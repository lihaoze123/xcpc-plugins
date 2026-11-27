import "./style.css";
import type { XcpcBridge, XcpcTheme } from "@xcpc-workstation/plugin-sdk/ui";
import { computeGeoAlgo, computeGraphAlgo } from "./algos";
import {
  applyNodeLabelsText,
  nextEdgeId,
  parseGraphText,
  serializeGraphToText,
} from "./parser";
import {
  applyBipartiteLayout,
  applyCircleLayout,
  applyTreeLayout,
  placeInitialNodes,
  stepPhysics,
} from "./physics";
import {
  buildExportSvg,
  computeFitViewport,
  drawScene,
  hitTestEdge,
  hitTestNode,
  renderExportPngDataUrl,
  screenToWorld,
  worldToScreen,
  type RenderContextState,
  type ThemeColors,
} from "./renderer";
import {
  DEFAULT_APPEARANCE,
  PALETTE,
  PRESET_SAMPLES,
  type AlgoId,
  type AppearanceSettings,
  type EdgeItem,
  type GeoAlgoId,
  type GraphFormat,
  type GraphMode,
  type GraphTabState,
  type HistorySnapshot,
  type InspectorTab,
  type NodeItem,
  type RawNodeItem,
} from "./types";

// ---------------------------------------------------------------------------
// Bridge & Storage Helpers
// ---------------------------------------------------------------------------

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
      const raw = localStorage.getItem(`graph-editor-v2:${key}`);
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
      localStorage.setItem(`graph-editor-v2:${key}`, JSON.stringify(value));
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

function createDefaultTab(index: number): GraphTabState {
  const preset = PRESET_SAMPLES[0];
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `图 ${index}`,
    format: preset.format,
    oneIndexed: preset.oneIndexed,
    directed: preset.directed,
    multiedge: true,
    mode: preset.mode,
    locked: false,
    rootId: null,
    algo: "none",
    geoAlgo: "none",
    pathStart: null,
    pathEnd: null,
    editorText: preset.text,
    nodeLabelsText: "",
    headerNmMode: "auto",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, scale: 1 },
  };
}

