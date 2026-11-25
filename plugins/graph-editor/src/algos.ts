import type { AlgoId, EdgeItem, GeoAlgoId, NodeItem } from "./types";

export interface AlgoResult {
  summary: string;
  warning?: string;
  /** Optional node -> color index (0..7) for components / bipartite */
  nodeGroup?: Map<string, number>;
  /** Highlighted node IDs (cut vertices, centroids, odd cycle, path) */
  highlightNodes?: Set<string>;
  /** Highlighted edge IDs (bridges, MST, diameter, odd cycle, path) */
  highlightEdges?: Set<string>;
  /** Dim non-highlighted edges for visual clarity */
  dimOtherEdges?: boolean;
  /** Node badges shown as tiny pill tags (e.g. "C" centroid, "S"/"T" path, "割") */
  nodeBadges?: Map<string, string>;
}

export interface GeoResult {
  summary: string;
  hullIds?: string[];
  hullPerimeter?: number;
  hullArea?: number;
  showMeasurements?: boolean;
}

export function computeGraphAlgo(
  algo: AlgoId,
  nodes: NodeItem[],
  edges: EdgeItem[],
  opts: { directed: boolean; pathStart: string | null; pathEnd: string | null },
): AlgoResult | null {
  if (algo === "none" || nodes.length === 0) return null;

  const { directed, pathStart, pathEnd } = opts;

  if (algo === "components") {
    return directed ? computeTarjanSCC(nodes, edges) : computeUndirectedCC(nodes, edges);
  }
  if (algo === "bridges") {
    if (directed) {
      return { summary: "桥与割点仅适用于无向图", warning: "请切换为无向图以查看桥与割点" };
    }
    return computeBridgesAndCuts(nodes, edges);
  }
  if (algo === "mst") {
    return computeMST(nodes, edges);
  }
  if (algo === "bipartite") {
    return computeBipartite(nodes, edges);
  }
  if (algo === "tree_props") {
    return computeTreeProps(nodes, edges);
  }
  if (algo === "shortest_path") {
    return computeShortestPath(nodes, edges, directed, pathStart, pathEnd);
  }
  return null;
}

function computeUndirectedCC(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const group = new Map<string, number>();
  let comp = 0;
  for (const n of nodes) {
    if (group.has(n.id)) continue;
    const q = [n.id];
    group.set(n.id, comp);
    while (q.length > 0) {
      const u = q.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (!group.has(v)) {
          group.set(v, comp);
          q.push(v);
        }
      }
    }
    comp++;
  }
  return {
    summary: `共 ${comp} 个连通分量`,
    nodeGroup: group,
  };
}

function computeTarjanSCC(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const group = new Map<string, number>();
  let curIdx = 0;
  let sccCount = 0;

  function dfs(u: string) {
    index.set(u, curIdx);
    low.set(u, curIdx);
    curIdx++;
    stack.push(u);
    onStack.add(u);

    for (const v of adj.get(u) ?? []) {
      if (!index.has(v)) {
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
      } else if (onStack.has(v)) {
        low.set(u, Math.min(low.get(u)!, index.get(v)!));
      }
    }

    if (low.get(u) === index.get(u)) {
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        group.set(w, sccCount);
        if (w === u) break;
      }
      sccCount++;
    }
  }

  for (const n of nodes) {
    if (!index.has(n.id)) dfs(n.id);
  }

  return {
    summary: `共 ${sccCount} 个强连通分量 (SCC)`,
    nodeGroup: group,
  };
}

function computeBridgesAndCuts(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from)?.push({ to: e.to, edgeId: e.id });
    adj.get(e.to)?.push({ to: e.from, edgeId: e.id });
  }

  const dfn = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges = new Set<string>();
  const cuts = new Set<string>();
  let timer = 0;

  function dfs(u: string, parentEdgeId: string | null) {
    timer++;
    dfn.set(u, timer);
    low.set(u, timer);
    let children = 0;

    for (const { to: v, edgeId } of adj.get(u) ?? []) {
      if (edgeId === parentEdgeId) continue;
      if (!dfn.has(v)) {
        children++;
        dfs(v, edgeId);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > dfn.get(u)!) {
          bridges.add(edgeId);
        }
        if (parentEdgeId !== null && low.get(v)! >= dfn.get(u)!) {
          cuts.add(u);
        }
      } else {
        low.set(u, Math.min(low.get(u)!, dfn.get(v)!));
      }
    }
    if (parentEdgeId === null && children > 1) {
      cuts.add(u);
    }
  }

  for (const n of nodes) {
    if (!dfn.has(n.id)) dfs(n.id, null);
  }

  const badges = new Map<string, string>();
  for (const c of cuts) badges.set(c, "割");

  return {
    summary: `桥 ${bridges.size} 条，割点 ${cuts.size} 个`,
    highlightNodes: cuts,
    highlightEdges: bridges,
    dimOtherEdges: bridges.size > 0,
    nodeBadges: badges,
  };
}

