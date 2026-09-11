// Configuration: defaults, parsing, validation, migration. Pure -- no QML, no
// I/O. ConfigStore.qml owns reading and writing the file; everything about what
// the file *means* lives here so it can be tested with `node --test`.
//
// Two rules shape this module (DESIGN.md 12):
//   - the file is hand-editable, so a bad value must never lose the layout;
//     validation repairs what it can and reports what it couldn't.
//   - unknown fields are preserved on write, so a newer Touchdeck's config
//     survives a round-trip through an older one.

export const CONFIG_VERSION = 1

// 16x9 fitted to the deck's real canvas gives ~96px cells (DECISIONS.md D-3).
export const DEFAULT_COLUMNS = 16
export const DEFAULT_ROWS = 9

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    display: {
      match: { by: "description", value: "Verbatim" },
      layer: "top",
      startVisible: true,
    },
    appearance: { scale: 1.0, columns: DEFAULT_COLUMNS, rows: DEFAULT_ROWS, reduceMotion: false },
    sensors: { intervalMs: 1000 },
    launch: { target: "auto", restoreFocus: true },
    pages: [{ id: "main", items: defaultItems() }],
  }
}

// The layout sketched in DESIGN.md 6. The three app keys start unconfigured:
// `defaultRole` is a one-shot hint that Phase 3's AppsService resolves to a
// desktop id the first time it can, then clears. Everything else on the key
// row stays empty -- empty cells only show a "+" in edit mode.
export function defaultItems() {
  return [
    { id: "cpu-1", type: "cpu", col: 0, row: 0, w: 3, h: 3, settings: { tempWarn: 80, tempCrit: 95 } },
    { id: "gpu-1", type: "gpu", col: 3, row: 0, w: 3, h: 3, settings: { gpu: "auto", tempWarn: 80, tempCrit: 90 } },
    { id: "mem-1", type: "memory", col: 6, row: 0, w: 4, h: 3, settings: { showSwap: false, vramGpu: "auto" } },
    { id: "media-1", type: "media", col: 10, row: 0, w: 6, h: 3, settings: { preferredPlayer: "" } },
    { id: "vol-1", type: "volume", col: 12, row: 3, w: 4, h: 6, settings: { maxVolume: 1.0, showMic: true } },
    { id: "key-1", type: "app", col: 0, row: 3, w: 2, h: 2, settings: { defaultRole: "browser", target: "auto" } },
    { id: "key-2", type: "app", col: 2, row: 3, w: 2, h: 2, settings: { defaultRole: "files", target: "auto" } },
    { id: "key-3", type: "app", col: 4, row: 3, w: 2, h: 2, settings: { defaultRole: "terminal", target: "auto" } },
  ]
}

// ---------------------------------------------------------------- coercion

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function num(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function int(value, fallback, min, max) {
  return Math.round(num(value, fallback, min, max))
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback
}

function str(value, fallback) {
  return typeof value === "string" ? value : fallback
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) !== -1 ? value : fallback
}

// Merge `patch` onto `base`, keeping any key of `source` that neither knows
// about. This is what preserves fields written by a newer version.
function withUnknown(source, known) {
  if (!isObject(source)) return known
  const out = {}
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(known, key)) out[key] = source[key]
  }
  return Object.assign(out, known)
}

// ---------------------------------------------------------------- validation

// Every widget type known to the deck. Unknown types are kept in the config
// (so a config from a newer version isn't silently gutted) but reported, and
// the renderer shows them as an unknown-widget tile.
export const KNOWN_TYPES = ["cpu", "gpu", "memory", "volume", "media", "app"]

