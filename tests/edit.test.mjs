import { test } from "node:test"
import assert from "node:assert/strict"
import * as Edit from "../lib/edit.mjs"
import * as Grid from "../lib/grid.mjs"
import * as Config from "../lib/config.mjs"
import * as Widgets from "../lib/widgets.mjs"

const C = 16, R = 9
const layout = () => Config.pageItems(Config.defaultConfig(), 0)
const byId = (items, id) => items.find((i) => i.id === id)

test("move: to a free spot, refused onto another item or off the grid", () => {
  const items = layout()
  const moved = Edit.move(items, "key-1", 6, 3, C, R)
  assert.deepEqual([byId(moved, "key-1").col, byId(moved, "key-1").row], [6, 3])
  assert.equal(Edit.move(items, "key-1", 2, 3, C, R), null, "onto key-2")
  assert.equal(Edit.move(items, "key-1", 15, 3, C, R), null, "off the right edge")
  assert.equal(Edit.move(items, "nope", 0, 0, C, R), null)
  assert.equal(byId(items, "key-1").col, 0, "input not mutated")
})

test("moveTarget pins a drag past the edge to the edge", () => {
  const key = { id: "k", type: "app", col: 0, row: 3, w: 2, h: 2 }
  assert.deepEqual(Edit.moveTarget(key, -5, 0, C, R), { col: 0, row: 3, w: 2, h: 2 })
  assert.deepEqual(Edit.moveTarget(key, 99, 99, C, R), { col: 14, row: 7, w: 2, h: 2 })
  assert.equal(Edit.cells(130, 95), 1)
  assert.equal(Edit.cells(40, 95), 0, "under half a cell doesn't move")
  assert.equal(Edit.cells(-150, 95), -2)
})

test("resize: within the widget's limits and free space only", () => {
  const items = layout()
  const bigger = Edit.resize(items, "key-3", 3, 3, C, R)
  assert.deepEqual([byId(bigger, "key-3").w, byId(bigger, "key-3").h], [3, 3])
  assert.equal(Edit.resize(items, "key-1", 3, 2, C, R), null, "would cover key-2")
  assert.equal(Edit.resize(items, "key-3", 4, 4, C, R), null, "app keys max out at 3x3")
  assert.equal(Edit.resize(items, "cpu-1", 1, 1, C, R), null, "CPU minimum is 2x2")
  const t = Edit.resizeTarget(byId(items, "key-3"), 5, 5, C, R)
  assert.deepEqual([t.w, t.h], [3, 3], "resizeTarget clamps to the widget's maximum")
})

test("remove and undo put the item back exactly", () => {
  const items = layout()
  const r = Edit.remove(items, "gpu-1")
  assert.equal(r.items.length, items.length - 1)
  const back = Edit.undoRemove(r.items, r.removed, C, R)
  assert.deepEqual(back, items, "same position, same order, same settings")
})

test("undo finds somewhere else if the old spot was taken meanwhile", () => {
  const r = Edit.remove(layout(), "key-1")
  const taken = Edit.add(r.items, "app", {}, { col: 0, row: 3 }, C, R)
  const back = Edit.undoRemove(taken.items, r.removed, C, R)
  const k = byId(back, "key-1")
  assert.ok(k, "restored")
  assert.equal(Grid.partitionByFit(back, C, R).unplaced.length, 0, "and nothing overlaps")
  assert.notDeepEqual([k.col, k.row], [0, 3])
})

test("add: at the tapped cell at default size, else minimum, else anywhere, else null", () => {
  const items = layout()
  const a = Edit.add(items, "memory", {}, { col: 6, row: 5 }, C, R)
  assert.deepEqual([a.item.col, a.item.row, a.item.w, a.item.h], [6, 5, 4, 3])
  assert.equal(a.item.id, "memory-1", "sequential ids")
  assert.deepEqual(a.item.settings, { showSwap: false, vramGpu: "auto" }, "defaults filled")

  const cramped = Edit.add(items, "cpu", {}, { col: 10, row: 7 }, C, R)
  assert.deepEqual([cramped.item.col, cramped.item.row, cramped.item.w, cramped.item.h], [10, 7, 2, 2],
    "3x3 doesn't fit at that cell but its 2x2 minimum does")

  const key = Edit.add(items, "app", { desktopId: "x.desktop" }, null, C, R)
  assert.equal(key.item.settings.desktopId, "x.desktop")
  assert.equal(Edit.add([], "cpu", {}, null, 1, 1), null, "no room anywhere")
})

