import { test } from "node:test"
import assert from "node:assert/strict"
import * as config from "../lib/config.mjs"
import * as grid from "../lib/grid.mjs"

test("the default layout is internally consistent", () => {
  const c = config.defaultConfig()
  const items = config.pageItems(c, 0)
  const { columns, rows } = c.appearance

  for (let i = 0; i < items.length; i++) {
    assert.ok(grid.inBounds(items[i], columns, rows), `${items[i].id} is off the grid`)
    assert.ok(config.KNOWN_TYPES.includes(items[i].type), `${items[i].id} has an unknown type`)
    for (let j = i + 1; j < items.length; j++) {
      assert.ok(!grid.overlaps(items[i], items[j]),
        `${items[i].id} overlaps ${items[j].id}`)
    }
  }
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, "ids are unique")
})

test("the default config validates without repairs", () => {
  const { config: validated, errors } = config.validate(config.defaultConfig())
  assert.deepEqual(errors, [])
  assert.deepEqual(validated, config.defaultConfig())
})

test("validate fills every default from an empty object", () => {
  const { config: c, errors } = config.validate({})
  assert.deepEqual(errors, [])
  assert.equal(c.version, config.CONFIG_VERSION)
  assert.equal(c.display.layer, "top")
  assert.equal(c.display.startVisible, true)
  assert.equal(c.appearance.columns, config.DEFAULT_COLUMNS)
  assert.equal(c.sensors.intervalMs, 1000)
  assert.equal(c.launch.target, "auto")
  assert.equal(config.pageItems(c, 0).length, config.defaultItems().length)
})

test("validate clamps out-of-range numbers instead of rejecting the file", () => {
  const { config: c } = config.validate({
    appearance: { scale: 99, columns: 0, rows: -4 },
    sensors: { intervalMs: 1 },
  })
  assert.equal(c.appearance.scale, 3.0, "scale clamps to the maximum")
  assert.equal(c.appearance.columns, 1, "columns clamps to at least 1")
  assert.equal(c.appearance.rows, 1)
  assert.equal(c.sensors.intervalMs, 200, "interval clamps to the floor")
})

test("validate falls back on nonsense enum values", () => {
  const { config: c } = config.validate({
    display: { layer: "sideways", match: { by: "vibes", value: 42 } },
  })
  assert.equal(c.display.layer, "top")
  assert.equal(c.display.match.by, "description")
  assert.equal(c.display.match.value, "Verbatim", "a non-string value falls back")
})

test("validate drops unusable items and says which, keeping the good ones", () => {
  const { config: c, errors } = config.validate({
    pages: [{
      id: "main",
      items: [
        { id: "good", type: "cpu", col: 0, row: 0, w: 2, h: 2 },
        { id: "", type: "cpu", col: 0, row: 4, w: 2, h: 2 },
        { id: "no-type", col: 0, row: 6, w: 2, h: 2 },
        "not an object",
        { id: "good", type: "gpu", col: 6, row: 0, w: 2, h: 2 },
      ],
    }],
  })
  const items = config.pageItems(c, 0)
  assert.deepEqual(items.map((i) => i.id), ["good"])
  assert.equal(errors.length, 4, "one error per repair")
  assert.ok(errors.some((e) => e.includes("duplicate item id 'good'")))
})

test("an unknown widget type is kept but reported", () => {
  const { config: c, errors } = config.validate({
    pages: [{ id: "main", items: [{ id: "x", type: "quantum-flux", col: 0, row: 0, w: 1, h: 1 }] }],
  })
  assert.equal(config.pageItems(c, 0).length, 1, "kept, so a newer config isn't gutted")
  assert.ok(errors.some((e) => e.includes("unknown type 'quantum-flux'")))
})

test("an empty or unusable pages list falls back to the default layout", () => {
  assert.equal(config.pageItems(config.validate({ pages: [] }).config, 0).length,
    config.defaultItems().length)
  assert.equal(config.pageItems(config.validate({ pages: "nope" }).config, 0).length,
    config.defaultItems().length)
  assert.ok(config.validate({ pages: "nope" }).errors.some((e) => e.includes("not an array")))
})

