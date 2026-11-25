import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pluginsRoot = path.join(repoRoot, "plugins");
const outDir = path.join(repoRoot, "dist-repo");
const xcpcBin = process.env.XCPC_BIN || "xcpc";
const baseUrl = (
  process.env.BASE_URL ||
  "https://github.com/lihaoze123/xcpc-plugins/releases/latest/download"
).replace(/\/+$/, "");

function parseSimpleToml(raw) {
  const out = {
    id: "",
    name: "",
    version: "",
    description: "",
    ui_entry: undefined,
    capabilities: [],
    domains: [],
    workspace_read: false,
  };
  let section = "";
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("[[")) {
      section = line;
      continue;
    }
    if (line.startsWith("[")) {
      section = line.slice(1, -1).trim();
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (section === "") {
      if (val.startsWith('"') && val.endsWith('"')) {
        const str = val.slice(1, -1);
        if (key === "id") out.id = str;
        else if (key === "name") out.name = str;
        else if (key === "version") out.version = str;
        else if (key === "description") out.description = str;
        else if (key === "ui_entry") out.ui_entry = str;
      } else if (key === "capabilities" && val.startsWith("[") && val.endsWith("]")) {
        out.capabilities = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      }
    } else if (section === "permissions") {
      if (key === "workspace_read") {
        out.workspace_read = val === "true";
      } else if (key === "domains" && val.startsWith("[") && val.endsWith("]")) {
        out.domains = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      }
    }
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
const viteBin = path.join(repoRoot, "node_modules", ".bin", "vite");
if (!fs.existsSync(viteBin)) {
  throw new Error(`vite not found at ${viteBin}; run \`npm install\` first`);
}

const entries = [];
const pluginDirs = fs
  .readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dirName of pluginDirs) {
  const pluginDir = path.join(pluginsRoot, dirName);
  const manifestPath = path.join(pluginDir, "manifest.toml");
  if (!fs.existsSync(manifestPath)) continue;

  console.log(`\n[build] ${dirName}`);
  execFileSync(viteBin, ["build"], { cwd: pluginDir, stdio: "inherit" });

  const distDir = path.join(pluginDir, "dist");
  console.log(`[check] ${dirName}`);
  const checkRaw = execFileSync(xcpcBin, ["plugin", "check", distDir, "--json"], {
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
    ["plugin", "pack", distDir, "-o", zipPath, "--json"],
    { encoding: "utf8" },
  );
  const packReport = JSON.parse(packRaw);
  const hasUi = Boolean(meta.ui_entry);

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
      credentials: [],
      workspace_read: meta.workspace_read,
      has_unsandboxed_ui: hasUi,
    },
  });
}

const catalog = {
  name: "XCPC Official",
  plugins: entries,
};

const indexPath = path.join(outDir, "index.json");
fs.writeFileSync(indexPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
if (process.argv.includes("--write-root")) {
  fs.writeFileSync(path.join(repoRoot, "index.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
}
console.log(`\nWrote ${indexPath} (${entries.length} official plugins)`);
