import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { launchChrome, waitFor } from "./chrome-driver.mjs";
import { body, fixture, id, loopback, origin, root } from "./helpers.mjs";

test("isolated Chrome native image menu translates the selected image", { timeout: 90_000 }, async t => {
  let translations = 0;
  let imageRequests = 0;
  const service = await loopback(async (req, res) => {
    if (req.url === "/fixture") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
        "<title>Isolated image translation test</title><img width='600' src='/en.png'>"
      );
    } else if (req.url === "/en.png") {
      // This URL returns a different image if the extension tries to download it again.
      const image = imageRequests++ === 0 ? "en" : "ja";
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" })
        .end(readFileSync(fixture(image)));
    } else if (req.url === "/chat/completions") {
      const request = await body(req);
      assert.deepEqual(Object.keys(request).sort(), ["max_tokens", "messages", "model", "stream", "temperature", "thinking"]);
      assert.deepEqual(request.messages.map(message => [message.role, typeof message.content]), [
        ["system", "string"], ["user", "string"]
      ]);
      if (!request.messages[1].content.includes("The train leaves at seven.")) {
        res.writeHead(400).end();
        return;
      }
      translations++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "火车七点出发。" }, finish_reason: "stop" }] }));
    } else {
      res.writeHead(404).end();
    }
  });
  t.after(() => service.close());
  const chrome = await launchChrome({
    headful: true,
    binary: resolve(root, ".build/image-translator-test-host"),
    testPort: service.port
  });
  t.after(() => chrome.close());
  assert.deepEqual(await chrome.send("Extensions.loadUnpacked", { path: resolve(root, "extension") }), { id });
  const info = await waitFor(() => [...chrome.targets.values()].find(target => target.type === "page"), "isolated tab");
  const page = await chrome.attach(info.targetId);
  await page.invoke("Page.navigate", { url: `http://127.0.0.1:${service.port}/fixture` });
  await waitFor(() => page.eval("document.images[0]?.naturalWidth > 0").catch(() => false), "synthetic image");

  // The accessibility helper targets only the isolated Chrome process.
  const helper = spawn(resolve(root, ".build/select-menu"), [String(chrome.pid)], { stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => { if (helper.exitCode === null) helper.kill(); });
  let accessibility = "";
  helper.stdout.on("data", chunk => { accessibility += chunk; });
  const selected = once(helper, "close");
  await waitFor(() => accessibility.includes("Observer ready"), "isolated Chrome menu observer", 3000);
  const mouse = { x: 160, y: 80, button: "right", clickCount: 1 };
  const press = page.invoke("Input.dispatchMouseEvent", { ...mouse, type: "mousePressed" });
  const release = page.invoke("Input.dispatchMouseEvent", { ...mouse, type: "mouseReleased" });
  const [[code]] = await Promise.all([selected, press, release]);
  assert.equal(code, 0, accessibility);
  assert.match(accessibility, /Menu item found/);

  const panelInfo = await waitFor(async () => {
    const { targetInfos } = await chrome.send("Target.getTargets", { filter: [{}] });
    return targetInfos.find(target => target.url === origin + "panel.html");
  }, "actual side-panel target");
  const panel = await chrome.attach(panelInfo.targetId);
  await waitFor(() => panel.eval('document.querySelector("#status")?.textContent === "翻译完成。"'),
    "right-click translation", 65_000);
  assert.match(await panel.eval('document.querySelector("#original").value'), /The train leaves at seven\./);
  assert.equal(await panel.eval('document.querySelector("#translation").value'), "火车七点出发。");
  assert.equal(translations, 1);
  assert.equal(imageRequests, 1);
});