test("parked items don't block edits, and can be placed again", () => {
  // Shrink the grid: the right-hand widgets park.
  const items = layout()
  const cols = 10
  const parkedIds = Edit.parked(items, cols, R).map((i) => i.id)
  assert.ok(parkedIds.includes("media-1") && parkedIds.includes("vol-1"))
  // vol-1's stale spot (col 12) is off this grid; media-1 overlaps nothing placed.
  assert.ok(Edit.move(items, "key-3", 6, 5, cols, R), "a placed item moves freely past parked ones")
  assert.equal(Edit.move(items, "vol-1", 0, 0, cols, R), null, "a parked item can't be dragged")
  const placed = Edit.placeParked(items, "vol-1", cols, R)
  const v = byId(placed, "vol-1")
  assert.ok(Grid.inBounds(v, cols, R), `vol-1 placed at ${v.col},${v.row} ${v.w}x${v.h}`)
  assert.ok(!Edit.parked(placed, cols, R).some((i) => i.id === "vol-1"))
})

test("updateSettings merges, and null clears a key", () => {
  const items = layout()
  const u = Edit.updateSettings(items, "cpu-1", { tempWarn: 70, tempCrit: null })
  assert.deepEqual(byId(u, "cpu-1").settings, { tempWarn: 70 })
  assert.deepEqual(byId(items, "cpu-1").settings, { tempWarn: 80, tempCrit: 95 }, "input untouched")
  assert.equal(Edit.updateSettings(items, "nope", {}), null)
})

test("itemAt finds the placed item under a cell", () => {
  const items = layout()
  assert.equal(Edit.itemAt(items, 1, 1, C, R).id, "cpu-1")
  assert.equal(Edit.itemAt(items, 13, 8, C, R).id, "vol-1")
  assert.equal(Edit.itemAt(items, 8, 6, C, R), null)
})

// DESIGN.md 17 Phase 4: config.json stays valid through every edit operation.
test("fuzz: thousands of random edits never produce an invalid or overlapping config", () => {
  let seed = 424242
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
  const types = Widgets.types()
  let cfg = Config.defaultConfig()
  let removed = null
  for (let step = 0; step < 3000; step++) {
    const cols = cfg.appearance.columns, rows = cfg.appearance.rows
    let items = Config.pageItems(cfg, 0)
    const pick = items.length ? items[rnd(items.length)] : null
    let next = null
    switch (rnd(8)) {
      case 0: next = pick && Edit.move(items, pick.id, rnd(cols), rnd(rows), cols, rows); break
      case 1: next = pick && Edit.resize(items, pick.id, 1 + rnd(6), 1 + rnd(6), cols, rows); break
      case 2: { const r = pick && Edit.remove(items, pick.id); if (r) { next = r.items; removed = r.removed } break }
      case 3: next = removed && Edit.undoRemove(items, removed, cols, rows); removed = null; break
      case 4: { const a = Edit.add(items, types[rnd(types.length)], {}, { col: rnd(cols), row: rnd(rows) }, cols, rows); next = a && a.items; break }
      case 5: next = pick && Edit.updateSettings(items, pick.id, { label: "x" + step, confirm: rnd(2) === 1 }); break
      case 6: { const p = Edit.parked(items, cols, rows); next = p.length ? Edit.placeParked(items, p[0].id, cols, rows) : null; break }
      case 7: // the grid shrinks or grows by hand edit: parking must never lose anything
        cfg = Object.assign({}, cfg, { appearance: Object.assign({}, cfg.appearance, { columns: 8 + rnd(9), rows: 5 + rnd(5) }) })
        break
    }
    if (next) cfg = Config.withPageItems(cfg, 0, next)

    const round = Config.parse(Config.serialize(cfg))
    assert.ok(round.ok, `step ${step}: config no longer parses`)
    assert.deepEqual(round.errors, [], `step ${step}: config needed repairs: ${round.errors}`)
    items = Config.pageItems(round.config, 0)
    const ids = items.map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length, `step ${step}: duplicate ids`)
    const { placed } = Grid.partitionByFit(items, round.config.appearance.columns, round.config.appearance.rows)
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++)
      assert.ok(!Grid.overlaps(placed[i], placed[j]), `step ${step}: overlap`)
    for (const it of items) {
      const s = Widgets.specFor(it.type)
      assert.ok(it.w >= s.minSize.w && it.h >= s.minSize.h, `step ${step}: ${it.id} below minimum`)
    }
  }
})
