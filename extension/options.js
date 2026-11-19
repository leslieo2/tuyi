import { getSettings, targetLanguage } from "./config.js";
import { errorText } from "./errors.js";
import { nativeRequest } from "./native-client.js";

const byId = id => document.getElementById(id);
const mode = byId("mode");
const target = byId("target");
const ocrLanguage = byId("ocrLanguage");
const save = byId("save");
const result = byId("status");
const keyInput = byId("api-key");
const saveKey = byId("save-key");
const keyStatus = byId("key-status");
let settings;
function refreshMode() {
  const translate = mode.value === "translate";
  target.disabled = !translate;
  byId("target-fields").hidden = !translate;
  byId("translation-key").hidden = !translate;
}

function showKeyStatus(message, state) {
  keyStatus.textContent = message;
  keyStatus.dataset.state = state;
}

async function loadKeyStatus() {
  try {
    const { configured } = await nativeRequest({ command: "key_status" });
    showKeyStatus(configured ? "已配置。" : "尚未配置。", configured ? "done" : "idle");
  } catch (error) {
    showKeyStatus(error.message === "native_timeout" ? "读取密钥状态超时，请重新打开设置页。" : errorText(error.message), "error");
  } finally {
    saveKey.disabled = false;
  }
}

saveKey.onclick = async () => {
  if (saveKey.disabled) return;
  let apiKey = keyInput.value.trim();
  if (!apiKey) {
    showKeyStatus("请输入 DeepSeek API 密钥。", "error");
    keyInput.focus();
    return;
  }
  keyInput.value = "";
  keyInput.disabled = true;
  saveKey.disabled = true;
  showKeyStatus("正在保存密钥…", "busy");
  try {
    const saving = nativeRequest({ command: "set_key", apiKey });
    apiKey = "";
    await saving;
    showKeyStatus("密钥已保存。", "done");
  } catch (error) {
    showKeyStatus(error.message === "native_timeout" ? "保存密钥超时，请检查系统钥匙串后重试。" : errorText(error.message), "error");
  } finally {
    keyInput.disabled = false;
    saveKey.disabled = false;
  }
};
keyInput.onkeydown = event => {
  if (event.key === "Enter" && !event.isComposing) saveKey.click();
};

mode.onchange = refreshMode;
target.oninput = () => target.setCustomValidity("");
byId("settings-form").onsubmit = async event => {
  event.preventDefault();
  let canonical = settings.target;
  if (!target.disabled) {
    canonical = targetLanguage(target.value);
    if (!canonical) {
      target.setCustomValidity("请输入有效的语言代码，如 zh-Hans 或 ja。");
      target.reportValidity();
      return;
    }
  }
  const changes = { mode: mode.value, target: canonical, ocrLanguage: ocrLanguage.value };
  save.disabled = true;
  try {
    await chrome.storage.local.set(changes);
    Object.assign(settings, changes);
    target.value = canonical;
    void chrome.storage.local.remove("provider").catch(() => {});
    result.textContent = "已保存。";
    result.dataset.state = "done";
  } catch {
    result.textContent = "设置保存失败，请重试。";
    result.dataset.state = "error";
  } finally {
    save.disabled = false;
  }
};

async function load() {
  save.disabled = true;
  settings = await getSettings();
  mode.value = settings.mode;
  target.value = settings.target;
  refreshMode();
  if (settings.needsModeSelection) {
    result.textContent = "原处理方式无法识别。请重新选择并保存。";
    result.dataset.state = "error";
  }
  if (settings.ocrLanguage !== "auto") {
    ocrLanguage.add(new Option(settings.ocrLanguage, settings.ocrLanguage, true, true));
  }
  save.disabled = false;

  try {
    const { languages } = await nativeRequest({ command: "languages" });
    const display = new Intl.DisplayNames(["zh-CN"], { type: "language" });
    const chosen = ocrLanguage.value;
    const options = [new Option("自动检测", "auto")];
    for (const code of languages) {
      options.push(new Option(`${display.of(code)}（${code}）`, code));
    }
    ocrLanguage.replaceChildren(...options);
    ocrLanguage.value = languages.includes(chosen) ? chosen : "auto";
    if (chosen !== ocrLanguage.value) byId("recognition-status").textContent = "原识别语言已不可用。请保存新设置。";
  } catch (error) {
    byId("recognition-status").textContent = error.message === "native_timeout"
      ? "读取识别语言超时，请重新打开设置页。"
      : errorText(error.message);
  }
}

void load().catch(() => { result.textContent = "无法读取设置，请重新打开此页。"; });
void loadKeyStatus();
