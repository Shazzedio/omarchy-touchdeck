// Grid engine. Pure functions over plain objects -- no QML, no I/O.
//
// The deck is a fixed cols x rows grid fitted to the window's actual logical
// size. Items are placed by cell, never by pixel, and never overlap: a move or
// resize that would collide or leave the grid is rejected so the caller can
// snap back. Predictable beats clever, so nothing reflows on its own.
//
// An item is { id, type, col, row, w, h, settings }. Only the geometry fields
// matter here; everything else is carried through untouched.

export function isPlacement(item) {
  return !!item
    && Number.isInteger(item.col) && Number.isInteger(item.row)
    && Number.isInteger(item.w) && Number.isInteger(item.h)
    && item.w > 0 && item.h > 0
}

export function inBounds(item, cols, rows) {
  return isPlacement(item)
    && item.col >= 0 && item.row >= 0
    && item.col + item.w <= cols
    && item.row + item.h <= rows
}

export function overlaps(a, b) {
  return a.col < b.col + b.w
    && b.col < a.col + a.w
    && a.row < b.row + b.h
    && b.row < a.row + a.h
}

// Everything in `items` that would collide with `candidate`, ignoring the item
// being moved (matched by id) so a no-op move doesn't collide with itself.
export function collisions(items, candidate, ignoreId) {
  const out = []
  for (const item of items) {
    if (item.id === ignoreId) continue
    if (!isPlacement(item)) continue
    if (overlaps(item, candidate)) out.push(item)
  }
  return out
}

export function canPlace(items, candidate, cols, rows, ignoreId) {
  if (!inBounds(candidate, cols, rows)) return false
  return collisions(items, candidate, ignoreId).length === 0
}

// Returns a new array with the item moved/resized, or null when the placement
// is rejected. Callers treat null as "snap back".
export function withPlacement(items, id, placement, cols, rows) {
  const index = items.findIndex(function (i) { return i.id === id })
  if (index === -1) return null
  const next = Object.assign({}, items[index], {
    col: placement.col, row: placement.row,
    w: placement.w === undefined ? items[index].w : placement.w,
    h: placement.h === undefined ? items[index].h : placement.h,
  })
  if (!canPlace(items, next, cols, rows, id)) return null
  const out = items.slice()
  out[index] = next
  return out
}

// The first free cell that fits a w x h item, scanning row-major so new items
// land top-left first, the way a reader expects.
export function firstFree(items, w, h, cols, rows) {
  for (let row = 0; row + h <= rows; row++) {
    for (let col = 0; col + w <= cols; col++) {
      if (canPlace(items, { col, row, w, h }, cols, rows)) return { col, row }
    }
  }
  return null
}

export function add(items, item, cols, rows) {
  if (isPlacement(item) && canPlace(items, item, cols, rows)) return items.concat([item])
  const spot = firstFree(items, item.w, item.h, cols, rows)
  if (!spot) return null
  return items.concat([Object.assign({}, item, spot)])
}

export function remove(items, id) {
  return items.filter(function (i) { return i.id !== id })
}

// When the grid shrinks, items that no longer fit are parked rather than
// deleted (DESIGN.md 6). Parking is order-stable: earlier items keep their
// place, later ones are pushed out, so a shrink/grow round-trip is predictable.
export function partitionByFit(items, cols, rows) {
  const placed = []
  const unplaced = []
  for (const item of items) {
    if (isPlacement(item) && canPlace(placed, item, cols, rows)) placed.push(item)
    else unplaced.push(item)
  }
  return { placed, unplaced }
}

// Try to re-seat parked items now that there is room again. Anything that still
// doesn't fit stays parked.
export function reflowUnplaced(placed, unplaced, cols, rows) {
  const nextPlaced = placed.slice()
  const stillUnplaced = []
  for (const item of unplaced) {
    const spot = firstFree(nextPlaced, item.w, item.h, cols, rows)
    if (spot) nextPlaced.push(Object.assign({}, item, spot))
    else stillUnplaced.push(item)
  }
  return { placed: nextPlaced, unplaced: stillUnplaced }
}

// Fit the grid to the window's real logical size. Cells are whole pixels so
// borders stay crisp; the rounding remainder is spread into the outer margin
// rather than left as a seam down one edge.
export function geometry(width, height, cols, rows, margin, gap) {
  const usableW = Math.max(0, width - margin * 2 - gap * Math.max(0, cols - 1))
  const usableH = Math.max(0, height - margin * 2 - gap * Math.max(0, rows - 1))
  const cellW = cols > 0 ? Math.floor(usableW / cols) : 0
  const cellH = rows > 0 ? Math.floor(usableH / rows) : 0
  const gridW = cellW * cols + gap * Math.max(0, cols - 1)
  const gridH = cellH * rows + gap * Math.max(0, rows - 1)
  return {
    cellW, cellH, gap, cols, rows,
    originX: Math.floor((width - gridW) / 2),
    originY: Math.floor((height - gridH) / 2),
    gridW, gridH,
  }
}

export function cellRect(geom, col, row, w, h) {
  return {
    x: geom.originX + col * (geom.cellW + geom.gap),
    y: geom.originY + row * (geom.cellH + geom.gap),
    width: w * geom.cellW + (w - 1) * geom.gap,
    height: h * geom.cellH + (h - 1) * geom.gap,
  }
}

// Inverse of cellRect for drag handling: which cell does this point fall in?
// Clamped, so a drag that strays past the edge still yields a legal cell.
export function cellAt(geom, x, y) {
  const stepX = geom.cellW + geom.gap
  const stepY = geom.cellH + geom.gap
  const col = stepX > 0 ? Math.floor((x - geom.originX + geom.gap / 2) / stepX) : 0
  const row = stepY > 0 ? Math.floor((y - geom.originY + geom.gap / 2) / stepY) : 0
  return {
    col: Math.min(Math.max(col, 0), Math.max(0, geom.cols - 1)),
    row: Math.min(Math.max(row, 0), Math.max(0, geom.rows - 1)),
  }
}
