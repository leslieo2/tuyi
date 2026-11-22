import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { updateCaskSource, updateHomebrewTap } from "../scripts/update-homebrew-tap.mjs";

const SAMPLE_CASK = `cask "tuyi" do
  version "1.2.0"
  sha256 "0fc915241cd310ef4a86960f98269519dee65b8fef702874b94e31ea251dae4e"

  url "https://github.com/leslieo2/tuyi/releases/download/v#{version}/tuyi-v#{version}-macos.zip"
  name "Tuyi"

  postflight_steps do
    copy "tuyi-v{{version}}-macos/extension", "target"
  end
end
`;

const SAMPLE_SHA = "a".repeat(64);

test("updateCaskSource replaces version and sha256 without altering interpolations", () => {
  const { updated, changed } = updateCaskSource(SAMPLE_CASK, "1.5.0", SAMPLE_SHA);
  assert.equal(changed, true);
  assert.match(updated, /^ {2}version "1\.5\.0"$/m);
  assert.match(updated, new RegExp(`^ {2}sha256 "${SAMPLE_SHA}"$`, "m"));
  assert.match(updated, /v#\{version\}\/tuyi-v#\{version\}-macos\.zip/);
  assert.match(updated, /tuyi-v\{\{version\}\}-macos\/extension/);

  const second = updateCaskSource(updated, "1.5.0", SAMPLE_SHA);
  assert.equal(second.changed, false);
  assert.equal(second.updated, updated);
});

test("updateCaskSource rejects invalid inputs or missing cask fields", () => {
  assert.throws(() => updateCaskSource(SAMPLE_CASK, "v1.5.0", SAMPLE_SHA), /Invalid version/);
  assert.throws(() => updateCaskSource(SAMPLE_CASK, "1.5.0", "bad"), /Invalid sha256/);
  assert.throws(
    () => updateCaskSource('cask "tuyi" do\nend\n', "1.5.0", SAMPLE_SHA),
    /Expected exactly 1 "version" field/,
  );
});

test("updateHomebrewTap fetches current cask, computes zip sha256, and commits update", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tuyi-tap-test-"));
  try {
    const zipPath = join(dir, "tuyi-v1.5.0-macos.zip");
    const zipBytes = Buffer.from("fake-release-zip-payload");
    writeFileSync(zipPath, zipBytes);
    const expectedSha = createHash("sha256").update(zipBytes).digest("hex");

    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (init.method === "GET") {
        return new Response(
          JSON.stringify({
            sha: "blobsha123",
            content: Buffer.from(SAMPLE_CASK, "utf8").toString("base64"),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (init.method === "PUT") {
        return new Response(JSON.stringify({ commit: { sha: "newcommit" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected method: ${init.method}`);
    };

    const result = await updateHomebrewTap({
      version: "1.5.0",
      zipPath,
      token: "test-pat-token",
      repo: "leslieo2/homebrew-tap",
      caskPath: "Casks/tuyi.rb",
      fetchImpl,
    });

    assert.deepEqual(result, {
      skipped: false,
      changed: true,
      version: "1.5.0",
      sha256: expectedSha,
    });
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].url,
      "https://api.github.com/repos/leslieo2/homebrew-tap/contents/Casks/tuyi.rb",
    );
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-pat-token");

    const putBody = JSON.parse(calls[1].init.body);
    assert.equal(putBody.message, "chore(cask): update tuyi to 1.5.0");
    assert.equal(putBody.sha, "blobsha123");
    const decodedCask = Buffer.from(putBody.content, "base64").toString("utf8");
    assert.match(decodedCask, /^ {2}version "1\.5\.0"$/m);
    assert.match(decodedCask, new RegExp(`^ {2}sha256 "${expectedSha}"$`, "m"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updateHomebrewTap skips PUT when cask already matches and handles missing token", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tuyi-tap-noop-"));
  const previousCi = process.env.GITHUB_ACTIONS;
  try {
    const zipPath = join(dir, "tuyi-v1.5.0-macos.zip");
    const zipBytes = Buffer.from("same-payload");
    writeFileSync(zipPath, zipBytes);
    const expectedSha = createHash("sha256").update(zipBytes).digest("hex");
    const currentCask = updateCaskSource(SAMPLE_CASK, "1.5.0", expectedSha).updated;

    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init.method);
      return new Response(
        JSON.stringify({
          sha: "blobsha123",
          content: Buffer.from(currentCask, "utf8").toString("base64"),
        }),
        { status: 200 },
      );
    };

    const noop = await updateHomebrewTap({
      version: "1.5.0",
      zipPath,
      token: "test-pat-token",
      fetchImpl,
    });
    assert.deepEqual(noop, {
      skipped: false,
      changed: false,
      version: "1.5.0",
      sha256: expectedSha,
    });
    assert.deepEqual(calls, ["GET"]);

    process.env.GITHUB_ACTIONS = "true";
    const skipped = await updateHomebrewTap({ version: "1.5.0", zipPath, token: "" });
    assert.deepEqual(skipped, { skipped: true, reason: "missing_token" });

    delete process.env.GITHUB_ACTIONS;
    await assert.rejects(
      () => updateHomebrewTap({ version: "1.5.0", zipPath, token: "" }),
      /HOMEBREW_TAP_TOKEN environment variable is required/,
    );
  } finally {
    if (previousCi === undefined) {
      delete process.env.GITHUB_ACTIONS;
    } else {
      process.env.GITHUB_ACTIONS = previousCi;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updateHomebrewTap rejects API errors and invalid repositories", async () => {
  await assert.rejects(
    () =>
      updateHomebrewTap({
        version: "1.5.0",
        token: "test-pat-token",
        repo: "bad repo",
      }),
    /Invalid Homebrew tap repository/,
  );

  const dir = mkdtempSync(join(tmpdir(), "tuyi-tap-err-"));
  try {
    const zipPath = join(dir, "tuyi-v1.5.0-macos.zip");
    writeFileSync(zipPath, "zip");
    await assert.rejects(
      () =>
        updateHomebrewTap({
          version: "1.5.0",
          zipPath,
          token: "test-pat-token",
          fetchImpl: async () =>
            new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
        }),
      /Failed to fetch leslieo2\/homebrew-tap\/Casks\/tuyi\.rb \(401\): Bad credentials/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
