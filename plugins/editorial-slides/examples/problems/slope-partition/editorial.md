```typst
#slide-block(title: "朴素转移与代数化简")[
  - 记前缀和 $S_i = sum_(k=1)^i a_k$（由于 $a_i > 0$，$S_i$ 严格单调递增），朴素转移为 $"dp"_i = min_(0 <= j < i) ("dp"_j + (S_i - S_j)^2 + C)$，直接计算复杂度为 $cal(O)(n^2)$。
  - 将平方项展开并按「仅含 $j$」「$i, j$ 乘积」「仅含 $i$」重排为一次函数截距形式：
]

#v(2.6em)
#align(center, text(size: 1.24em, $
  #pin(21) "dp"_j + S_j^2 #pin(22)
  med = med
  #pin(23) 2 S_i #pin(24) dot #pin(25) S_j #pin(26)
  med + med
  #pin(27) ("dp"_i - S_i^2 - C) #pin(28)
$))
#v(2.8em)

#uncover("2-")[
  #hl(21, 22, tone: "primary")
  #callout(21, offset-dx: -0.2em, offset-dy: -2.4em, pin-dx: 1.8em, pin-dy: -0.95em, tone: "primary")[决策点纵坐标 $y(j)$]
  #hl(25, 26, tone: "green")
  #callout(25, offset-dx: -0.6em, offset-dy: -2.4em, pin-dx: 0.45em, pin-dy: -0.95em, tone: "green")[决策点横坐标 $x(j)$]
]

#uncover("3-")[
  #hl(23, 24, tone: "amber")
  #callout(23, offset-dx: -3.2em, offset-dy: 2.15em, pin-dx: 0.75em, pin-dy: 0.65em, tone: "amber")[单调递增斜率 $k(i)$]
  #hl(27, 28, tone: "red")
  #callout(27, offset-dx: 0.3em, offset-dy: 2.15em, pin-dx: 2.3em, pin-dy: 0.65em, tone: "red")[截距 $b(i)$：最小化目标]
]
```

## 几何意义与下凸包动态维护

