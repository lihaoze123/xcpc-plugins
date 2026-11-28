// Beamer Warsaw Editorial Presentation Template for XCPC Workstation.
// Built on Touying 0.8 + pinit 0.2 + mannot 0.4 + CeTZ 0.5.
// Classic Beamer Warsaw skeleton with refined publication typography & Deep Petrol Teal-Blue (#0B6989).

#import "@preview/touying:0.8.0": *
#import "@preview/pinit:0.2.2": *
#import "@preview/mannot:0.4.0" as mannot
#import "@preview/mannot:0.4.0": annot, mark, markhl, markrect, markul
#import "@preview/cetz:0.5.3" as cetz
#import "/xcpc/fonts.typ": cjk-fangsong, cjk-hei, cjk-song, lm-roman-10, lm-sans-10

// ---- Declarative Template Schema ------------------------------------------------------

#let schema = (
  kind: "editorial",
  name: (zh: "Beamer Warsaw 题解演示文稿", en: "Beamer Warsaw Editorial Slides"),
  description: (
    zh: "经典 Beamer Warsaw 骨架与出版级现代精修，基于 Touying 0.8，支持分步动画、细线 pinit 标注、mannot 公式拆解与 CeTZ 矢量图解",
    en: "Classic Beamer Warsaw skeleton with refined publication typography powered by Touying 0.8, hairline pinit annotations, mannot breakdowns, and CeTZ figures",
  ),
  groups: (
    (id: "presentation", label: (zh: "演示与主题", en: "Presentation & Theme")),
    (id: "chrome", label: (zh: "封面、顶栏与尾页", en: "Cover, Chrome & Closing")),
    (id: "typography", label: (zh: "字号与字体", en: "Typography")),
  ),
  fields: (
    (
      key: "aspect-ratio",
      label: (zh: "画幅比例", en: "Aspect Ratio"),
      type: "enum",
      scope: "book",
      group: "presentation",
      default: "16-9",
      choices: (
        (value: "16-9", label: (zh: "16:9 宽屏", en: "16:9 Widescreen")),
        (value: "4-3", label: (zh: "4:3 经典", en: "4:3 Classic")),
      ),
    ),
    (
      key: "accent-color",
      label: (zh: "主题强调色", en: "Accent Color"),
      description: (
        zh: "用于标题卡片、顶栏渐变、底栏与块标题；默认采用工作站品牌深鸭青蓝",
        en: "Used for the title card, frametitle gradient, footline, and block headers (defaults to Deep Petrol Teal-Blue)",
      ),
      type: "color",
      scope: "book",
      group: "presentation",
      default: "#0B6989",
    ),
    (
      key: "subtitle",
      label: (zh: "封面副标题", en: "Cover Subtitle"),
      description: (
        zh: "留空时中文默认「命题报告」，英文默认「Editorial」",
        en: "Leave empty to use \"命题报告\" (Chinese) or \"Editorial\" (English)",
      ),
      type: "string",
      scope: "book",
      group: "presentation",
      default: "",
      placeholder: (zh: "命题报告", en: "Editorial"),
    ),
    (
      key: "logo",
      label: (zh: "封面徽标", en: "Cover Logo"),
      description: (
        zh: "显示在首页标题卡上方，留空则不显示",
        en: "Displayed above the title card on the cover slide",
      ),
      type: "image",
      scope: "book",
      group: "presentation",
      default: "",
    ),
    (
      key: "handout",
      label: (zh: "讲义模式（折叠分步动画）", en: "Handout Mode (Collapse Reveals)"),
      description: (
        zh: "开启后将每页的 #pause / #uncover 分步动画折叠为最终帧，适合导出静态 PDF 讲义",
        en: "Collapses #pause and #uncover animations into the final subslide for static PDF sharing",
      ),
      type: "bool",
      scope: "book",
      group: "presentation",
      default: false,
    ),
    (
      key: "show-cover",
      label: (zh: "封面页", en: "Title Slide"),
      type: "enum",
      scope: "book",
      group: "chrome",
      default: "auto",
      choices: (
        (value: "auto", label: (zh: "自动（多题时显示）", en: "Auto (multi-problem)")),
        (value: "on", label: (zh: "总是显示", en: "Always")),
        (value: "off", label: (zh: "不显示", en: "Off")),
      ),
    ),
    (
      key: "show-headline",
      label: (zh: "显示顶栏章节导航条", en: "Show Top Section Headline"),
      description: (
        zh: "默认隐藏以保持经典简洁顶栏；开启后在顶栏上方显示题目章节进度条",
        en: "Hidden by default for a clean frametitle bar; enable to show the Warsaw section navigation bar",
      ),
      type: "bool",
      scope: "book",
      group: "chrome",
      default: false,
    ),
    (
      key: "show-slide-number",
      label: (zh: "底栏显示页码", en: "Show Slide Number"),
      type: "bool",
      scope: "book",
      group: "chrome",
      default: true,
    ),
    (
      key: "show-thanks",
      label: (zh: "显示结束页", en: "Show Closing Slide"),
      type: "bool",
      scope: "book",
      group: "chrome",
      default: true,
    ),
    (
      key: "thanks-text",
      label: (zh: "结束页文案", en: "Closing Text"),
      type: "string",
      scope: "book",
      group: "chrome",
      default: "Thanks!",
      placeholder: "Thanks!",
      when: (show-thanks: true),
    ),
    (
      key: "body-size",
      label: (zh: "正文字号", en: "Body Font Size"),
      type: "length",
      scope: "book",
      group: "typography",
      default: "16pt",
      presets: ("14pt", "15pt", "16pt", "18pt"),
      placeholder: "16pt",
    ),
    (
      key: "cjk-font",
      label: (zh: "中文字体", en: "CJK Font"),
      type: "font",
      scope: "book",
      group: "typography",
      default: "",
      placeholder: (zh: "默认（方正黑体 / 系统无衬线）", en: "Default (FZHei / System Sans)"),
    ),
  ),
)

