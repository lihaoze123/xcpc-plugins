import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const pluginsRoot = path.join(repoRoot, "plugins");
const outDir = path.join(repoRoot, "dist-repo");
const defaultBaseUrl =
  "https://github.com/lihaoze123/xcpc-plugins/releases/download/official-latest";

function stripTomlComment(line) {
  let inDouble = false;
  let inSingle = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inDouble) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
    } else if (inSingle) {
      if (ch === "'") inSingle = false;
    } else {
      if (ch === '"') inDouble = true;
      else if (ch === "'") inSingle = true;
      else if (ch === "#") return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

function parseTomlString(rawVal) {
  const val = rawVal.trim();
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    return JSON.parse(val);
  }
  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    return val.slice(1, -1);
  }
  return null;
}

function parseTomlStringArray(rawVal) {
  const val = rawVal.trim();
  if (!val.startsWith("[") || !val.endsWith("]")) return null;
  const inner = val.slice(1, -1).trim();
  if (!inner) return [];
  const items = [];
  let cur = "";
  let inDouble = false;
  let inSingle = false;
  let escaped = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inDouble) {
      cur += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inDouble = false;
    } else if (inSingle) {
      cur += ch;
      if (ch === "'") inSingle = false;
    } else if (ch === '"') {
      inDouble = true;
      cur += ch;
    } else if (ch === "'") {
      inSingle = true;
      cur += ch;
    } else if (ch === ",") {
      const parsed = parseTomlString(cur);
      if (parsed !== null) items.push(parsed);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) {
    const parsed = parseTomlString(cur);
    if (parsed !== null) items.push(parsed);
  }
  return items;
}

export function parseSimpleToml(raw) {
  const out = {
    id: "",
    name: "",
    version: "",
    description: "",
    ui_entry: undefined,
    capabilities: [],
    domains: [],
    credentials: [],
    workspace_read: false,
  };
  let section = "";
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine);
    if (!line) continue;
    if (line.startsWith("[[") && line.endsWith("]]")) {
      section = line.slice(2, -2).trim();
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim();
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (section === "") {
      const str = parseTomlString(val);
      if (str !== null) {
        if (key === "id") out.id = str;
        else if (key === "name") out.name = str;
        else if (key === "version") out.version = str;
        else if (key === "description") out.description = str;
        else if (key === "ui_entry") out.ui_entry = str;
      } else if (key === "capabilities") {
        const arr = parseTomlStringArray(val);
        if (arr) out.capabilities = arr;
      }
    } else if (section === "permissions") {
      if (key === "workspace_read") {
        out.workspace_read = val === "true";
      } else if (key === "domains") {
        const arr = parseTomlStringArray(val);
        if (arr) out.domains = arr;
      }
    } else if (section === "credentials") {
      if (key === "key") {
        const str = parseTomlString(val);
        if (str) out.credentials.push(str);
      }
    }
  }
  return out;
}

export function parseRegistryToml(raw) {
  const entries = [];
  let current = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine);
    if (!line) continue;
    if (line.startsWith("[[") && line.endsWith("]]")) {
      const tableName = line.slice(2, -2).trim();
      if (tableName === "plugin") {
        current = {
          id: "",
          name: "",
          version: "",
          description: "",
          repo: "",
          download_url: "",
          sha256: "",
          capabilities: [],
          has_ui: false,
        };
        entries.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      current = null;
      continue;
    }
    if (!current) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();

    if (
      key === "id" ||
      key === "name" ||
      key === "version" ||
      key === "description" ||
      key === "repo" ||
      key === "download_url" ||
      key === "sha256"
    ) {
      const str = parseTomlString(val);
      if (str !== null) current[key] = str;
    } else if (key === "capabilities") {
      const arr = parseTomlStringArray(val);
      if (arr) current.capabilities = arr;
    } else if (key === "has_ui") {
      current.has_ui = val === "true";
    }
  }

  return entries;
}

