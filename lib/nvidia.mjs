// nvidia-smi -> GPU readings. Pure.
//
// The deck runs one long-lived `nvidia-smi --query-gpu=... -lms <interval>`
// (DESIGN.md D4): one CSV line per GPU per interval, parsed here line by line.
// Field names checked against driver 610.57.04 (DECISIONS.md G-10).

export const QUERY_FIELDS = [
  "index", "pci.bus_id", "name", "utilization.gpu", "memory.used",
  "memory.total", "temperature.gpu", "power.draw", "fan.speed",
]

export function commandArgs(intervalMs) {
  const ms = Math.max(100, Math.round(Number(intervalMs)) || 1000)
  return [
    "--query-gpu=" + QUERY_FIELDS.join(","),
    "--format=csv,noheader,nounits",
    "-lms", String(ms),
  ]
}

const MIB = 1048576

// One canonical form for PCI addresses: lowercase, 4-digit domain.
// nvidia-smi pads the domain to 8 digits ("00000000:01:00.0") while sysfs uses
// 4 ("0000:01:00.0"); without this, NVIDIA and drm data never join up
// (DECISIONS.md G-10). A genuine 5-digit domain (VMD, "10000:e1:00.0") is kept.
export function normalizePci(value) {
  const m = /^\s*(?:([0-9a-fA-F]{1,8}):)?([0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-7])\s*$/.exec(String(value || ""))
  if (!m) return ""
  let domain = m[1] ? parseInt(m[1], 16).toString(16) : "0"
  while (domain.length < 4) domain = "0" + domain
  return (domain + ":" + m[2] + ":" + m[3] + "." + m[4]).toLowerCase()
}

// A field value, or null for "[N/A]", "[Not Supported]", "[Unknown Error]",
// "N/A" or blank -- all of which the driver emits for sensors a card lacks.
function field(raw) {
  const s = String(raw === undefined ? "" : raw).trim()
  if (s === "" || s.charAt(0) === "[" || /^n\/?a$/i.test(s)) return null
  const n = Number(s)
  return isFinite(n) ? n : null
}

// One CSV line -> reading, or null for anything that isn't a data line (the
// driver prints plain-text errors on the same stream, e.g. "NVIDIA-SMI has
// failed because it couldn't communicate with the NVIDIA driver").
export function parseLine(line) {
  const text = String(line || "").trim()
  if (!text) return null
  const parts = text.split(",")
  if (parts.length < QUERY_FIELDS.length) return null
  // The name is the only free-text field. If it ever contains a comma, the
  // extra pieces belong to it rather than shifting every later field.
  const extra = parts.length - QUERY_FIELDS.length
  const name = parts.slice(2, 3 + extra).join(",").trim()
  const rest = parts.slice(3 + extra)
  const index = Number(parts[0].trim())
  const pci = normalizePci(parts[1])
  if (!Number.isInteger(index) || !pci) return null
  const used = field(rest[1])
  const total = field(rest[2])
  return {
    index: index,
    pci: pci,
    name: name,
    usagePct: field(rest[0]),
    vramUsedBytes: used === null ? null : used * MIB,
    vramTotalBytes: total === null ? null : total * MIB,
    tempC: field(rest[3]),
    powerW: field(rest[4]),
    fanPct: field(rest[5]),
  }
}