// ---- Internal Utilities & Palette -----------------------------------------------------

/// Marker inspected by workspace `templates/preamble.typ` if dual-mode detection is used.
#let is-slide-template = true

#let _brand-primary = rgb("#0B6989")
#let _brand-dark = rgb("#111827")
#let _brand-muted = rgb("#52525B")
#let _brand-alert = rgb("#B91C1C")
#let _brand-example = rgb("#15803D")
#let _brand-amber = rgb("#B45309")

#let _accent-state = state("xcpc-warsaw-accent", _brand-primary)
#let _sans-font-state = state("xcpc-warsaw-sans-font", ((name: lm-sans-10, covers: "latin-in-cjk"), cjk-hei))
#let _is-zh-state = state("xcpc-warsaw-is-zh", true)

#let _parse-color(val, fallback) = {
  if type(val) == color { return val }
  if type(val) != str { return fallback }
  let s = val.trim()
  if s.match(regex("^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")) != none {
    rgb(s)
  } else {
    fallback
  }
}

#let _parse-len(s, fallback) = {
  if type(s) == length { return s }
  if type(s) != str { return fallback }
  let t = s.trim()
  if t == "" { return fallback }
  let m = t.match(regex("^([0-9]+(?:\\.[0-9]+)?)\\s*(pt|mm|cm|in|em)$"))
  if m == none { return fallback }
  let num = float(m.captures.at(0))
  let unit = m.captures.at(1)
  if unit == "pt" { num * 1pt }
  else if unit == "mm" { num * 1mm }
  else if unit == "cm" { num * 1cm }
  else if unit == "in" { num * 1in }
  else if unit == "em" { num * 1em }
  else { fallback }
}

#let _with-cjk(latin, cjk) = ((name: latin, covers: "latin-in-cjk"), cjk)

#let _tone-color(tone, accent) = {
  if type(tone) == color { tone }
  else if tone == "amber" or tone == "warning" { _brand-amber }
  else if tone == "red" or tone == "alert" or tone == "danger" { _brand-alert }
  else if tone == "green" or tone == "example" or tone == "success" { _brand-example }
  else if tone == "muted" or tone == "slate" { _brand-muted }
  else { accent }
}

