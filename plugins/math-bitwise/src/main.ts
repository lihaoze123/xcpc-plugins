import "./style.css";
import type { XcpcBridge, XcpcTheme } from "@xcpc-workstation/plugin-sdk/ui";

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
      // ignore storage errors
    }
  } else {
    try {
      const raw = localStorage.getItem(`math-bitwise:${key}`);
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
      localStorage.setItem(`math-bitwise:${key}`, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

function showToast(text: string, kind?: "info" | "success" | "error"): void {
  const b = getBridge();
  if (b?.toast) {
    b.toast(text, kind);
  }
}

async function copyToClipboard(text: string): Promise<void> {
  const b = getBridge();
  if (b?.clipboard) {
    await b.clipboard.writeText(text);
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
  showToast(`已复制 ${text}`, "success");
}

function resolveScheme(theme: XcpcTheme | string | undefined): "light" | "dark" | null {
  if (!theme) return null;
  const s = typeof theme === "string" ? theme : theme.scheme;
  return s === "dark" || s === "light" ? s : null;
}

function syncTheme(): void {
  const b = getBridge();
  const apply = (theme: XcpcTheme | string | undefined) => {
    const scheme = resolveScheme(theme);
    if (scheme) {
      document.documentElement.setAttribute("data-theme", scheme);
    }
  };
  apply(b?.theme);
  b?.onThemeChange?.((t) => apply(t));
}

// ---------------------------------------------------------------------------
// 64-bit & Number Theory Pure BigInt Math
// ---------------------------------------------------------------------------

const MASK64 = (1n << 64n) - 1n;
const SIGN64 = 1n << 63n;

function parseBig(raw: string): bigint {
  const s = String(raw || "0").trim().replace(/_/g, "");
  if (!s) return 0n;
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s)) {
    return s.startsWith("-") ? -BigInt(s.slice(1)) : BigInt(s.replace(/^\+/, ""));
  }
  if (/^[+-]?0[bB][01]+$/.test(s)) {
    return s.startsWith("-") ? -BigInt(s.slice(1)) : BigInt(s.replace(/^\+/, ""));
  }
  if (/^[+-]?0[oO][0-7]+$/.test(s)) {
    return s.startsWith("-") ? -BigInt(s.slice(1)) : BigInt(s.replace(/^\+/, ""));
  }
  if (/^[+-]?\d+$/.test(s)) return BigInt(s);
  throw new Error("无效整数格式");
}

function computeBitStats(u: bigint) {
  const signed = (u & SIGN64) !== 0n ? u - (1n << 64n) : u;
  let pop = 0;
  let tmp = u;
  while (tmp > 0n) {
    tmp &= tmp - 1n;
    pop++;
  }
  let ctz = 64;
  if (u !== 0n) {
    ctz = 0;
    let x = u;
    while ((x & 1n) === 0n) {
      x >>= 1n;
      ctz++;
    }
  }
  const clz = u === 0n ? 64 : 64 - u.toString(2).length;
  const lowbit = u === 0n ? 0n : u & (-u & MASK64);
  return {
    u64: u.toString(),
    i64: signed.toString(),
    hex: `0x${u.toString(16).toUpperCase().padStart(16, "0")}`,
    oct: `0o${u.toString(8)}`,
    popClzCtz: `${pop} / ${clz} / ${ctz}`,
    lowbit: lowbit > 0n ? `${lowbit} (2^${ctz})` : "0",
  };
}

const absBig = (x: bigint) => (x < 0n ? -x : x);

function gcdBig(a: bigint, b: bigint): bigint {
  a = absBig(a);
  b = absBig(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function exgcdBig(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { g: a, x: 1n, y: 0n };
  const r = exgcdBig(b, a % b);
  return { g: r.g, x: r.y, y: r.x - (a / b) * r.y };
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function isProbablePrime(n: bigint): boolean {
  if (n < 2n) return false;
  const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  for (const p of smallPrimes) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  const bases = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];
  for (const a of bases) {
    if (a % n === 0n) continue;
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let r = 1n; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function pollardRho(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 1000n; c++) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    const f = (v: bigint) => (v * v + c) % n;
    let steps = 0;
    while (d === 1n && steps < 200000) {
      x = f(x);
      y = f(f(y));
      d = gcdBig(x > y ? x - y : y - x, n);
      steps++;
    }
    if (d !== 1n && d !== n) return d;
  }
  return n;
}

function factorize(n: bigint): Map<bigint, number> {
  const factors = new Map<bigint, number>();
  if (n <= 1n) return factors;
  const addFactor = (p: bigint) => factors.set(p, (factors.get(p) ?? 0) + 1);

  let rem = n;
  for (let d = 2n; d * d <= rem && d <= 1000n; d += d === 2n ? 1n : 2n) {
    while (rem % d === 0n) {
      addFactor(d);
      rem /= d;
    }
  }

  const stack = rem > 1n ? [rem] : [];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrime(cur)) {
      addFactor(cur);
    } else {
      const d = pollardRho(cur);
      if (d === cur) addFactor(cur);
      else stack.push(d, cur / d);
    }
  }
  return new Map([...factors.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

function solveCrt(
  spec: string,
): { solvable: true; x: bigint; mod: bigint } | { solvable: false; message: string } | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const lines = trimmed
    .split(/[;\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let r0 = 0n;
  let m0 = 1n;
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`CRT 方程格式应为 'r m'，出错项: ${line}`);
    }
    const r1 = parseBig(parts[0]);
    const m1 = parseBig(parts[1]);
    if (m1 <= 0n) throw new Error(`CRT 模数必须为正整数: ${m1}`);

    const { g, x } = exgcdBig(m0, m1);
    const diff = r1 - r0;
    if (diff % g !== 0n) {
      return { solvable: false, message: "无解（同余条件冲突）" };
    }
    const lcm = (m0 / g) * m1;
    const step = m1 / g;
    let k = ((diff / g) * x) % step;
    if (k < 0n) k += step;
    r0 = (r0 + m0 * k) % lcm;
    if (r0 < 0n) r0 += lcm;
    m0 = lcm;
  }
  return { solvable: true, x: r0, mod: m0 };
}

const COMMON_MODS: Array<{
  p: string;
  factor: string;
  g: string;
  ntt: string;
  note: string;
}> = [
  { p: "998244353", factor: "119 × 2^23 + 1", g: "3", ntt: "2^23 = 8,388,608", note: "最常用 NTT 素数模数" },
  { p: "1000000007", factor: "2 × 500000003 + 1", g: "5", ntt: "2^1（非 NTT）", note: "经典竞赛素数模数" },
  { p: "1000000009", factor: "2^3 × 125000001 + 1", g: "13", ntt: "2^3（非 NTT）", note: "双哈希常用素数模数" },
  { p: "1004535809", factor: "479 × 2^21 + 1", g: "3", ntt: "2^21 = 2,097,152", note: "双模 NTT 搭档模数" },
  { p: "469762049", factor: "7 × 2^26 + 1", g: "3", ntt: "2^26 = 67,108,864", note: "超大长度 NTT 模数" },
  { p: "167772161", factor: "5 × 2^25 + 1", g: "3", ntt: "2^25 = 33,554,432", note: "三模 NTT 搭档模数" },
  { p: "2147483647", factor: "2^31 - 1", g: "7", ntt: "梅森素数", note: "int32 最大值 / 哈希模数" },
];

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
  syncTheme();

  const root = document.getElementById("app");
  if (!root) return;

  const [savedTab, savedBitRaw, savedNtN, savedNtA, savedNtB, savedNtMod, savedNtCrt] =
    await Promise.all([
      kvGet<string>("activeTab", "bits"),
      kvGet<string>("bitRaw", "998244353"),
      kvGet<string>("ntN", "998244353"),
      kvGet<string>("ntA", "3"),
      kvGet<string>("ntB", "998244351"),
      kvGet<string>("ntMod", "998244353"),
      kvGet<string>("ntCrt", "2 3; 3 5; 2 7"),
    ]);

  let activeTab = ["bits", "nt", "mods"].includes(savedTab) ? savedTab : "bits";
  let bitValue = 998244353n;
  try {
    bitValue = parseBig(savedBitRaw) & MASK64;
  } catch {
    bitValue = 998244353n;
  }

  // Topbar tabs
  const tabs: Array<{ id: string; label: string }> = [
    { id: "bits", label: "位运算" },
    { id: "nt", label: "数论计算" },
    { id: "mods", label: "常用模数" },
  ];
  const tabButtons = new Map<string, HTMLButtonElement>();
  const segmented = el("div", { class: "segmented", role: "tablist" });
  for (const t of tabs) {
    const btn = el("button", { type: "button", role: "tab", "data-testid": `math-tab-${t.id}` }, t.label);
    tabButtons.set(t.id, btn);
    segmented.append(btn);
  }
  const topbar = el("div", { class: "topbar" }, segmented);
  const scrollBody = el("div", { class: "scroll-body" });

  // --- Panel 1: Bitwise ---
  const panelBits = el("div", { class: "panel", "data-testid": "math-panel-bits" });
  const bitInput = el("input", {
    class: "input",
    type: "text",
    value: savedBitRaw,
    placeholder: "输入十进制 / 0x十六进制 / 0b二进制 / 负数",
    "data-testid": "math-bit-input",
  });
  const btnClear = el("button", { class: "btn", type: "button", "data-testid": "math-bit-clear" }, "清零");
  const btnNot = el("button", { class: "btn", type: "button", "data-testid": "math-bit-not" }, "取反 ~x");
  const btnShl = el("button", { class: "btn", type: "button", "data-testid": "math-bit-shl" }, "<< 1");
  const btnShr = el("button", { class: "btn", type: "button", "data-testid": "math-bit-shr" }, ">> 1");
  const btnAllOnes = el("button", { class: "btn", type: "button", "data-testid": "math-bit-all-ones" }, "全 1");
  const btnCopyHex = el("button", { class: "btn", type: "button", "data-testid": "math-bit-copy-hex" }, "复制十六进制");
  const bitError = el("div", { class: "error-slot" });

  const bitToolbar = el(
    "div",
    { class: "toolbar-row" },
    bitInput,
    btnClear,
    btnNot,
    btnShl,
    btnShr,
    btnAllOnes,
    btnCopyHex,
  );

  // 64 bit cells (indexed 0..63)
  const bitCells = new Array<HTMLButtonElement>(64);
  const bitValSpans = new Array<HTMLSpanElement>(64);
  const bitGrid = el("div", { class: "bit-grid", "data-testid": "math-bit-grid" });

  const groupOrder = [7, 6, 5, 4, 3, 2, 1, 0];
  for (const g of groupOrder) {
    const hi = g * 8 + 7;
    const lo = g * 8;
    const cellsWrap = el("div", { class: "bit-cells" });
    for (let b = hi; b >= lo; b--) {
      const valSpan = el("span", { class: "bit-val" }, "0");
      const idxSpan = el("span", { class: "bit-idx" }, String(b));
      const cell = el(
        "button",
        {
          class: "bit-cell",
          type: "button",
          "data-bit": String(b),
          "data-testid": `math-bit-${b}`,
        },
        valSpan,
        idxSpan,
      );
      bitCells[b] = cell;
      bitValSpans[b] = valSpan;
      cellsWrap.append(cell);
    }
    const groupEl = el(
      "div",
      { class: "bit-group", "data-testid": `math-bit-group-${g}` },
      el("div", { class: "bit-group-header" }, el("span", undefined, `位 ${hi}–${lo}`)),
      cellsWrap,
    );
    bitGrid.append(groupEl);
  }

  // Stats card
  const statDefs: Array<{ key: keyof ReturnType<typeof computeBitStats>; label: string; copyable: boolean }> = [
    { key: "u64", label: "无符号 u64", copyable: true },
    { key: "i64", label: "有符号 i64", copyable: true },
    { key: "hex", label: "十六进制", copyable: true },
    { key: "oct", label: "八进制", copyable: true },
    { key: "popClzCtz", label: "1 的个数 / 前导零 / 尾随零", copyable: false },
    { key: "lowbit", label: "最低位 1（x & -x）", copyable: true },
  ];
  const statEls = new Map<string, HTMLSpanElement>();
  const statsCard = el("div", { class: "card" });
  for (const def of statDefs) {
    const valEl = el("span", { class: "stat-val" });
    statEls.set(def.key, valEl);
    const row = el(
      "div",
      { class: def.copyable ? "stat-row clickable" : "stat-row", title: def.copyable ? "点击复制" : "" },
      el("span", { class: "stat-key" }, def.label),
      valEl,
    );
    if (def.copyable) {
      row.addEventListener("click", () => {
        const txt = valEl.textContent?.split(" ")[0] ?? "";
        if (txt) void copyToClipboard(txt);
      });
    }
    statsCard.append(row);
  }

  panelBits.append(bitToolbar, bitError, bitGrid, statsCard);

  function renderBitsDom(syncInput = false) {
    const u = bitValue;
    for (let b = 0; b < 64; b++) {
      const on = ((u >> BigInt(b)) & 1n) === 1n;
      const cell = bitCells[b];
      if (cell.classList.contains("on") !== on) {
        cell.classList.toggle("on", on);
        bitValSpans[b].textContent = on ? "1" : "0";
      }
    }
    const stats = computeBitStats(u);
    for (const def of statDefs) {
      statEls.get(def.key)!.textContent = stats[def.key];
    }
    if (syncInput) {
      const s = u.toString();
      bitInput.value = s;
      kvSet("bitRaw", s);
      bitError.textContent = "";
    }
  }

  // Event delegation for ultra-fast <1ms bit toggles
  bitGrid.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("button.bit-cell");
    if (!target) return;
    const idx = Number(target.dataset.bit);
    if (!Number.isInteger(idx) || idx < 0 || idx > 63) return;
    bitValue = (bitValue ^ (1n << BigInt(idx))) & MASK64;
    renderBitsDom(true);
  });

  bitInput.addEventListener("input", () => {
    const raw = bitInput.value;
    kvSet("bitRaw", raw);
    try {
      bitValue = parseBig(raw) & MASK64;
      bitError.textContent = "";
      renderBitsDom(false);
    } catch (err) {
      bitError.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  btnClear.addEventListener("click", () => {
    bitValue = 0n;
    renderBitsDom(true);
  });
  btnNot.addEventListener("click", () => {
    bitValue = ~bitValue & MASK64;
    renderBitsDom(true);
  });
  btnShl.addEventListener("click", () => {
    bitValue = (bitValue << 1n) & MASK64;
    renderBitsDom(true);
  });
  btnShr.addEventListener("click", () => {
    bitValue = (bitValue >> 1n) & MASK64;
    renderBitsDom(true);
  });
  btnAllOnes.addEventListener("click", () => {
    bitValue = MASK64;
    renderBitsDom(true);
  });
  btnCopyHex.addEventListener("click", () => {
    const hex = computeBitStats(bitValue).hex;
    void copyToClipboard(hex);
  });

  // --- Panel 2: Number Theory ---
  const panelNt = el("div", { class: "panel", "data-testid": "math-panel-nt" });
  const inputN = el("input", { class: "input", type: "text", value: savedNtN });
  const inputA = el("input", { class: "input", type: "text", value: savedNtA });
  const inputB = el("input", { class: "input", type: "text", value: savedNtB });
  const inputMod = el("input", { class: "input", type: "text", value: savedNtMod });
  const inputCrt = el("input", { class: "input", type: "text", value: savedNtCrt });

  const ntFormCard = el(
    "div",
    { class: "card" },
    el(
      "div",
      { class: "nt-grid" },
      el("div", { class: "field" }, el("label", undefined, "整数 n（分解 / φ(n)）"), inputN),
      el("div", { class: "field" }, el("label", undefined, "参数 a"), inputA),
      el("div", { class: "field" }, el("label", undefined, "参数 b"), inputB),
      el("div", { class: "field" }, el("label", undefined, "模数 m"), inputMod),
    ),
    el("div", { class: "field" }, el("label", undefined, "同余方程组（分号分隔，每组 r m）"), inputCrt),
  );
  const ntError = el("div", { class: "error-slot" });
  const ntResults = el("div", { style: "display:flex;flex-direction:column;gap:12px;" });
  panelNt.append(ntFormCard, ntError, ntResults);

  function buildKvCard(title: string, rows: Array<[string, string]>): HTMLElement {
    const card = el("div", { class: "card" }, el("h3", { class: "card-title" }, title));
    for (const [k, v] of rows) {
      const row = el(
        "div",
        { class: "stat-row clickable", title: "点击复制" },
        el("span", { class: "stat-key" }, k),
        el("span", { class: "stat-val" }, v),
      );
      row.addEventListener("click", () => void copyToClipboard(v));
      card.append(row);
    }
    return card;
  }

  function recomputeNt() {
    ntError.textContent = "";
    ntResults.replaceChildren();
    try {
      const nStr = inputN.value.trim();
      if (nStr) {
        const n = parseBig(nStr);
        if (n >= 1n) {
          const factors = factorize(n);
          const factorExpr =
            factors.size === 0
              ? n.toString()
              : [...factors.entries()]
                  .map(([p, e]) => (e === 1 ? p.toString() : `${p}^${e}`))
                  .join(" × ");
          let phi = n;
          let divCount = 1n;
          let divSum = 1n;
          for (const [p, e] of factors.entries()) {
            phi = (phi / p) * (p - 1n);
            divCount *= BigInt(e + 1);
            let pPow = 1n;
            let geo = 1n;
            for (let i = 0; i < e; i++) {
              pPow *= p;
              geo += pPow;
            }
            divSum *= geo;
          }
          const primeStr = isProbablePrime(n) ? "是（素数）" : n === 1n ? "否（1）" : "否（合数）";
          ntResults.append(
            buildKvCard(`整数性质与分解 (n = ${n})`, [
              ["素性判定", primeStr],
              ["质因数分解", factorExpr],
              ["欧拉函数 φ(n)", phi.toString()],
              ["正约数个数 d(n)", divCount.toString()],
              ["正约数和 σ(n)", divSum.toString()],
            ]),
          );
        }
      }

      const aStr = inputA.value.trim();
      const bStr = inputB.value.trim();
      const mStr = inputMod.value.trim();
      if (aStr || bStr || mStr) {
        const a = aStr ? parseBig(aStr) : 0n;
        const b = bStr ? parseBig(bStr) : 0n;
        const m = mStr ? parseBig(mStr) : 998244353n;
        const g = gcdBig(a, b);
        const lcm = g === 0n ? 0n : absBig((a / g) * b);
        const ex = exgcdBig(a, b);
        const rows: Array<[string, string]> = [
          ["gcd(a, b)", g.toString()],
          ["lcm(a, b)", lcm.toString()],
          ["exgcd(a, b)", `a·(${ex.x}) + b·(${ex.y}) = ${ex.g}`],
        ];
        if (m > 0n) {
          rows.push([
            "快速幂 a^b mod m",
            b >= 0n ? modPow(a, b, m).toString() : "指数 b 需为非负整数",
          ]);
          const invEx = exgcdBig(((a % m) + m) % m, m);
          if (invEx.g === 1n) {
            const inv = ((invEx.x % m) + m) % m;
            rows.push(["模逆元 a^(-1) mod m", inv.toString()]);
          } else {
            rows.push(["模逆元 a^(-1) mod m", `不存在 (gcd = ${invEx.g})`]);
          }
        }
        ntResults.append(buildKvCard("同余、exgcd 与快速幂", rows));
      }

      const crtStr = inputCrt.value.trim();
      if (crtStr) {
        const crt = solveCrt(crtStr);
        if (crt) {
          ntResults.append(
            buildKvCard(
              "中国剩余定理 (CRT / exCRT)",
              crt.solvable
                ? [
                    ["状态", "有唯一通解"],
                    ["最小非负解 x", crt.x.toString()],
                    ["合并模数 M", crt.mod.toString()],
                    ["通解表达式", `x ≡ ${crt.x} (mod ${crt.mod})`],
                  ]
                : [["状态", crt.message]],
            ),
          );
        }
      }
    } catch (err) {
      ntError.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  let ntTimer: number | null = null;
  const scheduleNt = () => {
    if (ntTimer !== null) window.clearTimeout(ntTimer);
    ntTimer = window.setTimeout(() => {
      ntTimer = null;
      recomputeNt();
    }, 60);
  };

  inputN.addEventListener("input", () => {
    kvSet("ntN", inputN.value);
    scheduleNt();
  });
  inputA.addEventListener("input", () => {
    kvSet("ntA", inputA.value);
    scheduleNt();
  });
  inputB.addEventListener("input", () => {
    kvSet("ntB", inputB.value);
    scheduleNt();
  });
  inputMod.addEventListener("input", () => {
    kvSet("ntMod", inputMod.value);
    scheduleNt();
  });
  inputCrt.addEventListener("input", () => {
    kvSet("ntCrt", inputCrt.value);
    scheduleNt();
  });

  // --- Panel 3: Common Moduli ---
  const panelMods = el("div", { class: "panel", "data-testid": "math-panel-mods" });
  const modTable = el(
    "table",
    { class: "data-table" },
    el(
      "thead",
      undefined,
      el(
        "tr",
        undefined,
        el("th", { class: "right" }, "模数 p"),
        el("th", undefined, "p - 1 分解"),
        el("th", { class: "center" }, "原根 g"),
        el("th", undefined, "NTT 最大 2^k"),
        el("th", undefined, "说明"),
        el("th", { class: "right" }, ""),
      ),
    ),
  );
  const modTbody = el("tbody");
  for (const m of COMMON_MODS) {
    const copyBtn = el("button", { class: "btn btn-sm", type: "button" }, "复制");
    copyBtn.addEventListener("click", () => void copyToClipboard(m.p));
    modTbody.append(
      el(
        "tr",
        undefined,
        el("td", { class: "mono right" }, m.p),
        el("td", { class: "mono" }, m.factor),
        el("td", { class: "mono center" }, m.g),
        el("td", { class: "mono" }, m.ntt),
        el("td", undefined, m.note),
        el("td", { class: "right" }, copyBtn),
      ),
    );
  }
  modTable.append(modTbody);
  panelMods.append(el("div", { class: "card" }, el("h3", { class: "card-title" }, "常用竞赛模数与原根速查表"), modTable));

  // Tab switching
  function setActiveTab(next: string) {
    activeTab = next;
    kvSet("activeTab", next);
    for (const [id, btn] of tabButtons.entries()) {
      btn.classList.toggle("active", id === next);
      btn.setAttribute("aria-selected", id === next ? "true" : "false");
    }
    panelBits.classList.toggle("hidden", next !== "bits");
    panelNt.classList.toggle("hidden", next !== "nt");
    panelMods.classList.toggle("hidden", next !== "mods");
    if (next === "nt") recomputeNt();
  }

  for (const [id, btn] of tabButtons.entries()) {
    btn.addEventListener("click", () => setActiveTab(id));
  }

  scrollBody.append(panelBits, panelNt, panelMods);
  root.replaceChildren(topbar, scrollBody);

  // Initial paint
  renderBitsDom(false);
  setActiveTab(activeTab);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void mount(), { once: true });
} else {
  void mount();
}