```typst
#let cht-fig(stage) = {
  align(center, cetz.canvas(length: 0.96cm, {
    import cetz.draw: *
    // Subtle coordinate grid
    grid((0, 0), (6.4, 4.8), step: 1, stroke: 0.35pt + rgb("#E2E8F0"))
    // Axes
    line((-0.25, 0), (6.75, 0), stroke: 0.9pt + rgb("#475569"), mark: (end: ">", fill: rgb("#475569"), scale: 0.5))
    line((0, -0.25), (0, 5.15), stroke: 0.9pt + rgb("#475569"), mark: (end: ">", fill: rgb("#475569"), scale: 0.5))
    content((6.85, -0.22), text(size: 0.72em, fill: rgb("#475569"))[$x(j) = S_j$])
    content((0.0, 5.38), text(size: 0.72em, fill: rgb("#475569"))[$y(j) = "dp"_j + S_j^2$])

    let p1 = (1.2, 1.05)
    let p2 = (2.8, 1.65)
    let p3 = (4.2, 3.25) // concave point once p4 arrives
    let p4 = (5.7, 3.65)

    // Stage 1: initial hull p1 -> p2 -> p3
    if stage == 1 {
      line(p1, p2, p3, stroke: 1.6pt + rgb("#0B6989"))
      for (pt, lbl, off, anc) in (
        (p1, $P_1$, (0, -0.34), "north"),
        (p2, $P_2$, (0.18, -0.32), "north-west"),
        (p3, $P_3$, (-0.15, 0.28), "south-east"),
      ) {
        circle(pt, radius: 0.12, fill: rgb("#0B6989"), stroke: white + 0.9pt)
        content((pt.at(0) + off.at(0), pt.at(1) + off.at(1)), anchor: anc, text(size: 0.74em, weight: "bold", fill: rgb("#09546D"), lbl))
      }
      content((0.35, 4.42), anchor: "west", text(size: 0.7em, fill: rgb("#475569"))[队内斜率递增：$"slope"(P_1, P_2) < "slope"(P_2, P_3)$])
    }

    // Stage 2: p4 arrives, p3 popped from tail
    if stage == 2 {
      line(p1, p2, stroke: 1.5pt + rgb("#0B6989"))
      line(p2, p3, stroke: (paint: rgb("#B91C1C"), thickness: 1.0pt, dash: "densely-dashed"))
      line(p3, p4, stroke: (paint: rgb("#CBD5E1"), thickness: 0.9pt, dash: "dotted"))
      line(p2, p4, stroke: 1.8pt + rgb("#B45309"))

      circle(p1, radius: 0.12, fill: rgb("#0B6989"), stroke: white + 0.9pt)
      circle(p2, radius: 0.12, fill: rgb("#0B6989"), stroke: white + 0.9pt)
      circle(p3, radius: 0.13, fill: rgb("#FEF2F2"), stroke: 1.1pt + rgb("#B91C1C"))
      circle(p4, radius: 0.13, fill: rgb("#B45309"), stroke: white + 0.9pt)

      content((1.2, 0.7), anchor: "north", text(size: 0.74em, weight: "bold", fill: rgb("#09546D"))[$P_1$])
      content((2.95, 1.32), anchor: "north-west", text(size: 0.74em, weight: "bold", fill: rgb("#09546D"))[$P_2$])
      content((4.05, 3.55), anchor: "south-east", text(size: 0.72em, weight: "bold", fill: rgb("#B91C1C"))[$P_3$（队尾弹出）])
      content((5.7, 3.95), anchor: "south", text(size: 0.74em, weight: "bold", fill: rgb("#B45309"))[$P_4$（新点入队）])
    }

    // Stage 3: query tangent of slope k(i) = 0.48 pops obsolete P1 and hits optimal P2
    if stage == 3 {
      line(p1, p2, stroke: (paint: rgb("#94A3B8"), thickness: 1.0pt, dash: "densely-dashed"))
      line(p2, p4, stroke: 1.7pt + rgb("#0B6989"))

      // Optimal tangent line through P2(2.8, 1.65) with slope 0.48 -> (0, 0.306) to (6.2, 3.282)
      line((0, 0.306), (6.2, 3.282), stroke: 1.5pt + rgb("#15803D"))
      circle((0, 0.306), radius: 0.09, fill: rgb("#15803D"), stroke: none)
      content((-0.18, 0.31), anchor: "east", text(size: 0.68em, weight: "bold", fill: rgb("#15803D"))[$min b(i)$])

      // Halo around optimal tangent vertex P2
      circle(p2, radius: 0.28, fill: rgb("#15803D").transparentize(82%), stroke: 1.1pt + rgb("#15803D"))
      circle(p1, radius: 0.12, fill: rgb("#F1F5F9"), stroke: 1.0pt + rgb("#94A3B8"))
      circle(p2, radius: 0.13, fill: rgb("#15803D"), stroke: white + 0.9pt)
      circle(p4, radius: 0.12, fill: rgb("#0B6989"), stroke: white + 0.9pt)

      line((1.2, 1.22), (1.2, 1.95), stroke: (paint: rgb("#94A3B8"), thickness: 0.65pt, dash: "densely-dotted"))
      content((0.35, 2.02), anchor: "south-west", text(size: 0.68em, fill: rgb("#64748B"))[$P_1$（队头弹出）])
      content((2.98, 1.25), anchor: "north-west", text(size: 0.74em, weight: "bold", fill: rgb("#15803D"))[$P_2 = j^*$（最优切点）])
      content((5.7, 3.95), anchor: "south", text(size: 0.74em, weight: "bold", fill: rgb("#09546D"))[$P_4$])
      content((5.15, 2.52), anchor: "north-west", text(size: 0.72em, weight: "bold", fill: rgb("#15803D"))[斜率 $k(i)$])
    }
  }))
}

#let cht-card(stage) = example-block(title: "单调队列 3 步维护不变量")[
  - *下凸壳维护*：保留斜率严格递增的决策点，内凹点永远不可能成为任何切线的切点。
  #if stage >= 2 [
    - *队尾弹非凸*：新点 $P_4$ 入队前，若 $"slope"(P_2, P_3) >= "slope"(P_2, P_4)$，弹出队尾 $P_3$。
  ]
  #if stage >= 3 [
    - *队头弹过时*：斜率 $k(i)$ 递增，若 $"slope"(P_1, P_2) <= k(i)$，则 $P_1$ 永久劣于 $P_2$，直接出队；队头即为最优 $j^*$。
  ]
]

#two-col(ratio: (1.32fr, 1fr), gutter: 1.6em, align: horizon)[
  #step-only("1")[#cht-fig(1)]
  #step-only("2")[#cht-fig(2)]
  #step-only("3-")[#cht-fig(3)]
][
  #step-only("1")[#cht-card(1)]
  #step-only("2")[#cht-card(2)]
  #step-only("3-")[#cht-card(3)]
]
```

