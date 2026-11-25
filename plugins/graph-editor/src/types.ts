export type GraphFormat = "edge_list" | "parent_array" | "adj_list" | "coords";
export type GraphMode = "normal" | "tree" | "bipartite" | "geometry";
export type AlgoId =
  | "none"
  | "components"
  | "bridges"
  | "mst"
  | "bipartite"
  | "tree_props"
  | "shortest_path";
export type GeoAlgoId = "none" | "convex_hull" | "measure";
export type HeaderNmMode = "auto" | "force_on" | "force_off";
export type InspectorTab = "modes" | "algos" | "appearance";

export interface NodeItem {
  id: string;
  label: string;
  note: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string | null;
  pinned: boolean;
}

export interface RawNodeItem {
  id: string;
  label: string;
  note: string;
  x: number | null;
  y: number | null;
  color: string | null;
  pinned: boolean;
}

export interface EdgeItem {
  id: string;
  from: string;
  to: string;
  weight: string | null;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface AppearanceSettings {
  nodeRadius: number;
  fontSize: number;
  edgeWidth: number;
  curveStrength: number;
  showWeights: boolean;
  showBadges: boolean;
  showAxes: boolean;
  printStyle: boolean;
  transparentBg: boolean;
}

export interface GraphTabState {
  id: string;
  name: string;
  format: GraphFormat;
  oneIndexed: boolean;
  directed: boolean;
  multiedge: boolean;
  mode: GraphMode;
  locked: boolean;
  rootId: string | null;
  algo: AlgoId;
  geoAlgo: GeoAlgoId;
  pathStart: string | null;
  pathEnd: string | null;
  editorText: string;
  nodeLabelsText: string;
  headerNmMode: HeaderNmMode;
  nodes: NodeItem[];
  edges: EdgeItem[];
  viewport: Viewport;
}

export interface HistorySnapshot {
  editorText: string;
  nodeLabelsText: string;
  nodes: Array<{
    id: string;
    label: string;
    note: string;
    x: number;
    y: number;
    color: string | null;
    pinned: boolean;
  }>;
  edges: EdgeItem[];
  format: GraphFormat;
  directed: boolean;
  oneIndexed: boolean;
  mode: GraphMode;
  rootId: string | null;
}

export interface PaletteEntry {
  id: string | null;
  name: string;
  light: string;
  dark: string;
  lightStroke: string;
  darkStroke: string;
  swatch: string;
}

export const PALETTE: PaletteEntry[] = [
  { id: null, name: "默认", light: "", dark: "", lightStroke: "", darkStroke: "", swatch: "transparent" },
  { id: "sky", name: "天蓝", light: "#E0F2FE", dark: "#0C4A6E", lightStroke: "#0284C7", darkStroke: "#38BDF8", swatch: "#0EA5E9" },
  { id: "emerald", name: "翠绿", light: "#DCFCE7", dark: "#14532D", lightStroke: "#15803D", darkStroke: "#4ADE80", swatch: "#10B981" },
  { id: "amber", name: "琥珀", light: "#FEF3C7", dark: "#78350F", lightStroke: "#B45309", darkStroke: "#FBBF24", swatch: "#F59E0B" },
  { id: "rose", name: "玫红", light: "#FFE4E6", dark: "#881337", lightStroke: "#BE123C", darkStroke: "#FB7185", swatch: "#F43F5E" },
  { id: "violet", name: "紫罗兰", light: "#EDE9FE", dark: "#4C1D95", lightStroke: "#6D28D9", darkStroke: "#A78BFA", swatch: "#8B5CF6" },
  { id: "teal", name: "青碧", light: "#CCFBF1", dark: "#134E4A", lightStroke: "#0F766E", darkStroke: "#2DD4BF", swatch: "#14B8A6" },
  { id: "orange", name: "橙橘", light: "#FFEDD5", dark: "#7C2D12", lightStroke: "#C2410C", darkStroke: "#FB923C", swatch: "#F97316" },
];

export const COMPONENT_COLORS = [
  { light: "#E0F2FE", dark: "#0C4A6E", lightStroke: "#0284C7", darkStroke: "#38BDF8" },
  { light: "#DCFCE7", dark: "#14532D", lightStroke: "#15803D", darkStroke: "#4ADE80" },
  { light: "#FEF3C7", dark: "#78350F", lightStroke: "#B45309", darkStroke: "#FBBF24" },
  { light: "#FFE4E6", dark: "#881337", lightStroke: "#BE123C", darkStroke: "#FB7185" },
  { light: "#EDE9FE", dark: "#4C1D95", lightStroke: "#6D28D9", darkStroke: "#A78BFA" },
  { light: "#CCFBF1", dark: "#134E4A", lightStroke: "#0F766E", darkStroke: "#2DD4BF" },
  { light: "#FFEDD5", dark: "#7C2D12", lightStroke: "#C2410C", darkStroke: "#FB923C" },
  { light: "#FCE7F3", dark: "#831843", lightStroke: "#BE185D", darkStroke: "#F472B6" },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  nodeRadius: 20,
  fontSize: 13,
  edgeWidth: 1.8,
  curveStrength: 34,
  showWeights: true,
  showBadges: true,
  showAxes: true,
  printStyle: false,
  transparentBg: false,
};

export interface PresetSample {
  id: string;
  label: string;
  format: GraphFormat;
  directed: boolean;
  oneIndexed: boolean;
  mode: GraphMode;
  text: string;
  nodeLabels?: string;
}

export const PRESET_SAMPLES: PresetSample[] = [
  {
    id: "weighted",
    label: "带权图",
    format: "edge_list",
    directed: false,
    oneIndexed: true,
    mode: "normal",
    text: "1 2 5\n1 3 2\n2 4 1\n2 5 4\n3 5 3\n4 5 7\n5 6 2",
  },
  {
    id: "tree",
    label: "树",
    format: "parent_array",
    directed: false,
    oneIndexed: true,
    mode: "tree",
    text: "1 1 2 2 3 3 5",
  },
  {
    id: "bipartite",
    label: "二分图",
    format: "edge_list",
    directed: false,
    oneIndexed: true,
    mode: "bipartite",
    text: "1 4\n1 5\n2 4\n2 6\n3 5\n3 6",
  },
  {
    id: "geometry",
    label: "几何点集",
    format: "coords",
    directed: false,
    oneIndexed: true,
    mode: "geometry",
    text: "1 0 0\n2 5 0\n3 6 3\n4 3 5\n5 0 3\n6 3 2\npoly 1 2 3 4 5\nedge 2 6\nedge 4 6",
  },
];

export function findPaletteEntry(colorKey: string | null): PaletteEntry | null {
  if (!colorKey) return null;
  return (
    PALETTE.find(
      (p) => p.id === colorKey || p.light === colorKey || p.dark === colorKey || p.swatch === colorKey,
    ) ?? null
  );
}
