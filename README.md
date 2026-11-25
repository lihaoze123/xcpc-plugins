# XCPC Workstation Official Plugins & Registry

Official tool plugins and community plugin index for [XCPC Workstation](https://github.com/lihaoze123/xcpc-workstation).

## Official Tool Plugins

All official tool plugins are built with `@xcpc/plugin-sdk` + Vite + TypeScript/TSX:

- **`graph-editor`** — 图论与几何画板（交互式 `ui.js` 画布，边表/父数组/邻接表/坐标双向联动、拖拽与多种布局、SVG/PNG 导出）
- **`math-bitwise`** — 数论与位运算工作台（64 位按位翻转、质因数分解、gcd/exgcd、快速幂/模逆元、CRT、常用模数速查）
- **`complexity-mem`** — 复杂度与内存估算（时间复杂度运算量安全边界与多维数组精确 MiB 估算）
- **`string-lab`** — 字符串算法调试器（KMP 前缀函数、Z 函数、Manacher 回文半径、后缀数组 SA / LCP）

## Local Build & Packaging

```bash
npm install
npm run typecheck
# Build all official plugins, run `xcpc plugin check` & `xcpc plugin pack`, and emit `dist-repo/index.json`
XCPC_BIN=/path/to/xcpc BASE_URL=http://127.0.0.1:8787 npm run build
```

## Submitting a Community Plugin

1. Develop and test your plugin in your own repository using `@xcpc/plugin-sdk`.
2. Build and package a release `.zip` with `xcpc plugin pack dist` and upload it to a GitHub Release.
3. Open a PR adding your plugin's metadata, `download_url`, and `sha256` to `registry.toml`.
4. CI verifies the SHA-256 digest and runs `xcpc plugin check` before merging into `index.json`.
