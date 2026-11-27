import type {
  PluginCommandAction,
  ToolExecutionResult,
  ToolOutputBlock,
} from "@xcpc-workstation/plugin-sdk/host";

const MASK64 = (1n << 64n) - 1n;
const SIGN64 = 1n << 63n;

function parseBigIntInput(raw: unknown): bigint {
  const s = String(raw ?? "0").trim().replace(/_/g, "");
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
  if (/^[+-]?\d+$/.test(s)) {
    return BigInt(s);
  }
  throw new Error(`无法解析整数: ${String(raw)}`);
}

const toU64 = (x: bigint) => x & MASK64;
const toI64 = (u: bigint) => ((u & SIGN64) !== 0n ? u - (1n << 64n) : u);

function popcount64(u: bigint): number {
  let c = 0;
  let v = u;
  while (v > 0n) {
    v &= v - 1n;
    c++;
  }
  return c;
}

function clz64(u: bigint): number {
  return u === 0n ? 64 : 64 - u.toString(2).length;
}

function ctz64(u: bigint): number {
  if (u === 0n) return 64;
  let c = 0;
  let v = u;
  while ((v & 1n) === 0n) {
    v >>= 1n;
    c++;
  }
  return c;
}

function runBitwise(inputs: Record<string, unknown>): ToolExecutionResult {
  const raw = parseBigIntInput(inputs.value ?? "0");
  const u = toU64(raw);
  const s = toI64(u);
  const neg = toU64(-u);
  const notU = ~u & MASK64;
  const lowbit = u === 0n ? 0n : u & neg;
  const bin64 = u.toString(2).padStart(64, "0");
  const groupedBin = (bin64.match(/.{1,8}/g) ?? []).join(" ");
  const hex16 = `0x${u.toString(16).toUpperCase().padStart(16, "0")}`;

  return {
    summary: `u64=${u}  hex=0x${u.toString(16).toUpperCase()}  popcount=${popcount64(u)}`,
    blocks: [
      {
        type: "table",
        title: "64 位整数与位运算属性",
        headers: ["属性", "值"],
        align: ["left", "right"],
        rows: [
          ["无符号 64 位 (u64)", u.toString()],
          ["有符号 64 位 (i64 补码)", s.toString()],
          ["十六进制 (Hex)", hex16],
          ["八进制 (Oct)", `0o${u.toString(8)}`],
          ["二进制 (64-bit)", groupedBin],
          ["补码取反 (~x)", `0x${notU.toString(16).toUpperCase().padStart(16, "0")} (${toI64(notU)})`],
          ["补码相反数 (-x)", `0x${neg.toString(16).toUpperCase().padStart(16, "0")} (${toI64(neg)})`],
          ["popcount (1 的个数)", String(popcount64(u))],
          ["clz64 (前导零)", String(clz64(u))],
          ["ctz64 (尾随零)", String(ctz64(u))],
          ["lowbit (x & -x)", `${lowbit}${lowbit > 0n ? ` (2^${ctz64(u)})` : ""}`],
        ],
      },
    ],
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
  spec: unknown,
): { solvable: true; x: bigint; mod: bigint } | { solvable: false; message: string } | null {
  const trimmed = String(spec ?? "").trim();
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
    const r1 = parseBigIntInput(parts[0]);
    const m1 = parseBigIntInput(parts[1]);
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

function runNumberTheory(inputs: Record<string, unknown>): ToolExecutionResult {
  const blocks: ToolOutputBlock[] = [];
  const summaryParts: string[] = [];

  if (inputs.n != null && String(inputs.n).trim() !== "") {
    const n = parseBigIntInput(inputs.n);
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
      summaryParts.push(`n = ${factorExpr}，φ(n) = ${phi}`);
      blocks.push({
        type: "table",
        title: `整数性质与分解 (n = ${n})`,
        headers: ["性质", "结果"],
        align: ["left", "right"],
        rows: [
          ["素性判定", primeStr],
          ["质因数分解", factorExpr],
          ["欧拉函数 φ(n)", phi.toString()],
          ["正约数个数 d(n)", divCount.toString()],
          ["正约数和 σ(n)", divSum.toString()],
        ],
      });
    }
  }

  const hasA = inputs.a != null && String(inputs.a).trim() !== "";
  const hasB = inputs.b != null && String(inputs.b).trim() !== "";
  const hasMod = inputs.mod != null && String(inputs.mod).trim() !== "";

  if (hasA || hasB || hasMod) {
    const a = hasA ? parseBigIntInput(inputs.a) : 0n;
    const b = hasB ? parseBigIntInput(inputs.b) : 0n;
    const m = hasMod ? parseBigIntInput(inputs.mod) : 998244353n;

    const g = gcdBig(a, b);
    const lcm = g === 0n ? 0n : absBig((a / g) * b);
    const ex = exgcdBig(a, b);
    const rows: string[][] = [
      ["gcd(a, b)", g.toString()],
      ["lcm(a, b)", lcm.toString()],
      ["exgcd(a, b)", `a·(${ex.x}) + b·(${ex.y}) = ${ex.g}`],
    ];

    if (m > 0n) {
      if (b >= 0n) {
        const pw = modPow(a, b, m);
        rows.push(["快速幂 a^b mod m", pw.toString()]);
        summaryParts.push(`${a}^${b} mod ${m} = ${pw}`);
      } else {
        rows.push(["快速幂 a^b mod m", "指数 b 需为非负整数"]);
      }
      const invEx = exgcdBig(((a % m) + m) % m, m);
      if (invEx.g === 1n) {
        const inv = ((invEx.x % m) + m) % m;
        rows.push(["模逆元 a^(-1) mod m", inv.toString()]);
      } else {
        rows.push(["模逆元 a^(-1) mod m", `不存在 (gcd = ${invEx.g})`]);
      }
    }

    blocks.push({
      type: "table",
      title: "同余、exgcd 与快速幂",
      headers: ["运算", "结果"],
      align: ["left", "right"],
      rows,
    });
  }

  if (inputs.crt != null && String(inputs.crt).trim() !== "") {
    const crt = solveCrt(inputs.crt);
    if (crt) {
      blocks.push({
        type: "table",
        title: "中国剩余定理 (CRT / exCRT)",
        headers: ["项", "结果"],
        align: ["left", "right"],
        rows: crt.solvable
          ? [
              ["状态", "有唯一通解"],
              ["最小非负解 x", crt.x.toString()],
              ["合并模数 M", crt.mod.toString()],
              ["通解表达式", `x ≡ ${crt.x} (mod ${crt.mod})`],
            ]
          : [["状态", crt.message]],
      });
      if (crt.solvable) {
        summaryParts.push(`CRT: x ≡ ${crt.x} (mod ${crt.mod})`);
      }
    }
  }

  return {
    summary: summaryParts.join("  ") || "数论计算完成",
    blocks,
  };
}

function runModReference(): ToolExecutionResult {
  const mods = [
    ["998244353", "119 × 2^23 + 1", "3", "2^23 = 8,388,608", "最常用 NTT 素数模数"],
    ["1000000007", "2 × 500000003 + 1", "5", "2^1（非 NTT）", "经典竞赛素数模数"],
    ["1004535809", "479 × 2^21 + 1", "3", "2^21 = 2,097,152", "双模 NTT 搭档模数"],
    ["469762049", "7 × 2^26 + 1", "3", "2^26 = 67,108,864", "超大长度 NTT 模数"],
    ["167772161", "5 × 2^25 + 1", "3", "2^25 = 33,554,432", "三模 NTT 搭档模数"],
  ];

  return {
    summary: "已列出 5 个竞赛常用质数模数及其原根与 NTT 2^k 幂次",
    blocks: [
      {
        type: "table",
        title: "常用竞赛模数与原根速查表",
        headers: ["模数 p", "p - 1 分解", "最小原根 g", "NTT 最大 2^k", "说明"],
        align: ["right", "left", "center", "left", "left"],
        rows: mods,
      },
    ],
  };
}

export function runTool(
  toolId: string,
  inputs: Record<string, unknown>,
): ToolExecutionResult {
  if (toolId === "bitwise") return runBitwise(inputs ?? {});
  if (toolId === "number-theory") return runNumberTheory(inputs ?? {});
  if (toolId === "mod-reference") return runModReference();
  throw new Error(`Unknown tool: ${toolId}`);
}

export function runCommand(commandId: string): PluginCommandAction {
  if (commandId === "open") {
    return { type: "open_tool", plugin_id: "math-bitwise" };
  }
  return { type: "none" };
}
