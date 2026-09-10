// The widget registry is consistent with itself, the default layout and the disk.
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import * as Widgets from "../lib/widgets.mjs"
import * as Config from "../lib/config.mjs"
import { REPO } from "./support/fixtures.mjs"

test("every registered type has a coherent spec", () => {
  for (const type of Widgets.types()) {
    const s = Widgets.REGISTRY[type]
    assert.equal(s.type, type)
    for (const dim of ["w", "h"]) {
      assert.ok(s.minSize[dim] >= 1, `${type} min ${dim}`)
      assert.ok(s.minSize[dim] <= s.defaultSize[dim] && s.defaultSize[dim] <= s.maxSize[dim],
        `${type}: min <= default <= max for ${dim}`)
    }
    const keys = s.settingsSchema.map((f) => f.key)
    assert.equal(new Set(keys).size, keys.length, `${type}: schema keys are unique`)
    for (const field of s.settingsSchema) {
      assert.ok(["enum", "bool", "number", "string", "app", "gpu", "sink"].includes(field.type),
        `${type}.${field.key}: field type ${field.type} is one DESIGN.md 7 allows`)
    }
    for (const key of Object.keys(s.defaultSettings)) {
      assert.ok(keys.includes(key), `${type}: default setting ${key} has a schema field`)
    }
  }
})

test("every widget source exists on disk", () => {
  for (const type of Widgets.types()) {
    assert.ok(existsSync(path.join(REPO, Widgets.REGISTRY[type].source)), `${type}: ${Widgets.REGISTRY[type].source}`)
  }
  assert.ok(existsSync(path.join(REPO, Widgets.UNKNOWN.source)))
  assert.ok(existsSync(path.join(REPO, Widgets.ERROR_SOURCE)))
})

test("the registry and config agree on which types exist", () => {
  assert.deepEqual([...Widgets.types()].sort(), [...Config.KNOWN_TYPES].sort())
})

test("the default layout respects every widget's size limits", () => {
  for (const item of Config.pageItems(Config.defaultConfig(), 0)) {
    const s = Widgets.specFor(item.type)
    assert.ok(item.w >= s.minSize.w && item.w <= s.maxSize.w, `${item.id} width`)
    assert.ok(item.h >= s.minSize.h && item.h <= s.maxSize.h, `${item.id} height`)
  }
})

test("unknown types draw as a placeholder rather than failing", () => {
  assert.equal(Widgets.specFor("quantum-flux"), Widgets.UNKNOWN)
  assert.equal(Widgets.specFor("constructor"), Widgets.UNKNOWN, "no prototype lookups")
})

test("clampSize honours the widget limits and the grid", () => {
  assert.deepEqual(Widgets.clampSize("cpu", 1, 1, 16, 9), { w: 2, h: 2 })
  assert.deepEqual(Widgets.clampSize("cpu", 99, 99, 16, 9), { w: 8, h: 6 })
  assert.deepEqual(Widgets.clampSize("cpu", 99, 99, 5, 4), { w: 5, h: 4 }, "a small grid wins")
  assert.deepEqual(Widgets.clampSize("app", "x", null, 16, 9), { w: 1, h: 1 })
})

test("settingsFor fills defaults and keeps unknown keys", () => {
  assert.deepEqual(Widgets.settingsFor("gpu", { tempCrit: 85, extra: 1 }),
    { gpu: "auto", tempWarn: 80, tempCrit: 85, extra: 1 })
  assert.deepEqual(Widgets.settingsFor("nope", null), {})
})
