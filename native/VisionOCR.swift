import Foundation
import ImageIO
import Vision

func visionLanguages() throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return try request.supportedRecognitionLanguages()
}

func recognize(image encoded: String, language: String) throws -> (text: String, meta: DiagnosticsMeta) {
    let startedAt = DispatchTime.now().uptimeNanoseconds
    var meta = DiagnosticsMeta(ocrLanguage: language)
    guard encoded.utf8.count <= ((Limits.imageBytes + 2) / 3) * 4 else {
        throw HostError("image_size", meta: meta)
    }
    guard let data = Data(base64Encoded: encoded), !data.isEmpty else {
        throw HostError("invalid_image", meta: meta)
    }
    meta.imageBytes = data.count
    guard data.count <= Limits.imageBytes else { throw HostError("image_size", meta: meta) }
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    let supportedTypes: Set<String> = [
        "public.png", "public.jpeg", "org.webmproject.webp", "com.compuserve.gif",
        "public.tiff", "com.microsoft.bmp", "public.heic", "public.heif", "public.avif"
    ]
    guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions),
          let type = CGImageSourceGetType(source), supportedTypes.contains(type as String),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, sourceOptions)
            as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0 else { throw HostError("invalid_image", meta: meta) }
    meta.imageWidth = width
    meta.imageHeight = height
    guard width <= Limits.imageEdge, height <= Limits.imageEdge,
          width * height <= Limits.imagePixels else { throw HostError("image_dimensions", meta: meta) }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = language == "auto"
    if language != "auto" {
        guard try request.supportedRecognitionLanguages().contains(language) else {
            throw HostError("ocr_language", meta: meta)
        }
        request.recognitionLanguages = [language]
    }

    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: Limits.visionEdge,
        kCGImageSourceShouldCacheImmediately: true
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        throw HostError("invalid_image", meta: meta)
    }
    do {
        try VNImageRequestHandler(cgImage: image).perform([request])
    } catch {
        meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
        throw HostError("ocr_failed", meta: meta)
    }

    var text = ""
    var lineCount = 0
    for observation in request.results ?? [] {
        guard let line = observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines),
              !line.isEmpty else { continue }
        let separator = text.isEmpty ? "" : "\n"
        guard text.utf8.count + separator.utf8.count + line.utf8.count <= Limits.sourceBytes else {
            meta.lineCount = lineCount
            meta.charCount = text.count
            meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
            throw HostError("source_limit", meta: meta)
        }
        text += separator + line
        lineCount += 1
    }
    meta.lineCount = lineCount
    meta.charCount = text.count
    meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
    return (text, meta)
}