function computeMST(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let cur = x;
    while (cur !== r) {
      const next = parent.get(cur)!;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };

  const weighted = edges
    .filter((e) => e.from !== e.to)
    .map((e) => {
      const num = e.weight != null && e.weight.trim() !== "" ? Number(e.weight) : 1;
      return { e, w: Number.isFinite(num) ? num : 1 };
    })
    .sort((a, b) => a.w - b.w);

  const chosen = new Set<string>();
  let total = 0;
  for (const { e, w } of weighted) {
    const ru = find(e.from);
    const rv = find(e.to);
    if (ru !== rv) {
      parent.set(ru, rv);
      chosen.add(e.id);
      total += w;
    }
  }

  const roots = new Set(nodes.map((n) => find(n.id)));
  const totalStr = Number.isInteger(total) ? String(total) : total.toFixed(2);
  return {
    summary:
      roots.size === 1
        ? `MST ${chosen.size} 边，总权值 ${totalStr}`
        : `最小生成森林 ${chosen.size} 边（${roots.size} 棵树），总权值 ${totalStr}`,
    highlightEdges: chosen,
    dimOtherEdges: true,
  };
}

export function computeBipartite(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push({ to: e.to, edgeId: e.id });
    if (e.from !== e.to) {
      adj.get(e.to)?.push({ to: e.from, edgeId: e.id });
    }
  }

  const color = new Map<string, number>();
  const parent = new Map<string, { node: string; edgeId: string } | null>();

  for (const start of nodes) {
    if (color.has(start.id)) continue;
    color.set(start.id, 0);
    parent.set(start.id, null);
    const q = [start.id];

    while (q.length > 0) {
      const u = q.shift()!;
      const cu = color.get(u)!;
      for (const { to: v, edgeId } of adj.get(u) ?? []) {
        if (!color.has(v)) {
          color.set(v, 1 - cu);
          parent.set(v, { node: u, edgeId });
          q.push(v);
        } else if (color.get(v) === cu) {
          // Odd cycle found! Reconstruct path u -> lca <- v
          const cycleNodes = new Set<string>([u, v]);
          const cycleEdges = new Set<string>([edgeId]);
          const ancU = new Map<string, number>();
          let cur: string | null = u;
          let step = 0;
          while (cur !== null) {
            ancU.set(cur, step++);
            cur = parent.get(cur)?.node ?? null;
          }
          cur = v;
          let lca = v;
          while (cur !== null) {
            if (ancU.has(cur)) {
              lca = cur;
              break;
            }
            const p = parent.get(cur);
            if (!p) break;
            cycleNodes.add(p.node);
            cycleEdges.add(p.edgeId);
            cur = p.node;
          }
          cur = u;
          while (cur !== null && cur !== lca) {
            const p = parent.get(cur);
            if (!p) break;
            cycleNodes.add(p.node);
            cycleEdges.add(p.edgeId);
            cur = p.node;
          }
          return {
            summary: `非二分图，发现长度为 ${cycleEdges.size} 的奇环`,
            warning: "已高亮冲突奇环",
            highlightNodes: cycleNodes,
            highlightEdges: cycleEdges,
            dimOtherEdges: true,
          };
        }
      }
    }
  }

  let left = 0;
  let right = 0;
  for (const c of color.values()) {
    if (c === 0) left++;
    else right++;
  }
  return {
    summary: `二分图，左部 ${left} 点，右部 ${right} 点`,
    nodeGroup: color,
  };
}

