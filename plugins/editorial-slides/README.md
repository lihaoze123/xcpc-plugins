# Editorial Slides (`editorial-slides`)

XCPC Workstation 官方纯模板插件（`capabilities = ["template"]`，零 JS、无需信任弹窗），提供基于 **Touying `0.8.0`** 的经典 **Beamer Warsaw** 风格题解演示文稿模板 `plugin:editorial-slides/warsaw`，并内置 **`pinit`**、**`mannot`** 与 **`CeTZ`** 语义封装，展示 Typst 在算法题解演示中相对传统 Beamer 的独特优势。

## 特性亮点

- **经典 Beamer Warsaw 版式复刻**：采用 XCPC Workstation 品牌主色深鸭青蓝 `#0B6989`（可在 `#let schema` 中自由更换），包含圆角阴影标题卡、左蓝右黑渐变顶栏 + 底部软投影、3D 球形列表圆点、带柔和过渡的圆角阴影 `block`、50/50 黑蓝分栏底栏与 `Thanks!` 结束页。
- **零改造兼容普通 `editorial.md`**：每道题自动开启新章节，每个 `## 二级标题` 自动切分新页面，`> 引用块` 自动渲染为 Warsaw 阴影卡片。
- **独立题解模板**：在比赛或工作区中设置 `editorial-template = "plugin:editorial-slides/warsaw"`，试题册保持 A4 出版版式，题解自动输出演示文稿；比赛冻结时插件模板与资源会一并归档进快照，完全离线可复现。
- **Typst 进阶能力开箱即用**：在 `editorial.md` 的 ```` ```typst ```` 块中可直接调用 Touying 分步动画、`pinit` 锚点高亮/标注/连线、`mannot` 公式拆解与 `CeTZ` 算法矢量图。

## 快速使用

### 1. 安装或开发链接

```bash
# 本地开发链接
xcpc plugin link /path/to/plugins/editorial-slides
```

### 2. 在工作区或比赛中启用

在 `contest.toml` 或 `workspace.toml` 中配置：

```toml
editorial-template = "plugin:editorial-slides/warsaw"

[template-options."plugin:editorial-slides/warsaw"]
aspect-ratio = "16-9"     # 或 "4-3"
accent-color = "#0B6989"
handout = false           # true 时折叠所有 #pause / #uncover 分步动画
show-slide-number = true
show-headline = false
show-thanks = true
```

或在命令行临时指定：

```bash
xcpc -w ./examples build contest showcase --editorial --template plugin:editorial-slides/warsaw
```

## 模板导出宏参考（在 `editorial.md` 的 ```` ```typst ```` 块中直接可用）

### 语义块与版式

| 宏 | 说明 |
| :--- | :--- |
| `#slide-block(title: "题意")[...]` | Warsaw 风格主色圆角阴影块（别名 `#info-block`） |
| `#alert-block(title: "注意")[...]` | 警示红（`#B91C1C`）圆角阴影块 |
| `#example-block(title: "示例")[...]` | 翠绿（`#15803D`）圆角阴影块 |
| `#two-col(ratio: (1fr, 1fr), align: horizon)[左][右]` | 两栏并排布局（默认垂直居中对齐） |
| `#complexity($cal(O)(n)$, $cal(O)(n)$)` | 纯排印时间 / 空间复杂度总结（自动中英本地化） |
| `#slide-break(subtitle: none)` | 显式换新页（保留当前题名顶栏） |

### Touying 分步动画

直接可用：`#pause`、`#meanwhile`、`#only("2-")[...]`、`#uncover("2-")[...]`、`#step-only("2-")[...]`、`#alternatives[...][...]`、`#handout-only[...]`、`#slides-only[...]`。开启 `handout = true` 后自动折叠为最终状态。

### `pinit` 学术细线标注封装

- 原生导出：`pin`、`pinit-highlight`、`pinit-point-from`、`pinit-point-to`、`pinit-arrow`、`pinit-rect`、`pinit-line`
- 主题色封装：
  - `#hl(start, end, tone: "primary" | "amber" | "red" | "green")`：圆角端点学术底线高亮（零方框杂讯，与 `mannot` 下划线视觉统一；可选 `wash: true` 叠加极淡底色）
  - `#callout(pin-id, offset-dx: ..., offset-dy: ..., tone: ...)[标注短语]`：学术细线标尺引出标注（无框彩色短语 + 极细矢量箭头）
  - `#link-pins(from, to, tone: ...)`：极细矢量状态转移 / 指针连线

### `mannot` 与 `CeTZ`

模板已直接导出 `mannot`（含 `annot`、`mark`、`markhl`、`markrect`、`markul`）、自动统一无衬线字体的 `#math-annot(<tag>, tone: ...)[...]` 以及 `cetz`，无需额外 `#import`。

## 示例工作区

本插件的 [`examples/`](./examples/) 目录包含一个 16:9 演示文稿双题示例工作区（`contests/showcase`，8 逻辑帧 / 19 动画页 / 10 讲义页）：
- **A. 树上信标（树形最大权独立集）**：展示 `mannot` 双道折线状态拆解、3 步 `CeTZ` 自底向上 DP 树动态推演、`pinit` 细线状态转移标注，以及非递归 BFS 实现与工程要点。
- **B. 序列分段代价（斜率优化与下凸包）**：展示 4 项分步 `pinit` 代数变形细线拆解、3 步 `CeTZ` 平面下凸包动态维护与最优切线动画、单调队列实现 + `mannot` 均摊复杂度拆解，以及现代三线表方法家族对比。
