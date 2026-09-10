// /proc/meminfo -> bytes. Pure.
//
// "Used" is MemTotal - MemAvailable, the same definition btop and free use:
// page cache the kernel will give back on demand is not counted as used.

export function parseMeminfo(lines) {
  const kb = Object.create(null)
  const list = lines || []
  for (let i = 0; i < list.length; i++) {
    const m = /^(\w+):\s+(\d+)(?:\s*kB)?\s*$/.exec(String(list[i]))
    if (m) kb[m[1]] = Number(m[2])
  }
  const bytes = function (key) { return key in kb ? kb[key] * 1024 : null }
  const total = bytes("MemTotal")
  const available = bytes("MemAvailable")
  const swapTotal = bytes("SwapTotal")
  const swapFree = bytes("SwapFree")
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: total !== null && available !== null ? Math.max(0, total - available) : null,
    swapTotalBytes: swapTotal,
    swapFreeBytes: swapFree,
    swapUsedBytes: swapTotal !== null && swapFree !== null ? Math.max(0, swapTotal - swapFree) : null,
  }
}
