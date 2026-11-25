import "./style.css";
import type { XcpcBridge, XcpcTheme } from "@xcpc/plugin-sdk/ui";

function getBridge(): XcpcBridge | undefined {
  return window.xcpc;
}

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const b = getBridge();
  if (b?.storage) {
    try {
      const val = await b.storage.get<T>(key);
      if (val !== null && val !== undefined) return val;
    } catch {
      // ignore
    }
  } else {
    try {
      const raw = localStorage.getItem(`graph-editor:${key}`);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // ignore
    }
  }
  return fallback;
}

function kvSet(key: string, value: unknown): void {
  const b = getBridge();
  if (b?.storage) {
    void b.storage.set(key, value).catch(() => {});
  } else {
    try {
      localStorage.setItem(`graph-editor:${key}`, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

function showToast(text: string, kind?: "info" | "success" | "error"): void {
  getBridge()?.toast?.(text, kind);
}

function resolveScheme(theme: XcpcTheme | string | undefined): "light" | "dark" | null {
  if (!theme) return null;
  const s = typeof theme === "string" ? theme : theme.scheme;
  return s === "dark" || s === "light" ? s : null;
}

// ---------------------------------------------------------------------------
// Graph Types & Constants
// ---------------------------------------------------------------------------

interface NodeItem {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string | null;
}

interface RawNodeItem {
  id: string;
  label: string;
  x: number | null;
  y: number | null;
  color: string | null;
}

interface EdgeItem {
  from: string;
  to: string;
  weight: string | null;
}

const NODE_R = 18;

const PALETTE = [
  { id: null as string | null, name: "默认", light: "", dark: "", lightStroke: "", darkStroke: "" },
  { id: "cyan", name: "青蓝", light: "#E0F2FE", dark: "#164E63", lightStroke: "#0284C7", darkStroke: "#38BDF8" },
  { id: "green", name: "绿", light: "#DCFCE7", dark: "#14532D", lightStroke: "#15803D", darkStroke: "#4ADE80" },
  { id: "amber", name: "橙", light: "#FEF3C7", dark: "#78350F", lightStroke: "#B45309", darkStroke: "#FBBF24" },
  { id: "red", name: "红", light: "#FEE2E2", dark: "#7F1D1D", lightStroke: "#B91C1C", darkStroke: "#F87171" },
];

const SAMPLES = {
  tree: {
    format: "parent_array",
    directed: false,
    oneIndexed: true,
    layout: "tree",
    text: "1 1 2 2 3 3",
  },
  weighted: {
    format: "edge_list",
    directed: true,
    oneIndexed: true,
    layout: "force",
    text: "1 2 5\n1 3 2\n2 4 1\n2 5 4\n3 5 3\n4 5 7",
  },
  geometry: {
    format: "coords",
    directed: false,
    oneIndexed: true,
    layout: "coords",
    text: "1 0 0\n2 4 0\n3 2 3\n4 6 3\nedge 1 2\nedge 2 3\nedge 3 1\nedge 2 4\nedge 3 4",
  },
} as const;

const FORMAT_ITEMS = [
  { value: "edge_list", label: "边表" },
  { value: "parent_array", label: "父数组" },
  { value: "adj_list", label: "邻接表" },
  { value: "coords", label: "点坐标" },
];

const INDEX_ITEMS = [
  { value: "1", label: "从 1 开始" },
  { value: "0", label: "从 0 开始" },
];

const DIR_ITEMS = [
  { value: "undirected", label: "无向图" },
  { value: "directed", label: "有向图" },
];

const LAYOUT_ITEMS = [
  { value: "force", label: "力导向" },
  { value: "tree", label: "树" },
  { value: "circle", label: "圆形" },
  { value: "coords", label: "按坐标" },
];

function findPaletteEntry(colorKey: string | null) {
  if (!colorKey) return null;
  return PALETTE.find((p) => p.id === colorKey || p.light === colorKey || p.dark === colorKey) ?? null;
}

function resolveNodeFill(colorKey: string | null, dark: boolean, fallback: string) {
  if (!colorKey) return fallback;
  const entry = findPaletteEntry(colorKey);
  if (entry?.id) return dark ? entry.dark : entry.light;
  return colorKey;
}

function resolveNodeStroke(colorKey: string | null, dark: boolean, isSel: boolean, primary: string, fallback: string) {
  if (isSel) return primary;
  const entry = findPaletteEntry(colorKey);
  if (entry?.id) return dark ? entry.darkStroke : entry.lightStroke;
  return fallback;
}

function resolveNodeText(colorKey: string | null, dark: boolean, fallback: string) {
  if (!colorKey) return fallback;
  const entry = findPaletteEntry(colorKey);
  if (entry?.id) return dark ? "#FAFAFA" : "#09090B";
  return "#09090B";
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fitBounds(points: Array<{ x: number; y: number }>, w: number, h: number, pad: number) {
  if (points.length === 0) return { centerX: w / 2, centerY: h / 2, scale: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const usableW = Math.max(1, w - pad * 2);
  const usableH = Math.max(1, h - pad * 2);
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.min(usableW / spanX, usableH / spanY),
  };
}

function clampNodesToBounds(list: NodeItem[], w: number, hVal: number): NodeItem[] {
  const pad = Math.min(48, Math.max(NODE_R + 14, Math.min(w, hVal) * 0.12));
  const minX = pad;
  const maxX = Math.max(pad, w - pad);
  const minY = pad;
  const maxY = Math.max(pad, hVal - pad);
  return list.map((nd) => ({
    ...nd,
    x: Math.max(minX, Math.min(maxX, Number.isFinite(nd.x) ? nd.x : w / 2)),
    y: Math.max(minY, Math.min(maxY, Number.isFinite(nd.y) ? nd.y : hVal / 2)),
  }));
}

function clampNodesToDragBounds(list: NodeItem[], w: number, hVal: number): NodeItem[] {
  const pad = NODE_R + 4;
  const minX = pad;
  const maxX = Math.max(pad, w - pad);
  const minY = pad;
  const maxY = Math.max(pad, hVal - pad);
  return list.map((nd) => ({
    ...nd,
    x: Math.max(minX, Math.min(maxX, Number.isFinite(nd.x) ? nd.x : w / 2)),
    y: Math.max(minY, Math.min(maxY, Number.isFinite(nd.y) ? nd.y : hVal / 2)),
  }));
}

function placeNewNodes(rawNodes: RawNodeItem[], rawEdges: EdgeItem[], w: number, hVal: number): NodeItem[] {
  const dragPad = NODE_R + 4;
  const placePad = Math.min(52, Math.max(NODE_R + 18, Math.min(w, hVal) * 0.14));
  const clampDragX = (x: number) => Math.max(dragPad, Math.min(Math.max(dragPad, w - dragPad), x));
  const clampDragY = (y: number) => Math.max(dragPad, Math.min(Math.max(dragPad, hVal - dragPad), y));
  const clampPlaceX = (x: number) => Math.max(placePad, Math.min(Math.max(placePad, w - placePad), x));
  const clampPlaceY = (y: number) => Math.max(placePad, Math.min(Math.max(placePad, hVal - placePad), y));

  const adj = new Map<string, string[]>();
  for (const nd of rawNodes) adj.set(nd.id, []);
  for (const e of rawEdges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }

  const placedMap = new Map<string, { x: number; y: number }>();
  for (const nd of rawNodes) {
    if (nd.x != null && nd.y != null && Number.isFinite(nd.x) && Number.isFinite(nd.y)) {
      placedMap.set(nd.id, { x: clampDragX(nd.x), y: clampDragY(nd.y) });
    }
  }

  const step = Math.min(100, Math.max(64, Math.min(w, hVal) * 0.22));
  const circleRadius = Math.max(44, Math.min(w, hVal) * 0.34);

  for (const nd of rawNodes) {
    if (placedMap.has(nd.id)) continue;

    const placedValues = [...placedMap.values()];
    const allCx =
      placedValues.length > 0 ? placedValues.reduce((acc, p) => acc + p.x, 0) / placedValues.length : w / 2;
    const allCy =
      placedValues.length > 0 ? placedValues.reduce((acc, p) => acc + p.y, 0) / placedValues.length : hVal / 2;

    const placedNeighbors: Array<{ x: number; y: number }> = [];
    for (const nb of adj.get(nd.id) ?? []) {
      const p = placedMap.get(nb);
      if (p) placedNeighbors.push(p);
    }

    const candidates: Array<{ x: number; y: number }> = [];
    if (placedNeighbors.length > 0) {
      const nx = placedNeighbors.reduce((acc, p) => acc + p.x, 0) / placedNeighbors.length;
      const ny = placedNeighbors.reduce((acc, p) => acc + p.y, 0) / placedNeighbors.length;
      const dx = nx - allCx;
      const dy = ny - allCy;
      const baseAngle = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : -Math.PI / 2;
      const count = 12;
      for (let i = 0; i < count; i++) {
        const a = baseAngle + (i * 2 * Math.PI) / count;
        candidates.push({
          x: clampPlaceX(nx + step * Math.cos(a)),
          y: clampPlaceY(ny + step * Math.sin(a)),
        });
      }
    } else {
      const count = 16;
      for (let i = 0; i < count; i++) {
        const a = (i * 2 * Math.PI) / count - Math.PI / 2;
        candidates.push({
          x: clampPlaceX(w / 2 + circleRadius * Math.cos(a)),
          y: clampPlaceY(hVal / 2 + circleRadius * Math.sin(a)),
        });
      }
    }

    let best = candidates[0] ?? { x: w / 2, y: hVal / 2 };
    let bestScore = -1;
    for (const c of candidates) {
      let minDist = Infinity;
      for (const p of placedValues) {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < minDist) minDist = d;
      }
      const score = Number.isFinite(minDist) ? minDist : Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    placedMap.set(nd.id, best);
  }

  return rawNodes.map((nd) => {
    const p = placedMap.get(nd.id) ?? { x: w / 2, y: hVal / 2 };
    return { id: nd.id, label: nd.label, x: p.x, y: p.y, color: nd.color };
  });
}

function layoutNodes(rawNodes: RawNodeItem[], rawEdges: EdgeItem[], mode: string, w: number, hVal: number): NodeItem[] {
  const list: NodeItem[] = rawNodes.map((n) => ({ ...n, x: n.x ?? 0, y: n.y ?? 0 }));
  const n = list.length;
  if (n === 0) return list;
  const pad = Math.min(52, Math.max(NODE_R + 18, Math.min(w, hVal) * 0.14));
  const cx = w / 2;
  const cy = hVal / 2;
  const radius = Math.max(36, Math.min(w, hVal) / 2 - pad);

  if (mode === "coords" && rawNodes.some((nd) => nd.x != null && nd.y != null)) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const nd of rawNodes) {
      if (nd.x != null && nd.y != null) {
        minX = Math.min(minX, nd.x);
        maxX = Math.max(maxX, nd.x);
        minY = Math.min(minY, nd.y);
        maxY = Math.max(maxY, nd.y);
      }
    }
    const sx = Math.max(1e-6, maxX - minX);
    const sy = Math.max(1e-6, maxY - minY);
    const usableW = Math.max(1, w - 2 * pad);
    const usableH = Math.max(1, hVal - 2 * pad);
    for (let i = 0; i < n; i++) {
      const orig = rawNodes[i];
      if (orig.x == null || orig.y == null) {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        list[i].x = cx + radius * Math.cos(a);
        list[i].y = cy + radius * Math.sin(a);
      } else {
        list[i].x = pad + ((orig.x - minX) / sx) * usableW;
        list[i].y = hVal - pad - ((orig.y - minY) / sy) * usableH;
      }
    }
    return clampNodesToBounds(list, w, hVal);
  }

  if (mode === "tree") {
    const adj = new Map<string, string[]>();
    for (const nd of list) adj.set(nd.id, []);
    for (const e of rawEdges) {
      adj.get(e.from)?.push(e.to);
      adj.get(e.to)?.push(e.from);
    }
    const depth = new Map<string, number>();
    const levels: string[][] = [];
    for (const nd of list) {
      if (depth.has(nd.id)) continue;
      const q = [nd.id];
      depth.set(nd.id, 0);
      while (q.length > 0) {
        const u = q.shift()!;
        const d = depth.get(u)!;
        if (!levels[d]) levels[d] = [];
        levels[d].push(u);
        for (const v of adj.get(u) ?? []) {
          if (!depth.has(v)) {
            depth.set(v, d + 1);
            q.push(v);
          }
        }
      }
    }
    const pos = new Map<string, { x: number; y: number }>();
    const maxD = Math.max(1, levels.length - 1);
    for (let d = 0; d < levels.length; d++) {
      const row = levels[d];
      const y = levels.length === 1 ? cy : pad + (d / maxD) * (hVal - 2 * pad);
      for (let i = 0; i < row.length; i++) {
        const x = row.length === 1 ? cx : pad + ((i + 0.5) / row.length) * (w - 2 * pad);
        pos.set(row[i], { x, y });
      }
    }
    for (const nd of list) {
      const p = pos.get(nd.id) ?? { x: cx, y: cy };
      nd.x = p.x;
      nd.y = p.y;
    }
    return clampNodesToBounds(list, w, hVal);
  }

  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    list[i].x = cx + radius * Math.cos(a);
    list[i].y = cy + radius * Math.sin(a);
  }
  if (mode === "circle" || n <= 2) return clampNodesToBounds(list, w, hVal);

  const idx = new Map<string, number>();
  list.forEach((nd, i) => idx.set(nd.id, i));
  const usableW = Math.max(80, w - 2 * pad);
  const usableH = Math.max(80, hVal - 2 * pad);
  const k = Math.sqrt((usableW * usableH) / Math.max(1, n)) * 0.85;
  let temp = Math.min(usableW, usableH) / 6;

  for (let iter = 0; iter < 55; iter++) {
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const vx = list[i].x - list[j].x;
        const vy = list[i].y - list[j].y;
        const dist = Math.hypot(vx, vy) || 0.01;
        const rep = (k * k) / dist;
        dx[i] += (vx / dist) * rep;
        dy[i] += (vy / dist) * rep;
        dx[j] -= (vx / dist) * rep;
        dy[j] -= (vy / dist) * rep;
      }
    }
    for (const e of rawEdges) {
      const u = idx.get(e.from);
      const v = idx.get(e.to);
      if (u == null || v == null || u === v) continue;
      const vx = list[u].x - list[v].x;
      const vy = list[u].y - list[v].y;
      const dist = Math.hypot(vx, vy) || 0.01;
      const attr = (dist * dist) / k;
      dx[u] -= (vx / dist) * attr;
      dy[u] -= (vy / dist) * attr;
      dx[v] += (vx / dist) * attr;
      dy[v] += (vy / dist) * attr;
    }
    for (let i = 0; i < n; i++) {
      const disp = Math.hypot(dx[i], dy[i]) || 0.01;
      const step = Math.min(disp, temp);
      list[i].x = Math.max(pad, Math.min(w - pad, list[i].x + (dx[i] / disp) * step));
      list[i].y = Math.max(pad, Math.min(hVal - pad, list[i].y + (dy[i] / disp) * step));
    }
    temp *= 0.93;
  }

  const fit = fitBounds(list, w, hVal, pad);
  const s = Math.min(1, fit.scale);
  for (const nd of list) {
    nd.x = cx + (nd.x - fit.centerX) * s;
    nd.y = cy + (nd.y - fit.centerY) * s;
  }
  return clampNodesToBounds(list, w, hVal);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// ---------------------------------------------------------------------------
// App Boot
// ---------------------------------------------------------------------------

async function mount() {
  const root = document.getElementById("app");
  if (!root) return;

  const bridge = getBridge();
  const initialScheme = resolveScheme(bridge?.theme);
  let isDark =
    initialScheme === "dark" ||
    (!initialScheme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const applyThemeAttr = (theme: XcpcTheme | string | undefined) => {
    const scheme = resolveScheme(theme);
    if (scheme) {
      document.documentElement.setAttribute("data-theme", scheme);
      isDark = scheme === "dark";
    }
  };
  applyThemeAttr(bridge?.theme);

  const [savedFormat, savedOneIndexed, savedDirected, savedLayout, savedText] = await Promise.all([
    kvGet<string>("format", "edge_list"),
    kvGet<boolean>("oneIndexed", true),
    kvGet<boolean>("directed", false),
    kvGet<string>("layoutMode", "force"),
    kvGet<string>("editorText", "1 2 5\n1 3 2\n2 4 1\n2 5 4\n3 5 3"),
  ]);

  let format = savedFormat;
  let oneIndexed = savedOneIndexed;
  let directed = savedDirected;
  let layoutMode = savedLayout;
  let editorText = savedText;
  let nodes: NodeItem[] = [];
  let edges: EdgeItem[] = [];
  let selectedId: string | null = null;
  let connectMode = false;
  let connectFrom: string | null = null;
  let canvasWidth = 480;
  let canvasHeight = 420;
  let pointerPos: { x: number; y: number } | null = null;

  let draggingId: string | null = null;
  let dragMoved = false;
  let suppressTextParse = false;
  let hasUserDragged = false;
  let hasMeasuredCanvas = false;
  let rafId = 0;

  // --- Segmented control helper ---
  function createSegmented(
    items: Array<{ value: string; label: string }>,
    getValue: () => string,
    onChange: (value: string) => void,
    testPrefix: string,
  ) {
    const wrap = el("div", { class: "segmented" });
    const btns = new Map<string, HTMLButtonElement>();
    for (const item of items) {
      const btn = el(
        "button",
        { type: "button", "data-testid": `${testPrefix}-${item.value}` },
        item.label,
      );
      btn.addEventListener("click", () => onChange(item.value));
      btns.set(item.value, btn);
      wrap.append(btn);
    }
    const sync = () => {
      const cur = getValue();
      for (const [val, btn] of btns.entries()) {
        btn.classList.toggle("active", val === cur);
      }
    };
    sync();
    return { el: wrap, sync };
  }

  // --- Left Sidebar ---
  const segFormat = createSegmented(
    FORMAT_ITEMS,
    () => format,
    (id) => {
      format = id;
      kvSet("format", id);
      segFormat.sync();
      parseTextToGraph(id, editorText, false);
    },
    "graph-format",
  );

  const segIndex = createSegmented(
    INDEX_ITEMS,
    () => (oneIndexed ? "1" : "0"),
    (v) => {
      oneIndexed = v === "1";
      kvSet("oneIndexed", oneIndexed);
      segIndex.sync();
      parseTextToGraph(format, editorText, false);
    },
    "graph-index",
  );

  const segDir = createSegmented(
    DIR_ITEMS,
    () => (directed ? "directed" : "undirected"),
    (v) => {
      directed = v === "directed";
      kvSet("directed", directed);
      segDir.sync();
      scheduleDraw();
    },
    "graph-dir",
  );

  const segLayout = createSegmented(
    LAYOUT_ITEMS,
    () => layoutMode,
    (id) => applyLayout(id),
    "graph-layout",
  );

  const btnSampleTree = el("button", { class: "btn", type: "button", "data-testid": "graph-sample-tree" }, "示例树");
  const btnSampleWeighted = el("button", { class: "btn", type: "button", "data-testid": "graph-sample-weighted" }, "带权图");
  const btnSampleGeometry = el("button", { class: "btn", type: "button", "data-testid": "graph-sample-geometry" }, "几何点集");
  const btnConnect = el(
    "button",
    { class: "btn btn-toggle", type: "button", "data-testid": "graph-connect-toggle" },
    el("span", { class: "connect-dot" }),
    "连边模式",
  );

  const textarea = el("textarea", {
    class: "editor-textarea",
    placeholder: "每行一条边 u v [w]",
    spellcheck: "false",
    "data-testid": "graph-editor-input",
  });
  textarea.value = editorText;

  const inspectorSlot = el("div");

  const sidebar = el(
    "aside",
    { class: "sidebar" },
    el("div", { class: "section" }, el("span", { class: "section-label" }, "输入格式"), segFormat.el),
    el("div", { class: "section", style: "gap:6px;" }, segIndex.el, segDir.el),
    el("div", { class: "section" }, el("span", { class: "section-label" }, "布局方式"), segLayout.el),
    el("div", { class: "chip-row" }, btnSampleTree, btnSampleWeighted, btnSampleGeometry, btnConnect),
    textarea,
    inspectorSlot,
  );

  // --- Right Workspace ---
  const statsEl = el("div", { class: "stats", "data-testid": "graph-stats" });
  const btnRelayout = el("button", { class: "btn", type: "button", "data-testid": "graph-relayout" }, "重新布局");
  const btnExportSvg = el("button", { class: "btn", type: "button", "data-testid": "graph-export-svg" }, "导出 SVG");
  const btnExportPng = el("button", { class: "btn btn-primary", type: "button", "data-testid": "graph-export-png" }, "导出 PNG");

  const toolbar = el(
    "div",
    { class: "toolbar" },
    statsEl,
    el("div", { class: "toolbar-actions" }, btnRelayout, btnExportSvg, btnExportPng),
  );

  const canvasEl = el("canvas", { "data-testid": "graph-canvas" });
  const canvasWrap = el("div", { class: "canvas-wrap" }, canvasEl);
  const workspace = el("main", { class: "workspace" }, toolbar, canvasWrap);

  root.replaceChildren(sidebar, workspace);

  // --- UI Sync Helpers ---
  function updateStats() {
    statsEl.textContent = `节点 ${nodes.length}   边 ${edges.length}${connectFrom ? `   连边起点：${connectFrom}` : ""}`;
  }

  function updateConnectBtn() {
    btnConnect.classList.toggle("active", connectMode);
    canvasEl.style.cursor = connectMode ? "crosshair" : "default";
  }

  function updateInspector() {
    if (!selectedId) {
      inspectorSlot.replaceChildren(
        el(
          "p",
          { class: "hint-text" },
          "拖拽节点调整位置，点击空白加点，开启「连边模式」依次点击两点连边。",
        ),
      );
      return;
    }
    const curNode = nodes.find((n) => n.id === selectedId);
    const activeColor = curNode?.color ?? null;
    const delBtn = el("button", { class: "btn btn-danger", type: "button", "data-testid": "graph-delete-node" }, "删除");
    delBtn.addEventListener("click", deleteSelected);

    const swatchRow = el("div", { class: "swatch-row" });
    for (const sw of PALETTE) {
      const swatch = el("button", {
        class: activeColor === sw.id ? "swatch picked" : "swatch",
        type: "button",
        title: sw.name,
        "data-testid": `graph-color-${sw.id ?? "default"}`,
      });
      swatch.style.backgroundColor = sw.id ? (isDark ? sw.dark : sw.light) : "var(--muted)";
      swatch.addEventListener("click", () => recolorSelected(sw.id));
      swatchRow.append(swatch);
    }

    inspectorSlot.replaceChildren(
      el(
        "div",
        { class: "inspector-card" },
        el(
          "div",
          { class: "inspector-header" },
          el("span", { class: "inspector-title" }, `选中节点：${selectedId}`),
          delBtn,
        ),
        swatchRow,
      ),
    );
  }

  // --- Graph Operations ---
  function parseTextToGraph(fmt: string, text: string, keepPositions: boolean) {
    const prevPos = new Map<string, { x: number; y: number; color: string | null }>();
    if (keepPositions) {
      for (const nd of nodes) prevPos.set(nd.id, { x: nd.x, y: nd.y, color: nd.color });
    }
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

    const nodeMap = new Map<string, RawNodeItem>();
    const parsedEdges: EdgeItem[] = [];

    function ensure(id: string, extra?: { x?: number; y?: number; color?: string | null }) {
      const k = String(id);
      if (!nodeMap.has(k)) {
        const old = prevPos.get(k);
        nodeMap.set(k, {
          id: k,
          label: k,
          x: extra?.x ?? old?.x ?? null,
          y: extra?.y ?? old?.y ?? null,
          color: extra?.color ?? old?.color ?? null,
        });
      } else if (extra) {
        const cur = nodeMap.get(k)!;
        if (extra.x != null) cur.x = extra.x;
        if (extra.y != null) cur.y = extra.y;
      }
    }

    const startIdx = oneIndexed ? 1 : 0;
    if (fmt === "parent_array") {
      const toks = lines.join(" ").split(/[\s,]+/).filter(Boolean);
      if (toks.length > 0) {
        const firstVal = Number(toks[0]);
        const hasRoot = firstVal === 0 || firstVal === -1 || (!oneIndexed && firstVal < 0);
        if (hasRoot) {
          for (let i = 0; i < toks.length; i++) {
            const u = String(startIdx + i);
            ensure(u);
            if (Number(toks[i]) >= startIdx) {
              ensure(toks[i]);
              parsedEdges.push({ from: String(toks[i]), to: u, weight: null });
            }
          }
        } else {
          ensure(String(startIdx));
          for (let i = 0; i < toks.length; i++) {
            const u = String(startIdx + i + 1);
            ensure(toks[i]);
            ensure(u);
            parsedEdges.push({ from: String(toks[i]), to: u, weight: null });
          }
        }
      }
    } else if (fmt === "adj_list") {
      for (const line of lines) {
        const c = line.indexOf(":");
        if (c < 0) continue;
        const u = line.slice(0, c).trim();
        if (!u) continue;
        ensure(u);
        for (const item of line
          .slice(c + 1)
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)) {
          const m = item.match(/^([^()]+)(?:\(([^)]+)\))?$/);
          if (m) {
            ensure(m[1]);
            parsedEdges.push({ from: u, to: m[1], weight: m[2] || null });
          }
        }
      }
    } else if (fmt === "coords") {
      let autoId = startIdx;
      for (const line of lines) {
        const p = line.split(/[\s,]+/).filter(Boolean);
        if (p[0] === "e" || p[0] === "edge") {
          if (p.length >= 3) {
            ensure(p[1]);
            ensure(p[2]);
            parsedEdges.push({ from: p[1], to: p[2], weight: p[3] || null });
          }
        } else if (p.length >= 3 && Number.isFinite(Number(p[1])) && Number.isFinite(Number(p[2]))) {
          ensure(p[0], { x: Number(p[1]), y: Number(p[2]) });
        } else if (p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
          ensure(String(autoId++), { x: Number(p[0]), y: Number(p[1]) });
        }
      }
    } else {
      for (const line of lines) {
        const p = line.split(/[\s,]+/).filter(Boolean);
        if (p.length === 1) ensure(p[0]);
        else if (p.length >= 2) {
          ensure(p[0]);
          ensure(p[1]);
          parsedEdges.push({ from: p[0], to: p[1], weight: p[2] || null });
        }
      }
    }

    const rawList = [...nodeMap.values()];
    const hasExisting = keepPositions && prevPos.size > 0;
    if (!hasExisting) {
      nodes = layoutNodes(rawList, parsedEdges, layoutMode, canvasWidth, canvasHeight);
    } else if (rawList.some((nd) => nd.x == null || nd.y == null)) {
      nodes = placeNewNodes(rawList, parsedEdges, canvasWidth, canvasHeight);
    } else {
      nodes = clampNodesToDragBounds(rawList as NodeItem[], canvasWidth, canvasHeight);
    }
    edges = parsedEdges;
    if (selectedId && !nodes.some((n) => n.id === selectedId)) {
      selectedId = null;
      updateInspector();
    }
    updateStats();
    scheduleDraw();
  }

  function serializeGraphToText(curNodes: NodeItem[], curEdges: EdgeItem[]) {
    let fmt = format;
    if (fmt === "parent_array") {
      fmt = "edge_list";
      format = "edge_list";
      kvSet("format", "edge_list");
      segFormat.sync();
    }
    const lines: string[] = [];
    if (fmt === "coords") {
      for (const nd of curNodes) {
        lines.push(`${nd.id} ${Math.round(nd.x)} ${Math.round(canvasHeight - nd.y)}`);
      }
      for (const e of curEdges) {
        lines.push(`edge ${e.from} ${e.to}${e.weight ? ` ${e.weight}` : ""}`);
      }
    } else if (fmt === "adj_list") {
      const adj = new Map<string, string[]>();
      for (const nd of curNodes) adj.set(nd.id, []);
      for (const e of curEdges) {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)!.push(e.weight ? `${e.to}(${e.weight})` : e.to);
      }
      for (const [u, vs] of adj.entries()) {
        lines.push(`${u}: ${vs.join(" ")}`);
      }
    } else {
      const touched = new Set<string>();
      for (const e of curEdges) {
        touched.add(e.from);
        touched.add(e.to);
        lines.push(`${e.from} ${e.to}${e.weight ? ` ${e.weight}` : ""}`);
      }
      for (const nd of curNodes) {
        if (!touched.has(nd.id)) lines.push(nd.id);
      }
    }
    const text = lines.join("\n");
    suppressTextParse = true;
    editorText = text;
    textarea.value = text;
    kvSet("editorText", text);
    suppressTextParse = false;
  }

  function applyLayout(mode: string) {
    layoutMode = mode;
    kvSet("layoutMode", mode);
    segLayout.sync();
    hasUserDragged = false;
    nodes = layoutNodes(nodes, edges, mode, canvasWidth, canvasHeight);
    if (format === "coords") serializeGraphToText(nodes, edges);
    scheduleDraw();
  }

  function applySample(key: keyof typeof SAMPLES) {
    const s = SAMPLES[key];
    hasUserDragged = false;
    format = s.format;
    directed = s.directed;
    oneIndexed = s.oneIndexed;
    layoutMode = s.layout;
    editorText = s.text;
    textarea.value = s.text;
    kvSet("format", s.format);
    kvSet("directed", s.directed);
    kvSet("oneIndexed", s.oneIndexed);
    kvSet("layoutMode", s.layout);
    kvSet("editorText", s.text);
    selectedId = null;
    connectFrom = null;
    segFormat.sync();
    segDir.sync();
    segIndex.sync();
    segLayout.sync();
    updateInspector();
    parseTextToGraph(s.format, s.text, false);
  }

  function recolorSelected(color: string | null) {
    if (!selectedId) return;
    nodes = nodes.map((n) => (n.id === selectedId ? { ...n, color } : n));
    updateInspector();
    scheduleDraw();
  }

  function deleteSelected() {
    if (!selectedId) return;
    const sid = selectedId;
    nodes = nodes.filter((n) => n.id !== sid);
    edges = edges.filter((e) => e.from !== sid && e.to !== sid);
    selectedId = null;
    if (connectFrom === sid) connectFrom = null;
    serializeGraphToText(nodes, edges);
    updateInspector();
    updateStats();
    scheduleDraw();
  }

  function hitNode(x: number, y: number): NodeItem | null {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (Math.hypot(nodes[i].x - x, nodes[i].y - y) <= NODE_R + 4) return nodes[i];
    }
    return null;
  }

  function nextNodeId(): string {
    const existing = new Set(nodes.map((n) => n.id));
    let cur = oneIndexed ? 1 : 0;
    while (existing.has(String(cur))) cur++;
    return String(cur);
  }

  // --- Rendering (60fps DPR-aware HTML5 Canvas) ---
  function readCssColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    return {
      card: get("--card", isDark ? "#111113" : "#ffffff"),
      muted: get("--muted", isDark ? "#1c1c20" : "#f4f4f5"),
      fg: get("--fg", isDark ? "#fafafa" : "#09090b"),
      secondaryFg: get("--secondary-fg", isDark ? "#d4d4d8" : "#3f3f46"),
      primary: get("--primary", isDark ? "#fafafa" : "#18181b"),
    };
  }

  function drawScene(
    ctx: CanvasRenderingContext2D,
    w: number,
    hVal: number,
    opts: { exportLight?: boolean } = {},
  ) {
    const dark = opts.exportLight ? false : isDark;
    const colors = opts.exportLight
      ? { card: "#ffffff", muted: "#f4f4f5", fg: "#09090b", secondaryFg: "#52525b", primary: "#18181b" }
      : readCssColors();

    ctx.clearRect(0, 0, w, hVal);
    ctx.fillStyle = colors.card;
    ctx.fillRect(0, 0, w, hVal);

    if (!opts.exportLight) {
      ctx.fillStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(9,9,11,0.06)";
      for (let gx = 24; gx < w; gx += 28) {
        for (let gy = 24; gy < hVal; gy += 28) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));
    ctx.strokeStyle = colors.secondaryFg;
    ctx.lineWidth = 1.8;
    ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Rubber-band preview when connecting
    if (!opts.exportLight && connectMode && connectFrom && pointerPos) {
      const u = byId.get(connectFrom);
      if (u) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(pointerPos.x, pointerPos.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const e of edges) {
      const u = byId.get(e.from);
      const v = byId.get(e.to);
      if (!u || !v) continue;
      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const x1 = u.x + ux * NODE_R;
      const y1 = u.y + uy * NODE_R;
      const x2 = v.x - ux * (directed ? NODE_R + 3 : NODE_R);
      const y2 = v.y - uy * (directed ? NODE_R + 3 : NODE_R);

      ctx.strokeStyle = colors.secondaryFg;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (directed) {
        const headLen = 9;
        const ang = Math.atan2(dy, dx);
        ctx.fillStyle = colors.secondaryFg;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(ang - Math.PI / 6),
          y2 - headLen * Math.sin(ang - Math.PI / 6),
        );
        ctx.lineTo(
          x2 - headLen * Math.cos(ang + Math.PI / 6),
          y2 - headLen * Math.sin(ang + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }

      if (e.weight) {
        ctx.fillStyle = colors.fg;
        ctx.fillText(String(e.weight), (x1 + x2) / 2, (y1 + y2) / 2 - 10);
      }
    }

    ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
    for (const nd of nodes) {
      const isSel = !opts.exportLight && (nd.id === selectedId || nd.id === connectFrom);
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, NODE_R, 0, Math.PI * 2);
      ctx.fillStyle = resolveNodeFill(nd.color, dark, colors.muted);
      ctx.fill();
      ctx.lineWidth = isSel ? 2.5 : 1.8;
      ctx.strokeStyle = resolveNodeStroke(nd.color, dark, isSel, colors.primary, colors.secondaryFg);
      ctx.stroke();

      ctx.fillStyle = resolveNodeText(nd.color, dark, colors.fg);
      ctx.fillText(String(nd.label || nd.id), nd.x, nd.y + 0.5);
    }
  }

  function drawNow() {
    rafId = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.max(1, Math.round(canvasWidth * dpr));
    const targetH = Math.max(1, Math.round(canvasHeight * dpr));
    if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
    }
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, canvasWidth, canvasHeight);
  }

  function scheduleDraw() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(drawNow);
  }

  // --- Export SVG & PNG ---
  function buildCurrentSvg(): string {
    const w = Math.max(320, Math.round(canvasWidth));
    const hVal = Math.max(240, Math.round(canvasHeight));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const strokeCol = "#52525b";
    const textCol = "#09090b";
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hVal}" viewBox="0 0 ${w} ${hVal}">`,
      '<rect width="100%" height="100%" fill="#ffffff"/>',
    ];
    if (directed) {
      parts.push(
        `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${strokeCol}"/></marker></defs>`,
      );
    }
    for (const e of edges) {
      const u = byId.get(e.from);
      const v = byId.get(e.to);
      if (!u || !v) continue;
      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const d = Math.hypot(dx, dy) || 1;
      const x1 = u.x + (dx / d) * NODE_R;
      const y1 = u.y + (dy / d) * NODE_R;
      const x2 = v.x - (dx / d) * (directed ? NODE_R + 4 : NODE_R);
      const y2 = v.y - (dy / d) * (directed ? NODE_R + 4 : NODE_R);
      parts.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${strokeCol}" stroke-width="2"${directed ? ' marker-end="url(#arr)"' : ""}/>`,
      );
      if (e.weight) {
        parts.push(
          `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${((y1 + y2) / 2 - 6).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="12" fill="${textCol}">${escapeXml(e.weight)}</text>`,
        );
      }
    }
    for (const nd of nodes) {
      const fillCol = resolveNodeFill(nd.color, false, "#f4f4f5");
      parts.push(
        `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${NODE_R}" fill="${escapeXml(fillCol)}" stroke="${strokeCol}" stroke-width="2"/>`,
      );
      parts.push(
        `<text x="${nd.x.toFixed(1)}" y="${(nd.y + 4).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="600" fill="${textCol}">${escapeXml(nd.label || nd.id)}</text>`,
      );
    }
    parts.push("</svg>");
    return parts.join("");
  }

  async function handleExportSvg() {
    try {
      const svg = buildCurrentSvg();
      if (bridge?.files?.saveText) {
        const saved = await bridge.files.saveText("graph.svg", svg);
        if (saved) showToast("已导出 SVG", "success");
      } else {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "graph.svg";
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      showToast(`导出 SVG 失败：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  async function handleExportPng() {
    try {
      const scale = 2;
      const w = Math.max(320, Math.round(canvasWidth));
      const hVal = Math.max(240, Math.round(canvasHeight));
      const offscreen = document.createElement("canvas");
      offscreen.width = w * scale;
      offscreen.height = hVal * scale;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("无法创建 2D 渲染上下文");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, w, hVal, { exportLight: true });
      const dataUrl = offscreen.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      if (bridge?.files?.savePng) {
        const saved = await bridge.files.savePng("graph.png", base64);
        if (saved) showToast("已导出 PNG", "success");
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "graph.png";
        a.click();
      }
    } catch (err) {
      showToast(`导出 PNG 失败：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  // --- Event Wiring ---
  btnSampleTree.addEventListener("click", () => applySample("tree"));
  btnSampleWeighted.addEventListener("click", () => applySample("weighted"));
  btnSampleGeometry.addEventListener("click", () => applySample("geometry"));
  btnConnect.addEventListener("click", () => {
    connectMode = !connectMode;
    connectFrom = null;
    updateConnectBtn();
    updateStats();
    scheduleDraw();
  });
  btnRelayout.addEventListener("click", () => applyLayout(layoutMode));
  btnExportSvg.addEventListener("click", () => void handleExportSvg());
  btnExportPng.addEventListener("click", () => void handleExportPng());

  textarea.addEventListener("input", () => {
    editorText = textarea.value;
    kvSet("editorText", editorText);
    if (!suppressTextParse) parseTextToGraph(format, editorText, true);
  });

  function getCanvasCoords(e: PointerEvent) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const { x, y } = getCanvasCoords(e);
    pointerPos = { x, y };
    const hit = hitNode(x, y);
    dragMoved = false;
    if (hit) {
      if (connectMode) {
        if (!connectFrom) {
          connectFrom = hit.id;
        } else if (connectFrom !== hit.id) {
          edges = [...edges, { from: connectFrom, to: hit.id, weight: null }];
          connectFrom = null;
          serializeGraphToText(nodes, edges);
        } else {
          connectFrom = null;
        }
        selectedId = hit.id;
        updateInspector();
        updateStats();
        scheduleDraw();
        return;
      }
      draggingId = hit.id;
      selectedId = hit.id;
      canvasEl.setPointerCapture(e.pointerId);
      canvasEl.style.cursor = "grabbing";
      updateInspector();
      scheduleDraw();
    } else {
      draggingId = null;
      selectedId = null;
      connectFrom = null;
      if (!connectMode) {
        const id = nextNodeId();
        const pad = NODE_R + 6;
        const cx = Math.max(pad, Math.min(canvasWidth - pad, x));
        const cy = Math.max(pad, Math.min(canvasHeight - pad, y));
        nodes = [...nodes, { id, label: id, x: cx, y: cy, color: null }];
        selectedId = id;
        hasUserDragged = true;
        serializeGraphToText(nodes, edges);
      }
      updateInspector();
      updateStats();
      scheduleDraw();
    }
  });

  canvasEl.addEventListener("pointermove", (e) => {
    const { x, y } = getCanvasCoords(e);
    pointerPos = { x, y };
    if (draggingId) {
      dragMoved = true;
      hasUserDragged = true;
      const pad = NODE_R + 4;
      const nx = Math.max(pad, Math.min(canvasWidth - pad, x));
      const ny = Math.max(pad, Math.min(canvasHeight - pad, y));
      const target = nodes.find((n) => n.id === draggingId);
      if (target) {
        target.x = nx;
        target.y = ny;
      }
      scheduleDraw();
      return;
    }
    if (connectMode && connectFrom) {
      scheduleDraw();
      return;
    }
    if (!connectMode) {
      canvasEl.style.cursor = hitNode(x, y) ? "grab" : "default";
    }
  });

  const finishDrag = (e: PointerEvent) => {
    if (draggingId) {
      if (canvasEl.hasPointerCapture(e.pointerId)) {
        canvasEl.releasePointerCapture(e.pointerId);
      }
      if (dragMoved && format === "coords") {
        serializeGraphToText(nodes, edges);
      }
      draggingId = null;
      dragMoved = false;
      canvasEl.style.cursor = connectMode ? "crosshair" : "default";
    }
  };

  canvasEl.addEventListener("pointerup", finishDrag);
  canvasEl.addEventListener("pointercancel", finishDrag);
  canvasEl.addEventListener("pointerleave", () => {
    if (!draggingId) {
      pointerPos = null;
      if (connectMode && connectFrom) scheduleDraw();
    }
  });

  // ResizeObserver for crisp DPR sizing
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      const hVal = entry.contentRect.height;
      if (w > 40 && hVal > 40) {
        const changed = Math.abs(canvasWidth - w) > 2 || Math.abs(canvasHeight - hVal) > 2;
        canvasWidth = w;
        canvasHeight = hVal;
        if (!hasMeasuredCanvas || (changed && !hasUserDragged)) {
          hasMeasuredCanvas = true;
          nodes = layoutNodes(nodes, edges, layoutMode, w, hVal);
        } else if (changed) {
          nodes = clampNodesToBounds(nodes, w, hVal);
        }
        scheduleDraw();
      }
    }
  });
  ro.observe(canvasWrap);

  // Live theme sync
  bridge?.onThemeChange?.((theme) => {
    applyThemeAttr(theme);
    updateInspector();
    scheduleDraw();
  });

  // Initial payload support
  const payload = bridge?.initialPayload as Record<string, unknown> | undefined;
  if (payload && Array.isArray(payload.nodes)) {
    if (payload.directed != null) directed = Boolean(payload.directed);
    if (payload.one_indexed != null) oneIndexed = Boolean(payload.one_indexed);
    if (payload.layout) layoutMode = String(payload.layout);
    const incomingNodes: RawNodeItem[] = (payload.nodes as Array<Record<string, unknown>>).map((n) => ({
      id: String(n.id),
      label: String(n.label || n.id),
      x: n.x != null ? Number(n.x) : null,
      y: n.y != null ? Number(n.y) : null,
      color: (n.color as string | null) ?? null,
    }));
    const incomingEdges: EdgeItem[] = ((payload.edges as Array<Record<string, unknown>>) ?? []).map((e) => ({
      from: String(e.from),
      to: String(e.to),
      weight: e.weight != null ? String(e.weight) : e.label != null ? String(e.label) : null,
    }));
    nodes = incomingNodes.some((n) => n.x == null || n.y == null)
      ? layoutNodes(incomingNodes, incomingEdges, layoutMode, canvasWidth, canvasHeight)
      : clampNodesToBounds(incomingNodes as NodeItem[], canvasWidth, canvasHeight);
    edges = incomingEdges;
    segDir.sync();
    segIndex.sync();
    segLayout.sync();
    serializeGraphToText(nodes, edges);
  } else {
    parseTextToGraph(format, editorText, false);
  }

  updateInspector();
  updateStats();
  scheduleDraw();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void mount(), { once: true });
} else {
  void mount();
}