test("unknown fields survive a validate/serialize round trip", () => {
  const source = {
    version: 1,
    futureTopLevel: { keep: "me" },
    display: { futureDisplayKey: 7, match: { by: "name", value: "DP-3", futureMatchKey: true } },
    appearance: { futureAppearanceKey: "x" },
    pages: [{
      id: "main",
      futurePageKey: [1, 2],
      items: [{ id: "a", type: "cpu", col: 0, row: 0, w: 2, h: 2, futureItemKey: "kept" }],
    }],
  }
  const { config: c } = config.validate(source)

  assert.deepEqual(c.futureTopLevel, { keep: "me" })
  assert.equal(c.display.futureDisplayKey, 7)
  assert.equal(c.display.match.futureMatchKey, true)
  assert.equal(c.appearance.futureAppearanceKey, "x")
  assert.deepEqual(c.pages[0].futurePageKey, [1, 2])
  assert.equal(config.pageItems(c, 0)[0].futureItemKey, "kept")

  // and again through text, which is what actually hits disk
  const round = config.parse(config.serialize(c)).config
  assert.equal(round.futureTopLevel.keep, "me")
  assert.equal(config.pageItems(round, 0)[0].futureItemKey, "kept")
})

test("known fields win over same-named unknown ones", () => {
  const { config: c } = config.validate({ appearance: { columns: 12 } })
  assert.equal(c.appearance.columns, 12, "a valid value is used, not shadowed")
})

test("migrate carries an older version forward without touching a current one", () => {
  const current = config.defaultConfig()
  assert.equal(config.migrate(current), current, "current version is returned as-is")
  assert.equal(config.migrate({ version: 0, pages: [] }).version, config.CONFIG_VERSION)
  assert.equal(config.migrate({ version: 99 }).version, 99, "a newer file is left alone")
})

test("parse reports an empty file as first-run rather than an error", () => {
  for (const text of ["", "   \n\t ", undefined]) {
    const r = config.parse(text)
    assert.equal(r.ok, true)
    assert.equal(r.isEmpty, true)
    assert.equal(r.parseError, "")
    assert.equal(config.pageItems(r.config, 0).length, config.defaultItems().length)
  }
})

test("parse reports broken JSON with a line number and no config", () => {
  const broken = '{\n  "version": 1,\n  "appearance": {\n    "scale": 1,,\n  }\n}\n'
  const r = config.parse(broken)
  assert.equal(r.ok, false)
  assert.equal(r.config, null, "callers must keep their last good config")
  assert.match(r.parseError, /^line 4: /, `got: ${r.parseError}`)
})

test("parse accepts a valid hand edit", () => {
  const r = config.parse('{"version":1,"appearance":{"columns":8,"rows":4},"pages":[{"id":"main","items":[]}]}')
  assert.equal(r.ok, true)
  assert.equal(r.config.appearance.columns, 8)
  assert.deepEqual(config.pageItems(r.config, 0), [])
})

test("serialize produces stable, re-readable text", () => {
  const text = config.serialize(config.defaultConfig())
  assert.ok(text.endsWith("\n"), "files end with a newline")
  assert.equal(text, config.serialize(config.parse(text).config), "round trip is a fixed point")
})

test("withPageItems replaces one page and leaves the others alone", () => {
  const c = config.defaultConfig()
  c.pages.push({ id: "second", items: [] })
  const next = config.withPageItems(c, 0, [])

  assert.deepEqual(config.pageItems(next, 0), [])
  assert.equal(next.pages[1].id, "second")
  assert.equal(config.pageItems(c, 0).length, config.defaultItems().length,
    "the input config is not mutated")
})

test("nextItemId skips ids already in use", () => {
  const items = [{ id: "cpu-1" }, { id: "cpu-2" }, { id: "gpu-1" }]
  assert.equal(config.nextItemId(items, "cpu"), "cpu-3")
  assert.equal(config.nextItemId(items, "gpu"), "gpu-2")
  assert.equal(config.nextItemId([], "memory"), "memory-1")
})

test("validate never throws, whatever it is handed", () => {
  for (const input of [null, undefined, 42, "string", [], true, { pages: [null, 1, "x"] }]) {
    assert.doesNotThrow(() => config.validate(input), `threw on ${JSON.stringify(input)}`)
    assert.ok(config.validate(input).config.version === config.CONFIG_VERSION)
  }
})