// Soft layered elevation shadow replicating classic Beamer Warsaw cards without harsh edge bleed.
#let _shadow-frame(radius: 5pt, width: 100%, body) = {
  layout(avail => {
    let target-w = if type(width) == ratio {
      avail.width * width
    } else if type(width) == length {
      width
    } else {
      avail.width
    }
    let content-box = block(width: target-w, breakable: false, body)
    let sz = measure(content-box, width: target-w)
    block(width: sz.width, height: sz.height, breakable: false, {
      place(
        top + left,
        dx: 2.2pt,
        dy: 3.0pt,
        rect(width: sz.width, height: sz.height, radius: radius + 1.2pt, fill: black.transparentize(95%)),
      )
      place(
        top + left,
        dx: 1.4pt,
        dy: 1.9pt,
        rect(width: sz.width, height: sz.height, radius: radius + 0.6pt, fill: black.transparentize(91%)),
      )
      place(
        top + left,
        dx: 0.7pt,
        dy: 0.9pt,
        rect(width: sz.width, height: sz.height, radius: radius + 0.2pt, fill: black.transparentize(86%)),
      )
      content-box
    })
  })
}

// ---- Public Editorial & Warsaw Block Helpers ------------------------------------------

/// Classic Beamer Warsaw rounded shaded block with refined tint, subtle seam, and breathable spacing.
#let slide-block(title: none, color: auto, body) = context {
  let accent = if color == auto { _accent-state.get() } else { _tone-color(color, _accent-state.get()) }
  let body-tint = accent.lighten(94%)
  let border-tint = accent.lighten(76%)
  let seam-top = accent.darken(16%)
  v(0.45em, weak: true)
  _shadow-frame(radius: 5pt, width: 100%, {
    if title != none {
      grid(
        columns: 1,
        row-gutter: 0pt,
        block(
          width: 100%,
          fill: gradient.linear(accent.lighten(2%), accent.darken(4%), angle: 90deg),
          radius: (top: 5pt),
          inset: (x: 0.85em, top: 0.44em, bottom: 0.38em),
          text(fill: white, weight: "bold", size: 0.94em, tracking: 0.01em, title),
        ),
        rect(
          width: 100%,
          height: 2pt,
          fill: gradient.linear(seam-top, body-tint, angle: 90deg),
        ),
        block(
          width: 100%,
          fill: body-tint,
          stroke: (left: 0.5pt + border-tint, right: 0.5pt + border-tint, bottom: 0.5pt + border-tint),
          radius: (bottom: 5pt),
          inset: (x: 0.85em, top: 0.58em, bottom: 0.64em),
          body,
        ),
      )
    } else {
      block(
        width: 100%,
        fill: body-tint,
        stroke: 0.5pt + border-tint,
        radius: 5pt,
        inset: (x: 0.9em, y: 0.62em),
        body,
      )
    }
  })
  v(0.65em, weak: true)
}

/// Alias for `slide-block` using the active accent color.
#let info-block(title: none, body) = slide-block(title: title, color: auto, body)

/// Alert / pitfall / key-observation block in crimson (#B91C1C).
#let alert-block(title: none, body) = slide-block(title: title, color: _brand-alert, body)

/// Example / worked-trace / proof block in emerald (#15803D).
#let example-block(title: none, body) = slide-block(title: title, color: _brand-example, body)

/// Responsive two-column slide layout vertically centered by default for balanced composition.
#let two-col(ratio: (1fr, 1fr), gutter: 1.6em, align: horizon, left, right) = {
  grid(
    columns: ratio,
    column-gutter: gutter,
    align: align,
    left,
    right,
  )
}

