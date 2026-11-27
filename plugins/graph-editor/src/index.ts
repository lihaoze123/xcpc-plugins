import type {
  GraphEdge,
  GraphNode,
  PluginCommandAction,
  ToolExecutionResult,
} from "@xcpc-workstation/plugin-sdk/host";
import { parseGraphText } from "./parser";
import {
  applyBipartiteLayout,
  applyCircleLayout,
  applyTreeLayout,
  placeInitialNodes,
} from "./physics";
import type { GraphFormat, GraphMode, NodeItem } from "./types";

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fitToBox(nodes: NodeItem[], width: number, height: number, pad = 48): void {
  if (nodes.length === 0) return;
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
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (const nd of nodes) {
    nd.x = width / 2 + (nd.x - cx) * (Number.isFinite(scale) ? scale : 1);
    nd.y = height / 2 + (nd.y - cy) * (Number.isFinite(scale) ? scale : 1);
  }
}

function renderHeadlessSvg(
  nodes: NodeItem[],
  edges: Array<{ id: string; from: string; to: string; weight: string | null }>,
  directed: boolean,
  width: number,
  height: number,
): string {
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const r = 18;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#ffffff" rx="8"/>',
  ];

  // Group multiedges & self-loops
  const pairGroups = new Map<string, typeof edges>();
  const loopGroups = new Map<string, typeof edges>();
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

  for (const e of edges) {
    const u = byId.get(e.from);
    const v = byId.get(e.to);
    if (!u || !v) continue;

    if (e.from === e.to) {
      const idx = (loopGroups.get(e.from) ?? [e]).indexOf(e);
      const base = -Math.PI / 2 + idx * 0.85;
      const a1 = base - 0.44;
      const a2 = base + 0.44;
      const reach = r * 2.55 + idx * 12;
      const sx = u.x + Math.cos(a1) * r;
      const sy = u.y + Math.sin(a1) * r;
      const tx = u.x + Math.cos(a2) * (directed ? r + 2 : r);
      const ty = u.y + Math.sin(a2) * (directed ? r + 2 : r);
      const c1x = u.x + Math.cos(a1 - 0.35) * reach;
      const c1y = u.y + Math.sin(a1 - 0.35) * reach;
      const c2x = u.x + Math.cos(a2 + 0.35) * reach;
      const c2y = u.y + Math.sin(a2 + 0.35) * reach;
      parts.push(
        `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="#475569" stroke-width="2"/>`,
      );
      if (e.weight) {
        const lx = 0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * tx;
        const ly = 0.125 * sy + 0.375 * c1y + 0.375 * c2y + 0.125 * ty;
        parts.push(
          `<text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="12" fill="#0f172a">${escapeXml(e.weight)}</text>`,
        );
      }
      continue;
    }

    const key = e.from < e.to ? `${e.from}\0${e.to}` : `${e.to}\0${e.from}`;
    const group = pairGroups.get(key) ?? [e];
    const idx = group.indexOf(e);
    const count = group.length;
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const canonSign = e.from < e.to ? 1 : -1;
    const nx = (-dy / dist) * canonSign;
    const ny = (dx / dist) * canonSign;
    const offset = count === 1 ? 0 : (idx - (count - 1) / 2) * 30;
    const cx = (u.x + v.x) / 2 + nx * offset;
    const cy = (u.y + v.y) / 2 + ny * offset;

    const sDist = Math.hypot(cx - u.x, cy - u.y) || 1;
    const sx = u.x + ((cx - u.x) / sDist) * r;
    const sy = u.y + ((cy - u.y) / sDist) * r;
    const tDist = Math.hypot(v.x - cx, v.y - cy) || 1;
    const trim = directed ? r + 3 : r;
    const tx = v.x - ((v.x - cx) / tDist) * trim;
    const ty = v.y - ((v.y - cy) / tDist) * trim;

    parts.push(
      `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="#475569" stroke-width="2"/>`,
    );
    if (directed) {
      const ang = Math.atan2(ty - cy, tx - cx);
      const hl = 9;
      const ax = tx - hl * Math.cos(ang - Math.PI / 6.5);
      const ay = ty - hl * Math.sin(ang - Math.PI / 6.5);
      const bx = tx - hl * Math.cos(ang + Math.PI / 6.5);
      const by = ty - hl * Math.sin(ang + Math.PI / 6.5);
      parts.push(
        `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="#475569"/>`,
      );
    }
    if (e.weight) {
      const lx = 0.25 * sx + 0.5 * cx + 0.25 * tx;
      const ly = 0.25 * sy + 0.5 * cy + 0.25 * ty;
      parts.push(
        `<text x="${lx.toFixed(1)}" y="${(ly - 6).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="12" fill="#0f172a">${escapeXml(e.weight)}</text>`,
      );
    }
  }

  for (const nd of nodes) {
    const fill = nd.color || "#eef2ff";
    parts.push(
      `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${r}" fill="${escapeXml(fill)}" stroke="#334155" stroke-width="2"/>`,
    );
    parts.push(
      `<text x="${nd.x.toFixed(1)}" y="${(nd.y + 4).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="600" fill="#0f172a">${escapeXml(nd.label || nd.id)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

export function runTool(
  toolId: string,
  inputs: Record<string, unknown>,
): ToolExecutionResult {
  if (toolId !== "parse-graph") {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  const format = String(inputs?.format ?? "edge_list") as GraphFormat;
  const text = String(inputs?.text ?? "");
  const oneIndexed = inputs?.one_indexed !== false;
  const directed = Boolean(inputs?.directed);
  const layout = String(inputs?.layout ?? (format === "coords" ? "coords" : "force"));
  const width = 640;
  const height = 420;

  const parsed = parseGraphText(format, text, {
    oneIndexed,
    directed,
    multiedge: true,
    headerNmMode: "auto",
  });

  const mode: GraphMode =
    layout === "tree"
      ? "tree"
      : layout === "bipartite"
        ? "bipartite"
        : layout === "coords"
          ? "geometry"
          : "normal";

  const placed = placeInitialNodes(parsed.nodes, parsed.edges, mode, null);
  if (layout === "circle") {
    applyCircleLayout(placed);
  } else if (layout === "tree") {
    applyTreeLayout(placed, parsed.edges, null);
  } else if (layout === "bipartite") {
    applyBipartiteLayout(placed, parsed.edges);
  }
  fitToBox(placed, width, height);

  const svg = renderHeadlessSvg(placed, parsed.edges, directed, width, height);
  const weighted = Boolean(inputs?.weighted) || parsed.edges.some((e) => e.weight != null);
  const outNodes: GraphNode[] = placed.map((n) => ({
    id: n.id,
    label: n.label,
    x: n.x,
    y: n.y,
    color: n.color ?? undefined,
  }));
  const outEdges: GraphEdge[] = parsed.edges.map((e) => ({
    from: e.from,
    to: e.to,
    weight: e.weight ?? undefined,
    label: e.weight ?? undefined,
    directed,
  }));

  const layoutLabel =
    layout === "tree"
      ? "树"
      : layout === "bipartite"
        ? "二分图"
        : layout === "circle"
          ? "圆形"
          : layout === "coords"
            ? "按坐标"
            : "力导向";

  return {
    summary: `已解析 ${outNodes.length} 个节点、${outEdges.length} 条边（${directed ? "有向" : "无向"}，${layoutLabel}）`,
    blocks: [
      {
        type: "graph",
        title: "图结构",
        directed,
        weighted,
        one_indexed: oneIndexed,
        nodes: outNodes,
        edges: outEdges,
        layout,
      },
      {
        type: "svg",
        title: "矢量预览",
        svg,
        width,
        height,
      },
    ],
  };
}

export function runCommand(commandId: string): PluginCommandAction {
  if (commandId === "open") {
    return { type: "open_tool", plugin_id: "graph-editor" };
  }
  return { type: "none" };
}
