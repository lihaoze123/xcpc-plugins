import {
  computed,
  copyText,
  h,
  signal,
  storage,
  toast,
  token,
  ui,
  useTool,
} from "@xcpc/plugin-sdk/ui";

const MASK64 = (1n << 64n) - 1n;
const SIGN64 = 1n << 63n;

const TAB_ITEMS = [
  { value: "bits", label: "位运算", testID: "math-tab-bits" },
  { value: "nt", label: "数论计算", testID: "math-tab-nt" },
  { value: "mods", label: "常用模数", testID: "math-tab-mods" },
] as const;

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

export function render() {
  const savedTab = storage.get<string>("activeTab") ?? "bits";
  const savedRaw = storage.get<string>("bitRaw") ?? "998244353";
  let initialBig = 998244353n;
  try {
    initialBig = parseBig(savedRaw) & MASK64;
  } catch {
    initialBig = 998244353n;
  }

  const activeTab = signal<string>(savedTab);
  const bitValue = signal<bigint>(initialBig);
  const rawInput = signal<string>(savedRaw);
  const parseError = signal<string>("");

  const ntN = signal<string>(storage.get<string>("ntN") ?? "998244353");
  const ntA = signal<string>(storage.get<string>("ntA") ?? "3");
  const ntB = signal<string>(storage.get<string>("ntB") ?? "998244351");
  const ntMod = signal<string>(storage.get<string>("ntMod") ?? "998244353");
  const ntCrt = signal<string>(storage.get<string>("ntCrt") ?? "2 3; 3 5; 2 7");

  const ntTool = useTool(
    "number-theory",
    () => ({
      n: ntN(),
      a: ntA(),
      b: ntB(),
      mod: ntMod(),
      crt: ntCrt(),
    }),
    { debounceMs: 120, enabled: () => activeTab() === "nt" },
  );

  const modTool = useTool("mod-reference", () => ({}), {
    debounceMs: 0,
    enabled: () => activeTab() === "mods",
  });

  const setU64 = (v: bigint) => {
    const u = v & MASK64;
    bitValue.set(u);
    const nextStr = u.toString();
    rawInput.set(nextStr);
    storage.set("bitRaw", nextStr);
    parseError.set("");
  };

  const flipBit = (bitIdx: number) => {
    setU64(bitValue() ^ (1n << BigInt(bitIdx)));
  };

  const bitStats = computed(() => {
    const u = bitValue();
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
      popcount: pop,
      clz,
      ctz,
      lowbit: lowbit.toString(),
    };
  });

  const renderBitGroup = (g: number) => {
    const hi = g * 8 + 7;
    const lo = g * 8;
    const indices: number[] = [];
    for (let b = hi; b >= lo; b--) indices.push(b);

    return (
      <ui.Col
        testID={`math-bit-group-${g}`}
        gap={5}
        style={{
          flex: 1,
          minWidth: 0,
          padding: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: token("border"),
          backgroundColor: token("muted"),
        }}
      >
        <ui.Text
          style={{
            fontSize: 10.5,
            color: token("muted-foreground"),
            fontVariant: ["tabular-nums"],
          }}
        >
          {`位 ${hi}–${lo}`}
        </ui.Text>
        <ui.Row gap={4}>
          {indices.map((bitIndex) => {
            const isOn = () => ((bitValue() >> BigInt(bitIndex)) & 1n) === 1n;
            return (
              <ui.View
                testID={`math-bit-${bitIndex}`}
                onPress={() => flipBit(bitIndex)}
                style={() => ({
                  flex: 1,
                  minWidth: 0,
                  height: 36,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: isOn() ? token("primary") : token("border"),
                  backgroundColor: isOn() ? token("primary") : token("card"),
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                })}
              >
                <ui.Text
                  style={() => ({
                    fontSize: 12.5,
                    fontWeight: "600",
                    fontFamily: "JetBrains Mono, monospace",
                    fontVariant: ["tabular-nums"],
                    color: isOn() ? token("primary-foreground") : token("foreground"),
                  })}
                >
                  {() => (isOn() ? "1" : "0")}
                </ui.Text>
                <ui.Text
                  style={() => ({
                    fontSize: 9,
                    fontFamily: "JetBrains Mono, monospace",
                    fontVariant: ["tabular-nums"],
                    color: isOn() ? token("primary-foreground") : token("muted-foreground"),
                  })}
                >
                  {String(bitIndex)}
                </ui.Text>
              </ui.View>
            );
          })}
        </ui.Row>
      </ui.Col>
    );
  };

  const renderBitsTab = () => {
    const statRows: Array<[string, () => string]> = [
      ["无符号 u64", () => bitStats().u64],
      ["有符号 i64", () => bitStats().i64],
      ["十六进制", () => bitStats().hex],
      ["八进制", () => bitStats().oct],
      [
        "1 的个数 / 前导零 / 尾随零",
        () => `${bitStats().popcount} / ${bitStats().clz} / ${bitStats().ctz}`,
      ],
      ["最低位 1（x & -x）", () => bitStats().lowbit],
    ];

    return (
      <ui.Col testID="math-panel-bits" gap={12} style={{ position: "relative" }}>
        <ui.Col gap={4}>
          <ui.Row gap={8} align="center">
            <ui.Input
              testID="math-bit-input"
              value={rawInput}
              placeholder="输入十进制 / 0x十六进制 / 0b二进制 / 负数"
              onChangeText={(txt) => {
                rawInput.set(txt);
                storage.set("bitRaw", txt);
                try {
                  bitValue.set(parseBig(txt) & MASK64);
                  parseError.set("");
                } catch (e) {
                  parseError.set(e instanceof Error ? e.message : String(e));
                }
              }}
              style={{ flex: 1, minWidth: 180, fontFamily: "JetBrains Mono, monospace" }}
            />
            <ui.Button testID="math-bit-clear" variant="outline" size="sm" onPress={() => setU64(0n)}>
              清零
            </ui.Button>
            <ui.Button
              testID="math-bit-not"
              variant="outline"
              size="sm"
              onPress={() => setU64(~bitValue())}
            >
              取反 ~x
            </ui.Button>
            <ui.Button
              testID="math-bit-copy-hex"
              variant="outline"
              size="sm"
              onPress={() => {
                const hex = bitStats().hex;
                void copyText(hex);
                toast(`已复制 ${hex}`);
              }}
            >
              复制十六进制
            </ui.Button>
            <ui.Menu
              align="end"
              minWidth={130}
              items={[
                { id: "all-ones", label: "全 1 (~0)" },
                { id: "shl", label: "左移 << 1" },
                { id: "shr", label: "右移 >> 1" },
              ]}
              onSelect={(id) => {
                if (id === "all-ones") setU64(MASK64);
                else if (id === "shl") setU64(bitValue() << 1n);
                else if (id === "shr") setU64(bitValue() >> 1n);
              }}
              trigger={
                <ui.Button
                  testID="math-bit-more"
                  variant="outline"
                  size="sm"
                  icon="ellipsis"
                  tooltip="更多位运算"
                />
              }
            />
          </ui.Row>
          <ui.View style={{ height: 18, justifyContent: "center" }}>
            <ui.Text style={{ fontSize: 12, lineHeight: 16, color: token("destructive") }}>
              {() => parseError() || ""}
            </ui.Text>
          </ui.View>
        </ui.Col>

        <ui.Col testID="math-bit-grid" gap={8} style={{ width: "100%" }}>
          {[0, 1, 2, 3].map((r) => (
            <ui.Row gap={8} style={{ width: "100%" }}>
              {renderBitGroup(7 - r * 2)}
              {renderBitGroup(6 - r * 2)}
            </ui.Row>
          ))}
        </ui.Col>

        <ui.Card style={{ gap: 6 }}>
          {statRows.map(([k, getVal]) => (
            <ui.Row justify="space-between" gap={12}>
              <ui.Text style={{ fontSize: 12, color: token("muted-foreground") }}>{k}</ui.Text>
              <ui.Text
                style={{
                  fontSize: 12.5,
                  fontFamily: "JetBrains Mono, monospace",
                  fontVariant: ["tabular-nums"],
                  color: token("foreground"),
                }}
              >
                {getVal}
              </ui.Text>
            </ui.Row>
          ))}
        </ui.Card>
      </ui.Col>
    );
  };

  const renderNumberTheoryTab = () => (
    <ui.Col testID="math-panel-nt" gap={12}>
      <ui.Card style={{ gap: 10 }}>
        <ui.Row wrap gap={8}>
          <ui.Col gap={4} style={{ flex: 1, minWidth: 150 }}>
            <ui.Text style={{ fontSize: 11.5, color: token("muted-foreground") }}>
              整数 n（分解 / φ(n)）
            </ui.Text>
            <ui.Input
              value={ntN}
              onChangeText={(v) => {
                ntN.set(v);
                storage.set("ntN", v);
              }}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            />
          </ui.Col>
          <ui.Col gap={4} style={{ flex: 1, minWidth: 110 }}>
            <ui.Text style={{ fontSize: 11.5, color: token("muted-foreground") }}>参数 a</ui.Text>
            <ui.Input
              value={ntA}
              onChangeText={(v) => {
                ntA.set(v);
                storage.set("ntA", v);
              }}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            />
          </ui.Col>
          <ui.Col gap={4} style={{ flex: 1, minWidth: 110 }}>
            <ui.Text style={{ fontSize: 11.5, color: token("muted-foreground") }}>参数 b</ui.Text>
            <ui.Input
              value={ntB}
              onChangeText={(v) => {
                ntB.set(v);
                storage.set("ntB", v);
              }}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            />
          </ui.Col>
          <ui.Col gap={4} style={{ flex: 1, minWidth: 130 }}>
            <ui.Text style={{ fontSize: 11.5, color: token("muted-foreground") }}>模数 m</ui.Text>
            <ui.Input
              value={ntMod}
              onChangeText={(v) => {
                ntMod.set(v);
                storage.set("ntMod", v);
              }}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            />
          </ui.Col>
        </ui.Row>
        <ui.Col gap={4}>
          <ui.Text style={{ fontSize: 11.5, color: token("muted-foreground") }}>
            同余方程组（分号分隔，每组 r m）
          </ui.Text>
          <ui.Input
            value={ntCrt}
            onChangeText={(v) => {
              ntCrt.set(v);
              storage.set("ntCrt", v);
            }}
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          />
        </ui.Col>
      </ui.Card>

      <ui.If when={() => Boolean(ntTool.error())}>
        {() => (
          <ui.Text style={{ fontSize: 12, color: token("destructive") }}>
            {() => ntTool.error() ?? ""}
          </ui.Text>
        )}
      </ui.If>

      <ui.If when={() => Boolean(ntTool.data())}>
        {() => <ui.Output blocks={() => ntTool.data()?.blocks ?? []} />}
      </ui.If>
    </ui.Col>
  );

  const renderModTab = () => (
    <ui.Col testID="math-panel-mods" gap={12}>
      <ui.If when={() => Boolean(modTool.data())}>
        {() => <ui.Output blocks={() => modTool.data()?.blocks ?? []} />}
      </ui.If>
    </ui.Col>
  );

  return (
    <ui.Col
      style={{
        flex: 1,
        padding: 16,
        gap: 12,
        minHeight: 0,
        backgroundColor: token("background"),
      }}
    >
      <ui.Row align="center">
        <ui.Segmented
          items={TAB_ITEMS}
          value={activeTab}
          itemWidth={86}
          onChange={(tab) => {
            activeTab.set(tab);
            storage.set("activeTab", tab);
          }}
        />
      </ui.Row>
      <ui.Scroll style={{ flex: 1, minHeight: 0 }}>
        <ui.If when={() => activeTab() === "bits"}>{() => renderBitsTab()}</ui.If>
        <ui.If when={() => activeTab() === "nt"}>{() => renderNumberTheoryTab()}</ui.If>
        <ui.If when={() => activeTab() === "mods"}>{() => renderModTab()}</ui.If>
      </ui.Scroll>
    </ui.Col>
  );
}