export function validateHttpsUrl(urlStr, label = "download_url") {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid ${label}: "${urlStr}"`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https:// (got "${urlStr}")`);
  }
  return parsed.toString();
}

function findPluginRoot(unpackDir) {
  if (fs.existsSync(path.join(unpackDir, "manifest.toml"))) {
    return unpackDir;
  }
  const children = fs
    .readdirSync(unpackDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "__MACOSX");
  if (children.length === 1) {
    const candidate = path.join(unpackDir, children[0].name);
    if (fs.existsSync(path.join(candidate, "manifest.toml"))) {
      return candidate;
    }
  }
  throw new Error(`manifest.toml not found in unpacked archive (${unpackDir})`);
}

function safeUnzip(zipPath, destDir) {
  const listOut = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const zipEntries = listOut
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entryName of zipEntries) {
    if (
      entryName.startsWith("/") ||
      entryName.startsWith("\\") ||
      entryName.split(/[\\/]/).includes("..")
    ) {
      throw new Error(`Unsafe path in zip archive: "${entryName}"`);
    }
  }
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", destDir], { stdio: "inherit" });
}

export async function processRegistryEntry(entry, { xcpcBin, fetchImpl = fetch } = {}) {
  const id = (entry.id || "").trim();
  if (!id) {
    throw new Error("Community registry entry is missing required field: id");
  }
  const downloadUrl = validateHttpsUrl(entry.download_url, `plugin "${id}" download_url`);
  const expectedSha = (entry.sha256 || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha)) {
    throw new Error(`Community plugin "${id}" has invalid sha256: "${entry.sha256}"`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `xcpc-registry-${id}-`));
  try {
    console.log(`\n[registry:fetch] ${id} <- ${downloadUrl}`);
    const res = await fetchImpl(downloadUrl, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`Failed to download "${id}" (${res.status} ${res.statusText})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const actualSha = crypto.createHash("sha256").update(buf).digest("hex");
    if (actualSha !== expectedSha) {
      throw new Error(
        `SHA-256 mismatch for community plugin "${id}": expected ${expectedSha}, got ${actualSha}`,
      );
    }

    const zipPath = path.join(tmpDir, `${id}.zip`);
    fs.writeFileSync(zipPath, buf);

    const unpackDir = path.join(tmpDir, "unpacked");
    safeUnzip(zipPath, unpackDir);
    const pluginRoot = findPluginRoot(unpackDir);

    console.log(`[registry:check] ${id}`);
    const checkRaw = execFileSync(xcpcBin, ["plugin", "check", pluginRoot, "--json"], {
      encoding: "utf8",
    });
    const checkReport = JSON.parse(checkRaw);
    if (!checkReport.ok) {
      throw new Error(`xcpc plugin check failed for community plugin "${id}": ${checkRaw}`);
    }

    const manifestPath = path.join(pluginRoot, "manifest.toml");
    const meta = parseSimpleToml(fs.readFileSync(manifestPath, "utf8"));
    if (meta.id !== id) {
      throw new Error(
        `Community plugin id mismatch: registry.toml has "${id}", manifest.toml has "${meta.id}"`,
      );
    }
    if (entry.version && meta.version !== entry.version) {
      throw new Error(
        `Community plugin "${id}" version mismatch: registry.toml has "${entry.version}", manifest.toml has "${meta.version}"`,
      );
    }

    const hasUi = Boolean(meta.ui_entry);
    return {
      id: meta.id,
      name: meta.name || entry.name || meta.id,
      version: meta.version || entry.version,
      description: meta.description || entry.description || "",
      download_url: downloadUrl,
      sha256: expectedSha,
      capabilities: meta.capabilities.length > 0 ? meta.capabilities : entry.capabilities,
      has_ui: hasUi,
      official: false,
      permissions: {
        plugin_id: meta.id,
        domains: meta.domains,
        credentials: meta.credentials,
        workspace_read: meta.workspace_read,
      },
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function processRegistryFile(registryPath, options) {
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  const raw = fs.readFileSync(registryPath, "utf8");
  const parsed = parseRegistryToml(raw);
  if (parsed.length === 0) {
    return [];
  }
  const results = [];
  for (const entry of parsed) {
    results.push(await processRegistryEntry(entry, options));
  }
  return results;
}

function getCliArgValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return null;
}

async function main() {
  const xcpcBin = process.env.XCPC_BIN || "xcpc";
  const baseUrl = (process.env.BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
  const registryPath = path.resolve(
    getCliArgValue(process.argv, "--registry") || path.join(repoRoot, "registry.toml"),
  );

  fs.mkdirSync(outDir, { recursive: true });
  const viteBin = path.join(repoRoot, "node_modules", ".bin", "vite");
  if (!fs.existsSync(viteBin)) {
    throw new Error(`vite not found at ${viteBin}; run \`npm install\` first`);
  }

  const entries = [];
  const seenIds = new Set();
  const pluginDirs = fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dirName of pluginDirs) {
    const pluginDir = path.join(pluginsRoot, dirName);
    const manifestPath = path.join(pluginDir, "manifest.toml");
    if (!fs.existsSync(manifestPath)) continue;

    const needsViteBuild =
      fs.existsSync(path.join(pluginDir, "vite.config.ts")) ||
      fs.existsSync(path.join(pluginDir, "vite.config.js")) ||
      fs.existsSync(path.join(pluginDir, "vite.config.mjs"));

    let packSourceDir = pluginDir;
    if (needsViteBuild) {
      console.log(`\n[build] ${dirName}`);
      execFileSync(viteBin, ["build"], { cwd: pluginDir, stdio: "inherit" });
      packSourceDir = path.join(pluginDir, "dist");
    } else {
      console.log(`\n[zero-build] ${dirName}`);
    }

    console.log(`[check] ${dirName}`);
    const checkRaw = execFileSync(xcpcBin, ["plugin", "check", packSourceDir, "--json"], {
      encoding: "utf8",
    });
    const checkReport = JSON.parse(checkRaw);
    if (!checkReport.ok) {
      throw new Error(`xcpc plugin check failed for ${dirName}: ${checkRaw}`);
    }

    const meta = parseSimpleToml(fs.readFileSync(manifestPath, "utf8"));
    const zipName = `${meta.id}-${meta.version}.zip`;
    const zipPath = path.join(outDir, zipName);
    console.log(`[pack]  ${dirName} -> ${zipName}`);
    const packRaw = execFileSync(
      xcpcBin,
      ["plugin", "pack", packSourceDir, "-o", zipPath, "--json"],
      { encoding: "utf8" },
    );
    const packReport = JSON.parse(packRaw);
    const hasUi = Boolean(meta.ui_entry);

    seenIds.add(meta.id);
    entries.push({
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      download_url: `${baseUrl}/${zipName}`,
      sha256: packReport.sha256,
      capabilities: meta.capabilities,
      has_ui: hasUi,
      official: true,
      permissions: {
        plugin_id: meta.id,
        domains: meta.domains,
        credentials: meta.credentials,
        workspace_read: meta.workspace_read,
      },
    });
  }

  const officialCount = entries.length;
  const communityEntries = await processRegistryFile(registryPath, { xcpcBin });
  for (const community of communityEntries) {
    if (seenIds.has(community.id)) {
      throw new Error(`Duplicate plugin id "${community.id}" in registry.toml`);
    }
    seenIds.add(community.id);
    entries.push(community);
  }

  const catalog = {
    name: "XCPC Official",
    plugins: entries,
  };

  const indexPath = path.join(outDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  if (process.argv.includes("--write-root")) {
    fs.writeFileSync(
      path.join(repoRoot, "index.json"),
      JSON.stringify(catalog, null, 2) + "\n",
      "utf8",
    );
  }
  console.log(
    `\nWrote ${indexPath} (${officialCount} official, ${communityEntries.length} community plugins)`,
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  await main();
}
