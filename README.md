# XCPC Workstation Official Plugins & Registry

Official offline tool plugins and community plugin registry (`index.json`) for [XCPC Workstation](https://github.com/lihaoze123/xcpc-workstation).

## Official Tool Plugins

All official tool plugins are built with `@xcpc-workstation/plugin-sdk` + Vite + TypeScript. Custom UI tools bundle into a single self-contained pure-Web `ui.html` rendered inside XCPC Workstation's sandboxed `<WebView>`, while headless tools run purely in the QuickJS sandbox (`index.js`):

- **`graph-editor`** — 图论与几何画板（pure-Web `ui.html` 交互画布 + `index.js` 后端，边表/父数组/邻接表/坐标双向联动、拖拽与多种布局、SVG/PNG 导出）
- **`math-bitwise`** — 数论与位运算工作台（pure-Web `ui.html` 交互界面 + `index.js` 后端，64 位按位翻转、质因数分解、gcd/exgcd、快速幂/模逆元、CRT、常用模数速查）
- **`complexity-mem`** — 复杂度与内存估算（无头表单工具，时间复杂度运算量安全边界与多维数组精确 MiB 估算）
- **`string-lab`** — 字符串算法调试器（无头表单工具，KMP 前缀函数、Z 函数、Manacher 回文半径、后缀数组 SA / LCP）

## Official Template Plugins

Pure Typst typesetting template plugins (`capabilities = ["template"]`, zero JS, no trust prompt required):

- **`editorial-slides`** — Beamer Warsaw 风格题解演示文稿模板（`plugin:editorial-slides/warsaw`，基于 Touying 0.8 + `pinit` + `mannot` + `CeTZ`，支持分步动画、讲义模式与公式/代码锚点标注）

## Local Build & Packaging

```bash
npm install
npm run typecheck
# Build all official plugins, run `xcpc plugin check` & `xcpc plugin pack`, and emit `dist-repo/index.json`
XCPC_BIN=/path/to/xcpc BASE_URL=http://127.0.0.1:8787 npm run build
```

## Submitting a Community Plugin

1. Develop and test your plugin in your own repository — see the full [Plugin Development Guide](https://github.com/lihaoze123/xcpc-workstation/blob/main/docs/plugin-development.md).
2. Build and package a release `.zip` with `xcpc plugin pack dist` and upload it to an HTTPS GitHub Release.
3. Open a PR adding your plugin's metadata, `download_url`, and `sha256` to [`registry.toml`](./registry.toml).
4. CI automatically downloads the archive, verifies its SHA-256 digest, and runs `xcpc plugin check` before publishing to `index.json`.
