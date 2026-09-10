import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import * as theme from "../lib/theme.mjs"

const THEME_DIR = "/usr/share/omarchy/themes"

test("parseHex accepts #rrggbb and rejects everything else", () => {
  assert.deepEqual(theme.parseHex("#ff8000"), { r: 255, g: 128, b: 0 })
  assert.deepEqual(theme.parseHex("  #FF8000  "), { r: 255, g: 128, b: 0 })
  for (const bad of ["#fff", "ff8000", "rgb(1,2,3)", "", null, undefined, "#gggggg"]) {
    assert.equal(theme.parseHex(bad), null, `should reject ${JSON.stringify(bad)}`)
  }
})

test("mix interpolates and clamps t", () => {
  assert.equal(theme.mix("#000000", "#ffffff", 0), "#000000")
  assert.equal(theme.mix("#000000", "#ffffff", 1), "#ffffff")
  assert.equal(theme.mix("#000000", "#ffffff", 0.5), "#808080")
  assert.equal(theme.mix("#000000", "#ffffff", -5), "#000000", "t clamps low")
  assert.equal(theme.mix("#000000", "#ffffff", 5), "#ffffff", "t clamps high")
  assert.equal(theme.mix("garbage", "#ffffff", 0.5), "#ffffff", "one bad input degrades")
})

test("luminance and contrastRatio match the WCAG anchors", () => {
  assert.equal(theme.luminance("#000000"), 0)
  assert.ok(Math.abs(theme.luminance("#ffffff") - 1) < 1e-9)
  assert.ok(Math.abs(theme.contrastRatio("#000000", "#ffffff") - 21) < 1e-6)
  assert.equal(theme.contrastRatio("#123456", "#123456"), 1)
  assert.equal(theme.contrastRatio("#abc", "#def"), 1, "unparseable colours don't throw")
})

test("parseColorsToml reads mode and named hues, ignoring the rest", () => {
  const parsed = theme.parseColorsToml(`
mode = "light"

# a comment
accent = "#f38d70"
green = "#ADDA78"
not_a_colour = "hello"
bright_red = '#ff8297'
  indented = "#010203"
`)
  assert.equal(parsed.mode, "light")
  assert.equal(parsed.colors.accent, "#f38d70")
  assert.equal(parsed.colors.green, "#adda78", "hex is lowercased")
  assert.equal(parsed.colors.bright_red, "#ff8297", "single quotes work")
  assert.equal(parsed.colors.indented, "#010203")
  assert.equal(parsed.colors.not_a_colour, undefined)
})

test("parseColorsToml defaults to dark and never throws", () => {
  for (const input of ["", null, undefined, "garbage\nlines\n", "mode = 'sideways'"]) {
    assert.doesNotThrow(() => theme.parseColorsToml(input))
    assert.equal(theme.parseColorsToml(input).mode, "dark")
  }
})

test("statusColors prefers named hues", () => {
  const s = theme.statusColors({
    named: { green: "#adda78", yellow: "#f9cc6c", red: "#fd6883" },
    accent: "#f38d70", urgent: "#fd6883",
  })
  assert.deepEqual(s, { ok: "#adda78", warn: "#f9cc6c", critical: "#fd6883" })
})

test("statusColors falls back per DESIGN 8.3 when hues are missing", () => {
  const s = theme.statusColors({ named: {}, accent: "#00ff00", urgent: "#ff0000" })
  assert.equal(s.ok, "#00ff00", "ok falls back to accent")
  assert.equal(s.critical, "#ff0000", "critical falls back to urgent")
  assert.equal(s.warn, theme.mix("#00ff00", "#ff0000", 0.5), "warn is accent mixed with urgent")
})

test("statusColors survives a palette with nothing usable in it", () => {
  const s = theme.statusColors({})
  for (const key of ["ok", "warn", "critical"]) {
    assert.ok(theme.parseHex(s[key]), `${key} should still be a colour, got ${s[key]}`)
  }
  assert.doesNotThrow(() => theme.statusColors(null))
})

test("colorDistance is symmetric, zero for identity, and 1 across the diagonal", () => {
  assert.equal(theme.colorDistance("#123456", "#123456"), 0)
  assert.equal(theme.colorDistance("#ff0000", "#00ff00"), theme.colorDistance("#00ff00", "#ff0000"))
  assert.ok(Math.abs(theme.colorDistance("#000000", "#ffffff") - 1) < 1e-9)
  assert.ok(theme.colorDistance("#adda78", "#fd6883") > theme.colorDistance("#adda78", "#c8e292"))
})

test("statusLegibility separates a hued theme from a greyscale one", () => {
  assert.deepEqual(
    theme.statusLegibility({ ok: "#adda78", warn: "#f9cc6c", critical: "#fd6883" }),
    { criticalDistinct: true, warnDistinct: true }, "ristretto")
  assert.deepEqual(
    theme.statusLegibility({ ok: "#b6b6b6", warn: "#cecece", critical: "#a4a4a4" }),
    { criticalDistinct: false, warnDistinct: false }, "vantablack")
  assert.deepEqual(theme.statusLegibility(null),
    { criticalDistinct: false, warnDistinct: false })
})

