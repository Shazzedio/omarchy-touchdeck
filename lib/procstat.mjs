// /proc/stat -> CPU usage. Pure.
//
// Usage is a ratio of deltas between two frames, so the first frame yields
// nothing and every calculation copes with a CPU that wasn't there last time
// (hotplug) or whose counters went backwards (a CPU taken offline and back
// resets them).

// user nice system idle iowait irq softirq steal. guest and guest_nice are
// already included in user and nice, so they are left out to avoid counting
// that time twice.
const COUNTED_FIELDS = 8

export function parseStatLine(line) {
  const parts = String(line || "").trim().split(/\s+/)
  const name = parts[0]
  if (!/^cpu\d*$/.test(name)) return null
  if (parts.length < 5) return null
  const nums = []
  for (let i = 1; i <= COUNTED_FIELDS; i++) {
    const n = i < parts.length ? Number(parts[i]) : 0
    if (!isFinite(n)) return null
    nums.push(n)
  }
  let total = 0
  for (let i = 0; i < nums.length; i++) total += nums[i]
  const idle = nums[3] + nums[4]
  return { name: name, busy: total - idle, total: total }
}

// Returns { total, cpus } where cpus maps a CPU number ("0", "1", ...) to its
// { busy, total } counters.
export function parseStat(lines) {
  const out = { total: null, cpus: {} }
  const list = lines || []
  for (let i = 0; i < list.length; i++) {
    const row = parseStatLine(list[i])
    if (!row) continue
    if (row.name === "cpu") out.total = { busy: row.busy, total: row.total }
    else out.cpus[row.name.slice(3)] = { busy: row.busy, total: row.total }
  }
  return out
}

// Percentage busy between two counter snapshots, or null when there is no
// honest answer: no previous sample, no time passed, or counters reset.
export function busyPercent(prev, curr) {
  if (!prev || !curr) return null
  const dTotal = curr.total - prev.total
  const dBusy = curr.busy - prev.busy
  if (!(dTotal > 0) || dBusy < 0) return null
  // iowait is documented as able to go backwards, which can push busy past
  // the total; clamp rather than report 103 %.
  return Math.min(Math.max(dBusy / dTotal, 0), 1) * 100
}

// { total, cores: [{ id, pct }] } -- cores sorted numerically, taken from the
// current snapshot, so a CPU that disappeared is dropped and one that just
// appeared reports null until it has a previous sample.
export function usage(prev, curr) {
  const cores = []
  const ids = Object.keys((curr && curr.cpus) || {})
  ids.sort(function (a, b) { return Number(a) - Number(b) })
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    cores.push({
      id: Number(id),
      pct: busyPercent(prev && prev.cpus ? prev.cpus[id] : null, curr.cpus[id]),
    })
  }
  return {
    total: busyPercent(prev ? prev.total : null, curr ? curr.total : null),
    cores: cores,
  }
}