/// Plain typographic complexity summary (no badges, no vertical bars, no pipe dividers).
#let complexity(..args) = context {
  let pos = args.pos()
  let named = args.named()
  let time = named.at("time", default: if pos.len() >= 1 { pos.at(0) } else { none })
  let space = named.at("space", default: if pos.len() >= 2 { pos.at(1) } else { none })
  let is-zh = _is-zh-state.get()
  v(0.5em, weak: true)
  text(size: 0.92em, fill: _brand-dark, {
    if is-zh {
      if time != none {
        [时间复杂度 #time]
        if space != none [，]
      }
      if space != none {
        [空间复杂度 #space]
      }
      [。]
    } else {
      if time != none {
        [Time #time]
        if space != none [, ]
      }
      if space != none {
        [Space #space]
      }
      [.]
    }
  })
  v(0.4em, weak: true)
}

/// Dual-mode step visibility helper: delegates to Touying `only` in slides.
#let step-only(spec, final: false, body) = only(spec, body)

/// Renders content only in slide mode.
#let slide-only(body) = body

/// Renders content only in A4 book mode (no-op in slide mode).
#let book-only(body) = none

/// Explicitly starts a new slide while keeping the current problem title in the Warsaw top bar.
#let slide-break(subtitle: none) = {
  if subtitle != none {
    heading(depth: 2, subtitle)
  } else {
    heading(depth: 2, [])
  }
}

// ---- Refined Hairline pinit & Unified-Font mannot Wrappers ----------------------------

/// Refined academic underline highlight spanning two `#pin(start)` .. `#pin(end)` markers.
/// Draws a crisp round-cap colored bottom rule with zero boxy rectangle clutter.
#let hl(
  start,
  end,
  tone: "primary",
  dx: -0.06em,
  dy: 0.46em,
  thickness: 1.55pt,
  wash: false,
) = context {
  let c = _tone-color(tone, _accent-state.get())
  if wash {
    pinit-highlight(
      start,
      end,
      fill: c.transparentize(92%),
      stroke: none,
      dx: -0.18em,
      dy: -0.92em,
      extended-width: 0.36em,
      extended-height: 1.36em,
      radius: 2pt,
    )
  }
  pinit-line(
    start,
    end,
    start-dx: dx,
    end-dx: -dx,
    start-dy: dy,
    end-dy: dy,
    stroke: (paint: c, thickness: thickness, cap: "round"),
  )
}

/// Academic hairline leader annotation pointing cleanly to a `#pin(id)` anchor.
/// Uses an unboxed colored semantic phrase + razor-thin vector arrow with zero corner overlap.
#let callout(
  pin-id,
  tone: "primary",
  offset-dx: 0.8em,
  offset-dy: 1.9em,
  pin-dx: 0em,
  pin-dy: 0.35em,
  body-dx: auto,
  body-dy: auto,
  underline: false,
  body,
) = context {
  let c = _tone-color(tone, _accent-state.get())
  let above = offset-dy.to-absolute() < 0pt
  let eff-body-dx = if body-dx == auto { -0.15em } else { body-dx }
  let eff-body-dy = if body-dy == auto {
    if above { -1.18em } else { 0.16em }
  } else {
    body-dy
  }
  pinit-point-from(
    pin-id,
    pin-dx: pin-dx,
    pin-dy: pin-dy,
    body-dx: eff-body-dx,
    body-dy: eff-body-dy,
    offset-dx: offset-dx,
    offset-dy: offset-dy,
    fill: c.darken(6%),
    stroke: 0pt,
    thickness: 0.055em,
    arrow-width: 4.5,
    arrow-height: 5.5,
    inset: 1.0,
    box(
      inset: (x: 0.12em, y: 0.06em),
      stroke: if underline { (bottom: 0.75pt + c.transparentize(45%)) } else { none },
      text(size: 0.74em, weight: "medium", fill: c.darken(14%), body),
    ),
  )
}

/// Sleek directional hairline arrow linking two pinned anchors.
#let link-pins(
  from,
  to,
  tone: "primary",
  start-dx: 0em,
  start-dy: 0em,
  end-dx: 0em,
  end-dy: 0em,
  thickness: 0.06em,
) = context {
  let c = _tone-color(tone, _accent-state.get())
  pinit-arrow(
    from,
    to,
    start-dx: start-dx,
    start-dy: start-dy,
    end-dx: end-dx,
    end-dy: end-dy,
    fill: c,
    stroke: 0pt,
    thickness: thickness,
    arrow-width: 4.5,
    arrow-height: 5.5,
    inset: 1.0,
  )
}

