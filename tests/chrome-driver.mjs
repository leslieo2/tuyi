import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function waitFor(check, description, milliseconds = 12_000) {
  const deadline = Date.now() + milliseconds;
  do {
    const value = await check();
    if (value) return value;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

export async function launchChrome({ headful = false, binary, testPort, testKeychainID } = {}) {
  const profile = await mkdtemp(join(tmpdir(), "image-translator-chrome-"));
  const hosts = join(profile, "NativeMessagingHosts");
  const hostManifest = "com.local_image_translator.host.json";
  try {
    await mkdir(hosts);
    const registered = join(
      process.env.HOME,
      "Library/Application Support/Google/Chrome/NativeMessagingHosts",
      hostManifest,
    );
    const installed = join(hosts, hostManifest);
    if (binary) {
      const manifest = JSON.parse(await readFile(registered, "utf8"));
      await writeFile(installed, JSON.stringify({ ...manifest, path: binary }), { mode: 0o600 });
    } else {
      await copyFile(registered, installed);
    }
  } catch (error) {
    await rm(profile, { recursive: true, force: true });
    throw new Error("Run ./scripts/install.sh before Chrome testing.", { cause: error });
  }
  const executable =
    process.env.TEST_CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const env = { ...process.env };
  delete env.DEEPSEEK_API_KEY;
  delete env.IMAGE_TRANSLATOR_TEST_PORT;
  delete env.IMAGE_TRANSLATOR_TEST_KEYCHAIN_ID;
  if (testPort !== undefined) env.IMAGE_TRANSLATOR_TEST_PORT = String(testPort);
  if (testKeychainID) env.IMAGE_TRANSLATOR_TEST_KEYCHAIN_ID = testKeychainID;
  const child = spawn(
    executable,
    [
      ...(headful ? [] : ["--headless=new"]),
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--disable-background-networking",
      "--disable-component-update",
      "--window-size=960,800",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"], env },
  );

  const pending = new Map();
  const targets = new Map();
  let sequence = 0;
  let input = "";
  child.stdio[4].setEncoding("utf8");
  child.stdio[4].on("data", (chunk) => {
    input += chunk;
    let end;
    while ((end = input.indexOf("\0")) >= 0) {
      const message = JSON.parse(input.slice(0, end));
      input = input.slice(end + 1);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
      }
      if (
        message.method === "Target.targetCreated" ||
        message.method === "Target.targetInfoChanged"
      ) {
        const info = message.params.targetInfo;
        targets.set(info.targetId, info);
      }
      if (message.method === "Target.targetDestroyed") targets.delete(message.params.targetId);
    }
  });
  child.stdio[3].on("error", () => {});
  let closed = false;
  child.on("close", () => {
    closed = true;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Isolated Chrome closed"));
    }
    pending.clear();
  });
  child.on("error", (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  });

  function send(method, params = {}, sessionId) {
    if (closed) return Promise.reject(new Error("Isolated Chrome closed"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 12_000);
      pending.set(id, { resolve, reject, timer, method });
      child.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }

  async function close() {
    try {
      if (!closed) {
        const exited = once(child, "close").catch(() => {});
        void send("Browser.close").catch(() => {});
        const timer = setTimeout(() => child.kill("SIGKILL"), 2500);
        await exited;
        clearTimeout(timer);
      }
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function attach(targetId) {
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const invoke = (method, params) => send(method, params, sessionId);
    return {
      id: targetId,
      invoke,
      async eval(expression, extra = {}) {
        const response = await invoke("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
          ...extra,
        });
        if (response.exceptionDetails) {
          throw new Error(
            response.exceptionDetails.exception?.description ?? response.exceptionDetails.text,
          );
        }
        return response.result.value;
      },
    };
  }

  try {
    await send("Target.setDiscoverTargets", { discover: true });
    return { send, attach, close, targets, pid: child.pid };
  } catch (error) {
    await close();
    throw error;
  }
}
