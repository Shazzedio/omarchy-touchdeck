// hwmon chips and cpufreq -> CPU temperature and clock. Pure.
//
// Sensors are chosen by chip name and label, never by hwmonN index: the index
// is assigned in probe order and changes between boots (DECISIONS.md G-2).

// Readings outside this range are a sensor glitch, not a temperature.
const PLAUSIBLE_MIN_C = -40
const PLAUSIBLE_MAX_C = 150

function celsius(raw) {
  const n = Number(raw)
  if (raw === undefined || raw === null || raw === "" || !isFinite(n)) return null
  const c = n / 1000
  return c > PLAUSIBLE_MIN_C && c < PLAUSIBLE_MAX_C ? c : null
}

// [{ index, label, celsius }] for one chip, sorted by index.
export function chipTemps(chip) {
  const values = (chip && chip.values) || {}
  const out = []
  const keys = Object.keys(values)
  for (let i = 0; i < keys.length; i++) {
    const m = /^temp(\d+)_input$/.exec(keys[i])
    if (!m) continue
    const c = celsius(values[keys[i]])
    if (c === null) continue
    out.push({ index: Number(m[1]), label: String(values["temp" + m[1] + "_label"] || ""), celsius: c })
  }
  out.sort(function (a, b) { return a.index - b.index })
  return out
}

function byLabel(temps, test) {
  let best = null
  for (let i = 0; i < temps.length; i++) {
    if (test(temps[i].label) && (best === null || temps[i].celsius > best.celsius)) best = temps[i]
  }
  return best
}

// The one number a CPU widget shows, per chip:
//   coretemp  "Package id N" (hottest package), else hottest "Core N"
//   k10temp   "Tdie" when present -- it is Tctl minus the offset some Ryzens
//             add for fan control -- else "Tctl", else the hottest "Tccd"
//   zenpower  "Tdie", else "Tctl"
// falling back to the chip's first reading.
function pickForChip(name, temps) {
  if (temps.length === 0) return null
  let pick = null
  if (name === "coretemp") {
    pick = byLabel(temps, function (l) { return /^Package id \d+$/.test(l) })
      || byLabel(temps, function (l) { return /^Core \d+$/.test(l) })
  } else if (name === "k10temp" || name === "zenpower") {
    pick = byLabel(temps, function (l) { return l === "Tdie" })
      || byLabel(temps, function (l) { return l === "Tctl" })
      || byLabel(temps, function (l) { return /^Tccd\d+$/.test(l) })
  }
  return pick || temps[0]
}

const CPU_CHIPS = ["coretemp", "k10temp", "zenpower"]

// { celsius, source } or null, e.g. { celsius: 54, source: "coretemp: Package id 0" }.
export function cpuTemperature(chips) {
  const list = chips || []
  for (let c = 0; c < CPU_CHIPS.length; c++) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].name !== CPU_CHIPS[c]) continue
      const pick = pickForChip(list[i].name, chipTemps(list[i]))
      if (pick) {
        return { celsius: pick.celsius, source: list[i].name + (pick.label ? ": " + pick.label : "") }
      }
    }
  }
  return null
}

// Mean current clock across CPUs, in MHz. cpufreq reports kHz.
export function cpuFrequencyMHz(cpufreq) {
  const keys = Object.keys(cpufreq || {})
  let sum = 0
  let count = 0
  for (let i = 0; i < keys.length; i++) {
    const khz = Number(cpufreq[keys[i]])
    if (isFinite(khz) && khz > 0) {
      sum += khz
      count++
    }
  }
  return count > 0 ? sum / count / 1000 : null
}