/// Unified-font `mannot` annotation wrapper matching slide sans-serif typography and color palette.
#let math-annot(
  tag,
  tone: "primary",
  pos: bottom,
  dx: auto,
  dy: auto,
  leader-connect: (center + horizon, center + horizon),
  body,
) = context {
  let c = _tone-color(tone, _accent-state.get())
  let sf = _sans-font-state.get()
  annot(
    tag,
    pos: pos,
    dx: dx,
    dy: dy,
    leader-stroke: 0.75pt + c.transparentize(25%),
    leader-connect: leader-connect,
    annot-text-props: (font: sf, size: 0.74em, fill: c.darken(14%)),
    body,
  )
}

// ---- Markdown Hooks (Overrides /xcpc/defaults.typ) ------------------------------------

/// `## Heading` in `editorial.md` automatically opens a new slide under the current problem.
#let subsection(title) = heading(depth: 2, title)

/// `### Heading` in `editorial.md` renders as an inline accented bold lead-in.
#let runin(title) = context {
  let accent = _accent-state.get()
  text(weight: "bold", fill: accent.darken(10%), title)
  h(0.55em)
}

// ---- Warsaw Touying Theme Implementation ----------------------------------------------

#let _warsaw-footline(self) = {
  let accent = self.colors.primary
  let dark = self.colors.neutral-darkest
  let author-text = if self.info.author != none { self.info.author } else { [] }
  let title-text = if self.info.short-title != auto and self.info.short-title != none {
    self.info.short-title
  } else if self.info.title != none {
    self.info.title
  } else {
    []
  }
  let show-num = self.store.show-slide-number and not self.store.is-title-or-thanks
  set text(size: 0.6em, fill: white, top-edge: "ascender", bottom-edge: "descender")
  set par(leading: 0pt, spacing: 0pt)
  align(bottom, grid(
    columns: (50%, 50%),
    rows: 1.95em,
    align: horizon,
    grid.cell(
      fill: dark,
      align: right + horizon,
      inset: (x: 1.05em),
      text(fill: white.transparentize(10%), author-text),
    ),
    grid.cell(
      fill: accent,
      align: left + horizon,
      inset: (x: 1.05em),
      if show-num {
        grid(
          columns: (1fr, auto),
          align: (left + horizon, right + horizon),
          column-gutter: 0.9em,
          title-text,
          text(
            number-width: "tabular",
            fill: white.transparentize(14%),
            context utils.slide-counter.display() + " / " + utils.last-slide-number,
          ),
        )
      } else {
        title-text
      },
    ),
  ))
}

#let _warsaw-header(self) = {
  let accent = self.colors.primary
  let dark = self.colors.neutral-darkest
  let show-headline = self.store.show-headline

  // Active problem title (level 1 heading) + optional subsection label (level 2 heading).
  let title-bar = context {
    let sec = utils.display-current-heading(level: 1, numbered: false)
    let sub = utils.display-current-heading(level: 2, numbered: false)
    let primary-title = if self.store.title != none {
      self.store.title
    } else if sec != none and sec != [] {
      sec
    } else {
      sub
    }
    let has-sub = self.store.title == none and sec != none and sec != [] and sub != none and sub != []
    if primary-title == none or primary-title == [] {
      return
    }
    stack(
      dir: ttb,
      spacing: 0pt,
      block(
        width: 100%,
        fill: gradient.linear(accent, dark, angle: 0deg),
        inset: (x: 1.05em, top: 0.44em, bottom: 0.44em),
        grid(
          columns: if has-sub { (1fr, auto) } else { (1fr,) },
          align: (left + horizon, right + horizon),
          column-gutter: 1.1em,
          text(size: 1.32em, fill: white, weight: "regular", primary-title),
          ..if has-sub {
            (text(size: 0.86em, fill: white.transparentize(22%), sub),)
          } else {
            ()
          },
        ),
      ),
      rect(
        width: 100%,
        height: 4pt,
        fill: gradient.linear(black.transparentize(76%), black.transparentize(100%), angle: 90deg),
      ),
    )
  }

  set align(top)
  stack(
    dir: ttb,
    spacing: 0pt,
    if show-headline {
      block(
        width: 100%,
        fill: dark,
        inset: (x: 1.05em, y: 0.28em),
        text(
          size: 0.58em,
          fill: white,
          components.simple-navigation(
            self: self,
            primary: white,
            secondary: white.transparentize(55%),
            background: dark,
            logo: none,
          ),
        ),
      )
    },
    title-bar,
  )
}

