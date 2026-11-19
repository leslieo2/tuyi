const errors = {
  native_missing: "找不到或无法启动本地组件。请运行项目中的 ./scripts/install.sh，再重试。",
  native_failed: "本地组件未正常完成。请重试，或重新运行安装脚本。",
  native_timeout: "本地处理超时。请换用较小的图片或检查翻译服务后重试。",
  invalid_request: "请求参数无效。请检查设置后重试。",
  image_read: "当前页面的图片无法读取。请上传、粘贴图片，或将 macOS 框选截图粘贴到面板。",
  image_size: "图片超过 8 MiB。请裁剪或缩小后重试。",
  image_dimensions: "图片超过 4,000 万像素或单边超过 12,000 像素。请裁剪或缩小后重试。",
  invalid_image: "图片损坏或格式不受支持。可另存为 PNG 或 JPEG 后重试。",
  ocr_language: "当前设备不支持所选的识别语言。请在设置中选择自动检测或其他语言。",
  ocr_failed: "未能完成识别。请尝试缩小图片或转换格式。",
  source_limit: "识别文字超过 16 KiB。请把图片分区裁剪后分别识别。",
  cloud_consent: "请通过图片右键菜单或侧栏的翻译按钮发起翻译。",
  missing_key: "请在侧栏的「设置」中保存 DeepSeek API 密钥，再点击「翻译识别文字」。",
  invalid_key: "请输入有效的 API 密钥，去掉空格和换行。",
  keychain: "无法访问系统钥匙串。请解锁后重试。",
  network: "与翻译服务的连接失败或中断。请检查网络后重试。",
  request_timeout: "翻译服务响应超时。请检查服务状态，或用更短的文字重试。",
  http_auth: "翻译服务拒绝认证（401/403）。请核对 DeepSeek 密钥。",
  http_balance: "DeepSeek 账户余额不足（402）。",
  http_not_found: "翻译服务当前无法处理请求（404）。请稍后重试。",
  http_rate: "翻译服务限制请求速率（429）。请稍后重试。",
  http_server: "翻译服务发生服务端错误（5xx）。请稍后重试。",
  provider_error: "翻译服务未能完成请求。请稍后重试。",
  empty_translation: "翻译服务未返回译文。可以再次尝试翻译。",
  incomplete_stream: "翻译响应中途断开。已收到的片段仍可复制，也可重新翻译。",
  translation_truncated: "达到模型的输出上限。已收到的片段仍可复制；可按区域识别后重试。",
  bad_response: "翻译响应格式无效。请稍后重试。",
  output_limit: "翻译响应超过大小上限。请按区域识别后重试。"
};

export function errorText(code) {
  if (typeof code !== "string") return errors.native_failed;
  if (Object.hasOwn(errors, code)) return errors[code];
  if (/^http_[1-5][0-9]{2}$/.test(code)) return `翻译服务请求失败（HTTP ${code.slice(5)}）。`;
  return errors.native_failed;
}
