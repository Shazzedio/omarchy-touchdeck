// The sensor model: collector frames and nvidia-smi lines in, everything the
// widgets draw out. Pure and immutable -- each apply* returns a new state -- so
// SensorsService is a thin loop around it and all of the maths is unit-tested.
import * as ProcStat from "./procstat.mjs"
import * as Meminfo from "./meminfo.mjs"
import * as Hwmon from "./hwmon.mjs"
import * as Amdgpu from "./amdgpu.mjs"
import * as Nvidia from "./nvidia.mjs"

export const HISTORY_LENGTH = 120
// DESIGN.md 7: a source that has missed three intervals is stale.
export const STALE_AFTER_INTERVALS = 3

const VENDORS = { "0x1002": "amd", "0x10de": "nvidia", "0x8086": "intel" }

export function vendorName(id) {
  return VENDORS[String(id || "").toLowerCase()] || "other"
}

export function createState() {
  return {
    frames: 0,
    lastFrameAt: 0,
    stat: null,
    cpu: { usagePct: null, cores: [], tempC: null, tempSource: "", freqMHz: null, threads: 0, history: [] },
    memory: {
      totalBytes: null, availableBytes: null, usedBytes: null, usedPct: null,
      swapTotalBytes: null, swapFreeBytes: null, swapUsedBytes: null, swapPct: null, history: [],
    },
    drm: [],
    nvidia: {},
    lastNvidiaAt: 0,
    gpuHistory: {},
  }
}

// A fixed-length history. Missing readings are kept as null, so a gap in the
// data shows as a gap in the sparkline rather than being silently closed up.
export function pushHistory(list, value, max) {
  const limit = max > 0 ? max : HISTORY_LENGTH
  const prev = list || []
  const out = prev.slice(Math.max(0, prev.length - limit + 1))
  out.push(typeof value === "number" && isFinite(value) ? value : null)
  return out
}

function ratioPct(part, whole) {
  return typeof part === "number" && typeof whole === "number" && whole > 0 ? part / whole * 100 : null
}

export function isStale(lastAt, now, intervalMs) {
  return lastAt > 0 && now - lastAt > STALE_AFTER_INTERVALS * intervalMs
}

export function applyFrame(state, frame, now, historyLength) {
  const max = historyLength || HISTORY_LENGTH
  const stat = ProcStat.parseStat(frame.stat || [])
  const usage = ProcStat.usage(state.stat, stat)
  const temp = Hwmon.cpuTemperature(frame.hwmon || [])
  const mem = Meminfo.parseMeminfo(frame.meminfo || [])
  const usedPct = ratioPct(mem.usedBytes, mem.totalBytes)

  const gpuHistory = Object.assign({}, state.gpuHistory)
  const drm = []
  const entries = frame.drm || []
  for (let i = 0; i < entries.length; i++) {
    const vendor = vendorName(entries[i].vendor)
    const pci = Nvidia.normalizePci(entries[i].pci)
    if (!pci) continue
    const amd = vendor === "amd" ? Amdgpu.fromDrm(entries[i]) : null
    if (amd) gpuHistory[pci] = pushHistory(gpuHistory[pci], amd.usagePct, max)
    drm.push({ pci: pci, vendor: vendor, driver: entries[i].driver || "", amd: amd })
  }

  // The first frame has no previous counters, so no usage yet. Recording that
  // as a gap would put a hole at the start of every sparkline.
  const firstFrame = state.stat === null
  return Object.assign({}, state, {
    frames: state.frames + 1,
    lastFrameAt: now,
    stat: stat,
    cpu: {
      usagePct: usage.total,
      cores: usage.cores,
      tempC: temp ? temp.celsius : null,
      tempSource: temp ? temp.source : "",
      freqMHz: Hwmon.cpuFrequencyMHz(frame.cpufreq || {}),
      threads: Object.keys(stat.cpus).length,
      history: firstFrame ? state.cpu.history : pushHistory(state.cpu.history, usage.total, max),
    },
    memory: Object.assign({}, mem, {
      usedPct: usedPct,
      swapPct: ratioPct(mem.swapUsedBytes, mem.swapTotalBytes),
      history: pushHistory(state.memory.history, usedPct, max),
    }),
    drm: drm,
    gpuHistory: gpuHistory,
  })
}

export function applyNvidiaLine(state, line, now, historyLength) {
  const reading = Nvidia.parseLine(line)
  if (!reading) return state
  const nvidia = Object.assign({}, state.nvidia)
  nvidia[reading.pci] = Object.assign({}, reading, { at: now })
  const gpuHistory = Object.assign({}, state.gpuHistory)
  gpuHistory[reading.pci] = pushHistory(gpuHistory[reading.pci], reading.usagePct, historyLength || HISTORY_LENGTH)
  return Object.assign({}, state, { nvidia: nvidia, gpuHistory: gpuHistory, lastNvidiaAt: now })
}

