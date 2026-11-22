import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { askHost } from "./helpers.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--approved-synthetic") {
  console.error(
    "This sends one synthetic sentence and translation instructions to DeepSeek. No image is sent.",
  );
  console.error("If you consent, run npm run test:deepseek -- --approved-synthetic");
  process.exit(2);
}

const binary = join(
  homedir(),
  "Library/Application Support/Local Image Translator/image-translator-host",
);
if (!existsSync(binary)) {
  console.error("Run ./scripts/install.sh first.");
  process.exit(2);
}

const start = performance.now();
let firstDelta;
const replies = await askHost(
  binary,
  {
    command: "translate",
    target: "zh-Hans",
    text: "The train leaves at seven.",
    cloudConsent: 1,
  },
  {
    timeout: 145_000,
    onReply(reply) {
      if (reply.type === "delta") firstDelta ??= performance.now();
    },
  },
);

const final = replies.at(-1);
if (final?.type === "error") {
  console.error("DeepSeek synthetic test:", final.code);
  process.exit(1);
}
const text = replies
  .filter((reply) => reply.type === "delta")
  .map((reply) => reply.text)
  .join("");
if (
  final?.type !== "done" ||
  firstDelta === undefined ||
  !/(火车|列车)/u.test(text) ||
  !/([七7]点|[七7]时)/u.test(text)
) {
  console.error("DeepSeek did not return a complete translation of the synthetic phrase.");
  process.exit(1);
}
console.log(
  `DeepSeek synthetic test passed. First text: ${Math.round(firstDelta - start)} ms; complete: ${Math.round(performance.now() - start)} ms.`,
);
