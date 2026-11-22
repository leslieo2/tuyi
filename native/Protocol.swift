import Foundation

enum Limits {
    static let imageBytes = 8 * 1024 * 1024
    static let frameBytes = 11 * 1024 * 1024
    static let imagePixels = 40_000_000
    static let imageEdge = 12_000
    static let visionEdge = 4096
    static let sourceBytes = 16 * 1024
    static let translationBytes = 48 * 1024
}

struct Request: Decodable {
    let v: Int
    let command: String
    let image: String?
    let language: String?
    let text: String?
    let target: String?
    let apiBaseUrl: String?
    let model: String?
    let cloudConsent: Int?
    let apiKey: String?
    let diagnostics: Bool?
}

struct DiagnosticsMeta: Encodable {
    var durationMs: Int? = nil
    var ocrLanguage: String? = nil
    var imageWidth: Int? = nil
    var imageHeight: Int? = nil
    var imageBytes: Int? = nil
    var lineCount: Int? = nil
    var charCount: Int? = nil
    var route: String? = nil
    var target: String? = nil
    var targetLabel: String? = nil
    var detectedLanguage: String? = nil
    var detectedConfidence: Double? = nil
    var secondLanguage: String? = nil
    var secondConfidence: Double? = nil
    var nonTargetLineLanguage: String? = nil
    var skipReason: String? = nil
    var endpoint: String? = nil
    var model: String? = nil
    var httpStatus: Int? = nil
    var streamed: Bool? = nil
    var finishReason: String? = nil
    var chunkCount: Int? = nil
    var outputChars: Int? = nil
    var thinkingDisabled: Bool? = nil
    var systemPrompt: String? = nil
}

struct Reply: Encodable {
    let v = 1
    let type: String
    var code: String? = nil
    var text: String? = nil
    var languages: [String]? = nil
    var configured: Bool? = nil
    var ok: Bool? = nil
    var meta: DiagnosticsMeta? = nil
}

struct HostError: Error {
    let code: String
    let meta: DiagnosticsMeta?
    init(_ code: String, meta: DiagnosticsMeta? = nil) {
        self.code = code
        self.meta = meta
    }
}

func readExactly(_ count: Int) throws -> Data {
    var collected = Data()
    while collected.count < count {
        guard let part = try FileHandle.standardInput.read(upToCount: count - collected.count),
            !part.isEmpty
        else { throw HostError("invalid_request") }
        collected.append(part)
    }
    return collected
}

func readRequest() throws -> Request {
    let header = try readExactly(4)
    let count = header.withUnsafeBytes { Int(UInt32(littleEndian: $0.loadUnaligned(as: UInt32.self))) }
    guard count > 0, count <= Limits.frameBytes else { throw HostError("invalid_request") }
    let payload = try readExactly(count)
    guard let request = try? JSONDecoder().decode(Request.self, from: payload),
        request.v == 1
    else { throw HostError("invalid_request") }
    return request
}

func send(_ reply: Reply) throws {
    let body = try JSONEncoder().encode(reply)
    guard body.count <= 1_000_000 else { throw HostError("output_limit") }
    var size = UInt32(body.count).littleEndian
    let header = withUnsafeBytes(of: &size) { Data($0) }
    try FileHandle.standardOutput.write(contentsOf: header)
    try FileHandle.standardOutput.write(contentsOf: body)
}
