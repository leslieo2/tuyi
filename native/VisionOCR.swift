import Foundation
import ImageIO
import Vision

private func visionLanguages(for documentRequest: RecognizeDocumentsRequest) throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let supported = Set(documentRequest.supportedRecognitionLanguages)
    // Keep the language tags already used in saved settings and native messages.
    return try request.supportedRecognitionLanguages().filter { supported.contains(Locale.Language(identifier: $0)) }
}

func visionLanguages() throws -> [String] {
    try visionLanguages(for: RecognizeDocumentsRequest())
}

func recognize(image encoded: String, language: String) async throws -> (
    text: String, sourceLines: [String]?, meta: DiagnosticsMeta
) {
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
        width > 0, height > 0
    else { throw HostError("invalid_image", meta: meta) }
    meta.imageWidth = width
    meta.imageHeight = height
    guard width <= Limits.imageEdge, height <= Limits.imageEdge,
        width * height <= Limits.imagePixels
    else { throw HostError("image_dimensions", meta: meta) }

    var request = RecognizeDocumentsRequest()
    request.barcodeDetectionOptions.enabled = false
    request.textRecognitionOptions.useLanguageCorrection = true
    request.textRecognitionOptions.automaticallyDetectLanguage = language == "auto"
    if language != "auto" {
        guard try visionLanguages(for: request).contains(language) else {
            throw HostError("ocr_language", meta: meta)
        }
        request.textRecognitionOptions.recognitionLanguages = [Locale.Language(identifier: language)]
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
    let documents: [DocumentObservation]
    do {
        documents = try await request.perform(on: image)
    } catch {
        meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
        throw HostError("ocr_failed", meta: meta)
    }

    let imageSize = CGSize(width: image.width, height: image.height)
    let lines = documents.map { document in
        document.document.text.lines.map { observation in
            let direction: OCRLine.Direction? =
                switch observation.textDirection {
                case .leftToRight: .leftToRight
                case .rightToLeft: .rightToLeft
                case .topToBottom: .topToBottom
                default: nil
                }
            return OCRLine(
                text: observation.transcript.trimmingCharacters(in: .whitespacesAndNewlines),
                bounds: observation.boundingBox.toImageCoordinates(imageSize),
                direction: direction,
                wraps: observation.shouldWrapToNextLine == true,
                isTitle: observation.isTitle
            )
        }
    }
    do {
        let formatted = try formatOCR(lines, meta: &meta)
        meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
        return (formatted.text, formatted.sourceLines, meta)
    } catch let error as HostError {
        meta.durationMs = Int((DispatchTime.now().uptimeNanoseconds - startedAt) / 1_000_000)
        throw HostError(error.code, meta: meta)
    }
}
