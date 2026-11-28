```typst
#slide-block(title: "题意与模型抽象")[
  - 给定一棵 $n$ 个节点的树（点权 $w_u$），选出两两不相邻的点集 $S$，最大化总权 $sum_(u in S) w_u$。
  - 任选节点 $1$ 为根后，每棵子树 $T_u$ 的最优决策仅受根 $u$ 自身状态制约，即经典*树上最大权独立集*。
]

#v(2.0em)
#align(center, text(size: 1.22em, $
  "Ans" = max(
    markul(f_(1, 0), #<s0>, color: #rgb("#0B6989")),
    quad
    markul(f_(1, 1), #<s1>, color: #rgb("#B45309"))
  )
  #math-annot(<s0>, tone: "primary", pos: bottom + left, dx: -1.4em, dy: 0.9em, leader-connect: "elbow")[不点亮根节点 $1$ 时的子树最大权]
  #math-annot(<s1>, tone: "amber", pos: top + right, dx: 1.4em, dy: -0.8em, leader-connect: "elbow")[点亮根节点 $1$ 时的子树最大权]
$))
#v(2.9em)

#align(center, complexity($cal(O)(n)$, $cal(O)(n)$))
```

## 自底向上 DP 推演

```typst
#let dp-tree(stage) = {
  let coords = (
    "1": (3.9, 4.2),
    "2": (1.8, 2.8),
    "3": (6.0, 2.8),
    "4": (0.6, 1.3),
    "5": (3.0, 1.3),
    "6": (4.8, 1.3),
    "7": (7.2, 1.3),
    "8": (3.0, -0.2),
  )
  let edges = (("1","2"), ("1","3"), ("2","4"), ("2","5"), ("3","6"), ("3","7"), ("5","8"))
  let weights = ("1": 4, "2": 6, "3": 5, "4": 3, "5": 7, "6": 2, "7": 8, "8": 4)
  let dp-vals = (
    "4": $(0, 3)$, "8": $(0, 4)$, "6": $(0, 2)$, "7": $(0, 8)$,
    "5": $(4, 7)$, "2": $(10, 10)$, "3": $(10, 5)$, "1": $(20, 24)$,
  )
  let stage-of = ("4": 1, "8": 1, "6": 1, "7": 1, "5": 2, "2": 2, "3": 2, "1": 3)
  let chosen = ("1", "4", "5", "6", "7")

  align(center, cetz.canvas(length: 0.88cm, {
    import cetz.draw: *
    for (u, v) in edges {
      let active = stage >= stage-of.at(u)
      line(
        coords.at(u),
        coords.at(v),
        stroke: (
          paint: if active { rgb("#0B6989") } else { rgb("#CBD5E1") },
          thickness: if active { 1.25pt } else { 0.85pt },
        ),
      )
    }
    for (id, pos) in coords.pairs() {
      let st = stage-of.at(id)
      let done = stage >= st
      let cur = st == stage
      let lit = stage >= 3 and id in chosen
      let fill-c = if lit {
        rgb("#0B6989")
      } else if cur {
        rgb("#FEF3C7")
      } else if done {
        rgb("#EBF5F8")
      } else {
        white
      }
      let stroke-c = if lit {
        rgb("#09546D")
      } else if cur {
        rgb("#B45309")
      } else if done {
        rgb("#0B6989")
      } else {
        rgb("#94A3B8")
      }
      let txt-c = if lit { white } else { rgb("#111827") }
      circle(pos, radius: 0.35, fill: fill-c, stroke: 1.15pt + stroke-c)
      content(pos, text(size: 0.78em, weight: "bold", fill: txt-c, id))

      let (badge-pos, align-dir) = if id == "6" {
        ((pos.at(0), pos.at(1) - 0.56), "north")
      } else if id in ("2", "4", "5") {
        ((pos.at(0) - 0.5, pos.at(1)), "east")
      } else {
        ((pos.at(0) + 0.5, pos.at(1)), "west")
      }

      if done {
        let val-col = if lit { rgb("#0B6989") } else if cur { rgb("#B45309") } else { rgb("#475569") }
        content(
          badge-pos,
          anchor: align-dir,
          text(size: 0.68em, fill: val-col, weight: if lit or cur { "bold" } else { "regular" }, dp-vals.at(id)),
        )
      } else {
        content(
          badge-pos,
          anchor: align-dir,
          text(size: 0.64em, fill: rgb("#94A3B8"))[$w=#weights.at(id)$],
        )
      }
    }
  }))
}

#let trace-card(stage) = example-block(title: [样例 1 推演 · 节点标注 $(f_0, f_1)$])[
  - *叶子初始化*：节点 $4, 6, 7, 8$ 直接置为 $(0, 3), (0, 2), (0, 8), (0, 4)$。
  #if stage >= 2 [
    - *子树向上合并*：节点 $5$ 得 $(4, 7)$；节点 $2$ 得 $(10, 10)$；节点 $3$ 得 $(10, 5)$。
  ]
  #if stage >= 3 [
    - *根部结算最优*：根 $1$ 得 $f_(1,1) = 4 + 10 + 10 = 24$，对应高亮独立集 ${1, 4, 5, 6, 7}$。
  ]
]

#two-col(ratio: (1.28fr, 1fr), gutter: 1.6em, align: horizon)[
  #step-only("1")[#dp-tree(1)]
  #step-only("2")[#dp-tree(2)]
  #step-only("3-")[#dp-tree(3)]
][
  #step-only("1")[#trace-card(1)]
  #step-only("2")[#trace-card(2)]
  #step-only("3-")[#trace-card(3)]
]
```

