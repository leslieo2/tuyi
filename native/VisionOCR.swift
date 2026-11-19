import Foundation
import ImageIO
import Vision

func visionLanguages() throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return try request.supportedRecognitionLanguages()
}

func recognize(image encoded: String, language: String) throws -> String {
    guard encoded.utf8.count <= ((Limits.imageBytes + 2) / 3) * 4 else {
        throw HostError("image_size")
    }
    guard let data = Data(base64Encoded: encoded), !data.isEmpty else {
        throw HostError("invalid_image")
    }
    guard data.count <= Limits.imageBytes else { throw HostError("image_size") }
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
          width > 0, height > 0 else { throw HostError("invalid_image") }
    guard width <= Limits.imageEdge, height <= Limits.imageEdge,
          width * height <= Limits.imagePixels else { throw HostError("image_dimensions") }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = language == "auto"
    if language != "auto" {
        guard try request.supportedRecognitionLanguages().contains(language) else {
            throw HostError("ocr_language")
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
        throw HostError("invalid_image")
    }
    do {
        try VNImageRequestHandler(cgImage: image).perform([request])
    } catch {
        throw HostError("ocr_failed")
    }

    var text = ""
    for observation in request.results ?? [] {
        guard let line = observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines),
              !line.isEmpty else { continue }
        let separator = text.isEmpty ? "" : "\n"
        guard text.utf8.count + separator.utf8.count + line.utf8.count <= Limits.sourceBytes else {
            throw HostError("source_limit")
        }
        text += separator + line
    }
    return text
}
