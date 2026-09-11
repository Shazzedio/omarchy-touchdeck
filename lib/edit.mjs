// Edit mode's operations on a page's items. Pure: EditOverlay.qml and the
// sheets call these and hand the result to ConfigStore, which saves it.
// ES2015 only: this also runs in Qt's QML engine.
//
// The rule that shapes everything here: an edit only ever collides with
// *placed* items. Items parked because the grid shrank (DESIGN.md 6) keep
// their stale positions in the config, and colliding with those would block
// perfectly good moves. So every operation splits the page into placed and
// parked, works on the placed set, and leaves parked items exactly as they
// were -- until one is deliberately placed.
import * as Grid from "./grid.mjs"
import * as Widgets from "./widgets.mjs"
import * as Config from "./config.mjs"

function indexOf(items, id) {
  for (let i = 0; i < items.length; i++) if (items[i].id === id) return i
  return -1
}

function placedOf(items, cols, rows) {
  return Grid.partitionByFit(items || [], cols, rows).placed
}

function isPlaced(items, id, cols, rows) {
  return indexOf(placedOf(items, cols, rows), id) !== -1
}

// Does candidate fit among the placed items, ignoring ignoreId?
export function fits(items, candidate, cols, rows, ignoreId) {
  return Grid.canPlace(placedOf(items, cols, rows), candidate, cols, rows, ignoreId)
}

function replace(items, index, item) {
  const out = items.slice()
  out[index] = item
  return out
}

// The placed item covering a cell, or null.
export function itemAt(items, col, row, cols, rows) {
  const placed = placedOf(items, cols, rows)
  for (let i = 0; i < placed.length; i++) {
    const it = placed[i]
    if (col >= it.col && col < it.col + it.w && row >= it.row && row < it.row + it.h) return it
  }
  return null
}

// A drag's pixels -> whole cells. Rounding, so a drag that goes more than
// half a cell counts as one.
export function cells(px, step) {
  return step > 0 ? Math.round(Number(px) / step) : 0
}

// Where a moved item would land: kept inside the grid, so dragging past an
// edge pins it to the edge instead of refusing.
export function moveTarget(item, dCols, dRows, cols, rows) {
  const col = Math.min(Math.max(item.col + dCols, 0), Math.max(0, cols - item.w))
  const row = Math.min(Math.max(item.row + dRows, 0), Math.max(0, rows - item.h))
  return { col: col, row: row, w: item.w, h: item.h }
}

// What size a resize would give: the widget's own limits, and never past the
// grid's edge from where the item starts.
export function resizeTarget(item, dCols, dRows, cols, rows) {
  const size = Widgets.clampSize(item.type, item.w + dCols, item.h + dRows, cols - item.col, rows - item.row)
  return { col: item.col, row: item.row, w: size.w, h: size.h }
}

export function move(items, id, col, row, cols, rows) {
  const i = indexOf(items, id)
  if (i === -1 || !isPlaced(items, id, cols, rows)) return null
  const next = Object.assign({}, items[i], { col: col, row: row })
  return fits(items, next, cols, rows, id) ? replace(items, i, next) : null
}

export function resize(items, id, w, h, cols, rows) {
  const i = indexOf(items, id)
  if (i === -1 || !isPlaced(items, id, cols, rows)) return null
  const it = items[i]
  const size = Widgets.clampSize(it.type, w, h, cols, rows)
  if (size.w !== w || size.h !== h) return null   // outside the widget's limits
  const next = Object.assign({}, it, { w: w, h: h })
  return fits(items, next, cols, rows, id) ? replace(items, i, next) : null
}

// Returns { items, removed } where removed is what undoRemove() needs.
export function remove(items, id) {
  const i = indexOf(items, id)
  if (i === -1) return null
  const out = items.slice()
  out.splice(i, 1)
  return { items: out, removed: { item: items[i], index: i } }
}

// Candidate sizes for placing an item: as it was (or its default), then its
// minimum -- a smaller widget beats no widget.
function sizesFor(item) {
  const spec = Widgets.specFor(item.type)
  const out = [{ w: item.w, h: item.h }]
  if (spec.minSize.w !== item.w || spec.minSize.h !== item.h) out.push({ w: spec.minSize.w, h: spec.minSize.h })
  return out
}

// Somewhere for item: preferably at `at` (a cell), otherwise the first free
// spot, trying each candidate size. Null if the page is full.
function findSpot(items, item, at, cols, rows) {
  const placed = placedOf(items, cols, rows)
  const sizes = sizesFor(item)
  for (let s = 0; s < sizes.length; s++) {
    if (at) {
      const c = { col: at.col, row: at.row, w: sizes[s].w, h: sizes[s].h }
      if (Grid.canPlace(placed, c, cols, rows, item.id)) return c
    }
  }
  for (let s = 0; s < sizes.length; s++) {
    const spot = Grid.firstFree(placed, sizes[s].w, sizes[s].h, cols, rows)
    if (spot) return { col: spot.col, row: spot.row, w: sizes[s].w, h: sizes[s].h }
  }
  return null
}

// Put a removed item back: where it was if that's still free, otherwise the
// nearest thing to it. Null only if there's no room at all.
export function undoRemove(items, removed, cols, rows) {
  if (!removed || !removed.item) return null
  const spot = findSpot(items, removed.item, { col: removed.item.col, row: removed.item.row }, cols, rows)
  if (!spot) return null
  const item = Object.assign({}, removed.item, spot)
  const out = items.slice()
  out.splice(Math.min(removed.index, out.length), 0, item)
  return out
}

// A new widget at the tapped cell (or the first place it fits), at its default
// size or, failing that, its minimum. Returns { items, item } or null if full.
export function add(items, type, settings, at, cols, rows) {
  const spec = Widgets.specFor(type)
  const draft = {
    id: Config.nextItemId(items, type),
    type: type,
    col: 0, row: 0, w: spec.defaultSize.w, h: spec.defaultSize.h,
    settings: Widgets.settingsFor(type, settings),
  }
  const spot = findSpot(items, draft, at, cols, rows)
  if (!spot) return null
  const item = Object.assign({}, draft, spot)
  return { items: items.concat([item]), item: item }
}

// Give a parked item a place on the grid again. Null if there's no room.
export function placeParked(items, id, cols, rows) {
  const i = indexOf(items, id)
  if (i === -1 || isPlaced(items, id, cols, rows)) return null
  const spot = findSpot(items, items[i], null, cols, rows)
  if (!spot) return null
  return replace(items, i, Object.assign({}, items[i], spot))
}

// Merge a settings patch into one item. A null value removes the key, so a
// field can be cleared back to its default.
export function updateSettings(items, id, patch) {
  const i = indexOf(items, id)
  if (i === -1) return null
  const settings = Object.assign({}, items[i].settings || {})
  const keys = Object.keys(patch || {})
  for (let k = 0; k < keys.length; k++) {
    if (patch[keys[k]] === null || patch[keys[k]] === undefined) delete settings[keys[k]]
    else settings[keys[k]] = patch[keys[k]]
  }
  return replace(items, i, Object.assign({}, items[i], { settings: settings }))
}

export function parked(items, cols, rows) {
  return Grid.partitionByFit(items || [], cols, rows).unplaced
}
