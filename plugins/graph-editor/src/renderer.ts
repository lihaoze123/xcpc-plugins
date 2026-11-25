import type { AlgoResult, GeoResult } from "./algos";
import {
  COMPONENT_COLORS,
  findPaletteEntry,
  type AppearanceSettings,
  type EdgeItem,
  type GraphMode,
  type NodeItem,
  type Viewport,
} from "./types";

export interface ThemeColors {
  bg: string;
  card: string;
  muted: string;
  fg: string;
  secondaryFg: string;
  mutedFg: string;
  border: string;
  primary: string;
  accentHighlight: string;
  danger: string;
}

export interface RenderContextState {
  nodes: NodeItem[];
  edges: EdgeItem[];
  directed: boolean;
  mode: GraphMode;
  rootId: string | null;
  viewport: Viewport;
  appearance: AppearanceSettings;
  isDark: boolean;
  colors: ThemeColors;
  algoResult: AlgoResult | null;
  geoResult: GeoResult | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoverNodeId: string | null;
  hoverEdgeId: string | null;
  connectFrom: string | null;
  pointerScreen: { x: number; y: number } | null;
  exportMode?: boolean;
}

export interface ScreenEdgeGeom {
  edge: EdgeItem;
  isLoop: boolean;
  // For normal/curved edge: quadratic bezier (sx, sy) -> (cx, cy) -> (tx, ty)
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  // For self-loop: cubic bezier (sx, sy) -> (c1x, c1y), (c2x, c2y) -> (tx, ty)
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  labelX: number;
  labelY: number;
  endAngle: number;
}

export function worldToScreen(
  wx: number,
  wy: number,
  vp: Viewport,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: width / 2 + (wx - vp.x) * vp.scale,
    y: height / 2 + (wy - vp.y) * vp.scale,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  vp: Viewport,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: vp.x + (sx - width / 2) / vp.scale,
    y: vp.y + (sy - height / 2) / vp.scale,
  };
}

