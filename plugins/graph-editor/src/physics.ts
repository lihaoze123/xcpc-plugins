import { computeBipartite } from "./algos";
import type { EdgeItem, GraphMode, NodeItem, RawNodeItem } from "./types";

export interface LayoutResult {
  nodes: NodeItem[];
}

export function placeInitialNodes(
  rawNodes: RawNodeItem[],
  edges: EdgeItem[],
  mode: GraphMode,
  rootId: string | null,
): NodeItem[] {
  const n = rawNodes.length;
  if (n === 0) return [];

  if (mode === "geometry") {
    return rawNodes.map((nd, i) => {
      if (nd.x != null && nd.y != null && Number.isFinite(nd.x) && Number.isFinite(nd.y)) {
        // Store Cartesian y-up as canvas y-down (-y)
        return {
          id: nd.id,
          label: nd.label,
          note: nd.note,
          x: nd.x,
          y: -nd.y,
          vx: 0,
          vy: 0,
          color: nd.color,
          pinned: true,
        };
      }
      const a = (2 * Math.PI * i) / Math.max(1, n);
      return {
        id: nd.id,
        label: nd.label,
        note: nd.note,
        x: Math.round(Math.cos(a) * 4 * 10) / 10,
        y: -Math.round(Math.sin(a) * 4 * 10) / 10,
        vx: 0,
        vy: 0,
        color: nd.color,
        pinned: true,
      };
    });
  }

  const list: NodeItem[] = rawNodes.map((nd, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
    const r = Math.max(70, Math.min(200, n * 18));
    return {
      id: nd.id,
      label: nd.label,
      note: nd.note,
      x: nd.x != null && Number.isFinite(nd.x) ? nd.x : Math.cos(a) * r,
      y: nd.y != null && Number.isFinite(nd.y) ? nd.y : Math.sin(a) * r,
      vx: 0,
      vy: 0,
      color: nd.color,
      pinned: nd.pinned,
    };
  });

  if (mode === "tree") {
    applyTreeLayout(list, edges, rootId);
    return list;
  }
  if (mode === "bipartite") {
    applyBipartiteLayout(list, edges);
    return list;
  }

  // For normal mode, if all nodes lacked positions, run quick warm-up steps
  const allNew = rawNodes.every((nd) => nd.x == null || nd.y == null);
  if (allNew && n > 1) {
    for (let i = 0; i < 90; i++) {
      stepPhysics(list, edges, null, 1);
    }
    for (const nd of list) {
      nd.vx = 0;
      nd.vy = 0;
    }
  } else {
    // Place newly added nodes cleanly near their neighbors
    const existingIds = new Set(
      rawNodes.filter((nd) => nd.x != null && nd.y != null).map((nd) => nd.id),
    );
    if (existingIds.size > 0 && existingIds.size < rawNodes.length) {
      const byId = new Map(list.map((nd) => [nd.id, nd]));
      const adj = new Map<string, string[]>();
      for (const nd of list) adj.set(nd.id, []);
      for (const e of edges) {
        adj.get(e.from)?.push(e.to);
        adj.get(e.to)?.push(e.from);
      }
      for (const nd of list) {
        if (existingIds.has(nd.id)) continue;
        const nbs = (adj.get(nd.id) ?? [])
          .filter((id) => existingIds.has(id))
          .map((id) => byId.get(id)!);
        if (nbs.length > 0) {
          const cx = nbs.reduce((s, p) => s + p.x, 0) / nbs.length;
          const cy = nbs.reduce((s, p) => s + p.y, 0) / nbs.length;
          const ang = Math.random() * Math.PI * 2;
          nd.x = cx + Math.cos(ang) * 95;
          nd.y = cy + Math.sin(ang) * 95;
        }
        existingIds.add(nd.id);
      }
    }
  }

  return list;
}

export function applyTreeLayout(
  nodes: NodeItem[],
  edges: EdgeItem[],
  rootId: string | null,
): void {
  if (nodes.length === 0) return;
  const adj = new Map<string, string[]>();
  for (const nd of nodes) adj.set(nd.id, []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }

  const orderedRoots: string[] = [];
  if (rootId && adj.has(rootId)) orderedRoots.push(rootId);
  for (const nd of nodes) {
    if (nd.id !== rootId) orderedRoots.push(nd.id);
  }

  const visited = new Set<string>();
  const childrenMap = new Map<string, string[]>();
  const trees: string[] = [];

  for (const r of orderedRoots) {
    if (visited.has(r)) continue;
    trees.push(r);
    const q = [r];
    visited.add(r);
    while (q.length > 0) {
      const u = q.shift()!;
      const ch: string[] = [];
      for (const v of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          ch.push(v);
          q.push(v);
        }
      }
      childrenMap.set(u, ch);
    }
  }

  // Compute subtree leaf widths for balanced spacing
  const widthMap = new Map<string, number>();
  function calcWidth(u: string): number {
    const ch = childrenMap.get(u) ?? [];
    if (ch.length === 0) {
      widthMap.set(u, 1);
      return 1;
    }
    let w = 0;
    for (const v of ch) w += calcWidth(v);
    widthMap.set(u, w);
    return w;
  }

  const xGap = 84;
  const yGap = 86;
  const pos = new Map<string, { x: number; y: number }>();

  let offsetX = 0;
  for (const root of trees) {
    const totalW = calcWidth(root);
    function assign(u: string, left: number, depth: number) {
      const w = widthMap.get(u) ?? 1;
      pos.set(u, { x: (left + w / 2) * xGap, y: depth * yGap });
      let cur = left;
      for (const v of childrenMap.get(u) ?? []) {
        const vw = widthMap.get(v) ?? 1;
        assign(v, cur, depth + 1);
        cur += vw;
      }
    }
    assign(root, offsetX, 0);
    offsetX += totalW + 1.2;
  }

  // Center around (0, 0)
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  for (const nd of nodes) {
    const p = pos.get(nd.id);
    if (p) {
      nd.x = p.x - cx;
      nd.y = p.y - cy;
      nd.vx = 0;
      nd.vy = 0;
    }
  }
}

