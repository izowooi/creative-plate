import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

enum CaptureTarget: String, CaseIterable, Identifiable {
    case activeWindow
    case mainDisplay

    var id: Self { self }

    var title: String {
        switch self {
        case .activeWindow: "활성 창"
        case .mainDisplay: "전체 화면"
        }
    }
}

/// 활성 창 또는 주 디스플레이를 원본 해상도 PNG 로 저장한다.
enum ScreenCapturer {
    enum CaptureError: LocalizedError {
        case noDisplay
        case noActiveWindow
        case writeFailed(URL)

        var errorDescription: String? {
            switch self {
            case .noDisplay: "캡처할 디스플레이를 찾지 못했습니다"
            case .noActiveWindow: "활성 창을 찾지 못했습니다. 캡처할 창을 먼저 클릭하세요"
            case .writeFailed(let url): "PNG 저장 실패: \(url.lastPathComponent)"
            }
        }
    }

    /// 매 장마다 창을 다시 찾는다. 같은 앱 안에서 창이 바뀌거나 옮겨져도 그 시점의 앞 창을 찍기 위해서다.
    static func capture(_ target: CaptureTarget, of pid: pid_t, to url: URL) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        let filter: SCContentFilter
        let size: CGSize
        switch target {
        case .activeWindow:
            guard let windowID = frontWindowID(of: pid),
                  let window = content.windows.first(where: { $0.windowID == windowID }) else {
                throw CaptureError.noActiveWindow
            }
            filter = SCContentFilter(desktopIndependentWindow: window)
            size = window.frame.size
        case .mainDisplay:
            let mainID = CGMainDisplayID()
            guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
                throw CaptureError.noDisplay
            }
            filter = SCContentFilter(display: display, excludingWindows: [])
            size = CGSize(width: display.width, height: display.height)
        }

        let configuration = SCStreamConfiguration()
        // 지정하지 않으면 포인트 단위(Retina 의 절반 해상도)로 찍힌다.
        let scale = CGFloat(filter.pointPixelScale)
        configuration.width = Int(size.width * scale)
        configuration.height = Int(size.height * scale)
        configuration.showsCursor = false
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        try writePNG(image, to: url)
    }

    /// 해당 앱의 가장 앞에 있는 일반 창. CGWindowList 는 앞에서 뒤 순서로 정렬되어 있다.
    private static func frontWindowID(of pid: pid_t) -> CGWindowID? {
        guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]] else {
            return nil
        }
        let window = windows.first {
            ($0[kCGWindowOwnerPID as String] as? pid_t) == pid
                && ($0[kCGWindowLayer as String] as? Int) == 0
        }
        return window?[kCGWindowNumber as String] as? CGWindowID
    }

    private static func writePNG(_ image: CGImage, to url: URL) throws {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw CaptureError.writeFailed(url)
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw CaptureError.writeFailed(url)
        }
    }
}
