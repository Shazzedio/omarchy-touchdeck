import { test } from "node:test"
import assert from "node:assert/strict"
import * as grid from "../lib/grid.mjs"

const COLS = 16
const ROWS = 9

function item(id, col, row, w, h) {
  return { id, type: "cpu", col, row, w, h, settings: {} }
}

test("overlaps is true only for real intersections", () => {
  const a = item("a", 0, 0, 2, 2)
  assert.equal(grid.overlaps(a, item("b", 1, 1, 2, 2)), true)
  assert.equal(grid.overlaps(a, item("b", 2, 0, 2, 2)), false, "edge-adjacent right")
  assert.equal(grid.overlaps(a, item("b", 0, 2, 2, 2)), false, "edge-adjacent below")
  assert.equal(grid.overlaps(a, item("b", 1, 0, 1, 1)), true, "contained")
})

test("inBounds rejects items running off any edge", () => {
  assert.equal(grid.inBounds(item("a", 14, 7, 2, 2), COLS, ROWS), true)
  assert.equal(grid.inBounds(item("a", 15, 0, 2, 1), COLS, ROWS), false, "off right")
  assert.equal(grid.inBounds(item("a", 0, 8, 1, 2), COLS, ROWS), false, "off bottom")
  assert.equal(grid.inBounds(item("a", -1, 0, 1, 1), COLS, ROWS), false, "negative col")
  assert.equal(grid.inBounds(item("a", 0, 0, 0, 1), COLS, ROWS), false, "zero width")
})

test("canPlace ignores the item being moved", () => {
  const items = [item("a", 0, 0, 2, 2), item("b", 4, 0, 2, 2)]
  assert.equal(grid.canPlace(items, item("a", 0, 0, 2, 2), COLS, ROWS, "a"), true,
    "a no-op move must not collide with itself")
  assert.equal(grid.canPlace(items, item("a", 4, 0, 2, 2), COLS, ROWS, "a"), false,
    "moving onto b is rejected")
})

test("withPlacement returns null on a rejected move and leaves the input alone", () => {
  const items = [item("a", 0, 0, 2, 2), item("b", 4, 0, 2, 2)]
  const before = JSON.stringify(items)

  assert.equal(grid.withPlacement(items, "a", { col: 4, row: 0 }, COLS, ROWS), null)
  assert.equal(grid.withPlacement(items, "a", { col: 15, row: 0 }, COLS, ROWS), null)
  assert.equal(grid.withPlacement(items, "nope", { col: 0, row: 0 }, COLS, ROWS), null)
  assert.equal(JSON.stringify(items), before, "input array must not be mutated")

  const moved = grid.withPlacement(items, "a", { col: 8, row: 4 }, COLS, ROWS)
  assert.deepEqual({ col: moved[0].col, row: moved[0].row }, { col: 8, row: 4 })
  assert.equal(moved[0].settings, items[0].settings, "unrelated fields carry through")
})

test("withPlacement resizes and rejects a resize that would collide", () => {
  const items = [item("a", 0, 0, 2, 2), item("b", 2, 0, 2, 2)]
  assert.equal(grid.withPlacement(items, "a", { col: 0, row: 0, w: 3, h: 2 }, COLS, ROWS), null)
  const grown = grid.withPlacement(items, "a", { col: 0, row: 0, w: 2, h: 4 }, COLS, ROWS)
  assert.equal(grown[0].h, 4)
})

test("firstFree scans row-major and reports exhaustion", () => {
  assert.deepEqual(grid.firstFree([], 2, 2, COLS, ROWS), { col: 0, row: 0 })
  assert.deepEqual(grid.firstFree([item("a", 0, 0, 2, 2)], 2, 2, COLS, ROWS), { col: 2, row: 0 })
  assert.equal(grid.firstFree([item("a", 0, 0, 2, 2)], 2, 2, 2, 2), null, "no room left")
})

test("add places at the requested spot when free, otherwise finds one", () => {
  const items = [item("a", 0, 0, 2, 2)]
  const placedAsAsked = grid.add(items, item("b", 4, 4, 2, 2), COLS, ROWS)
  assert.deepEqual({ col: placedAsAsked[1].col, row: placedAsAsked[1].row }, { col: 4, row: 4 })

  const relocated = grid.add(items, item("b", 0, 0, 2, 2), COLS, ROWS)
  assert.deepEqual({ col: relocated[1].col, row: relocated[1].row }, { col: 2, row: 0 })

  assert.equal(grid.add([item("a", 0, 0, 2, 2)], item("b", 0, 0, 2, 2), 2, 2), null)
})

test("partitionByFit parks what no longer fits and keeps the rest in order", () => {
  const items = [
    item("keep-1", 0, 0, 2, 2),
    item("park-wide", 14, 0, 2, 2),
    item("keep-2", 2, 0, 2, 2),
    item("park-tall", 0, 6, 2, 2),
  ]
  const { placed, unplaced } = grid.partitionByFit(items, 8, 6)
  assert.deepEqual(placed.map((i) => i.id), ["keep-1", "keep-2"])
  assert.deepEqual(unplaced.map((i) => i.id), ["park-wide", "park-tall"])
  assert.equal(placed.length + unplaced.length, items.length, "nothing is ever deleted")
})

