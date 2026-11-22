import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TAP_REPO = "leslieo2/homebrew-tap";
const DEFAULT_CASK_PATH = "Casks/tuyi.rb";
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function replaceSingleLineField(source, field, value) {
  const globalPattern = new RegExp(`^([ \\t]*${field}[ \\t]+)"([^"]+)"`, "gm");
  const matches = [...source.matchAll(globalPattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 "${field}" field in cask, found ${matches.length}`);
  }
  return source.replace(globalPattern, `$1"${value}"`);
}

export function updateCaskSource(source, version, sha256) {
  if (!VERSION_PATTERN.test(version ?? "")) {
    throw new Error(`Invalid version: ${version}`);
  }
  if (!SHA256_PATTERN.test(sha256 ?? "")) {
    throw new Error(`Invalid sha256: ${sha256}`);
  }

  let updated = replaceSingleLineField(source, "version", version);
  updated = replaceSingleLineField(updated, "sha256", sha256);
  return { updated, changed: updated !== source };
}

export function computeFileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "tuyi-release-script",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodeContentsPath(caskPath) {
  return caskPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readErrorSummary(response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    // Fall back to raw text when error body is not JSON.
  }
  return raw.slice(0, 200) || response.statusText;
}

export async function updateHomebrewTap({
  version,
  zipPath = resolve(process.cwd(), `.build/tuyi-v${version}-macos.zip`),
  token = process.env.HOMEBREW_TAP_TOKEN ?? "",
  repo = process.env.HOMEBREW_TAP_REPO || DEFAULT_TAP_REPO,
  caskPath = process.env.HOMEBREW_TAP_CASK_PATH || DEFAULT_CASK_PATH,
  fetchImpl = globalThis.fetch,
}) {
  if (!VERSION_PATTERN.test(version ?? "")) {
    throw new Error(`Invalid version: ${version}`);
  }
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Invalid Homebrew tap repository: ${repo}`);
  }
  if (!token) {
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log("::warning::HOMEBREW_TAP_TOKEN is not set; skipping Homebrew tap update.");
      return { skipped: true, reason: "missing_token" };
    }
    throw new Error("HOMEBREW_TAP_TOKEN environment variable is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable");
  }

  const sha256 = computeFileSha256(zipPath);
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeContentsPath(caskPath)}`;
  const headers = githubHeaders(token);

  const getResponse = await fetchImpl(apiUrl, { method: "GET", headers });
  if (!getResponse.ok) {
    const detail = await readErrorSummary(getResponse);
    throw new Error(`Failed to fetch ${repo}/${caskPath} (${getResponse.status}): ${detail}`);
  }

  const filePayload = await getResponse.json();
  if (typeof filePayload?.content !== "string" || typeof filePayload?.sha !== "string") {
    throw new Error(`Unexpected GitHub Contents API response for ${repo}/${caskPath}`);
  }

  const currentSource = Buffer.from(filePayload.content, "base64").toString("utf8");
  const { updated, changed } = updateCaskSource(currentSource, version, sha256);
  if (!changed) {
    console.log(`Homebrew cask ${repo}/${caskPath} is already up to date (${version}).`);
    return { skipped: false, changed: false, version, sha256 };
  }

  const putResponse = await fetchImpl(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `chore(cask): update tuyi to ${version}`,
      content: Buffer.from(updated, "utf8").toString("base64"),
      sha: filePayload.sha,
    }),
  });
  if (!putResponse.ok) {
    const detail = await readErrorSummary(putResponse);
    throw new Error(`Failed to update ${repo}/${caskPath} (${putResponse.status}): ${detail}`);
  }

  console.log(`Updated ${repo}/${caskPath} to ${version} (${sha256}).`);
  return { skipped: false, changed: true, version, sha256 };
}

const isMain =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const version = process.argv[2];
  const zipPath = process.argv[3];
  await updateHomebrewTap({ version, zipPath });
}