test("statusLegibility answers its two questions independently", () => {
  // everforest: green and yellow are both warm and close, but red stands
  // clear of both -- so only the warn band needs a non-colour cue.
  assert.deepEqual(
    theme.statusLegibility({ ok: "#a7c080", warn: "#dbbc7f", critical: "#e67e80" }),
    { criticalDistinct: true, warnDistinct: false }, "everforest")
  // hackerman: three greens, but yellow drifts far enough into cyan that warn
  // reads while critical does not.
  assert.deepEqual(
    theme.statusLegibility({ ok: "#4fe88f", warn: "#50f7d4", critical: "#50f872" }),
    { criticalDistinct: false, warnDistinct: true }, "hackerman")
})

test("statusFor bands a reading, inclusive at each threshold", () => {
  assert.equal(theme.statusFor(50, 80, 95), "ok")
  assert.equal(theme.statusFor(79.9, 80, 95), "ok")
  assert.equal(theme.statusFor(80, 80, 95), "warn", "the threshold itself is a warning")
  assert.equal(theme.statusFor(94, 80, 95), "warn")
  assert.equal(theme.statusFor(95, 80, 95), "critical")
  assert.equal(theme.statusFor(NaN, 80, 95), "unknown")
  assert.equal(theme.statusFor(null, 80, 95), "unknown")
  assert.equal(theme.statusFor(200, NaN, NaN), "ok", "no thresholds means nothing to warn about")
})

test("touchScale lands near 1 on the real deck canvas and stays clamped", () => {
  // 1536x838 logical after the bar, 16x9 (DECISIONS.md G-3, D-3).
  const actual = theme.touchScale(1536, 838, 16, 9, 1)
  assert.ok(actual > 0.9 && actual < 1.05, `expected ~1, got ${actual}`)

  assert.equal(theme.touchScale(100, 100, 16, 9, 1), 0.8, "clamps at the bottom")
  assert.equal(theme.touchScale(9999, 9999, 16, 9, 1), 1.8, "clamps at the top")
  assert.equal(theme.touchScale(9999, 9999, 16, 9, 2), 3.6, "the user scale is applied after the clamp")
  assert.equal(theme.touchScale(1536, 838, 16, 9, 0), theme.touchScale(1536, 838, 16, 9, 1),
    "a nonsense user scale is ignored")
})

test("touchScale never returns a nonsense value", () => {
  for (const args of [[0, 0, 16, 9, 1], [NaN, 100, 16, 9, 1], [100, 100, 0, 0, 1]]) {
    const v = theme.touchScale(...args)
    assert.ok(Number.isFinite(v) && v > 0, `touchScale(${args}) = ${v}`)
  }
})

// Reads the machine's installed themes. Skipped where they aren't present so
// the suite still runs on a non-Omarchy checkout.
test("every installed theme yields usable, legible status colours", { skip: !existsSync(THEME_DIR) }, () => {
  const names = readdirSync(THEME_DIR)
  assert.ok(names.length > 0)

  const criticalBlind = []
  const warnBlind = []
  for (const name of names) {
    const path = `${THEME_DIR}/${name}/colors.toml`
    if (!existsSync(path)) continue
    const parsed = theme.parseColorsToml(readFileSync(path, "utf8"))
    const status = theme.statusColors({
      named: parsed.colors,
      accent: parsed.colors.accent,
      urgent: parsed.colors.red,
    })

    for (const key of ["ok", "warn", "critical"]) {
      assert.ok(theme.parseHex(status[key]), `${name}: ${key} is not a colour (${status[key]})`)
    }
    assert.ok(["dark", "light"].includes(parsed.mode), `${name}: bad mode ${parsed.mode}`)

    const bg = parsed.colors.background
    if (bg) {
      for (const key of ["ok", "warn", "critical"]) {
        assert.ok(theme.contrastRatio(status[key], bg) >= 1.6,
          `${name}: ${key} (${status[key]}) is invisible on ${bg}`)
      }
    }
    const legible = theme.statusLegibility(status)
    if (!legible.criticalDistinct) criticalBlind.push(name)
    if (!legible.warnDistinct) warnBlind.push(name)
  }

  // Assert the invariants, not an exact roster: these are someone else's colour
  // choices, and several themes sit within a hundredth of the threshold, so
  // pinning the full list would fail on a cosmetic upstream tweak. What must
  // hold is that the obviously-monochrome themes are caught and the
  // obviously-hued ones are not -- that is what the non-colour cue keys off.
  for (const name of ["lumon", "vantablack", "white", "hackerman"]) {
    if (!names.includes(name)) continue
    assert.ok(criticalBlind.includes(name),
      `${name} is monochrome; critical must be flagged as indistinguishable`)
  }
  for (const name of ["catppuccin", "catppuccin-latte", "nord", "ristretto", "tokyo-night"]) {
    if (!names.includes(name)) continue
    assert.ok(!criticalBlind.includes(name),
      `${name} has a clearly distinct red; it must not be flagged`)
    assert.ok(!warnBlind.includes(name),
      `${name} has a clearly distinct yellow; it must not be flagged`)
  }
  assert.ok(criticalBlind.length < names.length / 2,
    `most themes should have a usable critical colour; blind: ${criticalBlind.join(", ")}`)
})
