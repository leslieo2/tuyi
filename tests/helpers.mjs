import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";

export const root = resolve(import.meta.dirname, "..");
export const manifest = JSON.parse(readFileSync(resolve(root, "extension/manifest.json"), "utf8"));
export const id = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/./g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
export const origin = `chrome-extension://${id}/`;
export const fixture = (name) => resolve(root, ".build/fixtures", `${name}.png`);

export function frame(data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}

export function hostJob(
  binary,
  buffer,
  { onReply = () => {}, closeAfterFirst = false, timeout = 70_000, port } = {},
) {
  const env = { ...process.env };
  delete env.DEEPSEEK_API_KEY;
  delete env.IMAGE_TRANSLATOR_TEST_PORT;
  delete env.IMAGE_TRANSLATOR_TEST_KEYCHAIN_ID;
  if (port !== undefined) env.IMAGE_TRANSLATOR_TEST_PORT = String(port);
  const child = spawn(binary, [origin], { stdio: ["pipe", "pipe", "ignore"], env });
  const replies = [];
  let pending = Buffer.alloc(0);
  let exited = false;
  child.stdin.on("error", () => {});
  child.stdout.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const length = pending.readUInt32LE();
      if (length > 1_000_000) {
        child.kill("SIGKILL");
        return;
      }
      if (pending.length < length + 4) return;
      const reply = JSON.parse(pending.subarray(4, 4 + length).toString("utf8"));
      pending = pending.subarray(4 + length);
      replies.push(reply);
      onReply(reply);
      if (closeAfterFirst) child.stdin.end();
    }
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const done = once(child, "close")
    .then(([code, signal]) => {
      exited = true;
      clearTimeout(timer);
      if (code !== 0 || signal || pending.length)
        throw new Error("Native test job did not exit cleanly");
      return replies;
    })
    .finally(() => {
      clearTimeout(timer);
      if (!exited) child.kill("SIGKILL");
    });
  child.stdin.write(buffer);
  return { child, done };
}

export function askHost(binary, request, options) {
  return hostJob(binary, frame({ v: 1, ...request }), options).done;
}

export async function loopback(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    port: server.address().port,
    async close() {
      server.closeAllConnections();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}

export async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100 * 1024) throw new Error("Fixture request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

export function sse(res, choice) {
  res.write(`data: ${JSON.stringify({ choices: [choice] })}\r\n\r\n`);
}