#let _warsaw-slide(
  title: auto,
  config: (:),
  repeat: auto,
  setting: body => body,
  composer: auto,
  ..bodies,
) = touying-slide-wrapper(self => {
  if title != auto {
    self.store.title = title
  }
  self.store.is-title-or-thanks = false
  let new-setting = body => {
    show: std.align.with(horizon)
    show: setting
    body
  }
  touying-slide(
    self: self,
    config: config,
    repeat: repeat,
    setting: new-setting,
    composer: composer,
    ..bodies,
  )
})

#let _warsaw-title-slide(config: (:), logo-path: "", extra: none) = touying-slide-wrapper(self => {
  self = utils.merge-dicts(
    self,
    config,
    config-common(freeze-slide-counter: true),
    config-page(
      header: none,
      margin: (top: 1.8em, bottom: 1.9em, x: 2.6em),
    ),
  )
  self.store.title = none
  self.store.is-title-or-thanks = true
  let accent = self.colors.primary
  let info = self.info

  let body = {
    set align(center + horizon)
    if logo-path != "" {
      block(below: 1.2em, image(logo-path, height: 2.6em))
    }
    _shadow-frame(radius: 7pt, width: 86%, {
      block(
        width: 100%,
        fill: gradient.linear(accent.lighten(4%), accent.darken(8%), angle: 90deg),
        stroke: 0.6pt + accent.lighten(18%),
        radius: 7pt,
        inset: (x: 1.6em, top: 1.2em, bottom: 1.1em),
        {
          set align(center)
          text(size: 1.62em, fill: white, weight: "regular", tracking: 0.02em, info.title)
          if info.subtitle != none and info.subtitle != [] {
            v(0.65em)
            text(size: 1.0em, fill: white.transparentize(10%), info.subtitle)
          }
        },
      )
    })
    if info.author != none and info.author != [] {
      v(2.1em)
      text(size: 1.04em, fill: _brand-dark, info.author)
    }
    if info.date != none and info.date != [] {
      v(1.1em)
      text(size: 0.92em, fill: _brand-muted, info.date)
    }
    if extra != none {
      v(0.8em)
      text(size: 0.8em, fill: _brand-muted, extra)
    }
  }
  touying-slide(self: self, body)
})

#let _warsaw-thanks-slide(thanks-text: "Thanks!") = touying-slide-wrapper(self => {
  self = utils.merge-dicts(
    self,
    config-common(freeze-slide-counter: true),
    config-page(
      header: none,
      margin: (top: 1.8em, bottom: 1.9em, x: 2.6em),
    ),
  )
  self.store.title = none
  self.store.is-title-or-thanks = true
  let trimmed = if type(thanks-text) == str { thanks-text.trim() } else { "" }
  let body = align(center + horizon, {
    if trimmed == "Thanks!" or trimmed == "" {
      image("../assets/thanks.svg", width: 46%)
    } else {
      text(
        font: _with-cjk(lm-roman-10, cjk-song),
        style: "italic",
        size: 2.8em,
        fill: _brand-dark,
        trimmed,
      )
    }
  })
  touying-slide(self: self, body)
})

