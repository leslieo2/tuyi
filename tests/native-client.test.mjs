import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeRequest } from "../extension/native-client.js";
import { HOST } from "../extension/config.js";

function connect() {
  const listeners = {};
  const events = (name) => ({
    addListener(fn) {
      listeners[name] = fn;
    },
  });
  const port = {
    disconnects: 0,
    sent: [],
    disconnect() {
      this.disconnects++;
    },
    postMessage(message) {
      this.sent.push(message);
    },
    onMessage: events("message"),
    onDisconnect: events("disconnect"),
  };
  globalThis.chrome = {
    runtime: {
      connectNative(name) {
        assert.equal(name, HOST);
        return port;
      },
    },
  };
  return {
    port,
    send: (message) => listeners.message(message),
    disconnect(message) {
      globalThis.chrome.runtime.lastError = { message };
      listeners.disconnect();
      delete globalThis.chrome.runtime.lastError;
    },
  };
}

test("preserves ordering and streams before done", async () => {
  const client = connect();
  const chunks = [];
  const translate = { command: "translate", text: "test" };
  const operation = nativeRequest(translate, { onDelta: (text) => chunks.push(text) });
  assert.deepEqual(client.port.sent, [{ v: 1, ...translate }]);
  client.send({ v: 1, type: "delta", text: "中" });
  assert.deepEqual(chunks, ["中"]);
  client.send({ v: 1, type: "delta", text: "文" });
  client.send({ v: 1, type: "done" });
  assert.equal((await operation).type, "done");
  client.send({ v: 1, type: "delta", text: "过期消息" });
  assert.equal(chunks.join(""), "中文");
  assert.equal(client.port.disconnects, 1);
});

test("handles abort, invalid messages, missing host and native errors", async () => {
  const client = connect();
  const controller = new AbortController();
  const operation = nativeRequest(
    { command: "translate" },
    {
      signal: controller.signal,
      onDelta: () => assert.fail("A cancelled operation must ignore delayed text"),
    },
  );
  controller.abort();
  client.send({ v: 1, type: "delta", text: "过期消息" });
  await assert.rejects(operation, { name: "AbortError" });
  await assert.rejects(nativeRequest({ command: "ocr" }, { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.equal(client.port.disconnects, 1);

  const malformed = connect();
  const bad = nativeRequest({ command: "ocr" });
  malformed.send({ v: 1, type: "ocr", text: ["invalid"] });
  await assert.rejects(bad, /native_failed/);

  const missing = connect();
  const absent = nativeRequest({ command: "languages" });
  missing.disconnect("Specified native messaging host not found.");
  await assert.rejects(absent, /native_missing/);

  const failed = connect();
  const reply = nativeRequest({ command: "translate" });
  failed.send({ v: 1, type: "error", code: "missing_key" });
  await assert.rejects(reply, /missing_key/);

  const checked = connect();
  const testReply = nativeRequest({
    command: "test_connection",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  checked.send({ v: 1, type: "test_connection", ok: true });
  assert.deepEqual(await testReply, { v: 1, type: "test_connection", ok: true });

  const withMeta = connect();
  const diagDone = nativeRequest({ command: "translate", diagnostics: true });
  withMeta.send({ v: 1, type: "done", meta: { route: "api", httpStatus: 200 } });
  assert.deepEqual(await diagDone, { v: 1, type: "done", meta: { route: "api", httpStatus: 200 } });

  const failedWithMeta = connect();
  const diagError = nativeRequest({ command: "translate", diagnostics: true });
  failedWithMeta.send({
    v: 1,
    type: "error",
    code: "http_auth",
    meta: { httpStatus: 401, model: "gpt-4o-mini" },
  });
  await assert.rejects(
    diagError,
    (err) => err.message === "http_auth" && err.meta?.httpStatus === 401,
  );
});