## 状态转移方程与细线拆解

```typst
#v(2.6em)
#align(center, text(size: 1.24em, $
  f_(u, 0) = sum_(v in "son"(u)) #pin(1) max(f_(v, 0), f_(v, 1)) #pin(2),
  quad
  f_(u, 1) = #pin(3) w_u #pin(4) + sum_(v in "son"(u)) #pin(5) f_(v, 0) #pin(6)
$))
#v(2.8em)

#uncover("2-")[
  #hl(1, 2, tone: "primary")
  #callout(1, offset-dx: -0.2em, offset-dy: -2.4em, pin-dx: 2.2em, pin-dy: -0.95em, tone: "primary")[$u$ 不亮：各子树自由取更优态]
]

#uncover("3-")[
  #hl(3, 4, tone: "amber")
  #callout(3, offset-dx: -3.2em, offset-dy: 2.15em, pin-dx: 0.55em, pin-dy: 0.65em, tone: "amber")[点亮 $u$ 获得的直接点权收益]
]

#uncover("4-")[
  #hl(5, 6, tone: "green")
  #callout(5, offset-dx: -4.2em, offset-dy: -2.4em, pin-dx: 0.8em, pin-dy: -0.95em, tone: "green")[相邻互斥：所有子节点强制不选]
]

#pause
- 各子节点 $v$ 的子树两两不相交，状态合并满足严格无后效性，单次遍历即可求解。
- 按任意*逆拓扑序*（如 BFS 序倒扫）自底向上更新，即可彻底消除递归调用栈开销。
```

## 非递归实现与工程要点

```typst
#two-col(ratio: (1.38fr, 1fr), gutter: 1.8em, align: horizon)[
```

```cpp
vector<int> parent(n + 1, 0), order = {1};
for (int i = 0; i < n; ++i) {
    int u = order[i];
    for (int v : adj[u]) if (v != parent[u]) {
        parent[v] = u;
        order.push_back(v);
    }
}
vector<long long> f0(n + 1, 0), f1(n + 1, 0);
for (int i = n - 1; i >= 0; --i) {
    int u = order[i];
    f1[u] = w[u];
    for (int v : adj[u]) if (v != parent[u]) {
        f0[u] += max(f0[v], f1[v]);
        f1[u] += f0[v];
    }
}
cout << max(f0[1], f1[1]) << '\n';
```

```typst
][
  #alert-block(title: "工程要点")[
    - *64 位防溢出*：$n <= 2 times 10^5$ 且 $w_u <= 10^9$，总点权可达 $2 times 10^14$，状态数组必须使用 `long long`。
    - *链状树防爆栈*：倒扫 BFS 序替代递归 DFS，在 $n = 2 times 10^5$ 的退化链上稳定零爆栈。
  ]
  #complexity($cal(O)(n)$, $cal(O)(n)$)
]
```
