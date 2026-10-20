import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

/// 주 디스플레이를 원본 해상도 PNG 로 저장한다.
struct ScreenCapturer {
    enum CaptureError: LocalizedError {
        case noDisplay
        case writeFailed(URL)

        var errorDescription: String? {
            switch self {
            case .noDisplay: "캡처할 디스플레이를 찾지 못했습니다"
            case .writeFailed(let url): "PNG 저장 실패: \(url.lastPathComponent)"
            }
        }
    }

    private let filter: SCContentFilter
    private let configuration: SCStreamConfiguration

    /// 디스플레이 목록 조회는 느리므로 한 번의 실행 동안 필터를 재사용한다.
    static func forMainDisplay() async throws -> ScreenCapturer {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let mainID = CGMainDisplayID()
        guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
            throw CaptureError.noDisplay
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        // 지정하지 않으면 포인트 단위(Retina 의 절반 해상도)로 찍힌다.
        let scale = CGFloat(filter.pointPixelScale)
        configuration.width = Int(CGFloat(display.width) * scale)
        configuration.height = Int(CGFloat(display.height) * scale)
        configuration.showsCursor = false
        return ScreenCapturer(filter: filter, configuration: configuration)
    }

    func capture(to url: URL) async throws {
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw CaptureError.writeFailed(url)
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw CaptureError.writeFailed(url)
        }
    }
}
