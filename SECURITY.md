# Security Policy

## Security Model

- **API Keys**: DeepSeek API keys are stored exclusively in macOS Keychain (`com.local_image_translator.deepseek`) and never written to `chrome.storage` or disk files.
- **Native Host Verification**: The Native Messaging host manifest restricts `allowed_origins` to the extension's fixed origin, and `Host.swift` validates the caller origin argument on startup.
- **No Redirects**: Translation requests use a fixed HTTPS endpoint (`https://api.deepseek.com/chat/completions`) and refuse HTTP redirects.
- **Temporary Data Only**: Images, OCR results, and translations are held only in memory / `chrome.storage.session` for the active browser session.

## Reporting a Vulnerability

If you discover a security issue, please open a private security advisory on GitHub rather than posting exploit details in a public issue.
