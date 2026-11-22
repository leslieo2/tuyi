import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error(`Invalid Chrome extension version: ${version}`);
  process.exit(1);
}

for (const relPath of ["package.json", "extension/manifest.json"]) {
  const filePath = resolve(process.cwd(), relPath);
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  data.version = version;
  const config = await resolveConfig(filePath);
  const formatted = await format(JSON.stringify(data), { ...config, filepath: filePath });
  writeFileSync(filePath, formatted);
}