function validateItem(raw, index, errors) {
  if (!isObject(raw)) {
    errors.push("pages[].items[" + index + "] is not an object; dropped")
    return null
  }
  const id = str(raw.id, "")
  if (!id) {
    errors.push("pages[].items[" + index + "] has no id; dropped")
    return null
  }
  const type = str(raw.type, "")
  if (!type) {
    errors.push("item '" + id + "' has no type; dropped")
    return null
  }
  if (KNOWN_TYPES.indexOf(type) === -1) {
    errors.push("item '" + id + "' has unknown type '" + type + "'")
  }
  const known = {
    id,
    type,
    col: int(raw.col, 0, 0, 4096),
    row: int(raw.row, 0, 0, 4096),
    w: int(raw.w, 1, 1, 4096),
    h: int(raw.h, 1, 1, 4096),
    settings: isObject(raw.settings) ? raw.settings : {},
  }
  return withUnknown(raw, known)
}

function validatePage(raw, index, errors) {
  if (!isObject(raw)) {
    errors.push("pages[" + index + "] is not an object; dropped")
    return null
  }
  const items = []
  const seen = {}
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  if (!Array.isArray(raw.items) && raw.items !== undefined) {
    errors.push("pages[" + index + "].items is not an array; treated as empty")
  }
  for (let i = 0; i < rawItems.length; i++) {
    const item = validateItem(rawItems[i], i, errors)
    if (!item) continue
    if (seen[item.id]) {
      errors.push("duplicate item id '" + item.id + "'; later one dropped")
      continue
    }
    seen[item.id] = true
    items.push(item)
  }
  return withUnknown(raw, { id: str(raw.id, "page-" + index), items })
}

// Fills defaults, clamps out-of-range values, drops unusable items, and returns
// both the repaired config and a list of what it had to repair. Never throws.
export function validate(raw) {
  const errors = []
  const defaults = defaultConfig()
  if (!isObject(raw)) {
    return { config: defaults, errors: raw === undefined ? [] : ["config root is not an object; using defaults"] }
  }

  const display = isObject(raw.display) ? raw.display : {}
  const match = isObject(display.match) ? display.match : {}
  const appearance = isObject(raw.appearance) ? raw.appearance : {}
  const sensors = isObject(raw.sensors) ? raw.sensors : {}
  const launch = isObject(raw.launch) ? raw.launch : {}

  const columns = int(appearance.columns, DEFAULT_COLUMNS, 1, 64)
  const rows = int(appearance.rows, DEFAULT_ROWS, 1, 64)

  let pages = []
  if (Array.isArray(raw.pages)) {
    for (let i = 0; i < raw.pages.length; i++) {
      const page = validatePage(raw.pages[i], i, errors)
      if (page) pages.push(page)
    }
  } else if (raw.pages !== undefined) {
    errors.push("pages is not an array; using the default layout")
  }
  if (pages.length === 0) {
    if (raw.pages !== undefined && Array.isArray(raw.pages) && raw.pages.length > 0) {
      errors.push("no usable pages; using the default layout")
    }
    pages = defaults.pages
  }

  const config = {
    version: CONFIG_VERSION,
    display: withUnknown(display, {
      match: withUnknown(match, {
        by: oneOf(str(match.by, "description"), ["name", "description"], "description"),
        value: str(match.value, defaults.display.match.value),
      }),
      layer: oneOf(str(display.layer, "top"), ["background", "bottom", "top", "overlay"], "top"),
      startVisible: bool(display.startVisible, true),
    }),
    appearance: withUnknown(appearance, {
      scale: num(appearance.scale, 1.0, 0.5, 3.0),
      columns,
      rows,
      reduceMotion: bool(appearance.reduceMotion, false),
    }),
    sensors: withUnknown(sensors, {
      intervalMs: int(sensors.intervalMs, 1000, 200, 60000),
    }),
    launch: withUnknown(launch, {
      target: str(launch.target, "auto"),
      // Hand Hyprland's focus back to the main monitor after a touch on the
      // deck (DESIGN.md 5.6). Off for someone who wants focus to stay.
      restoreFocus: bool(launch.restoreFocus, true),
    }),
    pages,
  }
  return { config: withUnknown(raw, config), errors }
}

// ---------------------------------------------------------------- migration

