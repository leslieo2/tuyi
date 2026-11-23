import CoreGraphics
import Foundation

@main
struct OCRLayoutTests {
    static func line(
        _ text: String, x: CGFloat = 0, y: CGFloat, width: CGFloat = 110, height: CGFloat = 20,
        direction: OCRLine.Direction? = .leftToRight, wraps: Bool = false, isTitle: Bool = false
    ) -> OCRLine {
        OCRLine(
            text: text, bounds: CGRect(x: x, y: y, width: width, height: height),
            direction: direction, wraps: wraps, isTitle: isTitle
        )
    }

    static func main() throws {
        var meta = DiagnosticsMeta()
        let first = line("Read this", y: 100, wraps: true)
        let continuation = line("as one paragraph.", y: 76)
        let merged = try formatOCR([[first, continuation]], meta: &meta)
        precondition(merged.text == "Read this as one paragraph.")
        precondition(merged.sourceLines == ["Read this", "as one paragraph."])
        precondition(meta.lineCount == 2 && meta.charCount == merged.text.count)

        for separate in [
            line("Adjacent column", x: 180, y: 76),
            line("Same row", x: 15, y: 99),
            line("After a large gap", y: 35),
            line("Unknown direction", y: 76, direction: nil),
            line("Next title", y: 76, isTitle: true)
        ] {
            let blocks = try formatOCR([[first, separate]], meta: &meta)
            precondition(blocks.text == "Read this\n\n" + separate.text)
            precondition(blocks.sourceLines == nil)
        }
        let documents = try formatOCR([[first], [continuation]], meta: &meta)
        precondition(documents.text == "Read this\n\nas one paragraph.")

        let vertical = try formatOCR(
            [
                [
                    line("東京から、", x: 150, y: 30, width: 22, height: 95, direction: .topToBottom, wraps: true),
                    line("電車に乗る。", x: 117, y: 24, width: 22, height: 100, direction: .topToBottom)
                ]
            ], meta: &meta
        )
        precondition(vertical.text == "東京から、電車に乗る。")

        let prefix = String(repeating: "中", count: 5_460) + "ab"
        let longLine = line(prefix, y: 100, wraps: true)
        let exact = try formatOCR([[longLine, line("x", y: 76)]], meta: &meta)
        precondition(exact.text.utf8.count == Limits.sourceBytes)
        do {
            _ = try formatOCR([[longLine, line("xy", y: 76)]], meta: &meta)
            preconditionFailure("Expected a source limit error")
        } catch let error as HostError {
            precondition(error.code == "source_limit")
            precondition(meta.lineCount == 1 && meta.charCount == prefix.count)
        }
        print("OCR layout checks passed")
    }
}
