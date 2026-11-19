import AppKit
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func write(_ name: String, _ text: String?, size: CGSize = CGSize(width: 920, height: 240)) throws {
    let image = NSImage(size: size, flipped: true) { bounds in
        NSColor.white.setFill()
        bounds.fill()
        if let text {
            let paragraph = NSMutableParagraphStyle()
            paragraph.lineSpacing = 18
            (text as NSString).draw(in: bounds.insetBy(dx: 42, dy: 32), withAttributes: [
                .foregroundColor: NSColor.black,
                .font: NSFont.systemFont(ofSize: 46, weight: .medium),
                .paragraphStyle: paragraph
            ])
        }
        return true
    }
    guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
    try png.write(to: output.appendingPathComponent(name + ".png"))
}

try write("en", "LOCAL IMAGE TRANSLATOR\nThe train leaves at seven.")
try write("zh", "本地图片翻译工具\n请在入口处等候。")
try write("ja", "画像翻訳のテスト\n電車は七時に出発します。")
try write("blank", nil)
try write("wide", nil, size: CGSize(width: 12_001, height: 4))