## 单调队列实现与均摊复杂度

```typst
#two-col(ratio: (1.38fr, 1fr), gutter: 1.6em, align: horizon)[
```

```cpp
auto bad_head = [&](int a, int b, long long k) {
    return (__int128)(Y(b) - Y(a)) <= (__int128)k * (X(b) - X(a));
};
auto bad_tail = [&](int a, int b, int c) {
    return (__int128)(Y(b) - Y(a)) * (X(c) - X(b))
        >= (__int128)(Y(c) - Y(b)) * (X(b) - X(a));
};
for (int i = 1; i <= n; ++i) {
    while (h + 1 < t && bad_head(q[h], q[h + 1], 2 * S[i]))
        ++h;
    int j = q[h];
    dp[i] = dp[j] + (S[i] - S[j]) * (S[i] - S[j]) + C;
    while (h + 1 < t && bad_tail(q[t - 2], q[t - 1], i))
        --t;
    q[t++] = i;
}
```

```typst
][
  #example-block(title: "均摊复杂度拆解")[
    #v(1.2em)
    #align(center, $
      T(n) = markul(n dot cal(O)(1), #<in>, color: #rgb("#0B6989"))
      + markul(n dot cal(O)(1), #<out>, color: #rgb("#B45309"))
      = cal(O)(n)
      #math-annot(<in>, tone: "primary", pos: bottom, dy: 0.7em)[每点入队一次]
      #math-annot(<out>, tone: "amber", pos: top, dy: -0.65em)[至多出队一次]
    $)
    #v(1.4em)
  ]
  #alert-block(title: "精度与溢出警示")[
    - *去浮点误差*：将斜率不等式交叉相乘为整数叉积比较，彻底避免 `double` 精度丢失。
    - *防中间溢出*：坐标差乘积可达 $10^22$，叉积两项须强转为 `__int128`。
  ]
]
```

## 斜率优化家族方法对比

```typst
#align(center, table(
  columns: (0.85fr, 0.85fr, 2.05fr, 0.85fr),
  align: (left, left, left, center),
  [*横坐标 $x(j)$*], [*查询斜率 $k(i)$*], [*推荐维护结构*], [*时间复杂度*],
  [单调递增], [单调递增], [*单调队列*（队头查询 + 队尾维凸）], [$cal(O)(n)$],
  [单调递增], [无单调性], [*单调栈 + 凸包二分*（斜率二分切点）], [$cal(O)(n log n)$],
  [无单调性], [无单调性], [*李超线段树* / *CDQ 分治* / 动态凸包], [$cal(O)(n log n)$],
  table.hline(stroke: 1.1pt + rgb("#0B6989")),
))

#v(0.5em)
#slide-block(title: "赛场识别口诀")[
  - 状态转移中出现*关于 $i$ 与 $j$ 的交叉乘积项* $k(i) dot x(j)$ 时，立即考虑改写为 $y(j) = k(i) x(j) + b(i)$ 线性规划视角。
  - 先检查 $x(j)$ 与 $k(i)$ 是否单调，按上表直接选用最轻量的维护结构，避免过度设计。
]
```