#let _warsaw-theme(
  aspect-ratio: "16-9",
  accent: _brand-primary,
  body-size: 16pt,
  cjk-body: cjk-hei,
  handout: false,
  show-headline: false,
  show-slide-number: true,
  is-zh: true,
  info: (:),
  body,
) = {
  let top-margin = if show-headline { 4.45em } else { 3.35em }
  let sans-font = _with-cjk(lm-sans-10, cjk-body)
  let code-font = _with-cjk("JetBrains Mono", cjk-fangsong)

  show: touying-slides.with(
    config-page(
      ..utils.page-args-from-aspect-ratio(aspect-ratio),
      header: _warsaw-header,
      footer: _warsaw-footline,
      header-ascent: 0em,
      footer-descent: 0em,
      margin: (top: top-margin, bottom: 1.95em, x: 2.35em),
    ),
    config-common(
      slide-level: 2,
      slide-fn: _warsaw-slide,
      new-section-slide-fn: none,
      show-strong-with-alert: false,
      handout: handout,
    ),
    config-colors(
      primary: accent,
      primary-dark: accent.darken(20%),
      secondary: accent.lighten(92%),
      neutral-lightest: white,
      neutral-darkest: _brand-dark,
    ),
    config-store(
      title: none,
      show-headline: show-headline,
      show-slide-number: show-slide-number,
      is-title-or-thanks: false,
    ),
    config-info(..info),
    config-methods(
      init: (self: none, body) => {
        set text(font: sans-font, size: body-size, fill: _brand-dark)
        set par(leading: 0.78em, spacing: 0.85em)
        show math.equation: set text(font: "Latin Modern Math")
        show raw.where(block: false): set text(
          font: code-font,
          size: 0.88em,
          ligatures: false,
          features: (calt: 0),
        )
        show raw.where(block: true): it => {
          set par(leading: 0.56em, spacing: 0pt)
          set text(font: code-font, size: 0.76em, ligatures: false, features: (calt: 0), fill: _brand-dark)
          block(width: 100%, breakable: false, inset: (y: 0.25em), it)
        }
        // Classic Beamer Warsaw 3D glossy spherical bullet points
        set list(
          indent: 0.3em,
          body-indent: 0.58em,
          spacing: 0.72em,
          marker: (
            move(dy: -0.04em, components.knob-marker(primary: accent)),
            move(
              dy: -0.02em,
              box(
                width: 0.38em,
                circle(
                  fill: gradient.radial(
                    accent.lighten(95%),
                    accent.darken(30%),
                    focal-center: (30%, 30%),
                  ),
                  radius: 0.19em,
                ),
              ),
            ),
            text(fill: accent, size: 0.72em, sym.triangle.filled.r),
          ),
        )
        set enum(
          indent: 0.3em,
          body-indent: 0.58em,
          spacing: 0.68em,
          numbering: n => box(
            fill: accent,
            radius: 3pt,
            inset: (x: 0.34em, y: 0.12em),
            text(size: 0.74em, fill: white, weight: "bold", str(n)),
          ),
        )
        // Markdown `> quote` renders cleanly as a Warsaw shaded card
        show quote.where(block: true): it => slide-block(title: none, it.body)
        // Modern booktabs-style tables with generous vertical breathing room
        set table(
          inset: (x: 0.85em, y: 0.48em),
          stroke: (x, y) => if y == 0 {
            (top: 1.25pt + accent, bottom: 0.85pt + accent)
          } else {
            (bottom: 0.45pt + rgb("#E2E8F0"))
          },
          fill: (x, y) => if y == 0 { accent.lighten(93%) } else { none },
        )
        show table: it => block(above: 0.85em, below: 0.85em, text(size: 0.86em, it))
        show link: it => if type(it.dest) == str {
          text(fill: accent, underline(it))
        } else {
          it
        }
        _accent-state.update(accent)
        _sans-font-state.update(sans-font)
        _is-zh-state.update(is-zh)
        body
      },
      alert: utils.alert-with-primary-color,
    ),
  )

  body
}

// ---- Single-Entry Render Contract -----------------------------------------------------