// ---------------------------------------------------------------------------
// App Mount
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

  // Load persisted state
  const [savedTabs, savedActiveId, savedAppearance, savedInspectorOpen] = await Promise.all([
    kvGet<GraphTabState[] | null>("tabs_v2", null),
    kvGet<string | null>("activeTabId_v2", null),
    kvGet<Partial<AppearanceSettings> | null>("appearance_v2", null),
    kvGet<boolean>("inspectorOpen_v2", true),
  ]);

  let tabs: GraphTabState[] =
    Array.isArray(savedTabs) && savedTabs.length > 0 ? savedTabs : [createDefaultTab(1)];
  let activeTabId: string =
    savedActiveId && tabs.some((t) => t.id === savedActiveId) ? savedActiveId : tabs[0].id;
  let appearance: AppearanceSettings = { ...DEFAULT_APPEARANCE, ...(savedAppearance ?? {}) };
  let inspectorOpen = savedInspectorOpen;
  let inspectorTab: InspectorTab = "modes";
  let nodeLabelsExpanded = false;

  const curTab = (): GraphTabState => tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Interactive tool & canvas state
  let toolMode: "select" | "connect" | "paint" = "select";
  let brushColor: string | null = "sky";
  let selectedNodeId: string | null = null;
  let selectedEdgeId: string | null = null;
  let hoverNodeId: string | null = null;
  let hoverEdgeId: string | null = null;
  let connectFrom: string | null = null;
  let pointerScreen: { x: number; y: number } | null = null;

  let draggingNodeId: string | null = null;
  let dragOffsetWorld = { x: 0, y: 0 };
  let isPanning = false;
  let panStartScreen = { x: 0, y: 0 };
  let panStartViewport = { x: 0, y: 0 };
  let pointerMoved = false;

  let canvasWidth = 640;
  let canvasHeight = 480;
  let suppressTextParse = false;
  let detectedHeaderNm = false;
  let usedHeaderNm = false;
  let detectedLeetCode = false;

  // Per-tab Undo/Redo stacks
  const undoStacks = new Map<string, HistorySnapshot[]>();
  const redoStacks = new Map<string, HistorySnapshot[]>();

  function makeSnapshot(tab: GraphTabState): HistorySnapshot {
    return {
      editorText: tab.editorText,
      nodeLabelsText: tab.nodeLabelsText,
      nodes: tab.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        note: n.note,
        x: n.x,
        y: n.y,
        color: n.color,
        pinned: n.pinned,
      })),
      edges: tab.edges.map((e) => ({ ...e })),
      format: tab.format,
      directed: tab.directed,
      oneIndexed: tab.oneIndexed,
      mode: tab.mode,
      rootId: tab.rootId,
    };
  }

  function pushHistory() {
    const tab = curTab();
    const list = undoStacks.get(tab.id) ?? [];
    list.push(makeSnapshot(tab));
    if (list.length > 60) list.shift();
    undoStacks.set(tab.id, list);
    redoStacks.set(tab.id, []);
    updateHistoryButtons();
  }

  function restoreSnapshot(snap: HistorySnapshot) {
    const tab = curTab();
    tab.editorText = snap.editorText;
    tab.nodeLabelsText = snap.nodeLabelsText;
    tab.nodes = snap.nodes.map((n) => ({ ...n, vx: 0, vy: 0 }));
    tab.edges = snap.edges.map((e) => ({ ...e }));
    tab.format = snap.format;
    tab.directed = snap.directed;
    tab.oneIndexed = snap.oneIndexed;
    tab.mode = snap.mode;
    tab.rootId = snap.rootId;
    suppressTextParse = true;
    textarea.value = tab.editorText;
    nodeLabelsInput.value = tab.nodeLabelsText;
    suppressTextParse = false;
    selectedNodeId = null;
    selectedEdgeId = null;
    syncAllUI();
    scheduleSave();
    requestFrame();
  }

  function undo() {
    const tab = curTab();
    const stack = undoStacks.get(tab.id);
    if (!stack || stack.length === 0) return;
    const redo = redoStacks.get(tab.id) ?? [];
    redo.push(makeSnapshot(tab));
    redoStacks.set(tab.id, redo);
    restoreSnapshot(stack.pop()!);
    updateHistoryButtons();
  }

  function redo() {
    const tab = curTab();
    const stack = redoStacks.get(tab.id);
    if (!stack || stack.length === 0) return;
    const undoList = undoStacks.get(tab.id) ?? [];
    undoList.push(makeSnapshot(tab));
    undoStacks.set(tab.id, undoList);
    restoreSnapshot(stack.pop()!);
    updateHistoryButtons();
  }

  // Debounced persistence
  let saveTimer = 0;
  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      kvSet("tabs_v2", tabs);
      kvSet("activeTabId_v2", activeTabId);
      kvSet("appearance_v2", appearance);
      kvSet("inspectorOpen_v2", inspectorOpen);
    }, 260);
  }

  // -------------------------------------------------------------------------
  // Build DOM Skeleton
  // -------------------------------------------------------------------------

  // 1. Left Sidebar
  const tabStrip = el("div", { class: "tab-strip", "data-testid": "graph-tabs" });

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
    return { el: wrap, sync };
  }

  const segFormat = createSegmented(
    [
      { value: "edge_list", label: "边表" },
      { value: "parent_array", label: "父数组" },
      { value: "adj_list", label: "邻接表" },
      { value: "coords", label: "坐标" },
    ],
    () => curTab().format,
    (val) => {
      const tab = curTab();
      if (tab.format === val) return;
      pushHistory();
      tab.format = val as GraphFormat;
      if (val === "coords") {
        tab.mode = "geometry";
      } else if (tab.mode === "geometry") {
        tab.mode = "normal";
      }
      parseCurrentTabText(false, true);
      syncAllUI();
      scheduleSave();
    },
    "graph-format",
  );

  const segIndex = createSegmented(
    [
      { value: "1", label: "1-idx" },
      { value: "0", label: "0-idx" },
    ],
    () => (curTab().oneIndexed ? "1" : "0"),
    (v) => {
      const tab = curTab();
      tab.oneIndexed = v === "1";
      parseCurrentTabText(true, false);
      syncAllUI();
      scheduleSave();
    },
    "graph-index",
  );

  const segDir = createSegmented(
    [
      { value: "undirected", label: "无向" },
      { value: "directed", label: "有向" },
    ],
    () => (curTab().directed ? "directed" : "undirected"),
    (v) => {
      const tab = curTab();
      tab.directed = v === "directed";
      if (!tab.multiedge) parseCurrentTabText(true, false);
      syncAllUI();
      scheduleSave();
      requestFrame();
    },
    "graph-dir",
  );

  const textarea = el("textarea", {
    class: "editor-textarea",
    spellcheck: "false",
    "data-testid": "graph-editor-input",
  });

  const smartBanner = el("div", { class: "smart-banner" });
  smartBanner.hidden = true;

  // Collapsible Node Labels
  const nodeLabelsToggle = el("button", { class: "collapsible-head", type: "button" });
  const nodeLabelsBody = el("div", { class: "collapsible-body" });
  const nodeLabelsInput = el("textarea", {
    class: "node-labels-input",
    placeholder: "点权/标签数组，如: 10 20 _ 40 或 1:A 2:B",
    spellcheck: "false",
    "data-testid": "graph-node-labels",
  });
  nodeLabelsBody.append(nodeLabelsInput);
  const nodeLabelsBox = el("div", { class: "collapsible-box" }, nodeLabelsToggle, nodeLabelsBody);

  const presetRow = el("div", { class: "preset-row" });
  for (const preset of PRESET_SAMPLES) {
    const b = el(
      "button",
      { class: "preset-btn", type: "button", "data-testid": `graph-preset-${preset.id}` },
      preset.label,
    );
    b.addEventListener("click", () => applyPreset(preset));
    presetRow.append(b);
  }

  const sidebar = el(
    "aside",
    { class: "sidebar" },
    tabStrip,
    segFormat.el,
    el("div", { class: "dual-row" }, segIndex.el, segDir.el),
    el("div", { class: "editor-wrap" }, textarea, smartBanner),
    nodeLabelsBox,
    presetRow,
  );

  // 2. Center Workspace
  const statsEl = el("div", { class: "stats", "data-testid": "graph-stats" });
  const algoPillEl = el("div", { class: "algo-pill" });
  algoPillEl.hidden = true;

  const btnToggleInspector = el(
    "button",
    { class: "btn", type: "button", title: "展开/收起检查器", "data-testid": "graph-toggle-inspector" },
    "面板",
  );
  const btnCopyPng = el(
    "button",
    { class: "btn btn-primary", type: "button", "data-testid": "graph-copy-png" },
    "复制 PNG",
  );
  const btnExportMenu = el(
    "button",
    { class: "btn", type: "button", "data-testid": "graph-export-menu" },
    "导出 ▾",
  );
  const exportMenuList = el("div", { class: "dropdown-menu" });
  exportMenuList.hidden = true;
  const miExportSvg = el("button", { class: "dropdown-item", type: "button", "data-testid": "graph-export-svg" }, "导出 SVG 矢量图");
  const miExportPng = el("button", { class: "dropdown-item", type: "button", "data-testid": "graph-export-png" }, "导出 3× 高清 PNG");
  const miCopySvg = el("button", { class: "dropdown-item", type: "button", "data-testid": "graph-copy-svg" }, "复制 SVG 代码");
  exportMenuList.append(miExportSvg, miExportPng, miCopySvg);
  const exportDropdown = el("div", { class: "dropdown" }, btnExportMenu, exportMenuList);

  const toolbar = el(
    "div",
    { class: "toolbar" },
    el("div", { class: "toolbar-left" }, statsEl, algoPillEl),
    el("div", { class: "toolbar-actions" }, btnToggleInspector, btnCopyPng, exportDropdown),
  );

  const canvasEl = el("canvas", { "data-testid": "graph-canvas" });

  // Floating Top Palette Capsule
  const hudTop = el("div", { class: "hud-capsule hud-top" });
  const btnToolSelect = el("button", { class: "hud-btn", type: "button", title: "选择 / 拖拽 (Esc)" }, "选择");
  const btnToolConnect = el("button", { class: "hud-btn", type: "button", title: "连边模式 (或按住 Shift 拖拽)", "data-testid": "graph-connect-toggle" }, "连边");
  hudTop.append(btnToolSelect, btnToolConnect, el("span", { class: "hud-sep" }));

  const paletteBtns = new Map<string | null, HTMLButtonElement>();
  for (const p of PALETTE) {
    if (p.id === null) continue;
    const dot = el("button", {
      class: "palette-dot",
      type: "button",
      title: `画笔：${p.name}`,
      "data-testid": `graph-brush-${p.id}`,
    });
    dot.style.backgroundColor = p.swatch;
    dot.addEventListener("click", () => {
      toolMode = "paint";
      brushColor = p.id;
      connectFrom = null;
      if (selectedNodeId) {
        pushHistory();
        const nd = curTab().nodes.find((n) => n.id === selectedNodeId);
        if (nd) nd.color = p.id;
        scheduleSave();
      }
      updateHudTools();
      requestFrame();
    });
    paletteBtns.set(p.id, dot);
    hudTop.append(dot);
  }
  const btnEraser = el(
    "button",
    { class: "palette-dot eraser", type: "button", title: "清除节点颜色", "data-testid": "graph-brush-clear" },
    "×",
  );
  btnEraser.addEventListener("click", () => {
    toolMode = "paint";
    brushColor = null;
    connectFrom = null;
    if (selectedNodeId) {
      pushHistory();
      const nd = curTab().nodes.find((n) => n.id === selectedNodeId);
      if (nd) nd.color = null;
      scheduleSave();
    }
    updateHudTools();
    requestFrame();
  });
  paletteBtns.set(null, btnEraser);
  hudTop.append(btnEraser);

  // Floating Bottom Viewport & Undo Capsule
  const btnUndo = el("button", { class: "hud-btn", type: "button", title: "撤销 (Ctrl+Z)" }, "撤销");
  const btnRedo = el("button", { class: "hud-btn", type: "button", title: "重做 (Ctrl+Shift+Z)" }, "重做");
  const btnZoomOut = el("button", { class: "hud-btn", type: "button", title: "缩小" }, "−");
  const btnZoomPct = el("button", { class: "hud-btn", type: "button", title: "重置缩放" }, "100%");
  const btnZoomIn = el("button", { class: "hud-btn", type: "button", title: "放大" }, "+");
  const btnFitView = el("button", { class: "hud-btn", type: "button", title: "适应画布 (0)" }, "适应");
  const btnRelayout = el("button", { class: "hud-btn", type: "button", title: "重新布局", "data-testid": "graph-relayout" }, "重排");
  const hudBottom = el(
    "div",
    { class: "hud-capsule hud-bottom" },
    btnUndo,
    btnRedo,
    el("span", { class: "hud-sep" }),
    btnZoomOut,
    btnZoomPct,
    btnZoomIn,
    el("span", { class: "hud-sep" }),
    btnFitView,
    btnRelayout,
  );

  // Inline Popover for Double-Click Label / Weight editing
  const inlinePopover = el("div", { class: "inline-popover" });
  inlinePopover.hidden = true;
  const inlineInput = el("input", { type: "text" });
  const inlineOkBtn = el("button", { class: "btn btn-primary", type: "button" }, "确定");
  const inlineDelBtn = el("button", { class: "btn btn-danger", type: "button" }, "删除");
  inlinePopover.append(inlineInput, inlineOkBtn, inlineDelBtn);
  let inlineTarget: { kind: "node" | "edge"; id: string } | null = null;

  const canvasWrap = el("div", { class: "canvas-wrap" }, canvasEl, hudTop, hudBottom, inlinePopover);
  const workspace = el("main", { class: "workspace" }, toolbar, canvasWrap);

  // 3. Right Collapsible Inspector
  const inspectorSeg = createSegmented(
    [
      { value: "modes", label: "模式" },
      { value: "algos", label: "算法" },
      { value: "appearance", label: "外观" },
    ],
    () => inspectorTab,
    (v) => {
      inspectorTab = v as InspectorTab;
      inspectorSeg.sync();
      renderInspectorBody();
    },
    "graph-inspector-tab",
  );
  const inspectorBody = el("div", { class: "inspector-body" });
  const inspectorEl = el(
    "aside",
    { class: "inspector" },
    el("div", { class: "inspector-tabs" }, inspectorSeg.el),
    inspectorBody,
  );

  root.replaceChildren(sidebar, workspace, inspectorEl);

  // -------------------------------------------------------------------------
  // Physics Loop (Sleeps automatically at 0% CPU when settled)
  // -------------------------------------------------------------------------

  let rafId = 0;
  let physicsActive = false;

  function wakePhysics() {
    const tab = curTab();
    if (tab.locked || tab.mode === "geometry") return;
    physicsActive = true;
    requestFrame();
  }

  function requestFrame() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(tick);
  }

  function readThemeColors(): ThemeColors {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    return {
      bg: get("--bg", isDark ? "#09090b" : "#fafafa"),
      card: get("--card", isDark ? "#111113" : "#ffffff"),
      muted: get("--muted", isDark ? "#18181b" : "#f4f4f5"),
      fg: get("--fg", isDark ? "#fafafa" : "#09090b"),
      secondaryFg: get("--secondary-fg", isDark ? "#a1a1aa" : "#52525b"),
      mutedFg: get("--muted-fg", isDark ? "#71717a" : "#a1a1aa"),
      border: get("--border", isDark ? "#27272a" : "#e4e4e7"),
      primary: get("--primary", isDark ? "#0e7fa6" : "#0b6989"),
      accentHighlight: isDark ? "#38bdf8" : "#0b6989",
      danger: get("--destructive", isDark ? "#f87171" : "#b91c1c"),
    };
  }

  function buildRenderState(): RenderContextState {
    const tab = curTab();
    const algoResult =
      tab.mode === "geometry"
        ? null
        : computeGraphAlgo(tab.algo, tab.nodes, tab.edges, {
            directed: tab.directed,
            pathStart: tab.pathStart,
            pathEnd: tab.pathEnd,
          });
    const geoResult =
      tab.mode === "geometry" ? computeGeoAlgo(tab.geoAlgo, tab.nodes) : null;

    return {
      nodes: tab.nodes,
      edges: tab.edges,
      directed: tab.directed,
      mode: tab.mode,
      rootId: tab.rootId,
      viewport: tab.viewport,
      appearance,
      isDark,
      colors: readThemeColors(),
      algoResult,
      geoResult,
      selectedNodeId,
      selectedEdgeId,
      hoverNodeId,
      hoverEdgeId,
      connectFrom,
      pointerScreen,
    };
  }

  function tick() {
    rafId = 0;
    const tab = curTab();

    let keepRunning = false;
    if (physicsActive && !tab.locked && tab.mode === "normal" && tab.nodes.length > 1) {
      const maxSpeed = stepPhysics(tab.nodes, tab.edges, draggingNodeId, 1);
      if (maxSpeed > 0.08 || draggingNodeId !== null) {
        keepRunning = true;
      } else {
        physicsActive = false;
      }
    } else {
      physicsActive = false;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.max(1, Math.round(canvasWidth * dpr));
    const targetH = Math.max(1, Math.round(canvasHeight * dpr));
    if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
    }
    const ctx = canvasEl.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, canvasWidth, canvasHeight, buildRenderState());
    }

    if (keepRunning) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  // -------------------------------------------------------------------------
  // Graph Parsing, Serialization & Layout Actions
  // -------------------------------------------------------------------------

  function parseCurrentTabText(keepPositions: boolean, fitAfter: boolean) {
    const tab = curTab();
    const prevMap = keepPositions ? new Map(tab.nodes.map((n) => [n.id, n])) : undefined;
    const res = parseGraphText(tab.format, tab.editorText, {
      oneIndexed: tab.oneIndexed,
      directed: tab.directed,
      multiedge: tab.multiedge,
      headerNmMode: tab.headerNmMode,
      prevNodes: prevMap,
    });
    detectedHeaderNm = res.detectedHeaderNm;
    usedHeaderNm = res.usedHeaderNm;
    detectedLeetCode = res.detectedLeetCode;

    tab.nodes = placeInitialNodes(res.nodes, res.edges, tab.mode, tab.rootId);
    tab.edges = res.edges;
    applyNodeLabelsText(tab.nodes, tab.nodeLabelsText, tab.oneIndexed);

    if (tab.rootId && !tab.nodes.some((n) => n.id === tab.rootId)) {
      tab.rootId = tab.nodes[0]?.id ?? null;
    }
    if (selectedNodeId && !tab.nodes.some((n) => n.id === selectedNodeId)) selectedNodeId = null;
    if (selectedEdgeId && !tab.edges.some((e) => e.id === selectedEdgeId)) selectedEdgeId = null;

    if (fitAfter) {
      tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
    }
    updateSmartBanner();
    updateToolbarStats();
    if (tab.mode === "normal" && !tab.locked) wakePhysics();
    requestFrame();
  }

  function syncTextFromGraph() {
    const tab = curTab();
    const ser = serializeGraphToText(tab.nodes, tab.edges, tab.format);
    tab.format = ser.format;
    tab.editorText = ser.text;
    suppressTextParse = true;
    textarea.value = ser.text;
    suppressTextParse = false;
    segFormat.sync();
    updateToolbarStats();
    scheduleSave();
  }

  function relayoutCurrent(kind?: "mode" | "circle") {
    const tab = curTab();
    pushHistory();
    for (const nd of tab.nodes) nd.pinned = tab.mode === "geometry";
    if (kind === "circle") {
      applyCircleLayout(tab.nodes);
    } else if (tab.mode === "tree") {
      applyTreeLayout(tab.nodes, tab.edges, tab.rootId);
    } else if (tab.mode === "bipartite") {
      applyBipartiteLayout(tab.nodes, tab.edges);
    } else if (tab.mode === "geometry") {
      parseCurrentTabText(false, true);
      return;
    } else {
      const raw: RawNodeItem[] = tab.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        note: n.note,
        x: null,
        y: null,
        color: n.color,
        pinned: false,
      }));
      tab.nodes = placeInitialNodes(raw, tab.edges, "normal", tab.rootId);
    }
    tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
    updateZoomLabel();
    if (tab.mode === "normal" && !tab.locked && kind !== "circle") wakePhysics();
    requestFrame();
    scheduleSave();
  }

  function applyPreset(preset: (typeof PRESET_SAMPLES)[number]) {
    const tab = curTab();
    pushHistory();
    tab.format = preset.format;
    tab.directed = preset.directed;
    tab.oneIndexed = preset.oneIndexed;
    tab.mode = preset.mode;
    tab.editorText = preset.text;
    tab.nodeLabelsText = preset.nodeLabels ?? "";
    tab.headerNmMode = "auto";
    tab.rootId = null;
    tab.algo = preset.mode === "bipartite" ? "bipartite" : "none";
    tab.geoAlgo = preset.mode === "geometry" ? "convex_hull" : "none";
    suppressTextParse = true;
    textarea.value = tab.editorText;
    nodeLabelsInput.value = tab.nodeLabelsText;
    suppressTextParse = false;
    selectedNodeId = null;
    selectedEdgeId = null;
    connectFrom = null;
    parseCurrentTabText(false, true);
    syncAllUI();
    scheduleSave();
  }

  // -------------------------------------------------------------------------
  // UI Render & Sync Helpers
  // -------------------------------------------------------------------------

  function renderTabs() {
    tabStrip.replaceChildren();
    for (const tab of tabs) {
      const isAct = tab.id === activeTabId;
      const chip = el("button", {
        class: isAct ? "tab-chip active" : "tab-chip",
        type: "button",
        "data-testid": `graph-tab-${tab.id}`,
      });
      const labelSpan = el("span", {}, tab.name);
      chip.append(labelSpan);

      if (tabs.length > 1) {
        const closeBtn = el("span", { class: "tab-close", title: "关闭标签页" }, "×");
        closeBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const idx = tabs.findIndex((t) => t.id === tab.id);
          tabs = tabs.filter((t) => t.id !== tab.id);
          undoStacks.delete(tab.id);
          redoStacks.delete(tab.id);
          if (activeTabId === tab.id) {
            activeTabId = tabs[Math.max(0, idx - 1)].id;
            switchToActiveTab();
          } else {
            renderTabs();
          }
          scheduleSave();
        });
        chip.append(closeBtn);
      }

      chip.addEventListener("click", () => {
        if (activeTabId === tab.id) return;
        activeTabId = tab.id;
        switchToActiveTab();
        scheduleSave();
      });

      chip.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        const nextName = window.prompt("重命名画布标签", tab.name);
        if (nextName && nextName.trim()) {
          tab.name = nextName.trim().slice(0, 18);
          renderTabs();
          scheduleSave();
        }
      });

      tabStrip.append(chip);
    }

    const addBtn = el("button", { class: "tab-add", type: "button", title: "新建画布", "data-testid": "graph-tab-add" }, "+");
    addBtn.addEventListener("click", () => {
      const next = createDefaultTab(tabs.length + 1);
      tabs.push(next);
      activeTabId = next.id;
      switchToActiveTab();
      scheduleSave();
    });
    tabStrip.append(addBtn);
  }

  function switchToActiveTab() {
    const tab = curTab();
    suppressTextParse = true;
    textarea.value = tab.editorText;
    nodeLabelsInput.value = tab.nodeLabelsText;
    suppressTextParse = false;
    selectedNodeId = null;
    selectedEdgeId = null;
    connectFrom = null;
    closeInlinePopover();
    if (tab.nodes.length === 0 && tab.editorText.trim().length > 0) {
      parseCurrentTabText(false, true);
    }
    syncAllUI();
    requestFrame();
  }

  function updatePlaceholder() {
    const fmt = curTab().format;
    if (fmt === "parent_array") {
      textarea.placeholder = "父数组，如: 1 1 2 2 3\n或两行父子数组:\n1 1 2\n2 3 4";
    } else if (fmt === "adj_list") {
      textarea.placeholder = "邻接表，每行:\n1: 2(5) 3(2)\n2: 4";
    } else if (fmt === "coords") {
      textarea.placeholder = "坐标: id x y 或 x y\n线段: edge u v\n多边形: poly 1 2 3 4";
    } else {
      textarea.placeholder = "每行一条边 u v [w]\n支持首行 n m 与 LeetCode [[u,v]]";
    }
  }

  function updateSmartBanner() {
    const tab = curTab();
    if (tab.format !== "edge_list") {
      smartBanner.hidden = true;
      return;
    }
    if (detectedLeetCode) {
      smartBanner.hidden = false;
      smartBanner.replaceChildren(el("span", {}, "已自动识别 LeetCode 边表"));
      return;
    }
    if (detectedHeaderNm || tab.headerNmMode === "force_on") {
      smartBanner.hidden = false;
      const msg = usedHeaderNm ? "首行已按 n m 解析" : "首行按普通边解析";
      const toggleBtn = el(
        "button",
        { type: "button" },
        usedHeaderNm ? "改按普通边" : "改按 n m 首行",
      );
      toggleBtn.addEventListener("click", () => {
        tab.headerNmMode = usedHeaderNm ? "force_off" : "force_on";
        parseCurrentTabText(true, false);
        scheduleSave();
      });
      smartBanner.replaceChildren(el("span", {}, msg), toggleBtn);
      return;
    }
    smartBanner.hidden = true;
  }

  function updateNodeLabelsBox() {
    const count = curTab().nodes.filter((n) => n.note.length > 0).length;
    nodeLabelsToggle.textContent = "";
    nodeLabelsToggle.append(
      el("span", {}, count > 0 ? `点权 / 标签数组（${count}）` : "点权 / 标签数组"),
      el("span", {}, nodeLabelsExpanded ? "▾" : "▸"),
    );
    nodeLabelsBody.hidden = !nodeLabelsExpanded;
  }

  function updateToolbarStats() {
    const tab = curTab();
    statsEl.replaceChildren(
      el("span", {}, `节点 ${tab.nodes.length}`),
      el("span", {}, `边 ${tab.edges.length}`),
    );

    const rs = buildRenderState();
    const summary = tab.mode === "geometry" ? rs.geoResult?.summary : rs.algoResult?.summary;
    const warn = tab.mode === "geometry" ? false : Boolean(rs.algoResult?.warning);
    if (summary) {
      algoPillEl.hidden = false;
      algoPillEl.textContent = summary;
      algoPillEl.classList.toggle("warn", warn);
    } else {
      algoPillEl.hidden = true;
    }
  }

  function updateHudTools() {
    btnToolSelect.classList.toggle("active", toolMode === "select");
    btnToolConnect.classList.toggle("active", toolMode === "connect");
    for (const [colorId, btn] of paletteBtns.entries()) {
      btn.classList.toggle("active", toolMode === "paint" && brushColor === colorId);
    }
    canvasEl.style.cursor =
      toolMode === "connect" ? "crosshair" : toolMode === "paint" ? "cell" : "default";
  }

  function updateZoomLabel() {
    const tab = curTab();
    const base = tab.mode === "geometry" ? 56 : 1;
    const pct = Math.round((tab.viewport.scale / base) * 100);
    btnZoomPct.textContent = `${pct}%`;
  }

  function updateHistoryButtons() {
    const tab = curTab();
    btnUndo.disabled = (undoStacks.get(tab.id)?.length ?? 0) === 0;
    btnRedo.disabled = (redoStacks.get(tab.id)?.length ?? 0) === 0;
  }

  function renderInspectorBody() {
    const tab = curTab();
    inspectorEl.classList.toggle("collapsed", !inspectorOpen);
    btnToggleInspector.classList.toggle("active", inspectorOpen);
    inspectorBody.replaceChildren();

    if (inspectorTab === "modes") {
      // Mode grid
      const modes: Array<{ id: GraphMode; label: string }> = [
        { id: "normal", label: "通用图" },
        { id: "tree", label: "树结构" },
        { id: "bipartite", label: "二分图" },
        { id: "geometry", label: "计算几何" },
      ];
      const grid = el("div", { class: "mode-grid" });
      for (const m of modes) {
        const b = el(
          "button",
          {
            class: tab.mode === m.id ? "mode-btn active" : "mode-btn",
            type: "button",
            "data-testid": `graph-mode-${m.id}`,
          },
          m.label,
        );
        b.addEventListener("click", () => {
          if (tab.mode === m.id) return;
          pushHistory();
          tab.mode = m.id;
          if (m.id === "geometry") {
            tab.format = "coords";
            tab.locked = true;
            parseCurrentTabText(false, true);
          } else {
            if (tab.format === "coords") tab.format = "edge_list";
            if (m.id === "tree") {
              if (!tab.rootId && tab.nodes.length > 0) tab.rootId = tab.nodes[0].id;
              applyTreeLayout(tab.nodes, tab.edges, tab.rootId);
            } else if (m.id === "bipartite") {
              applyBipartiteLayout(tab.nodes, tab.edges);
              if (tab.algo === "none") tab.algo = "bipartite";
            } else {
              wakePhysics();
            }
            tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
          }
          syncAllUI();
          scheduleSave();
          requestFrame();
        });
        grid.append(b);
      }
      inspectorBody.append(el("div", { class: "panel-group" }, el("div", { class: "panel-label" }, "画布模式"), grid));

      // Tree root picker
      if (tab.mode === "tree" && tab.nodes.length > 0) {
        const rootSel = el("select", { class: "select-field" });
        for (const nd of tab.nodes) {
          const opt = el("option", { value: nd.id }, `节点 ${nd.label || nd.id}`);
          if (nd.id === (tab.rootId ?? tab.nodes[0].id)) opt.selected = true;
          rootSel.append(opt);
        }
        rootSel.addEventListener("change", () => {
          pushHistory();
          tab.rootId = rootSel.value;
          applyTreeLayout(tab.nodes, tab.edges, tab.rootId);
          tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
          scheduleSave();
          requestFrame();
        });
        inspectorBody.append(el("div", { class: "panel-group" }, el("div", { class: "panel-label" }, "树根节点"), rootSel));
      }

      // Behavior Toggles
      const makeToggle = (label: string, checked: boolean, onChange: (v: boolean) => void, testId?: string) => {
        const inp = el("input", { type: "checkbox", ...(testId ? { "data-testid": testId } : {}) });
        inp.checked = checked;
        inp.addEventListener("change", () => onChange(inp.checked));
        return el("label", { class: "toggle-row" }, el("span", {}, label), inp);
      };

      const toggleGroup = el(
        "div",
        { class: "panel-group" },
        el("div", { class: "panel-label" }, "交互行为"),
        makeToggle(
          "允许重边 (Multiedge)",
          tab.multiedge,
          (v) => {
            tab.multiedge = v;
            parseCurrentTabText(true, false);
            scheduleSave();
          },
          "graph-toggle-multiedge",
        ),
        makeToggle(
          "锁定物理布局 (Lock)",
          tab.locked,
          (v) => {
            tab.locked = v;
            if (!v && tab.mode === "normal") wakePhysics();
            scheduleSave();
          },
          "graph-toggle-lock",
        ),
        makeToggle("显示边权", appearance.showWeights, (v) => {
          appearance.showWeights = v;
          scheduleSave();
          requestFrame();
        }),
        makeToggle(
          "显示节点角标",
          appearance.showBadges,
          (v) => {
            appearance.showBadges = v;
            scheduleSave();
            requestFrame();
          },
          "graph-toggle-badges",
        ),
      );
      inspectorBody.append(toggleGroup);

      // Quick layout button
      if (tab.mode !== "geometry") {
        const circleBtn = el("button", { class: "btn", type: "button" }, "环形排列");
        circleBtn.addEventListener("click", () => relayoutCurrent("circle"));
        inspectorBody.append(circleBtn);
      }

      // Current Selection Card
      renderSelectionCard();
    } else if (inspectorTab === "algos") {
      if (tab.mode === "geometry") {
        const geoAlgos: Array<{ id: GeoAlgoId; label: string }> = [
          { id: "none", label: "关闭" },
          { id: "convex_hull", label: "凸包 (Convex Hull)" },
          { id: "measure", label: "边长与夹角标注" },
        ];
        const list = el("div", { class: "algo-list" });
        for (const item of geoAlgos) {
          const btn = el(
            "button",
            {
              class: tab.geoAlgo === item.id ? "algo-item active" : "algo-item",
              type: "button",
              "data-testid": `graph-geo-${item.id}`,
            },
            item.label,
          );
          btn.addEventListener("click", () => {
            tab.geoAlgo = item.id;
            updateToolbarStats();
            renderInspectorBody();
            scheduleSave();
            requestFrame();
          });
          list.append(btn);
        }
        inspectorBody.append(el("div", { class: "panel-group" }, el("div", { class: "panel-label" }, "计算几何分析"), list));

        const geoRes = computeGeoAlgo(tab.geoAlgo, tab.nodes);
        if (geoRes) {
          inspectorBody.append(el("div", { class: "algo-summary-card" }, geoRes.summary));
        }
      } else {
        const algos: Array<{ id: AlgoId; label: string }> = [
          { id: "none", label: "关闭" },
          { id: "components", label: tab.directed ? "强连通分量 (SCC)" : "连通分量 (CC)" },
          { id: "bridges", label: "桥与割点" },
          { id: "mst", label: "最小生成树 (MST)" },
          { id: "bipartite", label: "二分图与奇环检测" },
          { id: "tree_props", label: "树直径与重心" },
          { id: "shortest_path", label: "最短路 (s → t)" },
        ];
        const list = el("div", { class: "algo-list" });
        for (const item of algos) {
          const btn = el(
            "button",
            {
              class: tab.algo === item.id ? "algo-item active" : "algo-item",
              type: "button",
              "data-testid": `graph-algo-${item.id}`,
            },
            item.label,
          );
          btn.addEventListener("click", () => {
            tab.algo = item.id;
            if (item.id === "shortest_path" && tab.nodes.length > 0) {
              if (!tab.pathStart || !tab.nodes.some((n) => n.id === tab.pathStart)) {
                tab.pathStart = tab.nodes[0].id;
              }
              if (!tab.pathEnd || !tab.nodes.some((n) => n.id === tab.pathEnd)) {
                tab.pathEnd = tab.nodes[tab.nodes.length - 1].id;
              }
            }
            updateToolbarStats();
            renderInspectorBody();
            scheduleSave();
            requestFrame();
          });
          list.append(btn);
        }
        inspectorBody.append(el("div", { class: "panel-group" }, el("div", { class: "panel-label" }, "图论算法高亮"), list));

        // Shortest path S/T pickers
        if (tab.algo === "shortest_path" && tab.nodes.length > 0) {
          const mkSelect = (cur: string | null, onPick: (v: string) => void) => {
            const s = el("select", { class: "select-field" });
            for (const nd of tab.nodes) {
              const o = el("option", { value: nd.id }, nd.label || nd.id);
              if (nd.id === cur) o.selected = true;
              s.append(o);
            }
            s.addEventListener("change", () => onPick(s.value));
            return s;
          };
          const sSel = mkSelect(tab.pathStart ?? tab.nodes[0].id, (v) => {
            tab.pathStart = v;
            updateToolbarStats();
            renderInspectorBody();
            scheduleSave();
            requestFrame();
          });
          const tSel = mkSelect(tab.pathEnd ?? tab.nodes[tab.nodes.length - 1].id, (v) => {
            tab.pathEnd = v;
            updateToolbarStats();
            renderInspectorBody();
            scheduleSave();
            requestFrame();
          });
          inspectorBody.append(
            el(
              "div",
              { class: "panel-group" },
              el("div", { class: "panel-label" }, "起点 S / 终点 T"),
              el("div", { class: "dual-row" }, sSel, tSel),
            ),
          );
        }

        const res = computeGraphAlgo(tab.algo, tab.nodes, tab.edges, {
          directed: tab.directed,
          pathStart: tab.pathStart,
          pathEnd: tab.pathEnd,
        });
        if (res) {
          const card = el("div", { class: res.warning ? "algo-summary-card warn" : "algo-summary-card" });
          card.textContent = res.warning ? `${res.summary}\n${res.warning}` : res.summary;
          inspectorBody.append(card);
        }
      }
    } else {
      // Appearance tab
      const makeSlider = (
        label: string,
        min: number,
        max: number,
        step: number,
        value: number,
        unit: string,
        onInput: (v: number) => void,
      ) => {
        const valSpan = el("span", {}, `${value}${unit}`);
        const inp = el("input", {
          type: "range",
          min: String(min),
          max: String(max),
          step: String(step),
          value: String(value),
        });
        inp.addEventListener("input", () => {
          const num = Number(inp.value);
          valSpan.textContent = `${num}${unit}`;
          onInput(num);
          scheduleSave();
          requestFrame();
        });
        return el("div", { class: "slider-row" }, el("div", { class: "slider-head" }, el("span", {}, label), valSpan), inp);
      };

      inspectorBody.append(
        el(
          "div",
          { class: "panel-group" },
          el("div", { class: "panel-label" }, "几何尺寸"),
          makeSlider("节点半径", 12, 32, 1, appearance.nodeRadius, "px", (v) => (appearance.nodeRadius = v)),
          makeSlider("字号", 10, 18, 1, appearance.fontSize, "px", (v) => (appearance.fontSize = v)),
          makeSlider("边线宽度", 1.0, 3.6, 0.2, appearance.edgeWidth, "px", (v) => (appearance.edgeWidth = v)),
          makeSlider("重边弧度", 16, 64, 2, appearance.curveStrength, "", (v) => (appearance.curveStrength = v)),
        ),
      );

      const makeToggle = (label: string, checked: boolean, onChange: (v: boolean) => void, testId?: string) => {
        const inp = el("input", { type: "checkbox", ...(testId ? { "data-testid": testId } : {}) });
        inp.checked = checked;
        inp.addEventListener("change", () => {
          onChange(inp.checked);
          scheduleSave();
          requestFrame();
        });
        return el("label", { class: "toggle-row" }, el("span", {}, label), inp);
      };

      inspectorBody.append(
        el(
          "div",
          { class: "panel-group" },
          el("div", { class: "panel-label" }, "出版与渲染风格"),
          makeToggle("TikZ 出版风", appearance.printStyle, (v) => (appearance.printStyle = v), "graph-print-style"),
          makeToggle("导出透明背景", appearance.transparentBg, (v) => (appearance.transparentBg = v), "graph-transparent-bg"),
          makeToggle("显示节点角标", appearance.showBadges, (v) => (appearance.showBadges = v)),
          makeToggle("几何坐标轴与网格", appearance.showAxes, (v) => (appearance.showAxes = v)),
        ),
      );

      const resetBtn = el("button", { class: "btn", type: "button" }, "恢复默认外观");
      resetBtn.addEventListener("click", () => {
        appearance = { ...DEFAULT_APPEARANCE };
        renderInspectorBody();
        scheduleSave();
        requestFrame();
      });
      inspectorBody.append(resetBtn);
    }
  }

  function renderSelectionCard() {
    const tab = curTab();
    if (selectedNodeId) {
      const nd = tab.nodes.find((n) => n.id === selectedNodeId);
      if (!nd) return;
      const pinBtn = el("button", { class: "btn", type: "button" }, nd.pinned ? "取消固定" : "固定位置");
      pinBtn.addEventListener("click", () => {
        pushHistory();
        nd.pinned = !nd.pinned;
        if (!nd.pinned && !tab.locked && tab.mode === "normal") wakePhysics();
        renderInspectorBody();
        requestFrame();
        scheduleSave();
      });
      const editBtn = el("button", { class: "btn", type: "button" }, "改标签");
      editBtn.addEventListener("click", () => {
        const p = worldToScreen(nd.x, nd.y, tab.viewport, canvasWidth, canvasHeight);
        openInlinePopover("node", nd.id, nd.label || nd.id, p.x, p.y);
      });
      const delBtn = el("button", { class: "btn btn-danger", type: "button", "data-testid": "graph-delete-node" }, "删除");
      delBtn.addEventListener("click", deleteCurrentSelection);

      const actions = [editBtn];
      if (tab.mode !== "geometry") actions.push(pinBtn);
      if (tab.mode === "tree") {
        const rootBtn = el("button", { class: "btn", type: "button" }, "设为根");
        rootBtn.addEventListener("click", () => {
          pushHistory();
          tab.rootId = nd.id;
          applyTreeLayout(tab.nodes, tab.edges, tab.rootId);
          tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
          renderInspectorBody();
          requestFrame();
          scheduleSave();
        });
        actions.push(rootBtn);
      }
      actions.push(delBtn);

      inspectorBody.append(
        el(
          "div",
          { class: "selection-card" },
          el("div", { class: "selection-head" }, `选中节点：${nd.label || nd.id}`),
          el("div", { class: "selection-actions" }, ...actions),
        ),
      );
      return;
    }

    if (selectedEdgeId) {
      const e = tab.edges.find((x) => x.id === selectedEdgeId);
      if (!e) return;
      const editBtn = el("button", { class: "btn", type: "button" }, "改边权");
      editBtn.addEventListener("click", () => {
        const u = tab.nodes.find((n) => n.id === e.from);
        const v = tab.nodes.find((n) => n.id === e.to);
        if (u && v) {
          const p = worldToScreen((u.x + v.x) / 2, (u.y + v.y) / 2, tab.viewport, canvasWidth, canvasHeight);
          openInlinePopover("edge", e.id, e.weight ?? "", p.x, p.y);
        }
      });
      const delBtn = el("button", { class: "btn btn-danger", type: "button" }, "删除边");
      delBtn.addEventListener("click", deleteCurrentSelection);

      inspectorBody.append(
        el(
          "div",
          { class: "selection-card" },
          el("div", { class: "selection-head" }, `选中边：${e.from} ${tab.directed ? "→" : "—"} ${e.to}`),
          el("div", { class: "selection-actions" }, editBtn, delBtn),
        ),
      );
      return;
    }

    inspectorBody.append(
      el(
        "div",
        { class: "hint-box" },
        "拖拽空白平移，滚轮缩放，双击空白加点，Shift+拖拽连边，双击节点或边可直接编辑。",
      ),
    );
  }

  function syncAllUI() {
    renderTabs();
    segFormat.sync();
    segIndex.sync();
    segDir.sync();
    inspectorSeg.sync();
    updatePlaceholder();
    updateSmartBanner();
    updateNodeLabelsBox();
    updateToolbarStats();
    updateHudTools();
    updateZoomLabel();
    updateHistoryButtons();
    renderInspectorBody();
  }

  // -------------------------------------------------------------------------
  // Inline Popover Editing & Deletion
  // -------------------------------------------------------------------------

  function openInlinePopover(kind: "node" | "edge", id: string, initialVal: string, sx: number, sy: number) {
    inlineTarget = { kind, id };
    inlineInput.value = initialVal;
    inlineInput.placeholder = kind === "node" ? "节点标签" : "边权（留空清除）";
    inlinePopover.style.left = `${Math.max(100, Math.min(canvasWidth - 100, sx))}px`;
    inlinePopover.style.top = `${Math.max(48, Math.min(canvasHeight - 20, sy))}px`;
    inlinePopover.hidden = false;
    inlineInput.focus();
    inlineInput.select();
  }

  function closeInlinePopover() {
    inlinePopover.hidden = true;
    inlineTarget = null;
  }

  function commitInlinePopover() {
    if (!inlineTarget) return;
    const tab = curTab();
    const val = inlineInput.value.trim();
    pushHistory();
    if (inlineTarget.kind === "node") {
      const nd = tab.nodes.find((n) => n.id === inlineTarget!.id);
      if (nd && val) {
        nd.label = val;
      }
    } else {
      const e = tab.edges.find((x) => x.id === inlineTarget!.id);
      if (e) {
        e.weight = val || null;
        syncTextFromGraph();
      }
    }
    closeInlinePopover();
    updateToolbarStats();
    renderInspectorBody();
    scheduleSave();
    requestFrame();
  }

  function deleteCurrentSelection() {
    const tab = curTab();
    if (selectedNodeId) {
      pushHistory();
      const sid = selectedNodeId;
      tab.nodes = tab.nodes.filter((n) => n.id !== sid);
      tab.edges = tab.edges.filter((e) => e.from !== sid && e.to !== sid);
      selectedNodeId = null;
      if (connectFrom === sid) connectFrom = null;
      syncTextFromGraph();
      closeInlinePopover();
      renderInspectorBody();
      requestFrame();
      return;
    }
    if (selectedEdgeId) {
      pushHistory();
      const eid = selectedEdgeId;
      tab.edges = tab.edges.filter((e) => e.id !== eid);
      selectedEdgeId = null;
      syncTextFromGraph();
      closeInlinePopover();
      renderInspectorBody();
      requestFrame();
    }
  }

  inlineOkBtn.addEventListener("click", commitInlinePopover);
  inlineDelBtn.addEventListener("click", () => {
    if (inlineTarget?.kind === "node") selectedNodeId = inlineTarget.id;
    else if (inlineTarget?.kind === "edge") selectedEdgeId = inlineTarget.id;
    deleteCurrentSelection();
  });
  inlineInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInlinePopover();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeInlinePopover();
    }
  });

  // -------------------------------------------------------------------------
  // Export & Clipboard Actions
  // -------------------------------------------------------------------------

  async function handleCopyPng() {
    try {
      const dataUrl = renderExportPngDataUrl(buildRenderState(), canvasWidth, canvasHeight, 3);
      if (bridge?.clipboard?.writeImage) {
        await bridge.clipboard.writeImage(dataUrl);
      } else if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else {
        throw new Error("当前环境不支持图片剪贴板");
      }
      btnCopyPng.textContent = "已复制";
      window.setTimeout(() => {
        btnCopyPng.textContent = "复制 PNG";
      }, 1300);
      showToast("已复制高清 PNG 到剪贴板", "success");
    } catch (err) {
      showToast(`复制失败：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  async function handleExportPng() {
    exportMenuList.hidden = true;
    try {
      const dataUrl = renderExportPngDataUrl(buildRenderState(), canvasWidth, canvasHeight, 3);
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      if (bridge?.files?.savePng) {
        const saved = await bridge.files.savePng("graph.png", base64);
        if (saved) showToast("已导出 3× PNG", "success");
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

  async function handleExportSvg() {
    exportMenuList.hidden = true;
    try {
      const svg = buildExportSvg(buildRenderState(), canvasWidth, canvasHeight);
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

  async function handleCopySvg() {
    exportMenuList.hidden = true;
    try {
      const svg = buildExportSvg(buildRenderState(), canvasWidth, canvasHeight);
      if (bridge?.clipboard?.writeText) {
        await bridge.clipboard.writeText(svg);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(svg);
      }
      showToast("已复制 SVG 代码", "success");
    } catch (err) {
      showToast(`复制 SVG 失败：${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Event Wiring
  // -------------------------------------------------------------------------

  btnCopyPng.addEventListener("click", () => void handleCopyPng());
  btnExportMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenuList.hidden = !exportMenuList.hidden;
  });
  miExportSvg.addEventListener("click", () => void handleExportSvg());
  miExportPng.addEventListener("click", () => void handleExportPng());
  miCopySvg.addEventListener("click", () => void handleCopySvg());

  document.addEventListener("click", (e) => {
    if (!exportDropdown.contains(e.target as Node)) {
      exportMenuList.hidden = true;
    }
  });

  btnToggleInspector.addEventListener("click", () => {
    inspectorOpen = !inspectorOpen;
    renderInspectorBody();
    scheduleSave();
  });

  nodeLabelsToggle.addEventListener("click", () => {
    nodeLabelsExpanded = !nodeLabelsExpanded;
    updateNodeLabelsBox();
  });

  btnToolSelect.addEventListener("click", () => {
    toolMode = "select";
    connectFrom = null;
    updateHudTools();
    requestFrame();
  });
  btnToolConnect.addEventListener("click", () => {
    toolMode = toolMode === "connect" ? "select" : "connect";
    connectFrom = null;
    updateHudTools();
    requestFrame();
  });

  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);

  function zoomByFactor(factor: number, centerX = canvasWidth / 2, centerY = canvasHeight / 2) {
    const tab = curTab();
    const before = screenToWorld(centerX, centerY, tab.viewport, canvasWidth, canvasHeight);
    const minScale = tab.mode === "geometry" ? 0.05 : 0.18;
    const maxScale = tab.mode === "geometry" ? 400 : 4.5;
    tab.viewport.scale = Math.max(minScale, Math.min(maxScale, tab.viewport.scale * factor));
    const after = screenToWorld(centerX, centerY, tab.viewport, canvasWidth, canvasHeight);
    tab.viewport.x += before.x - after.x;
    tab.viewport.y += before.y - after.y;
    updateZoomLabel();
    requestFrame();
    scheduleSave();
  }

  btnZoomIn.addEventListener("click", () => zoomByFactor(1.2));
  btnZoomOut.addEventListener("click", () => zoomByFactor(1 / 1.2));
  btnZoomPct.addEventListener("click", () => {
    const tab = curTab();
    tab.viewport.scale = tab.mode === "geometry" ? 56 : 1;
    updateZoomLabel();
    requestFrame();
    scheduleSave();
  });
  btnFitView.addEventListener("click", () => {
    const tab = curTab();
    tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
    updateZoomLabel();
    requestFrame();
    scheduleSave();
  });
  btnRelayout.addEventListener("click", () => relayoutCurrent("mode"));

  textarea.addEventListener("input", () => {
    const tab = curTab();
    tab.editorText = textarea.value;
    if (!suppressTextParse) {
      parseCurrentTabText(true, false);
      renderInspectorBody();
    }
    scheduleSave();
  });

  nodeLabelsInput.addEventListener("input", () => {
    const tab = curTab();
    tab.nodeLabelsText = nodeLabelsInput.value;
    applyNodeLabelsText(tab.nodes, tab.nodeLabelsText, tab.oneIndexed);
    updateNodeLabelsBox();
    requestFrame();
    scheduleSave();
  });

  // Canvas Pointer & Wheel Gestures
  function getCanvasCoords(e: PointerEvent | MouseEvent | WheelEvent) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function nextNodeId(): string {
    const tab = curTab();
    const existing = new Set(tab.nodes.map((n) => n.id));
    let cur = tab.oneIndexed ? 1 : 0;
    while (existing.has(String(cur))) cur++;
    return String(cur);
  }

  function addEdgeBetween(fromId: string, toId: string) {
    const tab = curTab();
    if (!tab.multiedge) {
      const exists = tab.edges.some((e) =>
        tab.directed
          ? e.from === fromId && e.to === toId
          : (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId),
      );
      if (exists) return;
    }
    pushHistory();
    const edge: EdgeItem = { id: nextEdgeId(), from: fromId, to: toId, weight: null };
    tab.edges.push(edge);
    selectedEdgeId = edge.id;
    selectedNodeId = null;
    syncTextFromGraph();
    if (tab.mode === "normal" && !tab.locked) wakePhysics();
    renderInspectorBody();
    requestFrame();
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    closeInlinePopover();
    exportMenuList.hidden = true;

    const tab = curTab();
    const { x, y } = getCanvasCoords(e);
    pointerScreen = { x, y };
    pointerMoved = false;

    // Middle click always pans
    if (e.button === 1) {
      isPanning = true;
      panStartScreen = { x, y };
      panStartViewport = { ...tab.viewport };
      canvasEl.setPointerCapture(e.pointerId);
      canvasEl.style.cursor = "grabbing";
      return;
    }

    const hitN = hitTestNode(x, y, tab.nodes, tab.viewport, canvasWidth, canvasHeight, appearance, tab.mode);

    if (hitN) {
      if (toolMode === "paint") {
        pushHistory();
        hitN.color = brushColor;
        selectedNodeId = hitN.id;
        selectedEdgeId = null;
        renderInspectorBody();
        scheduleSave();
        requestFrame();
        return;
      }

      if (toolMode === "connect" || e.shiftKey) {
        if (!connectFrom) {
          connectFrom = hitN.id;
          selectedNodeId = hitN.id;
          selectedEdgeId = null;
          if (e.shiftKey) {
            canvasEl.setPointerCapture(e.pointerId);
          }
        } else {
          addEdgeBetween(connectFrom, hitN.id);
          connectFrom = null;
        }
        renderInspectorBody();
        requestFrame();
        return;
      }

      // Start dragging node
      pushHistory();
      draggingNodeId = hitN.id;
      selectedNodeId = hitN.id;
      selectedEdgeId = null;
      const worldPt = screenToWorld(x, y, tab.viewport, canvasWidth, canvasHeight);
      dragOffsetWorld = { x: hitN.x - worldPt.x, y: hitN.y - worldPt.y };
      canvasEl.setPointerCapture(e.pointerId);
      canvasEl.style.cursor = "grabbing";
      if (tab.mode === "normal" && !tab.locked) wakePhysics();
      renderInspectorBody();
      requestFrame();
      return;
    }

    // Check edge hit
    const hitE = hitTestEdge(
      x,
      y,
      tab.nodes,
      tab.edges,
      tab.directed,
      tab.viewport,
      canvasWidth,
      canvasHeight,
      appearance,
      tab.mode,
    );
    if (hitE && toolMode !== "connect") {
      selectedEdgeId = hitE.id;
      selectedNodeId = null;
      connectFrom = null;
      renderInspectorBody();
      requestFrame();
      return;
    }

    // Blank canvas -> start panning
    selectedNodeId = null;
    selectedEdgeId = null;
    connectFrom = null;
    isPanning = true;
    panStartScreen = { x, y };
    panStartViewport = { ...tab.viewport };
    canvasEl.setPointerCapture(e.pointerId);
    canvasEl.style.cursor = "grabbing";
    renderInspectorBody();
    requestFrame();
  });

  canvasEl.addEventListener("pointermove", (e) => {
    const tab = curTab();
    const { x, y } = getCanvasCoords(e);
    pointerScreen = { x, y };

    if (draggingNodeId) {
      pointerMoved = true;
      const nd = tab.nodes.find((n) => n.id === draggingNodeId);
      if (nd) {
        const wpt = screenToWorld(x, y, tab.viewport, canvasWidth, canvasHeight);
        nd.x = wpt.x + dragOffsetWorld.x;
        nd.y = wpt.y + dragOffsetWorld.y;
        nd.vx = 0;
        nd.vy = 0;
        if (tab.mode === "normal" && !tab.locked) wakePhysics();
      }
      requestFrame();
      return;
    }

    if (isPanning) {
      const dx = x - panStartScreen.x;
      const dy = y - panStartScreen.y;
      if (Math.hypot(dx, dy) > 2) pointerMoved = true;
      tab.viewport.x = panStartViewport.x - dx / tab.viewport.scale;
      tab.viewport.y = panStartViewport.y - dy / tab.viewport.scale;
      requestFrame();
      return;
    }

    if (connectFrom) {
      requestFrame();
      return;
    }

    // Hover feedback
    const hNode = hitTestNode(x, y, tab.nodes, tab.viewport, canvasWidth, canvasHeight, appearance, tab.mode);
    const hEdge = hNode
      ? null
      : hitTestEdge(
          x,
          y,
          tab.nodes,
          tab.edges,
          tab.directed,
          tab.viewport,
          canvasWidth,
          canvasHeight,
          appearance,
          tab.mode,
        );
    const nextHovNode = hNode?.id ?? null;
    const nextHovEdge = hEdge?.id ?? null;
    if (nextHovNode !== hoverNodeId || nextHovEdge !== hoverEdgeId) {
      hoverNodeId = nextHovNode;
      hoverEdgeId = nextHovEdge;
      requestFrame();
    }
    if (toolMode === "select") {
      canvasEl.style.cursor = hNode ? "grab" : hEdge ? "pointer" : "default";
    }
  });

  function finishPointer(e: PointerEvent) {
    const tab = curTab();
    if (canvasEl.hasPointerCapture(e.pointerId)) {
      canvasEl.releasePointerCapture(e.pointerId);
    }

    // Shift+drag connect release on target node
    if (connectFrom && e.shiftKey && toolMode !== "connect") {
      const { x, y } = getCanvasCoords(e);
      const target = hitTestNode(x, y, tab.nodes, tab.viewport, canvasWidth, canvasHeight, appearance, tab.mode);
      if (target) {
        addEdgeBetween(connectFrom, target.id);
      }
      connectFrom = null;
      requestFrame();
    }

    if (draggingNodeId) {
      if (pointerMoved && tab.format === "coords") {
        syncTextFromGraph();
      }
      draggingNodeId = null;
      scheduleSave();
    }
    if (isPanning) {
      isPanning = false;
      scheduleSave();
    }
    updateHudTools();
  }

  canvasEl.addEventListener("pointerup", finishPointer);
  canvasEl.addEventListener("pointercancel", finishPointer);
  canvasEl.addEventListener("pointerleave", () => {
    if (!draggingNodeId && !isPanning) {
      hoverNodeId = null;
      hoverEdgeId = null;
      pointerScreen = null;
      requestFrame();
    }
  });

  // Double-click: edit node label / edit edge weight / add new node on blank space
  canvasEl.addEventListener("dblclick", (e) => {
    const tab = curTab();
    const { x, y } = getCanvasCoords(e);

    const hitN = hitTestNode(x, y, tab.nodes, tab.viewport, canvasWidth, canvasHeight, appearance, tab.mode);
    if (hitN) {
      selectedNodeId = hitN.id;
      selectedEdgeId = null;
      const p = worldToScreen(hitN.x, hitN.y, tab.viewport, canvasWidth, canvasHeight);
      openInlinePopover("node", hitN.id, hitN.label || hitN.id, p.x, p.y);
      renderInspectorBody();
      requestFrame();
      return;
    }

    const hitE = hitTestEdge(
      x,
      y,
      tab.nodes,
      tab.edges,
      tab.directed,
      tab.viewport,
      canvasWidth,
      canvasHeight,
      appearance,
      tab.mode,
    );
    if (hitE) {
      selectedEdgeId = hitE.id;
      selectedNodeId = null;
      openInlinePopover("edge", hitE.id, hitE.weight ?? "", x, y);
      renderInspectorBody();
      requestFrame();
      return;
    }

    // Blank canvas double-click -> create new node
    pushHistory();
    const id = nextNodeId();
    const wpt = screenToWorld(x, y, tab.viewport, canvasWidth, canvasHeight);
    const nd: NodeItem = {
      id,
      label: id,
      note: "",
      x: tab.mode === "geometry" ? Math.round(wpt.x * 10) / 10 : wpt.x,
      y: tab.mode === "geometry" ? Math.round(wpt.y * 10) / 10 : wpt.y,
      vx: 0,
      vy: 0,
      color: toolMode === "paint" ? brushColor : null,
      pinned: tab.mode === "geometry",
    };
    tab.nodes.push(nd);
    selectedNodeId = id;
    selectedEdgeId = null;
    syncTextFromGraph();
    renderInspectorBody();
    requestFrame();
  });

  // Wheel Zoom around cursor
  canvasEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const { x, y } = getCanvasCoords(e);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomByFactor(factor, x, y);
    },
    { passive: false },
  );

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const isTyping = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
    if (isTyping) return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedNodeId || selectedEdgeId) {
        e.preventDefault();
        deleteCurrentSelection();
      }
      return;
    }
    if (e.key === "Escape") {
      toolMode = "select";
      connectFrom = null;
      closeInlinePopover();
      exportMenuList.hidden = true;
      updateHudTools();
      requestFrame();
      return;
    }
    if (e.key === "0") {
      const tab = curTab();
      tab.viewport = computeFitViewport(tab.nodes, canvasWidth, canvasHeight, tab.mode);
      updateZoomLabel();
      requestFrame();
    }
  });

  // ResizeObserver for crisp DPR
  let hasMeasured = false;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w > 40 && h > 40) {
        canvasWidth = w;
        canvasHeight = h;
        if (!hasMeasured) {
          hasMeasured = true;
          const tab = curTab();
          if (tab.nodes.length > 0) {
            tab.viewport = computeFitViewport(tab.nodes, w, h, tab.mode);
            updateZoomLabel();
          }
        }
        requestFrame();
      }
    }
  });
  ro.observe(canvasWrap);

  // Live theme sync
  bridge?.onThemeChange?.((theme) => {
    applyThemeAttr(theme);
    requestFrame();
  });

  // Handle initialPayload (e.g. "Open in Graph Editor" from headless tool output)
  const payload = bridge?.initialPayload as Record<string, unknown> | undefined;
  if (payload && Array.isArray(payload.nodes)) {
    const incomingTab = createDefaultTab(tabs.length + 1);
    incomingTab.name = typeof payload.title === "string" && payload.title ? payload.title.slice(0, 14) : `导入图 ${tabs.length + 1}`;
    incomingTab.directed = Boolean(payload.directed);
    incomingTab.oneIndexed = payload.one_indexed !== false;
    incomingTab.mode = payload.layout === "tree" ? "tree" : payload.layout === "coords" ? "geometry" : "normal";
    incomingTab.format = payload.layout === "coords" ? "coords" : "edge_list";

    const rawNodes: RawNodeItem[] = (payload.nodes as Array<Record<string, unknown>>).map((n) => ({
      id: String(n.id),
      label: String(n.label || n.id),
      note: "",
      x: n.x != null ? Number(n.x) : null,
      y: n.y != null ? Number(n.y) : null,
      color: (n.color as string | null) ?? null,
      pinned: incomingTab.mode === "geometry",
    }));
    const incomingEdges: EdgeItem[] = ((payload.edges as Array<Record<string, unknown>>) ?? []).map((e) => ({
      id: nextEdgeId(),
      from: String(e.from),
      to: String(e.to),
      weight: e.weight != null ? String(e.weight) : e.label != null ? String(e.label) : null,
    }));

    incomingTab.nodes = placeInitialNodes(rawNodes, incomingEdges, incomingTab.mode, null);
    incomingTab.edges = incomingEdges;
    const ser = serializeGraphToText(incomingTab.nodes, incomingTab.edges, incomingTab.format);
    incomingTab.editorText = ser.text;
    tabs.push(incomingTab);
    activeTabId = incomingTab.id;
  }

  // Initial boot
  const tab0 = curTab();
  suppressTextParse = true;
  textarea.value = tab0.editorText;
  nodeLabelsInput.value = tab0.nodeLabelsText;
  suppressTextParse = false;
  if (tab0.nodes.length === 0 && tab0.editorText.trim().length > 0) {
    parseCurrentTabText(false, true);
  }
  syncAllUI();
  requestFrame();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void mount(), { once: true });
} else {
  void mount();
}