// Bring an older file forward. There is only one version so far; the shape is
// here so v2 is a one-line addition rather than a refactor.
export function migrate(raw) {
  if (!isObject(raw)) return raw
  const version = Number(raw.version)
  if (!Number.isFinite(version) || version >= CONFIG_VERSION) return raw
  // No migrations yet: v1 is the first version.
  return Object.assign({}, raw, { version: CONFIG_VERSION })
}

// ---------------------------------------------------------------- parsing

// Turn file text into a usable config. Distinguishes three outcomes so the deck
// can tell the difference between "no file yet" (write defaults), "broken file"
// (keep the last good layout and show a banner) and "fine".
//
// Returns { ok, config, errors, parseError, isEmpty }.
export function parse(text) {
  const raw = typeof text === "string" ? text : ""
  if (raw.trim() === "") {
    return { ok: true, isEmpty: true, config: defaultConfig(), errors: [], parseError: "" }
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch (_) {
    return {
      ok: false,
      isEmpty: false,
      config: null,
      errors: [],
      parseError: describeJsonError(raw),
    }
  }
  const result = validate(migrate(json))
  return { ok: true, isEmpty: false, config: result.config, errors: result.errors, parseError: "" }
}

// Finding where a broken config went wrong.
//
// Engines disagree wildly here: Node reports "Unexpected token , in JSON at
// position 47", while the QML engine the deck actually runs in reports only
// "Parse error" -- no position, no line, nothing to put in a banner. Since
// DESIGN.md 12 promises the user a line number, we find it ourselves with a
// scanner that validates structure without building a value.
//
// Returns { line, column, message }; line is 1-based.

// Everything in lib/ runs in two engines: Node for the tests and Qt's QML engine
// in the shell. The QML engine rejects object spread (`{ ...a }`), so this uses
// Object.assign; tools/check.sh lints lib/ under the QML parser to keep it so.
const PUNCT = "{}[]:,"

function scanTokens(text) {
  const tokens = []
  let i = 0
  let line = 1
  let lineStart = 0
  const at = () => ({ line, column: i - lineStart + 1, index: i })

  while (i < text.length) {
    const ch = text[i]

    if (ch === "\n") { i++; line++; lineStart = i; continue }
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue }

    if (PUNCT.indexOf(ch) !== -1) {
      tokens.push(Object.assign({ kind: ch, text: ch }, at()))
      i++
      continue
    }

    if (ch === '"') {
      const start = at()
      i++
      let closed = false
      while (i < text.length) {
        if (text[i] === "\\") {
          if (i + 1 >= text.length) break
          // A literal newline inside an escape is still an unterminated string.
          if (text[i + 1] === "\n") break
          i += 2
          continue
        }
        if (text[i] === '"') { i++; closed = true; break }
        // JSON forbids a raw newline inside a string; treat it as the end so
        // the error points at the opening quote rather than running to EOF.
        if (text[i] === "\n") break
        i++
      }
      if (!closed) return { tokens, error: Object.assign({}, start, { message: "unterminated string" }) }
      tokens.push(Object.assign({ kind: "value", text: "string" }, start))
      continue
    }

    const literal = /^(?:true|false|null)/.exec(text.slice(i))
    if (literal) {
      tokens.push(Object.assign({ kind: "value", text: literal[0] }, at()))
      i += literal[0].length
      continue
    }

    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))
    if (number && number[0].length > 0) {
      tokens.push(Object.assign({ kind: "value", text: number[0] }, at()))
      i += number[0].length
      continue
    }

    return { tokens, error: Object.assign(at(), { message: "unexpected " + describeChar(ch) }) }
  }
  return { tokens, error: null }
}

function describeChar(ch) {
  if (ch === "'") return "'" + ch + "' (JSON needs double quotes)"
  return "'" + ch + "'"
}

function describeToken(token) {
  if (!token) return "end of file"
  if (token.kind === "value") return token.text === "string" ? "a string" : "'" + token.text + "'"
  return "'" + token.text + "'"
}