export function computeFitViewport(
  nodes: NodeItem[],
  width: number,
  height: number,
  mode: GraphMode,
): Viewport {
  if (nodes.length === 0) {
    return { x: 0, y: 0, scale: mode === "geometry" ? 56 : 1 };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const nd of nodes) {
    if (nd.x < minX) minX = nd.x;
    if (nd.x > maxX) maxX = nd.x;
    if (nd.y < minY) minY = nd.y;
    if (nd.y > maxY) maxY = nd.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const pad = 88;
  const usableW = Math.max(80, width - pad * 2);
  const usableH = Math.max(80, height - pad * 2);

  if (spanX < 1e-4 && spanY < 1e-4) {
    return { x: cx, y: cy, scale: mode === "geometry" ? 56 : 1 };
  }

  let scale = Math.min(
    spanX > 1e-4 ? usableW / spanX : Infinity,
    spanY > 1e-4 ? usableH / spanY : Infinity,
  );
  if (mode === "geometry") {
    scale = Math.max(0.05, Math.min(240, scale));
  } else {
    scale = Math.max(0.25, Math.min(1.6, scale));
  }
  return { x: cx, y: cy, scale };
}

export function getVisualNodeRadius(appearance: AppearanceSettings, mode: GraphMode, scale: number): number {
  if (mode === "geometry") {
    return Math.max(12, Math.min(26, appearance.nodeRadius * 0.78));
  }
  const zoomFactor = Math.max(0.68, Math.min(1.38, Math.pow(scale, 0.35)));
  return appearance.nodeRadius * zoomFactor;
}

export function computeEdgeGeometries(
  nodes: NodeItem[],
  edges: EdgeItem[],
  directed: boolean,
  vp: Viewport,
  width: number,
  height: number,
  appearance: AppearanceSettings,
  mode: GraphMode,
): ScreenEdgeGeom[] {
  const r = getVisualNodeRadius(appearance, mode, vp.scale);
  const posMap = new Map<string, { x: number; y: number }>();
  for (const nd of nodes) {
    posMap.set(nd.id, worldToScreen(nd.x, nd.y, vp, width, height));
  }

  // Group edges by unordered pair
  const pairGroups = new Map<string, EdgeItem[]>();
  const loopGroups = new Map<string, EdgeItem[]>();

  for (const e of edges) {
    if (e.from === e.to) {
      if (!loopGroups.has(e.from)) loopGroups.set(e.from, []);
      loopGroups.get(e.from)!.push(e);
    } else {
      const key = e.from < e.to ? `${e.from}\0${e.to}` : `${e.to}\0${e.from}`;
      if (!pairGroups.has(key)) pairGroups.set(key, []);
      pairGroups.get(key)!.push(e);
    }
  }

  const out: ScreenEdgeGeom[] = [];

  for (const e of edges) {
    const pu = posMap.get(e.from);
    const pv = posMap.get(e.to);
    if (!pu || !pv) continue;

    if (e.from === e.to) {
      const group = loopGroups.get(e.from) ?? [e];
      const idx = group.indexOf(e);
      const baseAngle = -Math.PI / 2 + idx * 0.85;
      const spread = 0.44;
      const a1 = baseAngle - spread;
      const a2 = baseAngle + spread;
      const loopReach = r * 2.55 + idx * 14;
      const sx = pu.x + Math.cos(a1) * r;
      const sy = pu.y + Math.sin(a1) * r;
      const tx = pu.x + Math.cos(a2) * (directed ? r + 2 : r);
      const ty = pu.y + Math.sin(a2) * (directed ? r + 2 : r);
      const c1x = pu.x + Math.cos(a1 - 0.35) * loopReach;
      const c1y = pu.y + Math.sin(a1 - 0.35) * loopReach;
      const c2x = pu.x + Math.cos(a2 + 0.35) * loopReach;
      const c2y = pu.y + Math.sin(a2 + 0.35) * loopReach;
      // Cubic midpoint at t=0.5
      const labelX = 0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * tx;
      const labelY = 0.125 * sy + 0.375 * c1y + 0.375 * c2y + 0.125 * ty;
      const endAngle = Math.atan2(ty - c2y, tx - c2x);

      out.push({
        edge: e,
        isLoop: true,
        sx,
        sy,
        cx: labelX,
        cy: labelY,
        tx,
        ty,
        c1x,
        c1y,
        c2x,
        c2y,
        labelX,
        labelY,
        endAngle,
      });
      continue;
    }

    const key = e.from < e.to ? `${e.from}\0${e.to}` : `${e.to}\0${e.from}`;
    const group = pairGroups.get(key) ?? [e];
    const idx = group.indexOf(e);
    const count = group.length;

    const dx = pv.x - pu.x;
    const dy = pv.y - pu.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Canonical perpendicular vector (always oriented from smaller ID to larger ID)
    const canonSign = e.from < e.to ? 1 : -1;
    const nx = (-dy / dist) * canonSign;
    const ny = (dx / dist) * canonSign;

    const curveOffset =
      count === 1 ? 0 : (idx - (count - 1) / 2) * appearance.curveStrength;

    const mx = (pu.x + pv.x) / 2 + nx * curveOffset;
    const my = (pu.y + pv.y) / 2 + ny * curveOffset;

    // Trim endpoints at node circle boundary along tangent to control point
    const sDx = mx - pu.x;
    const sDy = my - pu.y;
    const sDist = Math.hypot(sDx, sDy) || 1;
    const sx = pu.x + (sDx / sDist) * r;
    const sy = pu.y + (sDy / sDist) * r;

    const tDx = pv.x - mx;
    const tDy = pv.y - my;
    const tDist = Math.hypot(tDx, tDy) || 1;
    const trimEnd = directed ? r + 2.5 : r;
    const tx = pv.x - (tDx / tDist) * trimEnd;
    const ty = pv.y - (tDy / tDist) * trimEnd;

    // Quadratic bezier midpoint at t=0.5
    const labelX = 0.25 * sx + 0.5 * mx + 0.25 * tx;
    const labelY = 0.25 * sy + 0.5 * my + 0.25 * ty;
    const endAngle = Math.atan2(ty - my, tx - mx);

    out.push({
      edge: e,
      isLoop: false,
      sx,
      sy,
      cx: mx,
      cy: my,
      tx,
      ty,
      c1x: mx,
      c1y: my,
      c2x: mx,
      c2y: my,
      labelX,
      labelY,
      endAngle,
    });
  }

  return out;
}

function niceStep(rawStep: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, rawStep))));
  const frac = rawStep / pow;
  if (frac <= 1) return 1 * pow;
  if (frac <= 2) return 2 * pow;
  if (frac <= 5) return 5 * pow;
  return 10 * pow;
}

function formatTick(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
  return String(Math.round(v * 1000) / 1000);
}

