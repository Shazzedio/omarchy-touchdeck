import { test } from "node:test"
import assert from "node:assert/strict"
import * as Settings from "../lib/settings.mjs"
import * as Fuzzy from "../lib/fuzzy.mjs"
import * as Widgets from "../lib/widgets.mjs"

const field = (type, key) => Settings.fields(type).find((f) => f.key === key)

test("values: the item's own, else the widget default, else the type's", () => {
  assert.equal(Settings.valueOf("cpu", { tempWarn: 70 }, field("cpu", "tempWarn")), 70)
  assert.equal(Settings.valueOf("cpu", {}, field("cpu", "tempCrit")), 95)
  assert.equal(Settings.valueOf("app", {}, field("app", "confirm")), false)
  assert.equal(Settings.valueOf("app", {}, field("app", "label")), "")
  assert.equal(Settings.valueOf("gpu", {}, field("gpu", "gpu")), "auto")
})

test("number steppers clamp and never show float dust", () => {
  const warn = field("cpu", "tempWarn")
  assert.equal(Settings.stepNumber(80, warn, 1), 81)
  assert.equal(Settings.stepNumber(110, warn, 1), 110, "max")
  assert.equal(Settings.stepNumber(40, warn, -1), 40, "min")
  const vol = field("volume", "maxVolume")
  assert.equal(Settings.stepNumber(1.1, vol, 1), 1.15)
  assert.equal(Settings.stepNumber(1.5, vol, 1), 1.5)
  assert.equal(Settings.numberText(1.1, vol), "1.10")
  assert.equal(Settings.stepNumber("junk", warn, 1), 41)
})

test("enum and gpu choices, and row summaries", () => {
  assert.deepEqual(Settings.enumOptions(field("app", "target")).map((o) => o.value), ["auto", "touch"])
  const gpus = [{ pci: "0000:01:00.0", name: "NVIDIA GeForce RTX 4070" }]
  assert.deepEqual(Settings.gpuChoices(gpus, false).map((c) => c.value), ["auto", "0000:01:00.0"])
  assert.deepEqual(Settings.gpuChoices(gpus, true).map((c) => c.value), ["auto", "0000:01:00.0", "none"])
  assert.equal(Settings.summary(field("gpu", "gpu"), "0000:09:00.0", { gpus }), "0000:09:00.0 (not present)")
  assert.equal(Settings.summary(field("app", "confirm"), true), "On")
  assert.equal(Settings.summary(field("app", "desktopId"), "brave-browser", { appName: "Brave" }), "Brave")
  assert.equal(Settings.summary(field("app", "command"), ""), "Not set")
})

test("every schema field has a type the settings sheet can draw", () => {
  const drawable = ["enum", "bool", "number", "string", "app", "gpu"]
  for (const type of Widgets.types()) {
    for (const f of Settings.fields(type)) {
      assert.ok(drawable.includes(f.type), `${type}.${f.key}: ${f.type}`)
      if (f.type === "number") assert.ok(f.min !== undefined && f.max !== undefined, `${type}.${f.key} has bounds`)
      if (f.type === "enum") assert.ok(f.options && f.options.length > 1, `${type}.${f.key} has options`)
    }
  }
})

test("search: prefix, acronym, word start, substring, in-order", () => {
  const apps = ["Firefox", "Visual Studio Code", "Files", "Ghostty", "Brave", "Code Editor"].map((name) => ({ name }))
  const names = (q) => Fuzzy.search(apps, q).map((a) => a.name)
  assert.equal(names("fi")[0], "Files", "shorter prefix match first")
  assert.deepEqual(names("vsc"), ["Visual Studio Code"])
  assert.deepEqual(names("code"), ["Code Editor", "Visual Studio Code"], "a prefix beats a later word")
  assert.equal(names("host")[0], "Ghostty")
  assert.ok(names("ffx").includes("Firefox"))
  assert.deepEqual(names("zzz"), [])
  assert.equal(names("").length, apps.length, "empty query lists everything")
})

test("A–Z rail letters and jump indexes", () => {
  const sorted = ["1Password", "Brave", "btop", "Files", "Ghostty"]
  assert.equal(Fuzzy.letterOf("1Password"), "#")
  assert.equal(Fuzzy.letterOf(" brave"), "B")
  assert.deepEqual(Fuzzy.letterIndex(sorted), { "#": 0, B: 1, F: 3, G: 4 })
  assert.equal(Fuzzy.RAIL.length, 27)
})
