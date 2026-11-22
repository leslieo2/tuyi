import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { body, fixture, id, loopback, origin, root, sse } from "./helpers.mjs";
import { launchChrome, waitFor } from "./chrome-driver.mjs";

const $status = 'document.querySelector("#status").textContent';
const $original = 'document.querySelector("#original").value';
const $translation = 'document.querySelector("#translation").value';

test(
  "isolated Google Chrome: image translation, local uploads and streaming UI",
  { timeout: 100_000 },
  async (t) => {
    const testKey = "synthetic-browser-key";
    let requests = 0;
    let connectionClosed = false;
    const crossOrigin = await loopback((req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" }).end(readFileSync(fixture("ja")));
    });
    t.after(() => crossOrigin.close());
    const service = await loopback(async (req, res) => {
      if (req.url === "/fixture") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
          `<title>Image Translator Synthetic Test</title>
         <img id="english" width="500" src="/en.png" alt="Synthetic English text">
         <img id="cross-origin" width="200" src="http://127.0.0.1:${crossOrigin.port}/ja.png" alt="Synthetic Japanese text">`,
        );
      } else if (req.url === "/en.png") {
        res.writeHead(200, { "Content-Type": "image/png" }).end(readFileSync(fixture("en")));
      } else if (req.url === "/chat/completions") {
        const input = await body(req);
        assert.match(input.messages[1].content, /train leaves at seven/i);
        assert.match(input.messages[0].content, /zh-Hans/);
        assert.equal(input.model, "deepseek-flash");
        assert.equal(req.headers.authorization, `Bearer ${testKey}`);
        requests++;
        if (requests === 1) {
          res.writeHead(500).end("Fixture HTTP error");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        if (requests === 2) {
          res.on("close", () => {
            connectionClosed = true;
          });
          sse(res, { delta: { content: "正在生成…" } });
          return;
        }
        sse(res, { delta: { content: "合成测试：" } });
        setTimeout(() => {
          sse(res, { delta: { content: "火车七点出发。" }, finish_reason: "stop" });
          res.end("data: [DONE]\n\n");
        }, 60);
      } else {
        res.writeHead(404).end("Fixture resource missing");
      }
    });
    t.after(() => service.close());
    const testExtension = await mkdtemp(join(tmpdir(), "image-translator-extension-"));
    t.after(() => rm(testExtension, { recursive: true, force: true }));
    await cp(resolve(root, "extension"), testExtension, { recursive: true });
    await appendFile(
      join(testExtension, "background.js"),
      "\nglobalThis.testOpenFromImage = openFromImage;\n",
    );
    const binary = resolve(root, ".build/image-translator-test-host");
    const testKeychainID = randomUUID();
    const chrome = await launchChrome({ binary, testPort: service.port, testKeychainID });
    t.after(() => chrome.close());
    t.after(() => {
      const cleanup = spawnSync(binary, ["--delete-key"], {
        env: { IMAGE_TRANSLATOR_TEST_KEYCHAIN_ID: testKeychainID },
      });
      assert.equal(cleanup.status, 0, "Clean up synthetic Keychain item");
    });
    const version = await chrome.send("Browser.getVersion");
    t.diagnostic(version.product);
    assert.deepEqual(await chrome.send("Extensions.loadUnpacked", { path: testExtension }), { id });
    const pageInfo = await waitFor(
      () => [...chrome.targets.values()].find((target) => target.type === "page"),
      "fixture tab",
    );
    const page = await chrome.attach(pageInfo.targetId);
    const url = `http://127.0.0.1:${service.port}/fixture`;
    await page.invoke("Page.navigate", { url });
    await waitFor(
      () =>
        page
          .eval(
            "document.images.length === 2 && Array.from(document.images).every(image => image.naturalWidth > 0)",
          )
          .catch(() => false),
      "fixture images",
    );

    async function openExtensionPage(name) {
      const { targetId } = await chrome.send("Target.createTarget", { url: origin + name });
      const tab = await chrome.attach(targetId);
      await waitFor(
        () =>
          tab
            .eval(
              `document.readyState === "complete" && location.href === ${JSON.stringify(
                origin + name,
              )}`,
            )
            .catch(() => false),
        name,
      );
      return tab;
    }

    const options = await openExtensionPage("options.html");
    await options.eval('chrome.storage.local.set({uiLanguage: "zh_CN"})');
    await options.invoke("Page.reload");
    await waitFor(
      () =>
        options
          .eval('document.querySelector("#ui-language")?.value === "zh_CN"')
          .catch(() => false),
      "localized translation mode",
    );
    assert.equal(await options.eval('document.body.innerText.includes("Apple Vision")'), false);
    assert.equal(
      await options.eval('document.querySelector("#mode option[value=translate]").textContent'),
      "识别并翻译",
    );
    assert.equal(await options.eval('document.querySelector("#revoke") === null'), true);
    await waitFor(
      () =>
        options.eval(
          'Array.from(document.querySelector("#ocrLanguage").options).some(x=>x.value==="ja-JP")',
        ),
      "languages loaded from Native Messaging",
    );
    await waitFor(
      () => options.eval('document.querySelector("#key-status").textContent === "尚未配置。"'),
      "empty Keychain status",
    );
    assert.equal(await options.eval('document.querySelector("#api-key").type'), "password");
    await options.eval(`(() => {
    document.querySelector("#api-key").value = ${JSON.stringify(testKey)};
    document.querySelector("#save-key").click();
  })()`);
    await waitFor(
      () => options.eval('document.querySelector("#key-status").textContent === "密钥已保存。"'),
      "Keychain save",
    );
    assert.equal(await options.eval('document.querySelector("#api-key").value'), "");
    assert.equal(requests, 0);
    await options.invoke("Page.reload");
    await waitFor(
      () => options.eval('document.querySelector("#key-status")?.textContent === "已配置。"'),
      "Keychain status after reload",
    );
    assert.equal(await options.eval('document.querySelector("#api-key").value'), "");

    const panel = await openExtensionPage("panel.html");
    await waitFor(
      () => panel.eval('document.querySelector("#route").textContent === "默认译为简体中文"'),
      "default target language",
    );
    const backgroundInfo = await waitFor(
      () =>
        [...chrome.targets.values()].find(
          (target) => target.type === "service_worker" && target.url === `${origin}background.js`,
        ),
      "extension service worker",
    );
    const background = await chrome.attach(backgroundInfo.targetId);

    // CDP sends a trusted page gesture. The headless test invokes only the native
    // menu selection callback directly; the visible browser test clicks that menu.
    async function openImageContext(selector) {
      const { x, y } = await page.eval(`(() => {
      const bounds = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x: bounds.x + 20, y: bounds.y + 20};
    })()`);
      const mouse = { x, y, button: "right", clickCount: 1 };
      await page.invoke("Input.dispatchMouseEvent", { ...mouse, type: "mousePressed" });
      await page.invoke("Input.dispatchMouseEvent", { ...mouse, type: "mouseReleased" });
    }

    async function menu(path, selector = "#english") {
      await panel.eval('document.querySelector("#status").textContent = ""');
      await page.invoke("Page.bringToFront");
      if (selector) await openImageContext(selector);
      return background.eval(`(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!Number.isInteger(tab?.id)) throw new Error("Isolated fixture tab is missing");
      globalThis.testOpenFromImage({
        menuItemId: "recognize-and-translate", frameId: 0,
        srcUrl: ${JSON.stringify(new URL(path, url).href)}, pageUrl: ${JSON.stringify(url)}
      }, tab);
    })()`);
    }

    assert.equal(requests, 0);
    await menu("/en.png");
    await waitFor(
      () => panel.eval(`${$status}.includes("5xx")`),
      "menu starts translation without additional prompt",
      65_000,
    );
    assert.match(await panel.eval($original), /train leaves at seven/i);
    assert.equal(requests, 1);
    assert.equal(await panel.eval('document.querySelector("#consent") === null'), true);

    const click = (selector) =>
      panel.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await click("#retry");
    await waitFor(
      () => panel.eval(`${$translation} === "正在生成…"`),
      "partial streamed translation",
    );
    await click("#cancel");
    await waitFor(() => connectionClosed, "cancelled native HTTP connection");
    assert.match(await panel.eval($status), /已取消/);
    assert.match(await panel.eval($original), /train leaves at seven/i);
    await click("#retry");
    await waitFor(() => panel.eval(`${$status} === "翻译完成。"`), "translation retry completed");
    assert.equal(await panel.eval($translation), "合成测试：火车七点出发。");
    // Check the copy handlers without writing to the user's clipboard.
    await panel.eval(`Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async text => { globalThis.testCopied = text; } }
  })`);
    await click("#copy-original");
    assert.match(await panel.eval("testCopied"), /train leaves at seven/i);
    await click("#copy-translation");
    assert.equal(await panel.eval("testCopied"), "合成测试：火车七点出发。");

    await click("#clear");
    assert.equal(await panel.eval($original), "");
    assert.equal(await panel.eval($translation), "");

    await menu("/missing.png");
    await waitFor(
      () => panel.eval(`${$status}.includes("无法读取")`),
      "original image read failure",
    );
    assert.equal(requests, 3);

    await page.eval(`document.querySelector("#english").dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, composed: true }))`);
    await menu("/en.png", null);
    await waitFor(
      () => panel.eval(`${$status}.includes("无法读取")`),
      "synthetic gesture cannot select pixels",
    );
    await menu(`http://127.0.0.1:${crossOrigin.port}/ja.png`, "#cross-origin");
    await waitFor(
      () => panel.eval(`${$status}.includes("无法读取")`),
      "cross-origin pixels stay protected",
    );
    assert.equal(requests, 3);

    const { root: DOM } = await panel.invoke("DOM.getDocument");
    const { nodeId } = await panel.invoke("DOM.querySelector", {
      nodeId: DOM.nodeId,
      selector: "#file",
    });
    await panel.invoke("DOM.setFileInputFiles", { nodeId, files: [fixture("blank")] });
    await waitFor(
      () => panel.eval(`${$status}.includes("没有识别到文字")`),
      "real blank image OCR via file upload",
    );

    await panel.invoke("DOM.setFileInputFiles", { nodeId, files: [fixture("en")] });
    await waitFor(() => panel.eval(`${$status} === "识别完成。"`), "text upload stays local");
    assert.equal(requests, 3);
    assert.equal(await panel.eval($translation), "");
    await click("#retry");
    await waitFor(() => panel.eval(`${$status} === "翻译完成。"`), "explicit upload translation");
    assert.equal(requests, 4);

    const japaneseImage = JSON.stringify(readFileSync(fixture("ja")).toString("base64"));
    await panel.eval(`(() => {
    const bytes = Uint8Array.from(atob(${japaneseImage}), c => c.charCodeAt(0));
    const image = new Blob([bytes], { type: "image/png" });
    globalThis.clipboardItem = { types: ["image/png"], getType: async () => image };
    navigator.clipboard.read = () => new Promise(resolve => {
      globalThis.finishClipboardRead = () => resolve([clipboardItem]);
    });
    globalThis.pasteJob = document.querySelector("#paste").onclick();
  })()`);
    await click("#clear");
    const clearedStatus = await panel.eval($status);
    await panel.eval("(async () => { finishClipboardRead(); await pasteJob; })()");
    assert.equal(await panel.eval($status), clearedStatus);
    assert.equal(await panel.eval($original), "");

    await panel.eval(`(() => {
    navigator.clipboard.read = async () => [{
      types: ["image/png"],
      getType: () => new Promise(resolve => {
        globalThis.finishClipboardImage = async () => resolve(await clipboardItem.getType());
      })
    }];
    globalThis.pasteJob = document.querySelector("#paste").onclick();
  })()`);
    await waitFor(
      () => panel.eval('typeof finishClipboardImage === "function"'),
      "clipboard image retrieval is in progress",
    );
    assert.equal(await panel.eval('document.querySelector("#cancel").hidden'), false);
    await click("#cancel");
    await panel.eval("(async () => { await finishClipboardImage(); await pasteJob; })()");
    assert.match(await panel.eval($status), /已取消/);
    assert.equal(await panel.eval($original), "");

    await panel.eval("navigator.clipboard.read = async () => [clipboardItem]");
    await click("#paste");
    await waitFor(
      () =>
        panel.eval(
          `${$status} === "识别完成。" && ${$original}.includes("電車は七時に出発します")`,
        ),
      "the Paste button recognizes the clipboard image",
    );
    await click("#clear");

    await options.eval("chrome.storage.local.set({cloudConsent: 1})");
    // Dispatch a paste carrying a synthetic image; the OS clipboard is untouched.
    await panel.eval(`(() => {
    const bytes = Uint8Array.from(atob(${japaneseImage}), c => c.charCodeAt(0));
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([bytes], "japanese.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, cancelable: true }));
  })()`);
    await waitFor(
      () => panel.eval(`${$status} === "识别完成。"`),
      "paste stays local even with a legacy consent value",
    );
    assert.match(await panel.eval($original), /電車は七時に出発します/);
    assert.equal(await panel.eval($translation), "");
    assert.equal(requests, 4);
    await options.eval('chrome.storage.local.remove("cloudConsent")');

    function saveMode(mode) {
      return options.eval(`(() => {
      const field = document.querySelector("#mode");
      field.value = ${JSON.stringify(mode)};
      field.dispatchEvent(new Event("change"));
      document.querySelector("#save").click();
    })()`);
    }

    await saveMode("ocr");
    await waitFor(() => panel.eval('document.querySelector("#retry").hidden'), "OCR-only setting");
    assert.equal(await options.eval('document.querySelector("#target-fields").hidden'), true);
    assert.equal(await options.eval('document.querySelector("#translation-key").hidden'), true);
    await menu("/en.png");
    await waitFor(
      () => panel.eval(`${$status}.includes("识别完成") && ${$original}.includes("The train")`),
      "right-click OCR stays local in OCR-only mode",
    );
    assert.equal(await panel.eval('document.querySelector("#translation-result").hidden'), true);
    assert.equal(requests, 4);

    await panel.eval(`(() => {
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = async (...args) => {
      const reply = await send(...args);
      await new Promise(resolve => { globalThis.releaseImage = resolve; });
      chrome.tabs.sendMessage = send;
      return reply;
    };
  })()`);
    await menu("/en.png");
    await waitFor(
      () => panel.eval('typeof releaseImage === "function"'),
      "the image request has started in OCR-only mode",
    );
    await saveMode("translate");
    await waitFor(
      () => panel.eval('!document.querySelector("#retry").hidden'),
      "translation enabled for the next job",
    );
    await panel.eval("releaseImage()");
    await waitFor(
      () => panel.eval(`${$status} === "识别完成。"`),
      "the existing job keeps its OCR-only settings",
    );
    assert.equal(await panel.eval($translation), "");
    assert.equal(requests, 4);

    await options.eval('chrome.storage.local.set({mode: "unknown"})');
    await options.invoke("Page.reload");
    await waitFor(
      () => options.eval('document.querySelector("#status")?.textContent.includes("重新选择")'),
      "unknown settings ask the user to choose again",
    );
    await waitFor(
      () => panel.eval('document.querySelector("#route").textContent.includes("重新选择")'),
      "panel explains that only OCR will run",
    );
    await menu("/en.png");
    await waitFor(
      () => panel.eval(`${$status} === "识别完成。" && ${$original}.includes("The train")`),
      "unknown settings keep right-click recognition local even with a configured key",
    );
    assert.equal(requests, 4);
    await saveMode("translate");
    await waitFor(
      () => panel.eval('!document.querySelector("#retry").disabled'),
      "translation explicitly enabled again",
    );
    await click("#retry");
    await waitFor(
      () => panel.eval(`${$status} === "翻译完成。"`),
      "retry translates after the preference is saved",
    );
    assert.equal(requests, 5);

    const stored = await panel.eval("chrome.storage.local.get(null)");
    assert.deepEqual(Object.keys(stored).sort(), [
      "apiBaseUrl",
      "mode",
      "model",
      "ocrLanguage",
      "target",
      "uiLanguage",
    ]);
  },
);