function computeTreeProps(nodes: NodeItem[], edges: EdgeItem[]): AlgoResult {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const n of nodes) adj.set(n.id, []);
  let hasSelfLoop = false;
  for (const e of edges) {
    if (e.from === e.to) {
      hasSelfLoop = true;
      continue;
    }
    adj.get(e.from)?.push({ to: e.to, edgeId: e.id });
    adj.get(e.to)?.push({ to: e.from, edgeId: e.id });
  }

  // Find largest component & verify tree
  const visited = new Set<string>();
  let largestComp: string[] = [];
  let hasCycle = hasSelfLoop;

  for (const nd of nodes) {
    if (visited.has(nd.id)) continue;
    const comp: string[] = [];
    const q = [nd.id];
    visited.add(nd.id);
    let edgeDegSum = 0;
    while (q.length > 0) {
      const u = q.shift()!;
      comp.push(u);
      const nbs = adj.get(u) ?? [];
      edgeDegSum += nbs.length;
      for (const { to: v } of nbs) {
        if (!visited.has(v)) {
          visited.add(v);
          q.push(v);
        }
      }
    }
    if (edgeDegSum / 2 > comp.length - 1) hasCycle = true;
    if (comp.length > largestComp.length) largestComp = comp;
  }

  if (hasCycle) {
    return {
      summary: "当前图含环，不是树/森林",
      warning: "树直径与重心仅适用于无环树结构",
    };
  }
  if (largestComp.length === 0) {
    return { summary: "空树" };
  }

  // Double BFS for diameter on largest component
  function bfsFarthest(start: string) {
    const dist = new Map<string, number>([[start, 0]]);
    const prev = new Map<string, { node: string; edgeId: string } | null>([[start, null]]);
    const q = [start];
    let far = start;
    while (q.length > 0) {
      const u = q.shift()!;
      if (dist.get(u)! > dist.get(far)!) far = u;
      for (const { to: v, edgeId } of adj.get(u) ?? []) {
        if (!dist.has(v)) {
          dist.set(v, dist.get(u)! + 1);
          prev.set(v, { node: u, edgeId });
          q.push(v);
        }
      }
    }
    return { far, dist, prev };
  }

  const b1 = bfsFarthest(largestComp[0]);
  const b2 = bfsFarthest(b1.far);

  const diamNodes = new Set<string>();
  const diamEdges = new Set<string>();
  let cur: string | null = b2.far;
  while (cur !== null) {
    diamNodes.add(cur);
    const p = b2.prev.get(cur);
    if (p) {
      diamEdges.add(p.edgeId);
      cur = p.node;
    } else {
      cur = null;
    }
  }

  // Tree centroids
  const compSet = new Set(largestComp);
  const sz = new Map<string, number>();
  const centroids: string[] = [];
  const totalN = largestComp.length;

  function dfsCentroid(u: string, p: string | null) {
    sz.set(u, 1);
    let maxSub = 0;
    for (const { to: v } of adj.get(u) ?? []) {
      if (v === p || !compSet.has(v)) continue;
      dfsCentroid(v, u);
      const sv = sz.get(v)!;
      sz.set(u, sz.get(u)! + sv);
      maxSub = Math.max(maxSub, sv);
    }
    maxSub = Math.max(maxSub, totalN - sz.get(u)!);
    if (maxSub <= totalN / 2) centroids.push(u);
  }
  dfsCentroid(largestComp[0], null);

  const badges = new Map<string, string>();
  for (const c of centroids) {
    badges.set(c, "重心");
    diamNodes.add(c);
  }

  return {
    summary: `直径 ${diamEdges.size} 边，重心 ${centroids.join("、")}`,
    highlightNodes: diamNodes,
    highlightEdges: diamEdges,
    dimOtherEdges: diamEdges.size > 0,
    nodeBadges: badges,
  };
}

