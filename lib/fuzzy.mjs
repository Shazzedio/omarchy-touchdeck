// App search and the A–Z rail (DESIGN.md 11). Pure. The deck prefers
// omarchy-shell's own launcher matcher (AppLibrary.sortedEntries) so results
// match the Omarchy launcher; this is the fallback, and what the A–Z rail and
// the tests use. ES2015 only: this also runs in Qt's QML engine.

function words(text) {
  return String(text || "").toLowerCase().split(/[\s._\-]+/).filter(function (w) { return w.length > 0 })
}

// Higher is better; -1 means no match.
//   prefix     "fir"  -> Firefox
//   acronym    "vsc"  -> Visual Studio Code
//   word start "code" -> Visual Studio Code
//   substring  "efo"  -> Firefox
//   in order   "ffx"  -> Firefox
export function score(query, text) {
  const q = String(query || "").trim().toLowerCase()
  const t = String(text || "").toLowerCase()
  if (q === "") return 0
  if (t === "") return -1
  if (t.indexOf(q) === 0) return 1000 - t.length
  const w = words(t)
  const initials = w.map(function (x) { return x.charAt(0) }).join("")
  if (initials.indexOf(q) === 0) return 900 - t.length
  for (let i = 1; i < w.length; i++) if (w[i].indexOf(q) === 0) return 800 - t.length
  const at = t.indexOf(q)
  if (at !== -1) return 600 - at
  let pos = 0
  let gaps = 0
  for (let i = 0; i < q.length; i++) {
    const found = t.indexOf(q.charAt(i), pos)
    if (found === -1) return -1
    gaps += found - pos
    pos = found + 1
  }
  return 300 - gaps
}

// Entries matching query, best first, then by name. nameOf(entry) gives the text.
export function search(entries, query, nameOf) {
  const name = nameOf || function (e) { return e.name }
  const scored = []
  const list = entries || []
  for (let i = 0; i < list.length; i++) {
    const s = Math.max(score(query, name(list[i])), score(query, list[i].genericName || ""))
    if (s >= 0) scored.push({ entry: list[i], score: s, name: String(name(list[i]) || "").toLowerCase() })
  }
  scored.sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)) })
  return scored.map(function (x) { return x.entry })
}

// The rail letter an app files under: A–Z, or "#" for anything else.
export function letterOf(name) {
  const c = String(name || "").trim().charAt(0).toUpperCase()
  return c >= "A" && c <= "Z" ? c : "#"
}

// For a list already sorted by name: the first index for each letter, so a tap
// on the rail can jump there. Letters with no apps aren't in the map.
export function letterIndex(names) {
  const out = {}
  const list = names || []
  for (let i = 0; i < list.length; i++) {
    const l = letterOf(list[i])
    if (out[l] === undefined) out[l] = i
  }
  return out
}

export const RAIL = ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