// Recursive-descent validator over the token list. Only reports the first
// problem -- the rest are usually consequences of it, and the banner has one
// line anyway.
function findStructuralError(tokens) {
  let pos = 0
  let failure = null

  const peek = () => tokens[pos]
  const fail = (message, token) => {
    if (!failure) {
      const t = token || tokens[pos] || tokens[tokens.length - 1] || { line: 1, column: 1 }
      failure = { line: t.line, column: t.column, message }
    }
    return false
  }

  function expect(kind, what) {
    const t = peek()
    if (!t || t.kind !== kind) return fail("expected " + what + ", found " + describeToken(t))
    pos++
    return true
  }

  function value() {
    const t = peek()
    if (!t) return fail("unexpected end of file")
    if (t.kind === "value") { pos++; return true }
    if (t.kind === "{") return object()
    if (t.kind === "[") return array()
    return fail("unexpected " + describeToken(t))
  }

  function object() {
    pos++ // {
    if (peek() && peek().kind === "}") { pos++; return true }
    for (;;) {
      const key = peek()
      if (!key || key.kind !== "value" || key.text !== "string")
        return fail("expected a property name, found " + describeToken(key))
      pos++
      if (!expect(":", "':'")) return false
      if (!value()) return false
      const next = peek()
      if (!next) return fail("unexpected end of file")
      if (next.kind === ",") {
        pos++
        // The single most common hand-edit mistake, and worth naming exactly.
        if (peek() && peek().kind === "}") return fail("trailing ',' before '}'", peek())
        continue
      }
      if (next.kind === "}") { pos++; return true }
      return fail("expected ',' or '}', found " + describeToken(next))
    }
  }

  function array() {
    pos++ // [
    if (peek() && peek().kind === "]") { pos++; return true }
    for (;;) {
      if (!value()) return false
      const next = peek()
      if (!next) return fail("unexpected end of file")
      if (next.kind === ",") {
        pos++
        if (peek() && peek().kind === "]") return fail("trailing ',' before ']'", peek())
        continue
      }
      if (next.kind === "]") { pos++; return true }
      return fail("expected ',' or ']', found " + describeToken(next))
    }
  }

  if (value() && pos < tokens.length) fail("unexpected " + describeToken(peek()))
  return failure
}

export function locateJsonError(text) {
  const scanned = scanTokens(String(text || ""))
  if (scanned.error) {
    return { line: scanned.error.line, column: scanned.error.column, message: scanned.error.message }
  }
  if (scanned.tokens.length === 0) {
    return { line: 0, column: 0, message: "the file is empty" }
  }
  const structural = findStructuralError(scanned.tokens)
  if (structural) return structural
  // The scanner found nothing but JSON.parse still refused it: say so plainly
  // rather than inventing a location.
  return { line: 0, column: 0, message: "invalid JSON" }
}

export function describeJsonError(text) {
  const located = locateJsonError(text)
  return located.line > 0
    ? "line " + located.line + ": " + located.message
    : located.message
}

export function serialize(config) {
  return JSON.stringify(config, null, 2) + "\n"
}

// ---------------------------------------------------------------- pages

export function pageItems(config, pageIndex) {
  if (!isObject(config) || !Array.isArray(config.pages)) return []
  const page = config.pages[pageIndex || 0]
  return page && Array.isArray(page.items) ? page.items : []
}

export function withPageItems(config, pageIndex, items) {
  const index = pageIndex || 0
  const pages = (Array.isArray(config.pages) ? config.pages : []).slice()
  if (!pages[index]) pages[index] = { id: "page-" + index, items: [] }
  pages[index] = Object.assign({}, pages[index], { items })
  return Object.assign({}, config, { pages })
}

// A stable id for a newly added item. Sequential rather than random so the
// config file stays readable and diffs stay small.
export function nextItemId(items, type) {
  let n = 1
  const taken = {}
  for (const item of items) taken[item.id] = true
  while (taken[type + "-" + n]) n++
  return type + "-" + n
}
