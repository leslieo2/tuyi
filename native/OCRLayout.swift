import CoreGraphics
import Foundation

struct OCRLine {
    enum Direction {
        case leftToRight
        case rightToLeft
        case topToBottom
    }

    let text: String
    let bounds: CGRect
    let direction: Direction?
    let wraps: Bool
    let isTitle: Bool

    // In these coordinates, reading the next line always moves toward lower y.
    private var readingBounds: CGRect {
        guard direction == .topToBottom else { return bounds }
        return CGRect(x: bounds.minY, y: bounds.minX, width: bounds.height, height: bounds.width)
    }

    func wraps(into next: OCRLine) -> Bool {
        guard wraps, !isTitle, !next.isTitle, let direction, direction == next.direction else { return false }
        let currentBounds = readingBounds
        let nextBounds = next.readingBounds
        let thickness = max(currentBounds.height, nextBounds.height)
        let progression = currentBounds.midY - nextBounds.midY
        guard !currentBounds.isEmpty, !nextBounds.isEmpty,
            progression >= 0.5 * min(currentBounds.height, nextBounds.height),
            currentBounds.minY - nextBounds.maxY <= 1.5 * thickness
        else { return false }

        let overlap = min(currentBounds.maxX, nextBounds.maxX) - max(currentBounds.minX, nextBounds.minX)
        let leadingOffset =
            direction == .leftToRight
            ? currentBounds.minX - nextBounds.minX
            : currentBounds.maxX - nextBounds.maxX
        return overlap >= 0.25 * min(currentBounds.width, nextBounds.width) || abs(leadingOffset) <= thickness
    }
}

private let unspacedCJK = #"[\p{Han}\p{Hiragana}\p{Katakana}ー・、。！？：；「」『』（）《》〈〉【】，．]"#

private func wrapSeparator(_ previous: OCRLine, _ next: OCRLine) -> String {
    guard let last = previous.text.last, let first = next.text.first,
        String(last).range(of: unspacedCJK, options: .regularExpression) != nil,
        String(first).range(of: unspacedCJK, options: .regularExpression) != nil
    else { return " " }
    return ""
}

func formatOCR(
    _ documents: [[OCRLine]], meta: inout DiagnosticsMeta
) throws -> (text: String, sourceLines: [String]?) {
    var text = ""
    var sourceLines: [String] = []
    var byteCount = 0
    var joinedLines = false
    defer {
        meta.lineCount = sourceLines.count
        meta.charCount = text.count
    }

    for lines in documents {
        var previous: OCRLine?
        for line in lines where !line.text.isEmpty {
            let separator: String
            if let previous, previous.wraps(into: line) {
                separator = wrapSeparator(previous, line)
                joinedLines = true
            } else {
                separator = text.isEmpty ? "" : "\n\n"
            }
            byteCount += separator.utf8.count + line.text.utf8.count
            guard byteCount <= Limits.sourceBytes else { throw HostError("source_limit") }
            sourceLines.append(line.text)
            text += separator + line.text
            previous = line
        }
    }
    return (text, joinedLines ? sourceLines : nil)
}
