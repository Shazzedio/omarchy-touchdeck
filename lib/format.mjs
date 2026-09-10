// Numbers -> the short strings the deck shows. Pure. Every formatter returns
// an em dash for a missing value, so a widget never has to special-case null.

export const DASH = "—"
const GIB = 1073741824

export function isNumber(v) { return typeof v === "number" && isFinite(v) }

export function percent(v) { return isNumber(v) ? Math.round(v) + "%" : DASH }

export function celsius(v) { return isNumber(v) ? Math.round(v) + "°C" : DASH }

export function watts(v) { return isNumber(v) ? Math.round(v) + " W" : DASH }

export function rpm(v) { return isNumber(v) ? Math.round(v) + " rpm" : DASH }

export function gib(bytes, digits) {
  if (!isNumber(bytes)) return DASH
  return (bytes / GIB).toFixed(digits === undefined ? 1 : digits)
}

// "12.4 / 31.0 GiB"
export function usedOfTotal(used, total) {
  if (!isNumber(used) || !isNumber(total)) return DASH
  return gib(used) + " / " + gib(total) + " GiB"
}

export function frequency(mhz) {
  if (!isNumber(mhz)) return DASH
  return mhz >= 1000 ? (mhz / 1000).toFixed(1) + " GHz" : Math.round(mhz) + " MHz"
}

// How old a reading is, for the stale state: "4 s ago", "2 min ago".
export function age(ms) {
  if (!isNumber(ms) || ms < 0) return DASH
  const s = Math.floor(ms / 1000)
  if (s < 60) return s + " s ago"
  const m = Math.floor(s / 60)
  if (m < 60) return m + " min ago"
  return Math.floor(m / 60) + " h ago"
}
