// amdgpu sysfs (via the collector's @drm section) -> GPU readings. Pure.
//
// Units in: percent, bytes, millidegrees C, microwatts, RPM.
// https://docs.kernel.org/gpu/amdgpu/thermal.html

function num(raw) {
  if (raw === undefined || raw === null || raw === "") return null
  const n = Number(raw)
  return isFinite(n) ? n : null
}

function first(a, b) { return a !== null ? a : b }

// edge / junction / mem temperatures. Labels are what identify them; a chip
// with no labels at all is assumed to report edge on temp1.
export function temperatures(values) {
  const out = { edge: null, junction: null, mem: null }
  const keys = Object.keys(values || {})
  for (let i = 0; i < keys.length; i++) {
    const m = /^hwmon\.temp(\d+)_input$/.exec(keys[i])
    if (!m) continue
    const raw = num(values[keys[i]])
    if (raw === null) continue
    const label = String(values["hwmon.temp" + m[1] + "_label"] || "").toLowerCase()
    const key = label === "edge" || label === "junction" || label === "mem"
      ? label
      : (label === "" && m[1] === "1" ? "edge" : null)
    if (key && out[key] === null) out[key] = raw / 1000
  }
  return out
}

export function fromDrm(entry) {
  const v = (entry && entry.values) || {}
  const temps = temperatures(v)
  // Older kernels expose power1_average, RDNA3 and later power1_input.
  const microwatts = first(num(v["hwmon.power1_average"]), num(v["hwmon.power1_input"]))
  return {
    usagePct: num(v.gpu_busy_percent),
    vramUsedBytes: num(v.mem_info_vram_used),
    vramTotalBytes: num(v.mem_info_vram_total),
    tempC: temps.edge,
    junctionC: temps.junction,
    memTempC: temps.mem,
    powerW: microwatts === null ? null : microwatts / 1e6,
    fanRpm: num(v["hwmon.fan1_input"]),
  }
}
