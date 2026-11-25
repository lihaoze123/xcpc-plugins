import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseRegistryToml,
  processRegistryEntry,
  validateHttpsUrl,
} from "./build-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

test("parseRegistryToml handles comment-only registry.toml gracefully", () => {
  const raw = fs.readFileSync(path.join(repoRoot, "registry.toml"), "utf8");
  assert.deepEqual(parseRegistryToml(raw), []);
});

test("parseRegistryToml parses [[plugin]] entries and preserves # inside strings", () => {
  const sample = `
# Leading comment
[[plugin]]
id = "luogu-sync" # inline comment
name = "Luogu #1 Sync"
version = "0.1.0"
description = "Sync Luogu submissions."
repo = "https://github.com/example/xcpc-plugin-luogu"
download_url = "https://github.com/example/xcpc-plugin-luogu/releases/download/v0.1.0/luogu-sync-0.1.0.zip"
sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
capabilities = ["oj_source", "tool"]
has_ui = true

[[plugin]]
id = "cf-helper"
download_url = "https://example.com/cf-helper.zip"
sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
has_ui = false
`;
  const entries = parseRegistryToml(sample);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, "luogu-sync");
  assert.equal(entries[0].name, "Luogu #1 Sync");
  assert.deepEqual(entries[0].capabilities, ["oj_source", "tool"]);
  assert.equal(entries[0].has_ui, true);
  assert.equal(entries[1].id, "cf-helper");
  assert.equal(entries[1].has_ui, false);
});

test("validateHttpsUrl accepts https:// and rejects http://", () => {
  assert.equal(
    validateHttpsUrl("https://github.com/example/plugin.zip"),
    "https://github.com/example/plugin.zip",
  );
  assert.throws(
    () => validateHttpsUrl("http://example.com/plugin.zip"),
    /must use https:\/\//,
  );
  assert.throws(() => validateHttpsUrl("not-a-url"), /Invalid/);
});

test("processRegistryEntry rejects SHA-256 mismatch", async () => {
  const fakeZip = Buffer.from("not-matching-content");
  await assert.rejects(
    () =>
      processRegistryEntry(
        {
          id: "bad-sha",
          download_url: "https://example.com/bad-sha.zip",
          sha256: "0".repeat(64),
        },
        {
          xcpcBin: "xcpc",
          fetchImpl: async () => new Response(fakeZip, { status: 200 }),
        },
      ),
    /SHA-256 mismatch/,
  );
});

test("processRegistryEntry verifies, checks, and merges community plugin as official: false", async (t) => {
  const xcpcBin = process.env.XCPC_BIN;
  const sampleZip = path.join(repoRoot, "dist-repo", "complexity-mem-1.0.0.zip");
  if (!xcpcBin || !fs.existsSync(xcpcBin) || !fs.existsSync(sampleZip)) {
    t.skip("XCPC_BIN or dist-repo/complexity-mem-1.0.0.zip not available");
    return;
  }

  const zipBuf = fs.readFileSync(sampleZip);
  const sha = crypto.createHash("sha256").update(zipBuf).digest("hex");
  const merged = await processRegistryEntry(
    {
      id: "complexity-mem",
      version: "1.0.0",
      download_url: "https://example.com/complexity-mem-1.0.0.zip",
      sha256: sha,
    },
    {
      xcpcBin,
      fetchImpl: async () => new Response(zipBuf, { status: 200 }),
    },
  );

  assert.equal(merged.id, "complexity-mem");
  assert.equal(merged.official, false);
  assert.equal(merged.sha256, sha);
  assert.equal(merged.download_url, "https://example.com/complexity-mem-1.0.0.zip");
  assert.equal("has_unsandboxed_ui" in merged.permissions, false);
});