function computeShortestPath(
  nodes: NodeItem[],
  edges: EdgeItem[],
  directed: boolean,
  startId: string | null,
  endId: string | null,
): AlgoResult {
  const ids = new Set(nodes.map((n) => n.id));
  const s = startId && ids.has(startId) ? startId : nodes[0]?.id ?? null;
  const t = endId && ids.has(endId) ? endId : nodes[nodes.length - 1]?.id ?? null;
  if (!s || !t) return { summary: "请先指定起点与终点" };

  const badges = new Map<string, string>();
  badges.set(s, "S");
  badges.set(t, s === t ? "S/T" : "T");

  const adj = new Map<string, Array<{ to: string; edgeId: string; w: number }>>();
  for (const n of nodes) adj.set(n.id, []);
  let hasNeg = false;
  for (const e of edges) {
    const rawW = e.weight != null && e.weight.trim() !== "" ? Number(e.weight) : 1;
    const w = Number.isFinite(rawW) ? rawW : 1;
    if (w < 0) hasNeg = true;
    adj.get(e.from)?.push({ to: e.to, edgeId: e.id, w });
    if (!directed && e.from !== e.to) {
      adj.get(e.to)?.push({ to: e.from, edgeId: e.id, w });
    }
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edgeId: string } | null>();
  for (const n of nodes) dist.set(n.id, Infinity);
  dist.set(s, 0);
  prev.set(s, null);

  if (hasNeg) {
    // Bellman-Ford for negative weights
    const allEdges: Array<{ from: string; to: string; edgeId: string; w: number }> = [];
    for (const [u, list] of adj.entries()) {
      for (const item of list) allEdges.push({ from: u, to: item.to, edgeId: item.edgeId, w: item.w });
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      let updated = false;
      for (const { from, to, edgeId, w } of allEdges) {
        const du = dist.get(from)!;
        if (du < Infinity && du + w < dist.get(to)!) {
          dist.set(to, du + w);
          prev.set(to, { node: from, edgeId });
          updated = true;
        }
      }
      if (!updated) break;
    }
  } else {
    // Dijkstra (O(V^2) is instant for interactive graph sizes)
    const used = new Set<string>();
    for (let i = 0; i < nodes.length; i++) {
      let u: string | null = null;
      let best = Infinity;
      for (const nd of nodes) {
        const d = dist.get(nd.id)!;
        if (!used.has(nd.id) && d < best) {
          best = d;
          u = nd.id;
        }
      }
      if (!u) break;
      used.add(u);
      for (const { to, edgeId, w } of adj.get(u) ?? []) {
        const cand = best + w;
        if (cand < dist.get(to)!) {
          dist.set(to, cand);
          prev.set(to, { node: u, edgeId });
        }
      }
    }
  }

  const ans = dist.get(t)!;
  if (!Number.isFinite(ans)) {
    return {
      summary: `${s} → ${t} 不可达`,
      highlightNodes: new Set([s, t]),
      nodeBadges: badges,
    };
  }

  const pathNodes = new Set<string>();
  const pathEdges = new Set<string>();
  let cur: string | null = t;
  let guard = 0;
  while (cur !== null && guard++ <= nodes.length + 2) {
    pathNodes.add(cur);
    const p = prev.get(cur);
    if (p) {
      pathEdges.add(p.edgeId);
      cur = p.node;
    } else {
      cur = null;
    }
  }

  const distStr = Number.isInteger(ans) ? String(ans) : ans.toFixed(2);
  return {
    summary: `最短路 ${s} → ${t} = ${distStr}（${pathEdges.size} 边）`,
    highlightNodes: pathNodes,
    highlightEdges: pathEdges,
    dimOtherEdges: true,
    nodeBadges: badges,
  };
}

export function computeGeoAlgo(geoAlgo: GeoAlgoId, nodes: NodeItem[]): GeoResult | null {
  if (geoAlgo === "none" || nodes.length === 0) return null;

  if (geoAlgo === "measure") {
    return {
      summary: "已开启边长与夹角标注",
      showMeasurements: true,
    };
  }

  if (geoAlgo === "convex_hull") {
    if (nodes.length < 3) {
      return {
        summary: `凸包需要至少 3 个点（当前 ${nodes.length} 点）`,
        hullIds: nodes.map((n) => n.id),
      };
    }
    // Andrew's Monotone Chain in Cartesian coordinates (x, -y)
    const pts = nodes
      .map((n) => ({ id: n.id, x: n.x, y: -n.y }))
      .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

    const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower: typeof pts = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper: typeof pts = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    const hull = lower.concat(upper);

    let perim = 0;
    let area2 = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      perim += Math.hypot(b.x - a.x, b.y - a.y);
      area2 += a.x * b.y - b.x * a.y;
    }
    const area = Math.abs(area2) / 2;

    return {
      summary: `凸包 ${hull.length} 顶点，周长 ${perim.toFixed(2)}，面积 ${area.toFixed(2)}`,
      hullIds: hull.map((p) => p.id),
      hullPerimeter: perim,
      hullArea: area,
    };
  }

  return null;
}
