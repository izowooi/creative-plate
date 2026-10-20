// design/AppIcon.svg 를 Assets.xcassets/AppIcon.appiconset 의 macOS 아이콘 PNG 들로 변환한다.
// 사용: swift scripts/render-icon.swift   (xcode-proj 폴더에서 실행)
import AppKit

let svgURL = URL(fileURLWithPath: "design/AppIcon.svg")
let outDir = URL(fileURLWithPath: "xcode-proj/Assets.xcassets/AppIcon.appiconset")
guard let svg = NSImage(contentsOf: svgURL) else { fatalError("SVG 를 읽지 못했습니다: \(svgURL.path)") }

try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

var images: [[String: String]] = []
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = points * scale
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
            hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ) else { fatalError("비트맵 생성 실패") }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        svg.draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels))
        NSGraphicsContext.restoreGraphicsState()

        let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
        try rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent(name))
        images.append(["idiom": "mac", "size": "\(points)x\(points)", "scale": "\(scale)x", "filename": name])
    }
}

let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outDir.appendingPathComponent("Contents.json"))
print("생성: \(images.count)개 -> \(outDir.path)")