test("partitionByFit parks the later of two overlapping items rather than dropping one", () => {
  const items = [item("first", 0, 0, 2, 2), item("second", 1, 1, 2, 2)]
  const { placed, unplaced } = grid.partitionByFit(items, COLS, ROWS)
  assert.deepEqual(placed.map((i) => i.id), ["first"])
  assert.deepEqual(unplaced.map((i) => i.id), ["second"])
})

test("reflowUnplaced re-seats parked items when the grid grows back", () => {
  const shrunk = grid.partitionByFit(
    [item("a", 0, 0, 2, 2), item("b", 14, 0, 2, 2)], 8, 6)
  assert.equal(shrunk.unplaced.length, 1)

  const grown = grid.reflowUnplaced(shrunk.placed, shrunk.unplaced, COLS, ROWS)
  assert.equal(grown.unplaced.length, 0)
  assert.equal(grown.placed.length, 2)
  assert.equal(grid.collisions(grown.placed, grown.placed[1], "b").length, 0)
})

test("geometry fits whole-pixel cells inside the window and centres the remainder", () => {
  // The deck's real canvas: 1536x838 logical after the bar's 26px (DECISIONS G-3).
  const geom = grid.geometry(1536, 838, COLS, ROWS, 8, 6)
  assert.ok(geom.cellW > 0 && geom.cellH > 0)
  assert.equal(geom.cellW, Math.floor(geom.cellW), "cells are whole pixels")
  assert.ok(geom.gridW <= 1536 - 8 * 2, "grid fits inside the margin")
  assert.ok(geom.gridH <= 838 - 8 * 2)
  assert.ok(geom.originX >= 8 && geom.originY >= 8, "leftover space lands in the margin")

  const last = grid.cellRect(geom, COLS - 1, ROWS - 1, 1, 1)
  assert.ok(last.x + last.width <= 1536, "last column stays on screen")
  assert.ok(last.y + last.height <= 838, "last row stays on screen")
})

test("geometry survives a window too small to fit the grid", () => {
  const geom = grid.geometry(40, 20, COLS, ROWS, 8, 6)
  assert.equal(geom.cellW, 0)
  assert.equal(geom.cellH, 0)
  assert.ok(Number.isFinite(geom.originX) && Number.isFinite(geom.originY))
})

test("cellRect spans gaps for multi-cell items", () => {
  const geom = grid.geometry(1536, 838, COLS, ROWS, 8, 6)
  const one = grid.cellRect(geom, 0, 0, 1, 1)
  const three = grid.cellRect(geom, 0, 0, 3, 1)
  assert.equal(three.width, one.width * 3 + geom.gap * 2,
    "a 3-wide item covers the two gaps it spans")
})

test("cellAt inverts cellRect and clamps outside the grid", () => {
  const geom = grid.geometry(1536, 838, COLS, ROWS, 8, 6)
  for (const [col, row] of [[0, 0], [5, 3], [COLS - 1, ROWS - 1]]) {
    const rect = grid.cellRect(geom, col, row, 1, 1)
    assert.deepEqual(
      grid.cellAt(geom, rect.x + rect.width / 2, rect.y + rect.height / 2),
      { col, row })
  }
  assert.deepEqual(grid.cellAt(geom, -500, -500), { col: 0, row: 0 })
  assert.deepEqual(grid.cellAt(geom, 99999, 99999), { col: COLS - 1, row: ROWS - 1 })
})

test("fuzz: random move/resize/add/remove never corrupts the grid", () => {
  // DESIGN.md 17 Phase 4 asks for this; running it from Phase 1 means the
  // engine is trustworthy before edit mode is built on top of it.
  let seed = 12345
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed % n
  }

  let items = []
  for (let step = 0; step < 4000; step++) {
    const op = rnd(4)
    if (op === 0 || items.length === 0) {
      const next = grid.add(items, {
        id: "i" + step, type: "cpu", col: rnd(COLS), row: rnd(ROWS),
        w: 1 + rnd(4), h: 1 + rnd(3), settings: {},
      }, COLS, ROWS)
      if (next) items = next
    } else if (op === 1) {
      items = grid.remove(items, items[rnd(items.length)].id)
    } else if (op === 2) {
      const target = items[rnd(items.length)]
      const next = grid.withPlacement(items, target.id,
        { col: rnd(COLS), row: rnd(ROWS) }, COLS, ROWS)
      if (next) items = next
    } else {
      const target = items[rnd(items.length)]
      const next = grid.withPlacement(items, target.id,
        { col: target.col, row: target.row, w: 1 + rnd(4), h: 1 + rnd(3) }, COLS, ROWS)
      if (next) items = next
    }

    for (let i = 0; i < items.length; i++) {
      assert.ok(grid.inBounds(items[i], COLS, ROWS),
        `step ${step}: ${items[i].id} left the grid`)
      for (let j = i + 1; j < items.length; j++) {
        assert.ok(!grid.overlaps(items[i], items[j]),
          `step ${step}: ${items[i].id} overlaps ${items[j].id}`)
      }
    }
  }
  assert.ok(items.length > 0, "the fuzz run should end with something placed")
})
