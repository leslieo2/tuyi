# 技术规格与实现

## 技术规格

目标平台为 macOS 13+ 和 Chrome 123+，浏览器部分采用 Manifest V3。当前识别选用 Apple Vision，图片解码选用 ImageIO，翻译选用 DeepSeek Chat Completions，密钥存储使用 macOS Keychain。浏览器与 Swift 本地组件通过 Native Messaging 通信。生产组件按请求启动。

## 实现职责

| 位置 | 职责 |
| --- | --- |
| `extension/background.js` | 注册图片右键菜单，打开侧栏，按窗口转交触发操作的标签页、frame 和图片地址。等待侧栏连接的消息暂存在内存与 `chrome.storage.session`。 |
| `extension/image-selection.js`、`extension/image.js` | 内容脚本在可信的图片右键事件中记录目标图片引用。选择菜单后，侧栏向该 frame 读取一次并按需绘制像素。消息需匹配选图时的页面与图片地址，像素经 Canvas 同源检查。上传、拖拽和粘贴直接读取用户选中的数据。 |
| `extension/panel.js`、`extension/cache.js` | 管理当前任务、进度、结果、取消和会话级 LRU 缓存（仅存内存 / `chrome.storage.session`，不写入磁盘）。启动时读取一次已保存的处理方式与语言。右键及侧栏翻译动作是两处翻译入口，上传和粘贴的处理到本地识别为止；手动点击「翻译识别文字」会跳过译文缓存以获取最新结果。 |
| `extension/options.js`、`extension/config.js` | 验证并保存用户偏好。处理方式 `mode` 表达「识别并翻译」或「仅识别」。兼容旧 `provider` 的 `deepseek` 和 `ocr`。未知值进入仅识别，提醒用户重选。保存设置后清理旧字段，安装或更新时清理旧授权记录。 |
| `extension/native-client.js`、`native/Protocol.swift` | 交换带版本的请求和响应。OCR、密钥配置和翻译各自使用独立请求。密钥操作只回传配置状态。 |
| `native/Host.swift`、`native/VisionOCR.swift` | 验证消息，校验图片格式及尺寸，按方向解码并运行 Apple Vision。宿主关闭时结束对应任务。 |
| `native/Translation.swift` | 从 Keychain 读取密钥，使用固定的 HTTPS 地址请求翻译并转发流式译文。原文作为独立消息，系统指令将其中的命令作为待翻译文本。侧栏以纯文本显示结果。 |
| `native/Keychain.swift`、`scripts/` | 用服务 `com.local_image_translator.deepseek` 下的 `manual-api-key` 项存取密钥，并提供本地组件安装、维护和卸载。旧密钥项可在明确指定卸载参数时清理。 |

Chrome 原生主机清单只允许项目的扩展 ID。本地二进制也检查 Chrome 传入的来源参数。该限制依赖 Chrome 和 macOS 的本地信任边界。生产翻译请求使用 `https://api.deepseek.com/chat/completions`，拒绝重定向。只有测试版二进制支持 loopback 翻译服务和独立的测试钥匙串条目。

## 权限

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 右键菜单触发后，若图片因跨域限制无法导出 Canvas 像素，截取当前可见标签页并按图片区域裁剪 |
| `contextMenus` | 在网页图片上提供右键入口 |
| `sidePanel` | 打开侧栏 |
| HTTP(S) 网站和 frame 的内容脚本 | Chrome 菜单事件只提供图片网址及页面信息。内容脚本需在网页打开时注册右键监听，才能在选择菜单之前辨认实际点中的图片。Chrome 的站点访问设置可限制注入。 |
| `nativeMessaging` | 调用 Swift 组件 |
| `storage` | 保存处理方式和语言 |

## 边界条件

- 内容脚本仅在真实图片右键事件上记录目标图片。读取时再绘制并检查同源性，读取后释放，也会随下一次指针按下、按键、离开页面或 30 秒到期而清除。插件不重新请求图片网址。Chrome 禁止导出跨域像素、没有站点权限、目标无法确定时，提示上传、粘贴或截图。
- 输入最多 8 MiB、4,000 万像素，单边最多 12,000 像素。送去识别前图片最长边缩至 4,096 像素。网页快照优先编码为 PNG，超过 8 MiB 时回退为 JPEG。上传和粘贴支持 ImageIO 可解码的 PNG、JPEG、WebP、GIF 等光栅图片，ImageIO 读取首帧。
- 网页快照读取约 12 秒超时，识别任务约 60 秒超时。翻译 HTTP 空闲超时为 35 秒，单个网络请求最多 120 秒。原文最多 16 KiB，译文最多 48 KiB，翻译设置最多 4,096 个输出 token。首次识别的耗时可能明显高于后续任务。
- 安装脚本为 Google Chrome 默认用户数据目录注册主机。自定义 `--user-data-dir` 时需要将主机清单放到该目录下的 `NativeMessagingHosts`。

## 验证

| 命令 | 覆盖范围 |
| --- | --- |
| `npm test` | 默认设置、旧版偏好、语言校验、浏览器端消息协议 |
| `npm run test:native` | 实际英文、简体中文、日文和空白样图识别。协议校验、尺寸限制、缺失密钥、原生取消和翻译错误处理 |
| `npm run test:chrome` | 独立 Chrome 配置中的设置、真实钥匙串测试条目、上传、粘贴、设置切换、取消、重试和译文显示。翻译走本地测试服务 |
| `npm run test:chrome-menu` | 在独立可见的 Chrome 窗口实际点选系统右键菜单。测试图片网址第二次请求会返回另一张图，验证实际发给模拟翻译服务的是页面已显示图片中的文字。测试终端需要 macOS 辅助功能权限 |
| `npm run test:deepseek -- --approved-synthetic` | 使用配置过的密钥向真实 DeepSeek 服务发送固定的合成句子。仅供已授权的单次联调 |

[Apple Vision 文字识别](https://developer.apple.com/documentation/vision/recognizing-text-in-images) · [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) · [Chrome 右键菜单](https://developer.chrome.com/docs/extensions/reference/api/contextMenus#type-OnClickData) · [Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) · [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
