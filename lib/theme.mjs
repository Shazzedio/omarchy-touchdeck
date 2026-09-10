// Theme maths. Pure -- no QML, no I/O. DeckTheme.qml is the adapter that feeds
// this from Omarchy's singletons and the active theme's colors.toml.
//
// Omarchy's `Color` singleton exposes the foundational palette (foreground,
// background, accent, urgent, muted) and per-surface roles, but *not* the named
// hues. Status colours therefore come from colors.toml directly, with fallbacks
// for a theme that omits them (DESIGN.md 8.3).

const HEX = /^#([0-9A-Fa-f]{6})$/

export function parseHex(value) {
  const m = HEX.exec(String(value || "").trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex(rgb) {
  const c = (v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, "0")
  return "#" + c(rgb.r) + c(rgb.g) + c(rgb.b)
}

export function mix(a, b, t) {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return ca ? toHex(ca) : (cb ? toHex(cb) : "#000000")
  const k = Math.min(Math.max(t, 0), 1)
  return toHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  })
}

// Relative luminance, WCAG-style. Used both for contrast checks and to decide
// whether a scrim should darken or lighten.
export function luminance(value) {
  const c = parseHex(value)
  if (!c) return 0
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// Omarchy's colors.toml is a flat file of `key = "#rrggbb"` lines plus
// `mode = "dark"|"light"`. Parse exactly that subset -- the same one Omarchy's
// own Color.loadColors reads -- and ignore everything else.
export function parseColorsToml(text) {
  const out = { mode: "dark", colors: {} }
  const lines = String(text || "").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const mode = trimmed.match(/^mode\s*=\s*["']?(dark|light)/i)
    if (mode) {
      out.mode = mode[1].toLowerCase()
      continue
    }
    const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/)
    if (kv) out.colors[kv[1]] = kv[2].toLowerCase()
  }
  return out
}

// ok / warn / critical for gauges and temperature readouts.
//
// Named hues when the theme has them, otherwise the fallback ladder from
// DESIGN.md 8.3: critical -> urgent, warn -> accent mixed with urgent,
// ok -> accent.
export function statusColors(palette) {
  const p = palette || {}
  const named = p.named || {}
  const accent = parseHex(p.accent) ? p.accent : "#cacccc"
  const urgent = parseHex(p.urgent) ? p.urgent : "#a55555"

  const pick = (name, fallback) => (parseHex(named[name]) ? named[name].toLowerCase() : fallback)
  return {
    ok: pick("green", accent),
    warn: pick("yellow", mix(accent, urgent, 0.5)),
    critical: pick("red", urgent),
  }
}

// Perceptual-ish distance, weighted the way the eye weights the channels. Good
// enough to answer one question: can a person tell these two states apart?
export function colorDistance(a, b) {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return 0
  const dr = ca.r - cb.r
  const dg = ca.g - cb.g
  const db = ca.b - cb.b
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / Math.sqrt(9 * 255 * 255)
}

// Several Omarchy themes are monochrome or have hues that fight their own
// names: lumon is three blues, hackerman three greens, white and vantablack are
// greyscale, and everforest/gruvbox/osaka-jade put `green` and `yellow` in the
// same corner of the wheel. On a monitoring deck a critical reading that looks
// like a normal one is a functional failure, not a style choice.
//
// So this answers two separate questions rather than one, because they have
// different consequences: if critical can't be told apart, a widget must add a
// non-colour cue (heavier weight, a marked track); if only warn and ok blur
// together, that is a smaller matter and only the warn band needs the cue.
export const STATUS_DISTINCT_THRESHOLD = 0.10

export function statusLegibility(status) {
  if (!status) return { criticalDistinct: false, warnDistinct: false }
  const criticalGap = Math.min(
    colorDistance(status.critical, status.ok),
    colorDistance(status.critical, status.warn))
  return {
    criticalDistinct: criticalGap >= STATUS_DISTINCT_THRESHOLD,
    warnDistinct: colorDistance(status.ok, status.warn) >= STATUS_DISTINCT_THRESHOLD,
  }
}

// Which of ok / warn / critical a reading falls into. Thresholds are inclusive
// at the bottom, so `warn: 80` means 80 is already a warning.
export function statusFor(value, warn, crit) {
  // Number(null) is 0 and Number("") is 0, and a missing reading is not a cool
  // one -- reject anything that isn't actually a number before banding it.
  if (value === null || value === undefined || value === "") return "unknown"
  const n = Number(value)
  if (!Number.isFinite(n)) return "unknown"
  if (Number.isFinite(crit) && n >= crit) return "critical"
  if (Number.isFinite(warn) && n >= warn) return "warn"
  return "ok"
}

// The deck's type and spacing scale (DESIGN.md 8.3, recalibrated in
// DECISIONS.md D-3). Driven by the window's logical size rather than the fitted
// cell, so it can be computed before the grid geometry that depends on it.
export const TOUCH_BASE_CELL = 96

export function touchScale(width, height, columns, rows, appearanceScale) {
  const cols = Math.max(1, columns | 0)
  const rws = Math.max(1, rows | 0)
  const nominal = Math.min(width / cols, height / rws)
  if (!Number.isFinite(nominal) || nominal <= 0) return 1
  const raw = nominal / TOUCH_BASE_CELL
  const clamped = Math.min(Math.max(raw, 0.8), 1.8)
  const user = Number.isFinite(appearanceScale) && appearanceScale > 0 ? appearanceScale : 1
  return clamped * user
}
