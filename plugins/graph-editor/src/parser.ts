import type {
  EdgeItem,
  GraphFormat,
  HeaderNmMode,
  NodeItem,
  RawNodeItem,
} from "./types";

export interface ParseResult {
  nodes: RawNodeItem[];
  edges: EdgeItem[];
  detectedHeaderNm: boolean;
  usedHeaderNm: boolean;
  detectedLeetCode: boolean;
}

let edgeSeq = 1;
export function nextEdgeId(): string {
  return `e_${edgeSeq++}`;
}

function parseLeetCodeEdges(text: string): Array<[string, string, string | null]> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    const out: Array<[string, string, string | null]> = [];
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2) return null;
      const u = String(item[0]);
      const v = String(item[1]);
      const w = item.length >= 3 && item[2] != null ? String(item[2]) : null;
      out.push([u, v, w]);
    }
    return out;
  } catch {
    return null;
  }
}

function isNonNegInt(tok: string): boolean {
  return /^\d+$/.test(tok);
}

export function parseGraphText(
  format: GraphFormat,
  text: string,
  opts: {
    oneIndexed: boolean;
    directed: boolean;
    multiedge: boolean;
    headerNmMode: HeaderNmMode;
    prevNodes?: Map<string, NodeItem>;
  },
): ParseResult {
  const { oneIndexed, directed, multiedge, headerNmMode, prevNodes } = opts;
  const startIdx = oneIndexed ? 1 : 0;

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  const nodeMap = new Map<string, RawNodeItem>();
  const rawEdges: EdgeItem[] = [];
  let detectedHeaderNm = false;
  let usedHeaderNm = false;
  let detectedLeetCode = false;

  function ensure(id: string, extra?: { x?: number; y?: number; color?: string | null; label?: string }) {
    const k = String(id);
    if (!nodeMap.has(k)) {
      const old = prevNodes?.get(k);
      nodeMap.set(k, {
        id: k,
        label: extra?.label ?? old?.label ?? k,
        note: old?.note ?? "",
        x: extra?.x ?? old?.x ?? null,
        y: extra?.y ?? old?.y ?? null,
        color: extra?.color ?? old?.color ?? null,
        pinned: old?.pinned ?? false,
      });
    } else if (extra) {
      const cur = nodeMap.get(k)!;
      if (extra.x != null) cur.x = extra.x;
      if (extra.y != null) cur.y = extra.y;
      if (extra.label != null) cur.label = extra.label;
    }
  }

  function pushEdge(from: string, to: string, weight: string | null) {
    if (!multiedge) {
      const dup = rawEdges.some((e) =>
        directed
          ? e.from === from && e.to === to
          : (e.from === from && e.to === to) || (e.from === to && e.to === from),
      );
      if (dup) return;
    }
    rawEdges.push({ id: nextEdgeId(), from, to, weight });
  }

  if (format === "parent_array") {
    // Support either 1-line parent array or 2-line parent+child arrays
    const cleanedLines = lines.map((l) => l.replace(/^[pc]\s*[:=]\s*/i, "").replace(/[\[\]]/g, ""));
    const tokenizedLines = cleanedLines
      .map((l) => l.split(/[\s,]+/).filter(Boolean))
      .filter((arr) => arr.length > 0);

    if (
      tokenizedLines.length === 2 &&
      tokenizedLines[0].length === tokenizedLines[1].length &&
      tokenizedLines[0].length >= 1
    ) {
      const parents = tokenizedLines[0];
      const children = tokenizedLines[1];
      for (let i = 0; i < parents.length; i++) {
        const p = parents[i];
        const c = children[i];
        ensure(c);
        if (p !== "_" && p !== "-" && p !== "-1" && !(oneIndexed && p === "0")) {
          ensure(p);
          pushEdge(p, c, null);
        }
      }
    } else {
      const toks = tokenizedLines.flat();
      if (toks.length > 0) {
        const firstNum = Number(toks[0]);
        const hasRoot =
          toks[0] === "_" ||
          toks[0] === "-" ||
          firstNum === 0 ||
          firstNum === -1 ||
          (!oneIndexed && firstNum < 0);
        if (hasRoot) {
          for (let i = 0; i < toks.length; i++) {
            const u = String(startIdx + i);
            ensure(u);
            const p = toks[i];
            if (p !== "_" && p !== "-" && Number(p) >= startIdx) {
              ensure(p);
              pushEdge(p, u, null);
            }
          }
        } else {
          ensure(String(startIdx));
          for (let i = 0; i < toks.length; i++) {
            const u = String(startIdx + i + 1);
            const p = toks[i];
            ensure(p);
            ensure(u);
            pushEdge(p, u, null);
          }
        }
      }
    }
  } else if (format === "adj_list") {
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon >= 0) {
        const u = line.slice(0, colon).trim();
        if (!u) continue;
        ensure(u);
        const rhs = line.slice(colon + 1).trim();
        if (!rhs) continue;
        for (const item of rhs.split(/[\s,]+/).filter(Boolean)) {
          const m = item.match(/^([^()]+)(?:\(([^)]+)\))?$/);
          if (m) {
            ensure(m[1]);
            pushEdge(u, m[1], m[2] || null);
          }
        }
      } else {
        const parts = line.split(/[\s,]+/).filter(Boolean);
        if (parts.length >= 1) {
          const u = parts[0];
          ensure(u);
          for (let i = 1; i < parts.length; i++) {
            const m = parts[i].match(/^([^()]+)(?:\(([^)]+)\))?$/);
            if (m) {
              ensure(m[1]);
              pushEdge(u, m[1], m[2] || null);
            }
          }
        }
      }
    }
  } else if (format === "coords") {
    let autoId = startIdx;
    for (const line of lines) {
      const p = line.split(/[\s,]+/).filter(Boolean);
      const head = p[0]?.toLowerCase();
      if (head === "e" || head === "edge" || head === "seg") {
        if (p.length >= 3) {
          ensure(p[1]);
          ensure(p[2]);
          pushEdge(p[1], p[2], p[3] || null);
        }
      } else if (head === "poly" || head === "polygon") {
        const verts = p.slice(1);
        for (const v of verts) ensure(v);
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i];
          const b = verts[(i + 1) % verts.length];
          if (a !== b) pushEdge(a, b, null);
        }
      } else if (p.length >= 3 && Number.isFinite(Number(p[1])) && Number.isFinite(Number(p[2]))) {
        ensure(p[0], { x: Number(p[1]), y: Number(p[2]) });
      } else if (p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
        ensure(String(autoId++), { x: Number(p[0]), y: Number(p[1]) });
      }
    }
  } else {
    // Edge list — also auto-detects LeetCode `[[u,v],...]` and CF/AtCoder `n m` header
    const lc = parseLeetCodeEdges(text);
    if (lc) {
      detectedLeetCode = true;
      for (const [u, v, w] of lc) {
        ensure(u);
        ensure(v);
        pushEdge(u, v, w);
      }
    } else {
      let startLine = 0;
      if (lines.length >= 1) {
        const firstParts = lines[0].split(/[\s,]+/).filter(Boolean);
        if (
          firstParts.length === 2 &&
          isNonNegInt(firstParts[0]) &&
          isNonNegInt(firstParts[1])
        ) {
          const n = Number(firstParts[0]);
          const m = Number(firstParts[1]);
          if (n >= 1 && n <= 300 && m === lines.length - 1) {
            detectedHeaderNm = true;
          }
        }
      }

      if (
        (headerNmMode === "auto" && detectedHeaderNm) ||
        (headerNmMode === "force_on" && lines.length >= 1)
      ) {
        const firstParts = lines[0].split(/[\s,]+/).filter(Boolean);
        const n = Number(firstParts[0]);
        if (Number.isInteger(n) && n >= 1 && n <= 300) {
          usedHeaderNm = true;
          startLine = 1;
          for (let i = 0; i < n; i++) {
            ensure(String(startIdx + i));
          }
        }
      }

      for (let i = startLine; i < lines.length; i++) {
        const p = lines[i].split(/[\s,]+/).filter(Boolean);
        if (p.length === 1) {
          ensure(p[0]);
        } else if (p.length >= 2) {
          ensure(p[0]);
          ensure(p[1]);
          pushEdge(p[0], p[1], p[2] || null);
        }
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: rawEdges,
    detectedHeaderNm,
    usedHeaderNm,
    detectedLeetCode,
  };
}

export function applyNodeLabelsText(
  nodes: NodeItem[],
  labelsText: string,
  oneIndexed: boolean,
): void {
  const raw = labelsText.trim();
  for (const nd of nodes) nd.note = "";
  if (!raw) return;

  const cleaned = raw.replace(/^\[|\]$/g, "");
  const tokens = cleaned.split(/[\s,]+/).filter(Boolean);
  const startIdx = oneIndexed ? 1 : 0;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Check if tokens are key:val pairs
  const isKv = tokens.some((t) => t.includes(":") || t.includes("="));
  if (isKv) {
    for (const tok of tokens) {
      const sep = tok.indexOf(":") >= 0 ? ":" : "=";
      const idx = tok.indexOf(sep);
      if (idx > 0) {
        const id = tok.slice(0, idx).trim();
        const val = tok.slice(idx + 1).trim();
        const nd = byId.get(id);
        if (nd && val !== "_") nd.note = val;
      }
    }
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const val = tokens[i];
    if (val === "_") continue;
    const targetId = String(startIdx + i);
    const nd = byId.get(targetId) ?? nodes[i];
    if (nd) nd.note = val;
  }
}

export function serializeGraphToText(
  nodes: NodeItem[],
  edges: EdgeItem[],
  format: GraphFormat,
): { format: GraphFormat; text: string } {
  let outFormat = format;
  if (outFormat === "parent_array") {
    outFormat = "edge_list";
  }
  const lines: string[] = [];
  if (outFormat === "coords") {
    for (const nd of nodes) {
      // Geometry world uses standard Cartesian y-up stored in world coords as -y in canvas
      const gx = Math.round(nd.x * 100) / 100;
      const gy = Math.round(-nd.y * 100) / 100;
      lines.push(`${nd.id} ${gx} ${gy}`);
    }
    for (const e of edges) {
      lines.push(`edge ${e.from} ${e.to}${e.weight ? ` ${e.weight}` : ""}`);
    }
  } else if (outFormat === "adj_list") {
    const adj = new Map<string, string[]>();
    for (const nd of nodes) adj.set(nd.id, []);
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.weight ? `${e.to}(${e.weight})` : e.to);
    }
    for (const [u, vs] of adj.entries()) {
      lines.push(vs.length > 0 ? `${u}: ${vs.join(" ")}` : `${u}:`);
    }
  } else {
    const touched = new Set<string>();
    for (const e of edges) {
      touched.add(e.from);
      touched.add(e.to);
      lines.push(`${e.from} ${e.to}${e.weight ? ` ${e.weight}` : ""}`);
    }
    for (const nd of nodes) {
      if (!touched.has(nd.id)) lines.push(nd.id);
    }
  }
  return { format: outFormat, text: lines.join("\n") };
}