export function applyBipartiteLayout(nodes: NodeItem[], edges: EdgeItem[]): void {
  if (nodes.length === 0) return;
  const res = computeBipartite(nodes, edges);
  const left: NodeItem[] = [];
  const right: NodeItem[] = [];

  if (res.nodeGroup) {
    for (const nd of nodes) {
      if ((res.nodeGroup.get(nd.id) ?? 0) === 0) left.push(nd);
      else right.push(nd);
    }
  } else {
    // Fallback split if not bipartite
    nodes.forEach((nd, i) => {
      if (i % 2 === 0) left.push(nd);
      else right.push(nd);
    });
  }

  const colX = 130;
  const rowGap = 72;
  left.forEach((nd, i) => {
    nd.x = -colX;
    nd.y = (i - (left.length - 1) / 2) * rowGap;
    nd.vx = 0;
    nd.vy = 0;
  });
  right.forEach((nd, i) => {
    nd.x = colX;
    nd.y = (i - (right.length - 1) / 2) * rowGap;
    nd.vx = 0;
    nd.vy = 0;
  });
}

export function applyCircleLayout(nodes: NodeItem[]): void {
  const n = nodes.length;
  if (n === 0) return;
  const r = Math.max(85, (n * 54) / (2 * Math.PI));
  nodes.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    nd.x = Math.cos(a) * r;
    nd.y = Math.sin(a) * r;
    nd.vx = 0;
    nd.vy = 0;
  });
}

/**
 * Single real-time spring-force physics step.
 * Returns the maximum speed across all movable nodes so the caller can sleep when settled.
 */
export function stepPhysics(
  nodes: NodeItem[],
  edges: EdgeItem[],
  draggingId: string | null,
  dtScale = 1,
): number {
  const n = nodes.length;
  if (n <= 1) return 0;

  const idealLen = 115;
  const repulsion = 7800;
  const springK = 0.045;
  const gravity = 0.008;
  const damping = 0.82;
  const maxStep = 22;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const idxMap = new Map<string, number>();
  for (let i = 0; i < n; i++) idxMap.set(nodes[i].id, i);

  // Pairwise Coulomb repulsion
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dx = nodes[i].x - nodes[j].x;
      let dy = nodes[i].y - nodes[j].y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) {
        dx = (Math.random() - 0.5) * 2;
        dy = (Math.random() - 0.5) * 2;
        distSq = dx * dx + dy * dy || 1;
      }
      const dist = Math.sqrt(distSq);
      const force = repulsion / distSq;
      const ux = (dx / dist) * force;
      const uy = (dy / dist) * force;
      fx[i] += ux;
      fy[i] += uy;
      fx[j] -= ux;
      fy[j] -= uy;
    }
  }

  // Deduplicate edge pairs for spring calculation so multiedges don't collapse nodes together
  const seenPairs = new Set<string>();
  for (const e of edges) {
    const u = idxMap.get(e.from);
    const v = idxMap.get(e.to);
    if (u == null || v == null || u === v) continue;
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    const dx = nodes[v].x - nodes[u].x;
    const dy = nodes[v].y - nodes[u].y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const force = (dist - idealLen) * springK;
    const ux = (dx / dist) * force;
    const uy = (dy / dist) * force;
    fx[u] += ux;
    fy[u] += uy;
    fx[v] -= ux;
    fy[v] -= uy;
  }

  // Gentle centering gravity
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += nodes[i].x;
    meanY += nodes[i].y;
  }
  meanX /= n;
  meanY /= n;

  let maxSpeed = 0;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (nd.id === draggingId || nd.pinned) {
      nd.vx = 0;
      nd.vy = 0;
      continue;
    }
    fx[i] -= (nd.x - meanX) * gravity;
    fy[i] -= (nd.y - meanY) * gravity;

    nd.vx = (nd.vx + fx[i] * dtScale) * damping;
    nd.vy = (nd.vy + fy[i] * dtScale) * damping;

    const speed = Math.hypot(nd.vx, nd.vy);
    if (speed > maxStep) {
      nd.vx = (nd.vx / speed) * maxStep;
      nd.vy = (nd.vy / speed) * maxStep;
    }
    nd.x += nd.vx;
    nd.y += nd.vy;
    if (speed > maxSpeed) maxSpeed = speed;
  }

  return maxSpeed;
}
