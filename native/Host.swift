import Darwin
import Foundation

@main
struct ImageTranslatorHost {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())
        if args == ["--origin"] {
            print(extensionOrigin)
            return
        }
        if args == ["--set-key-manually"] || args == ["--delete-key"] {
            do {
                if args == ["--delete-key"] {
                    try deleteDeepSeekKey()
                    print("已删除 Keychain 密钥（如有）。")
                } else {
                    try promptAndStoreDeepSeekKey()
                    print("已保存至 macOS Keychain。")
                }
            } catch {
                let message: String
                switch (error as? HostError)?.code {
                case "invalid_key": message = "密钥为空或格式无效。\n"
                case "key_input": message = "请在终端窗口中运行此命令并手动输入密钥。\n"
                default: message = "无法访问 macOS Keychain。\n"
                }
                FileHandle.standardError.write(Data(message.utf8))
                exit(1)
            }
            return
        }

        guard args.first == extensionOrigin else { exit(2) }
        // Kill a stalled read, OCR or network operation even if the browser disappears.
        alarm(150)
        signal(SIGPIPE, SIG_IGN)
        var diagnosticsEnabled = false
        do {
            let request = try readRequest()
            diagnosticsEnabled = request.diagnostics == true
            // Chrome closes stdin when the port disconnects. Each host handles one job.
            DispatchQueue.global().async {
                var extra: UInt8 = 0
                _ = Darwin.read(STDIN_FILENO, &extra, 1)
                _exit(0)
            }
            switch request.command {
            case "key_status":
                try send(Reply(type: "key_status", configured: try hasDeepSeekKey()))
            case "set_key":
                guard let key = request.apiKey else { throw HostError("invalid_key") }
                try storeDeepSeekKey(key)
                try send(Reply(type: "key_status", configured: true))
            case "languages":
                try send(Reply(type: "languages", languages: try visionLanguages()))
            case "ocr":
                guard let image = request.image, let language = request.language else {
                    throw HostError("invalid_request")
                }
                let result = try await recognize(image: image, language: language)
                try send(
                    Reply(
                        type: "ocr", text: result.text, sourceLines: result.sourceLines,
                        meta: diagnosticsEnabled ? result.meta : nil
                    ))
            case "translate":
                let meta = try await translate(request) { try send(Reply(type: "delta", text: $0)) }
                try send(Reply(type: "done", meta: diagnosticsEnabled ? meta : nil))
            case "test_connection":
                try await testConnection(request)
                try send(Reply(type: "test_connection", ok: true))
            default:
                throw HostError("invalid_request")
            }
        } catch {
            let hostError = error as? HostError
            try? send(
                Reply(
                    type: "error",
                    code: hostError?.code ?? "native_failed",
                    meta: diagnosticsEnabled ? hostError?.meta : nil
                ))
        }
    }
}