function resolveNodeColors(
  nd: NodeItem,
  state: RenderContextState,
  isHighlighted: boolean,
  isSelected: boolean,
): { fill: string; stroke: string; text: string } {
  const { appearance, isDark, colors, algoResult } = state;
  if (appearance.printStyle) {
    return {
      fill: "#FFFFFF",
      stroke: "#000000",
      text: "#000000",
    };
  }

  // 1. User explicit color overrides automatic algorithm coloring
  if (nd.color) {
    const entry = findPaletteEntry(nd.color);
    if (entry?.id) {
      return {
        fill: isDark ? entry.dark : entry.light,
        stroke: isSelected ? colors.primary : isDark ? entry.darkStroke : entry.lightStroke,
        text: isDark ? "#FAFAFA" : "#09090B",
      };
    }
  }

  // 2. Algorithm group color (components / bipartite)
  const groupIdx = algoResult?.nodeGroup?.get(nd.id);
  if (groupIdx != null) {
    const c = COMPONENT_COLORS[groupIdx % COMPONENT_COLORS.length];
    return {
      fill: isDark ? c.dark : c.light,
      stroke: isSelected ? colors.primary : isDark ? c.darkStroke : c.lightStroke,
      text: isDark ? "#FAFAFA" : "#09090B",
    };
  }

  // 3. Highlighted node (cut vertex / centroid / odd cycle / shortest path)
  if (isHighlighted) {
    return {
      fill: isDark ? "#164E63" : "#E0F2FE",
      stroke: isSelected ? colors.primary : colors.accentHighlight,
      text: isDark ? "#FAFAFA" : "#09090B",
    };
  }

  return {
    fill: colors.card,
    stroke: isSelected ? colors.primary : colors.secondaryFg,
    text: colors.fg,
  };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RenderContextState,
): void {
  const {
    nodes,
    edges,
    directed,
    mode,
    rootId,
    viewport,
    appearance,
    isDark,
    colors,
    algoResult,
    geoResult,
    selectedNodeId,
    selectedEdgeId,
    hoverNodeId,
    hoverEdgeId,
    connectFrom,
    pointerScreen,
    exportMode,
  } = state;

  const print = appearance.printStyle;
  ctx.clearRect(0, 0, width, height);

  if (!(exportMode && appearance.transparentBg)) {
    ctx.fillStyle = print ? "#FFFFFF" : colors.card;
    ctx.fillRect(0, 0, width, height);
  }

  // 1. Background Grid / Coordinate Axes
  if (mode === "geometry" && appearance.showAxes) {
    drawCoordinateGrid(ctx, width, height, viewport, isDark, print, colors);
  } else if (!exportMode && !print) {
    const step = 28 * Math.max(0.5, Math.min(2, viewport.scale));
    const ox = ((width / 2 - viewport.x * viewport.scale) % step + step) % step;
    const oy = ((height / 2 - viewport.y * viewport.scale) % step + step) % step;
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.065)" : "rgba(9,9,11,0.065)";
    for (let x = ox; x < width; x += step) {
      for (let y = oy; y < height; y += step) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }

  const r = getVisualNodeRadius(appearance, mode, viewport.scale);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const screenPos = new Map<string, { x: number; y: number }>();
  for (const nd of nodes) {
    screenPos.set(nd.id, worldToScreen(nd.x, nd.y, viewport, width, height));
  }

  // 2. Geometry Convex Hull overlay
  if (mode === "geometry" && geoResult?.hullIds && geoResult.hullIds.length >= 3) {
    ctx.save();
    ctx.beginPath();
    geoResult.hullIds.forEach((id, i) => {
      const p = screenPos.get(id);
      if (!p) return;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = print
      ? "rgba(0,0,0,0.05)"
      : isDark
        ? "rgba(14,127,166,0.16)"
        : "rgba(11,105,137,0.10)";
    ctx.fill();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = print ? "#000000" : colors.primary;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Rubber-band connect preview
  if (!exportMode && connectFrom && pointerScreen) {
    const pu = screenPos.get(connectFrom);
    if (pu) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(pu.x, pu.y);
      ctx.lineTo(pointerScreen.x, pointerScreen.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 4. Edges
  const geoms = computeEdgeGeometries(nodes, edges, directed, viewport, width, height, appearance, mode);
  const tikzSerif = '"Latin Modern Roman", "CMU Serif", "STIX Two Text", Georgia, "Times New Roman", serif';
  const fontMono = print
    ? `${Math.max(10, appearance.fontSize - 1)}px ${tikzSerif}`
    : `${Math.max(10, appearance.fontSize - 1)}px "JetBrains Mono", ui-monospace, monospace`;

  for (const g of geoms) {
    const isHi = Boolean(algoResult?.highlightEdges?.has(g.edge.id));
    const isSel = !exportMode && g.edge.id === selectedEdgeId;
    const isHov = !exportMode && g.edge.id === hoverEdgeId;
    const isDim = Boolean(algoResult?.dimOtherEdges && !isHi && !isSel);

    ctx.save();
    if (isDim) ctx.globalAlpha = print ? 0.32 : 0.25;

    const strokeColor = print
      ? "#000000"
      : isSel
        ? colors.primary
        : isHi
          ? colors.accentHighlight
          : isHov
            ? colors.fg
            : colors.secondaryFg;

    const baseLw = print ? Math.min(1.25, appearance.edgeWidth * 0.68) : appearance.edgeWidth;
    const lw = baseLw + (isHi || isSel ? (print ? 0.95 : 1.2) : isHov ? 0.45 : 0);

    if (isHi && !print) {
      ctx.save();
      ctx.strokeStyle = isDark ? "rgba(56,189,248,0.28)" : "rgba(11,105,137,0.20)";
      ctx.lineWidth = lw + 5;
      ctx.beginPath();
      if (g.isLoop) {
        ctx.moveTo(g.sx, g.sy);
        ctx.bezierCurveTo(g.c1x, g.c1y, g.c2x, g.c2y, g.tx, g.ty);
      } else {
        ctx.moveTo(g.sx, g.sy);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (g.isLoop) {
      ctx.moveTo(g.sx, g.sy);
      ctx.bezierCurveTo(g.c1x, g.c1y, g.c2x, g.c2y, g.tx, g.ty);
    } else {
      ctx.moveTo(g.sx, g.sy);
      ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
    }
    ctx.stroke();

    // Arrowhead (TikZ Stealth barb in printStyle, crisp triangle otherwise)
    if (directed) {
      const headLen = print ? Math.max(8.5, 7.5 + lw * 1.3) : Math.max(8, 7 + lw * 1.4);
      ctx.fillStyle = strokeColor;
      if (print) {
        drawStealthArrow(ctx, g.tx, g.ty, g.endAngle, headLen);
      } else {
        ctx.beginPath();
        ctx.moveTo(g.tx, g.ty);
        ctx.lineTo(
          g.tx - headLen * Math.cos(g.endAngle - Math.PI / 6.5),
          g.ty - headLen * Math.sin(g.endAngle - Math.PI / 6.5),
        );
        ctx.lineTo(
          g.tx - headLen * Math.cos(g.endAngle + Math.PI / 6.5),
          g.ty - headLen * Math.sin(g.endAngle + Math.PI / 6.5),
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Weight or Geometry length label
    let edgeLabel: string | null = null;
    if (appearance.showWeights && g.edge.weight) {
      edgeLabel = g.edge.weight;
    } else if (mode === "geometry" && geoResult?.showMeasurements && !g.isLoop) {
      const u = byId.get(g.edge.from);
      const v = byId.get(g.edge.to);
      if (u && v) {
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        edgeLabel = Number.isInteger(d) ? String(d) : d.toFixed(2);
      }
    }

    if (edgeLabel) {
      ctx.font = print && isMathItalic(edgeLabel) ? `italic ${fontMono}` : fontMono;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(edgeLabel).width;
      const padX = print ? 3.5 : 5;
      const boxH = Math.max(15, appearance.fontSize + 3);
      if (!(exportMode && appearance.transparentBg)) {
        ctx.fillStyle = print ? "#FFFFFF" : colors.card;
        roundRect(ctx, g.labelX - tw / 2 - padX, g.labelY - boxH / 2, tw + padX * 2, boxH, 3);
        ctx.fill();
      }
      ctx.fillStyle = print ? "#000000" : isHi || isSel ? colors.primary : colors.fg;
      ctx.fillText(edgeLabel, g.labelX, g.labelY + 0.5);
    }

    ctx.restore();
  }

  // 5. Geometry angle measurements
  if (mode === "geometry" && geoResult?.showMeasurements) {
    drawGeometryAngles(ctx, nodes, edges, screenPos, selectedNodeId, print, colors);
  }

  // 6. Nodes
  for (const nd of nodes) {
    const p = screenPos.get(nd.id);
    if (!p) continue;
    const isHi = Boolean(algoResult?.highlightNodes?.has(nd.id));
    const isSel = !exportMode && (nd.id === selectedNodeId || nd.id === connectFrom);
    const isHov = !exportMode && nd.id === hoverNodeId;
    const nc = resolveNodeColors(nd, state, isHi, isSel);

    ctx.save();

    // Soft focus/hover halo
    if ((isSel || isHov) && !print) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + (isSel ? 5 : 3.5), 0, Math.PI * 2);
      ctx.fillStyle = isSel
        ? isDark
          ? "rgba(14,127,166,0.28)"
          : "rgba(11,105,137,0.16)"
        : isDark
          ? "rgba(255,255,255,0.08)"
          : "rgba(9,9,11,0.06)";
      ctx.fill();
    }

    // TikZ `double` concentric ring for highlighted or selected nodes in printStyle
    if (print && (isHi || isSel)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2.8, 0, Math.PI * 2);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = "#000000";
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = nc.fill;
    ctx.fill();

    ctx.lineWidth = print ? (isHi || isSel ? 1.5 : 1.15) : isSel ? 2.6 : isHi ? 2.4 : 1.8;
    ctx.strokeStyle = nc.stroke;
    ctx.stroke();

    // Node label (LaTeX math italic for alphabetic IDs in TikZ mode)
    const labelStr = String(nd.label || nd.id);
    ctx.font = print
      ? `${isMathItalic(labelStr) ? "italic " : ""}500 ${appearance.fontSize + 1}px ${tikzSerif}`
      : `600 ${appearance.fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = nc.text;
    ctx.fillText(labelStr, p.x, p.y + 0.5);

    // Node note (value array) below node
    if (nd.note) {
      ctx.font = print
        ? `${isMathItalic(nd.note) ? "italic " : ""}400 ${Math.max(10, appearance.fontSize - 1)}px ${tikzSerif}`
        : `500 ${Math.max(10, appearance.fontSize - 2)}px "JetBrains Mono", ui-monospace, monospace`;
      const tw = ctx.measureText(nd.note).width;
      const ny = p.y + r + 12;
      if (!print) {
        ctx.fillStyle = isDark ? "rgba(24,24,27,0.88)" : "rgba(244,244,245,0.92)";
        roundRect(ctx, p.x - tw / 2 - 5, ny - 8, tw + 10, 16, 4);
        ctx.fill();
      }
      ctx.fillStyle = print ? "#000000" : colors.secondaryFg;
      ctx.fillText(nd.note, p.x, ny + 0.5);
    }

    // Geometry coordinates micro-caption when hovered or selected
    if (mode === "geometry" && !exportMode && (isSel || isHov)) {
      const coordText = `(${formatTick(nd.x)}, ${formatTick(-nd.y)})`;
      ctx.font = '10.5px "JetBrains Mono", ui-monospace, monospace';
      const tw = ctx.measureText(coordText).width;
      const cy = p.y - r - 12;
      ctx.fillStyle = colors.card;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      roundRect(ctx, p.x - tw / 2 - 5, cy - 8, tw + 10, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.mutedFg;
      ctx.fillText(coordText, p.x, cy + 0.5);
    }

    // Micro badge (algo badge or tree root) — togglable via appearance.showBadges
    let badge = appearance.showBadges ? algoResult?.nodeBadges?.get(nd.id) : undefined;
    if (appearance.showBadges && !badge && mode === "tree" && nd.id === rootId) {
      badge = "根";
    }
    if (badge) {
      ctx.font = print
        ? `500 9.5px ${tikzSerif}`
        : '600 9.5px system-ui, -apple-system, sans-serif';
      const bw = Math.max(16, ctx.measureText(badge).width + 8);
      const bx = p.x + r * 0.72;
      const by = p.y - r * 0.72;
      if (print) {
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 0.9;
        roundRect(ctx, bx - bw / 2, by - 7.5, bw, 15, 7.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#000000";
      } else {
        ctx.fillStyle = colors.primary;
        roundRect(ctx, bx - bw / 2, by - 7.5, bw, 15, 7.5);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      }
      ctx.fillText(badge, bx, by + 0.5);
    } else if (!exportMode && nd.pinned && mode !== "geometry") {
      // Subtle pin indicator dot
      ctx.beginPath();
      ctx.arc(p.x + r * 0.72, p.y - r * 0.72, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.mutedFg;
      ctx.fill();
    }

    ctx.restore();
  }
}

function isMathItalic(s: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_']*$/.test(s.trim());
}

function drawStealthArrow(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  angle: number,
  len: number,
): void {
  const halfAngle = Math.PI / 7.5;
  const notchLen = len * 0.72;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - len * Math.cos(angle - halfAngle), ty - len * Math.sin(angle - halfAngle));
  ctx.lineTo(tx - notchLen * Math.cos(angle), ty - notchLen * Math.sin(angle));
  ctx.lineTo(tx - len * Math.cos(angle + halfAngle), ty - len * Math.sin(angle + halfAngle));
  ctx.closePath();
  ctx.fill();
}

function stealthArrowSvgPoints(tx: number, ty: number, angle: number, len: number): string {
  const halfAngle = Math.PI / 7.5;
  const notchLen = len * 0.72;
  const p1x = tx - len * Math.cos(angle - halfAngle);
  const p1y = ty - len * Math.sin(angle - halfAngle);
  const nx = tx - notchLen * Math.cos(angle);
  const ny = ty - notchLen * Math.sin(angle);
  const p2x = tx - len * Math.cos(angle + halfAngle);
  const p2y = ty - len * Math.sin(angle + halfAngle);
  return `${tx.toFixed(1)},${ty.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${nx.toFixed(1)},${ny.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}`;
}

function drawCoordinateGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vp: Viewport,
  isDark: boolean,
  print: boolean,
  colors: ThemeColors,
): void {
  const stepWorld = niceStep(64 / vp.scale);
  const topLeft = screenToWorld(0, 0, vp, width, height);
  const botRight = screenToWorld(width, height, vp, width, height);

  const minX = Math.floor(topLeft.x / stepWorld) * stepWorld;
  const maxX = Math.ceil(botRight.x / stepWorld) * stepWorld;
  const minY = Math.floor(topLeft.y / stepWorld) * stepWorld;
  const maxY = Math.ceil(botRight.y / stepWorld) * stepWorld;

  ctx.save();
  ctx.strokeStyle = print
    ? "rgba(0,0,0,0.08)"
    : isDark
      ? "rgba(255,255,255,0.06)"
      : "rgba(9,9,11,0.06)";
  ctx.lineWidth = 1;

  for (let x = minX; x <= maxX; x += stepWorld) {
    const sx = worldToScreen(x, 0, vp, width, height).x;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }
  for (let y = minY; y <= maxY; y += stepWorld) {
    const sy = worldToScreen(0, y, vp, width, height).y;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }

  // Main X and Y axes
  const origin = worldToScreen(0, 0, vp, width, height);
  ctx.strokeStyle = print
    ? "#000000"
    : isDark
      ? "rgba(255,255,255,0.24)"
      : "rgba(9,9,11,0.22)";
  ctx.lineWidth = print ? 1.05 : 1.4;

  if (origin.y >= 0 && origin.y <= height) {
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(print ? width - 6 : width, origin.y);
    ctx.stroke();
    if (print) {
      ctx.fillStyle = "#000000";
      drawStealthArrow(ctx, width - 3, origin.y, 0, 8.5);
      ctx.font = 'italic 12px "Latin Modern Roman", "CMU Serif", Georgia, serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("x", width - 8, origin.y - 6);
    }
  }
  if (origin.x >= 0 && origin.x <= width) {
    ctx.beginPath();
    ctx.moveTo(origin.x, height);
    ctx.lineTo(origin.x, print ? 6 : 0);
    ctx.stroke();
    if (print) {
      ctx.fillStyle = "#000000";
      drawStealthArrow(ctx, origin.x, 3, -Math.PI / 2, 8.5);
      ctx.font = 'italic 12px "Latin Modern Roman", "CMU Serif", Georgia, serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("y", origin.x + 7, 6);
    }
  }

  // Axis tick marks & labels
  ctx.font = print
    ? '10px "Latin Modern Roman", "CMU Serif", Georgia, serif'
    : '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = print ? "#000000" : colors.mutedFg;
  const xLabelY = Math.max(12, Math.min(height - 10, origin.y + 13));
  const yLabelX = Math.max(18, Math.min(width - 18, origin.x - 10));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = minX; x <= maxX; x += stepWorld) {
    if (Math.abs(x) < stepWorld * 0.01) continue;
    const sx = worldToScreen(x, 0, vp, width, height).x;
    if (sx > 18 && sx < width - 18) {
      if (print && origin.y >= 0 && origin.y <= height) {
        ctx.beginPath();
        ctx.moveTo(sx, origin.y - 3);
        ctx.lineTo(sx, origin.y + 3);
        ctx.stroke();
      }
      ctx.fillText(formatTick(x), sx, xLabelY);
    }
  }
  ctx.textAlign = "right";
  for (let y = minY; y <= maxY; y += stepWorld) {
    if (Math.abs(y) < stepWorld * 0.01) continue;
    const sy = worldToScreen(0, y, vp, width, height).y;
    if (sy > 12 && sy < height - 12) {
      if (print && origin.x >= 0 && origin.x <= width) {
        ctx.beginPath();
        ctx.moveTo(origin.x - 3, sy);
        ctx.lineTo(origin.x + 3, sy);
        ctx.stroke();
      }
      // Display Cartesian y-up (-y)
      ctx.fillText(formatTick(-y), yLabelX, sy);
    }
  }
  ctx.restore();
}

function drawGeometryAngles(
  ctx: CanvasRenderingContext2D,
  nodes: NodeItem[],
  edges: EdgeItem[],
  screenPos: Map<string, { x: number; y: number }>,
  selectedNodeId: string | null,
  print: boolean,
  colors: ThemeColors,
): void {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }

  const targets = selectedNodeId
    ? nodes.filter((n) => n.id === selectedNodeId)
    : nodes.filter((n) => (adj.get(n.id)?.length ?? 0) === 2);

  ctx.save();
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const nd of targets) {
    const nbs = [...new Set(adj.get(nd.id) ?? [])];
    if (nbs.length < 2) continue;
    const p0 = screenPos.get(nd.id);
    const p1 = screenPos.get(nbs[0]);
    const p2 = screenPos.get(nbs[1]);
    if (!p0 || !p1 || !p2) continue;

    const a1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const a2 = Math.atan2(p2.y - p0.y, p2.x - p0.x);
    let diff = a2 - a1;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    const deg = Math.abs((diff * 180) / Math.PI);
    const arcR = 24;
    ctx.strokeStyle = print ? "#000000" : colors.primary;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, arcR, a1, a1 + diff, diff < 0);
    ctx.stroke();

    const midA = a1 + diff / 2;
    const lx = p0.x + Math.cos(midA) * (arcR + 15);
    const ly = p0.y + Math.sin(midA) * (arcR + 15);
    ctx.fillStyle = print ? "#000000" : colors.primary;
    ctx.fillText(`${deg.toFixed(1)}°`, lx, ly);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Hit Testing
// ---------------------------------------------------------------------------

export function hitTestNode(
  sx: number,
  sy: number,
  nodes: NodeItem[],
  vp: Viewport,
  width: number,
  height: number,
  appearance: AppearanceSettings,
  mode: GraphMode,
): NodeItem | null {
  const r = getVisualNodeRadius(appearance, mode, vp.scale) + 5;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const p = worldToScreen(nodes[i].x, nodes[i].y, vp, width, height);
    if (Math.hypot(p.x - sx, p.y - sy) <= r) return nodes[i];
  }
  return null;
}

export function hitTestEdge(
  sx: number,
  sy: number,
  nodes: NodeItem[],
  edges: EdgeItem[],
  directed: boolean,
  vp: Viewport,
  width: number,
  height: number,
  appearance: AppearanceSettings,
  mode: GraphMode,
): EdgeItem | null {
  const geoms = computeEdgeGeometries(nodes, edges, directed, viewportOr(vp), width, height, appearance, mode);
  const threshold = Math.max(8, appearance.edgeWidth + 6);
  let bestEdge: EdgeItem | null = null;
  let bestDist = threshold;

  for (const g of geoms) {
    const samples = 18;
    let prevX = g.sx;
    let prevY = g.sy;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      let px: number;
      let py: number;
      if (g.isLoop) {
        const mt = 1 - t;
        px = mt * mt * mt * g.sx + 3 * mt * mt * t * g.c1x + 3 * mt * t * t * g.c2x + t * t * t * g.tx;
        py = mt * mt * mt * g.sy + 3 * mt * mt * t * g.c1y + 3 * mt * t * t * g.c2y + t * t * t * g.ty;
      } else {
        const mt = 1 - t;
        px = mt * mt * g.sx + 2 * mt * t * g.cx + t * t * g.tx;
        py = mt * mt * g.sy + 2 * mt * t * g.cy + t * t * g.ty;
      }
      const d = pointToSegmentDist(sx, sy, prevX, prevY, px, py);
      if (d < bestDist) {
        bestDist = d;
        bestEdge = g.edge;
      }
      prevX = px;
      prevY = py;
    }
  }
  return bestEdge;
}

function viewportOr(vp: Viewport): Viewport {
  return vp;
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---------------------------------------------------------------------------
// Tight-Cropped Publication Export (PNG 3x & SVG)
// ---------------------------------------------------------------------------

function computeTightExportFrame(
  state: RenderContextState,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number; viewport: Viewport } {
  const { nodes, edges, directed, viewport, appearance, mode } = state;
  if (nodes.length === 0) {
    return { width: 400, height: 280, viewport };
  }

  const r = getVisualNodeRadius(appearance, mode, viewport.scale);
  const geoms = computeEdgeGeometries(
    nodes,
    edges,
    directed,
    viewport,
    canvasWidth,
    canvasHeight,
    appearance,
    mode,
  );

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const nd of nodes) {
    const p = worldToScreen(nd.x, nd.y, viewport, canvasWidth, canvasHeight);
    const extraBottom = nd.note ? 20 : 0;
    minX = Math.min(minX, p.x - r - 8);
    maxX = Math.max(maxX, p.x + r + 8);
    minY = Math.min(minY, p.y - r - 8);
    maxY = Math.max(maxY, p.y + r + 8 + extraBottom);
  }
  for (const g of geoms) {
    minX = Math.min(minX, g.labelX - 18, g.cx - 8);
    maxX = Math.max(maxX, g.labelX + 18, g.cx + 8);
    minY = Math.min(minY, g.labelY - 14, g.cy - 8);
    maxY = Math.max(maxY, g.labelY + 14, g.cy + 8);
  }

  const pad = 28;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;

  const outW = Math.max(180, Math.ceil(maxX - minX));
  const outH = Math.max(140, Math.ceil(maxY - minY));
  const centerScreenX = (minX + maxX) / 2;
  const centerScreenY = (minY + maxY) / 2;
  const centerWorld = screenToWorld(centerScreenX, centerScreenY, viewport, canvasWidth, canvasHeight);

  return {
    width: outW,
    height: outH,
    viewport: { x: centerWorld.x, y: centerWorld.y, scale: viewport.scale },
  };
}

export function renderExportPngDataUrl(
  state: RenderContextState,
  canvasWidth: number,
  canvasHeight: number,
  scale = 3,
): string {
  const frame = computeTightExportFrame(state, canvasWidth, canvasHeight);
  const offscreen = document.createElement("canvas");
  offscreen.width = frame.width * scale;
  offscreen.height = frame.height * scale;
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("无法创建 2D 渲染上下文");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawScene(ctx, frame.width, frame.height, {
    ...state,
    viewport: frame.viewport,
    exportMode: true,
  });
  return offscreen.toDataURL("image/png");
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildExportSvg(
  state: RenderContextState,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const frame = computeTightExportFrame(state, canvasWidth, canvasHeight);
  const w = frame.width;
  const h = frame.height;
  const vp = frame.viewport;
  const { nodes, edges, directed, mode, appearance, colors, algoResult, geoResult } = state;
  const print = appearance.printStyle;
  const r = getVisualNodeRadius(appearance, mode, vp.scale);

  const geoms = computeEdgeGeometries(nodes, edges, directed, vp, w, h, appearance, mode);
  const screenPos = new Map(nodes.map((n) => [n.id, worldToScreen(n.x, n.y, vp, w, h)]));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  if (!appearance.transparentBg) {
    parts.push(`<rect width="100%" height="100%" fill="${print ? "#ffffff" : escapeXml(colors.card)}"/>`);
  }

  // Convex hull
  if (mode === "geometry" && geoResult?.hullIds && geoResult.hullIds.length >= 3) {
    const pts = geoResult.hullIds
      .map((id) => screenPos.get(id))
      .filter((p): p is { x: number; y: number } => Boolean(p))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    parts.push(
      `<polygon points="${pts}" fill="${print ? "rgba(0,0,0,0.05)" : "rgba(11,105,137,0.10)"}" stroke="${print ? "#000000" : escapeXml(colors.primary)}" stroke-width="2" stroke-dasharray="6 4"/>`,
    );
  }

  // Edges
  const svgSerif = "'Latin Modern Roman', 'CMU Serif', Georgia, 'Times New Roman', serif";
  for (const g of geoms) {
    const isHi = Boolean(algoResult?.highlightEdges?.has(g.edge.id));
    const isDim = Boolean(algoResult?.dimOtherEdges && !isHi);
    const strokeCol = print ? "#000000" : isHi ? colors.accentHighlight : colors.secondaryFg;
    const baseLw = print ? Math.min(1.25, appearance.edgeWidth * 0.68) : appearance.edgeWidth;
    const lw = baseLw + (isHi ? (print ? 0.95 : 1.2) : 0);
    const opAttr = isDim ? ' opacity="0.32"' : "";

    const dPath = g.isLoop
      ? `M ${g.sx.toFixed(1)} ${g.sy.toFixed(1)} C ${g.c1x.toFixed(1)} ${g.c1y.toFixed(1)}, ${g.c2x.toFixed(1)} ${g.c2y.toFixed(1)}, ${g.tx.toFixed(1)} ${g.ty.toFixed(1)}`
      : `M ${g.sx.toFixed(1)} ${g.sy.toFixed(1)} Q ${g.cx.toFixed(1)} ${g.cy.toFixed(1)}, ${g.tx.toFixed(1)} ${g.ty.toFixed(1)}`;
    parts.push(
      `<path d="${dPath}" fill="none" stroke="${escapeXml(strokeCol)}" stroke-width="${lw.toFixed(2)}" stroke-linecap="round"${opAttr}/>`,
    );

    if (directed) {
      const headLen = print ? Math.max(8.5, 7.5 + lw * 1.3) : Math.max(8, 7 + lw * 1.4);
      if (print) {
        parts.push(
          `<polygon points="${stealthArrowSvgPoints(g.tx, g.ty, g.endAngle, headLen)}" fill="${escapeXml(strokeCol)}"${opAttr}/>`,
        );
      } else {
        const ax = g.tx - headLen * Math.cos(g.endAngle - Math.PI / 6.5);
        const ay = g.ty - headLen * Math.sin(g.endAngle - Math.PI / 6.5);
        const bx = g.tx - headLen * Math.cos(g.endAngle + Math.PI / 6.5);
        const by = g.ty - headLen * Math.sin(g.endAngle + Math.PI / 6.5);
        parts.push(
          `<polygon points="${g.tx.toFixed(1)},${g.ty.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="${escapeXml(strokeCol)}"${opAttr}/>`,
        );
      }
    }

    let edgeLabel: string | null = null;
    if (appearance.showWeights && g.edge.weight) {
      edgeLabel = g.edge.weight;
    } else if (mode === "geometry" && geoResult?.showMeasurements && !g.isLoop) {
      const u = byId.get(g.edge.from);
      const v = byId.get(g.edge.to);
      if (u && v) {
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        edgeLabel = Number.isInteger(d) ? String(d) : d.toFixed(2);
      }
    }

    if (edgeLabel) {
      const fs = Math.max(10, appearance.fontSize - 1);
      const italicAttr = print && isMathItalic(edgeLabel) ? ' font-style="italic"' : "";
      const fam = print ? svgSerif : "monospace";
      parts.push(
        `<text x="${g.labelX.toFixed(1)}" y="${(g.labelY + 3.5).toFixed(1)}" text-anchor="middle" font-family="${fam}" font-size="${fs}"${italicAttr} fill="${print ? "#000000" : escapeXml(colors.fg)}"${opAttr}>${escapeXml(edgeLabel)}</text>`,
      );
    }
  }

  // Nodes
  const fontFam = print ? svgSerif : "monospace";
  for (const nd of nodes) {
    const p = screenPos.get(nd.id);
    if (!p) continue;
    const isHi = Boolean(algoResult?.highlightNodes?.has(nd.id));
    const nc = resolveNodeColors(nd, { ...state, exportMode: true }, isHi, false);
    const lw = print ? (isHi ? 1.5 : 1.15) : isHi ? 2.4 : 1.8;
    if (print && isHi) {
      parts.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r + 2.8).toFixed(1)}" fill="none" stroke="#000000" stroke-width="1"/>`,
      );
    }
    parts.push(
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${escapeXml(nc.fill)}" stroke="${escapeXml(nc.stroke)}" stroke-width="${lw}"/>`,
    );
    const labelStr = String(nd.label || nd.id);
    const italicAttr = print && isMathItalic(labelStr) ? ' font-style="italic"' : "";
    const fw = print ? "500" : "600";
    const fs = print ? appearance.fontSize + 1 : appearance.fontSize;
    parts.push(
      `<text x="${p.x.toFixed(1)}" y="${(p.y + fs * 0.34).toFixed(1)}" text-anchor="middle" font-family="${fontFam}" font-size="${fs}" font-weight="${fw}"${italicAttr} fill="${escapeXml(nc.text)}">${escapeXml(labelStr)}</text>`,
    );
    if (nd.note) {
      parts.push(
        `<text x="${p.x.toFixed(1)}" y="${(p.y + r + 14).toFixed(1)}" text-anchor="middle" font-family="${fontFam}" font-size="${Math.max(10, appearance.fontSize - 1)}" fill="${print ? "#000000" : escapeXml(colors.secondaryFg)}">${escapeXml(nd.note)}</text>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}
