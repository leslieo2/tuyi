import AppKit
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func writeImage(_ name: String, size: CGSize, draw: @escaping (CGRect) -> Void) throws {
    let image = NSImage(size: size, flipped: true) { bounds in
        NSColor.white.setFill()
        bounds.fill()
        draw(bounds)
        return true
    }
    guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
        let png = bitmap.representation(using: .png, properties: [:])
    else { exit(1) }
    try png.write(to: output.appendingPathComponent(name + ".png"))
}

func write(_ name: String, _ text: String?, size: CGSize = CGSize(width: 920, height: 240)) throws {
    try writeImage(name, size: size) { bounds in
        guard let text else { return }
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 18
        (text as NSString).draw(
            in: bounds.insetBy(dx: 42, dy: 32),
            withAttributes: [
                .foregroundColor: NSColor.black,
                .font: NSFont.systemFont(ofSize: 46, weight: .medium),
                .paragraphStyle: paragraph
            ])
    }
}

func drawVertical(_ columns: [String], rightEdge: Int, top: Int, font: NSFont) {
    for (index, column) in columns.enumerated() {
        for (offset, character) in column.enumerated() {
            String(character).draw(
                at: CGPoint(x: rightEdge - 65 * index, y: top + 42 * offset),
                withAttributes: [.font: font, .foregroundColor: NSColor.black])
        }
    }
}

try write("en", "LOCAL IMAGE TRANSLATOR\nThe train leaves at seven.")
try write("zh", "本地图片翻译工具\n请在入口处等候。")
try write("ja", "画像翻訳のテスト\n電車は七時に出発します。")
try write("blank", nil)
try write("wide", nil, size: CGSize(width: 12_001, height: 4))

let japaneseColumns = ["東京駅から出発します。", "電車は七時に到着します。", "入口でお待ちください。"]
let japaneseFont = NSFont(name: "HiraginoSans-W6", size: 40) ?? .systemFont(ofSize: 40)
try writeImage("vertical-ja", size: CGSize(width: 650, height: 560)) { _ in
    drawVertical(japaneseColumns, rightEdge: 545, top: 20, font: japaneseFont)
}
try writeImage("vertical-zh", size: CGSize(width: 520, height: 600)) { _ in
    let font = NSFont(name: "PingFangTC-Regular", size: 40) ?? .systemFont(ofSize: 40)
    drawVertical(["請按照指示排隊等候", "列車將在七點鐘抵達", "請保管好您隨身物品"], rightEdge: 390, top: 24, font: font)
}

for name in ["layout", "mixed-layout"] {
    try writeImage(name, size: CGSize(width: 1220, height: 760)) { _ in
        "TRANSPORT GUIDE FOR FIRST-TIME VISITORS".draw(
            at: CGPoint(x: 45, y: 30),
            withAttributes: [.font: NSFont.boldSystemFont(ofSize: 44), .foregroundColor: NSColor.black])
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 32), .foregroundColor: NSColor.black
        ]
        let left = [
            "The train leaves from the main", "station at seven every morning.", "Bring your ticket and your ID."
        ]
        let right = [
            "The bus passes through the town", "center before crossing the bridge.", "The final stop is near the park."
        ]
        for (index, y) in [115, 153, 223].enumerated() {
            left[index].draw(at: CGPoint(x: 45, y: y), withAttributes: attributes)
            if name == "layout" {
                right[index].draw(at: CGPoint(x: 640, y: y + 8), withAttributes: attributes)
            }
        }
        if name == "mixed-layout" {
            drawVertical(japaneseColumns, rightEdge: 1045, top: 115, font: japaneseFont)
        }
    }
}