// Whether an NVIDIA GPU is present, so the nvidia-smi stream is only started
// on machines that have one.
export function hasVendor(state, vendor) {
  for (let i = 0; i < state.drm.length; i++) if (state.drm[i].vendor === vendor) return true
  return false
}

function shortSlot(pci) { return String(pci).replace(/^0000:/, "") }

function blankGpu(pci, vendor) {
  let name = "GPU (" + shortSlot(pci) + ")"
  if (vendor === "amd") name = "AMD Radeon (" + shortSlot(pci) + ")"
  else if (vendor === "nvidia") name = "NVIDIA GPU (" + shortSlot(pci) + ")"
  else if (vendor === "intel") name = "Intel graphics"
  return {
    pci: pci, vendor: vendor, name: name, integrated: vendor === "intel",
    available: false, loading: false, stale: false, reason: "",
    usagePct: null, vramUsedBytes: null, vramTotalBytes: null,
    tempC: null, junctionC: null, memTempC: null, powerW: null, fanPct: null, fanRpm: null,
    lastAt: 0, history: [],
  }
}

// nvidiaStatus: "running" | "starting" | "missing" | "failed" | "stopped"
function describe(pci, vendor, entry, state, now, intervalMs, nvidiaStatus) {
  const gpu = blankGpu(pci, vendor)
  gpu.history = state.gpuHistory[pci] || []
  if (vendor === "nvidia") {
    const n = state.nvidia[pci]
    if (n) {
      gpu.name = n.name || gpu.name
      gpu.usagePct = n.usagePct
      gpu.vramUsedBytes = n.vramUsedBytes
      gpu.vramTotalBytes = n.vramTotalBytes
      gpu.tempC = n.tempC
      gpu.powerW = n.powerW
      gpu.fanPct = n.fanPct
      gpu.lastAt = n.at
      gpu.available = true
      gpu.stale = isStale(n.at, now, intervalMs)
    } else if (nvidiaStatus === "missing") {
      gpu.reason = "No GPU data: nvidia-smi not found"
    } else if (nvidiaStatus === "failed") {
      gpu.reason = "No GPU data: nvidia-smi stopped"
    } else {
      gpu.loading = true
    }
  } else if (vendor === "amd" && entry && entry.amd) {
    Object.assign(gpu, entry.amd)
    gpu.lastAt = state.lastFrameAt
    gpu.available = true
    gpu.stale = isStale(state.lastFrameAt, now, intervalMs)
  } else if (vendor === "intel") {
    // Busy % needs perf privileges (as intel_gpu_top does): out of scope for v1.
    gpu.reason = "Usage not available"
  } else {
    gpu.reason = "Unsupported GPU"
  }
  return gpu
}

// Every GPU the machine has, discrete first, then by PCI address. Detection
// comes from the collector's drm sections; NVIDIA numbers from nvidia-smi are
// joined on by PCI address.
export function gpuList(state, now, intervalMs, nvidiaStatus) {
  const out = []
  const seen = {}
  for (let i = 0; i < state.drm.length; i++) {
    const d = state.drm[i]
    if (seen[d.pci]) continue
    seen[d.pci] = true
    out.push(describe(d.pci, d.vendor, d, state, now, intervalMs, nvidiaStatus))
  }
  // An NVIDIA card nvidia-smi can see but drm can't (a headless compute card).
  const extra = Object.keys(state.nvidia)
  for (let i = 0; i < extra.length; i++) {
    if (seen[extra[i]]) continue
    seen[extra[i]] = true
    out.push(describe(extra[i], "nvidia", null, state, now, intervalMs, nvidiaStatus))
  }
  out.sort(function (a, b) {
    if (a.integrated !== b.integrated) return a.integrated ? 1 : -1
    return a.pci < b.pci ? -1 : (a.pci > b.pci ? 1 : 0)
  })
  return out
}

// "auto" is the first discrete GPU; anything else is a PCI address, in either
// sysfs or nvidia-smi spelling. Null when the requested GPU isn't present.
export function selectGpu(gpus, setting) {
  const want = String(setting || "auto")
  const list = gpus || []
  if (want === "auto") {
    for (let i = 0; i < list.length; i++) if (!list[i].integrated) return list[i]
    return list.length > 0 ? list[0] : null
  }
  const pci = Nvidia.normalizePci(want)
  for (let i = 0; i < list.length; i++) if (list[i].pci === pci) return list[i]
  return null
}