#let render(doc) = {
  let opts = doc.at("options", default: (:))
  let lang = doc.at("language", default: "chinese")
  let is-zh = lang == "chinese"
  let single = doc.at("single", default: false)
  let problems = doc.at("problems", default: ())

  let aspect-ratio = opts.at("aspect-ratio", default: "16-9")
  if aspect-ratio != "16-9" and aspect-ratio != "4-3" {
    aspect-ratio = "16-9"
  }
  let accent = _parse-color(opts.at("accent-color", default: "#0B6989"), _brand-primary)
  let body-size = _parse-len(opts.at("body-size", default: "16pt"), 16pt)
  let custom-cjk = opts.at("cjk-font", default: "")
  let eff-cjk = if type(custom-cjk) == str and custom-cjk.trim() != "" {
    custom-cjk.trim()
  } else {
    cjk-hei
  }
  let handout = opts.at("handout", default: false) == true
  let show-headline = opts.at("show-headline", default: false) == true
  let show-slide-number = opts.at("show-slide-number", default: true) != false
  let show-thanks = opts.at("show-thanks", default: true) != false
  let thanks-text = opts.at("thanks-text", default: "Thanks!")
  let logo-path = opts.at("logo", default: "")
  if type(logo-path) != str { logo-path = "" }
  logo-path = logo-path.trim()
  if logo-path != "" and not logo-path.starts-with("/") {
    logo-path = "/" + logo-path
  }

  let cover-opt = opts.at("show-cover", default: "auto")
  let show-cover = if single {
    cover-opt == "on" or cover-opt == true
  } else if cover-opt == "on" or cover-opt == true {
    true
  } else if cover-opt == "off" or cover-opt == false {
    false
  } else {
    problems.len() >= 1
  }

  let raw-name = doc.at("name", default: none)
  let contest-title = if raw-name != none and raw-name != "" {
    raw-name
  } else if problems.len() == 1 {
    let p0 = problems.at(0)
    p0.at("title", default: if is-zh { "题解" } else { "Editorial" })
  } else {
    if is-zh { "程序设计竞赛" } else { "Programming Contest" }
  }

  let raw-subtitle = opts.at("subtitle", default: "")
  let subtitle = if type(raw-subtitle) == str and raw-subtitle.trim() != "" {
    raw-subtitle.trim()
  } else {
    if is-zh { "命题报告" } else { "Editorial" }
  }

  let raw-author = doc.at("author", default: none)
  let author = if raw-author != none and raw-author != "" {
    raw-author
  } else {
    if is-zh { "命题组" } else { "Problem Setters" }
  }
  let raw-date = doc.at("date", default: none)

  let pdf-title = doc.at("pdf-title", default: none)
  let pdf-author = doc.at("pdf-author", default: none)
  set document(
    title: if pdf-title != none and pdf-title != "" { pdf-title } else { contest-title },
    author: if pdf-author != none and pdf-author != "" { pdf-author } else { author },
  )

  show: _warsaw-theme.with(
    aspect-ratio: aspect-ratio,
    accent: accent,
    body-size: body-size,
    cjk-body: eff-cjk,
    handout: handout,
    show-headline: show-headline,
    show-slide-number: show-slide-number,
    is-zh: is-zh,
    info: (
      title: contest-title,
      short-title: contest-title,
      subtitle: subtitle,
      author: author,
      date: if raw-date != none and raw-date != "" { raw-date } else { none },
    ),
  )

  if show-cover {
    _warsaw-title-slide(logo-path: logo-path)
  }

  for p in problems {
    let lbl = if single { none } else { p.at("label", default: none) }
    let p-title = p.at("title", default: p.at("id", default: ""))
    let heading-text = if lbl != none and lbl != "" {
      [#lbl. #p-title]
    } else {
      [#p-title]
    }
    heading(depth: 1, heading-text)
    [#metadata((label: lbl, title: p-title)) <xcpc-tutorial>]
    p.at("body", default: [])
  }

  if show-thanks and not single {
    _warsaw-thanks-slide(thanks-text: thanks-text)
  }
}
