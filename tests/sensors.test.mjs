// The sensor model end to end on each fixture, plus the formatters.
import { test } from "node:test"
import assert from "node:assert/strict"
import * as Sensors from "../lib/sensors.mjs"
import * as Format from "../lib/format.mjs"
import { framesFor, nvidiaLines } from "./support/fixtures.mjs"

const GIB = 1073741824

function run(name, withNvidia) {
  const [a, b] = framesFor(name)
  let s = Sensors.createState()
  s = Sensors.applyFrame(s, a, 1000)
  s = Sensors.applyFrame(s, b, 2000)
  if (withNvidia) {
    nvidiaLines(name).forEach((line, i) => { s = Sensors.applyNvidiaLine(s, line, 2000 + i) })
  }
  return s
}

test("amd-radeon: exact CPU, memory and GPU figures", () => {
  const s = run("amd-radeon")
  assert.equal(s.cpu.usagePct, 37.5, "16 CPUs at 50 % and 16 at 25 %")
  assert.equal(s.cpu.cores.length, 32)
  assert.deepEqual([s.cpu.cores[0].pct, s.cpu.cores[1].pct], [50, 25])
  assert.equal(s.cpu.tempC, 67.5)
  assert.equal(s.cpu.tempSource, "k10temp: Tctl")
  assert.equal(s.cpu.freqMHz, 4600)
  assert.equal(s.memory.usedPct, 25)
  assert.equal(s.memory.swapUsedBytes, 0)

  const gpus = Sensors.gpuList(s, 2500, 1000, "stopped")
  assert.equal(gpus.length, 1)
  const g = gpus[0]
  assert.deepEqual(
    [g.vendor, g.name, g.available, g.usagePct, g.tempC, g.junctionC, g.memTempC, g.powerW, g.fanRpm],
    ["amd", "AMD Radeon (03:00.0)", true, 13, 51, 58, 62, 45, 1200])
  assert.equal(g.vramTotalBytes, 25753026560)
  assert.deepEqual(g.history, [13, 13], "one sample per frame")
})

test("dual-gpu: both GPUs, joined by PCI address, discrete sorted by bus", () => {
  const s = run("dual-gpu", true)
  assert.equal(s.cpu.usagePct, 17.5)
  assert.equal(s.cpu.tempC, 54)
  assert.equal(s.cpu.tempSource, "coretemp: Package id 0")

  const gpus = Sensors.gpuList(s, 2500, 1000, "running")
  assert.deepEqual(gpus.map((g) => [g.pci, g.vendor]), [["0000:01:00.0", "nvidia"], ["0000:05:00.0", "amd"]])
  const [nv, rad] = gpus
  assert.equal(nv.name, "NVIDIA GeForce RTX 4070")
  assert.deepEqual([nv.usagePct, nv.tempC, nv.powerW, nv.fanPct], [44, 67, 119.8, 42], "the latest line wins")
  assert.equal(nv.vramUsedBytes, 6748 * 1048576)
  assert.deepEqual(nv.history, [45, 47, 44])
  assert.equal(rad.powerW, 212, "RDNA3 power1_input")
  assert.equal(Sensors.selectGpu(gpus, "auto").pci, "0000:01:00.0")
  assert.equal(Sensors.selectGpu(gpus, "00000000:05:00.0").vendor, "amd", "nvidia-smi spelling accepted")
  assert.equal(Sensors.selectGpu(gpus, "0000:09:00.0"), null, "a GPU that isn't there")
})

test("intel-nvidia (real capture): plausible readings, NVIDIA waits for nvidia-smi", () => {
  const s = run("intel-nvidia")
  assert.ok(s.cpu.usagePct >= 0 && s.cpu.usagePct <= 100)
  assert.equal(s.cpu.threads, 12)
  assert.ok(s.cpu.tempC > 15 && s.cpu.tempC < 100, `cpu temp ${s.cpu.tempC}`)
  assert.equal(s.cpu.tempSource, "coretemp: Package id 0")
  assert.ok(s.memory.totalBytes > 30 * GIB && s.memory.totalBytes < 32 * GIB)
  assert.ok(Sensors.hasVendor(s, "nvidia"))
  assert.ok(!Sensors.hasVendor(s, "amd"))

  const waiting = Sensors.gpuList(s, 2500, 1000, "starting")[0]
  assert.deepEqual([waiting.available, waiting.loading, waiting.reason], [false, true, ""])
  assert.equal(Sensors.gpuList(s, 2500, 1000, "missing")[0].reason, "No GPU data: nvidia-smi not found")
  assert.equal(Sensors.gpuList(s, 2500, 1000, "failed")[0].reason, "No GPU data: nvidia-smi stopped")
})

test("the first frame yields no CPU usage and no history gap", () => {
  const [a] = framesFor("amd-radeon")
  const s = Sensors.applyFrame(Sensors.createState(), a, 1000)
  assert.equal(s.cpu.usagePct, null, "usage needs two frames")
  assert.deepEqual(s.cpu.history, [])
  assert.equal(s.memory.history.length, 1, "memory is absolute, so it has a first sample")
})

test("readings go stale after three missed intervals", () => {
  assert.equal(Sensors.isStale(0, 99999, 1000), false, "never seen is loading, not stale")
  assert.equal(Sensors.isStale(1000, 4000, 1000), false)
  assert.equal(Sensors.isStale(1000, 4001, 1000), true)

  let s = run("dual-gpu", true)
  const fresh = Sensors.gpuList(s, 2500, 1000, "running")
  assert.ok(fresh.every((g) => !g.stale))
  const later = Sensors.gpuList(s, 9000, 1000, "failed")
  assert.ok(later.every((g) => g.stale), "old NVIDIA and AMD readings are marked, not hidden")
  assert.ok(later.every((g) => g.available), "the last values are still shown, dimmed")
})

test("history is capped and keeps gaps", () => {
  let list = []
  for (let i = 0; i < 200; i++) list = Sensors.pushHistory(list, i, 120)
  assert.equal(list.length, 120)
  assert.equal(list[0], 80)
  assert.equal(list[119], 199)
  assert.deepEqual(Sensors.pushHistory([1], NaN, 5), [1, null])
  assert.deepEqual(Sensors.pushHistory([1], undefined, 5), [1, null])
})

test("an Intel iGPU is detected but reports no usage; unknown vendors say so", () => {
  let s = Sensors.createState()
  s = Sensors.applyFrame(s, {
    stat: [], meminfo: [], cpufreq: {}, hwmon: [],
    drm: [
      { pci: "0000:00:02.0", vendor: "0x8086", driver: "i915", values: {} },
      { pci: "0000:07:00.0", vendor: "0x1af4", driver: "virtio-pci", values: {} },
      { pci: "not-a-pci", vendor: "0x1002", driver: "amdgpu", values: {} },
    ],
  }, 1000)
  const gpus = Sensors.gpuList(s, 1000, 1000, "stopped")
  assert.deepEqual(gpus.map((g) => [g.vendor, g.integrated, g.reason]),
    [["other", false, "Unsupported GPU"], ["intel", true, "Usage not available"]],
    "integrated sorts last; an unparseable PCI address is dropped")
  assert.equal(Sensors.selectGpu(gpus, "auto").vendor, "other", "auto prefers a discrete card")
  assert.equal(Sensors.selectGpu([gpus[1]], "auto").vendor, "intel", "but falls back to integrated")
  assert.equal(Sensors.selectGpu([], "auto"), null)
})

test("nvidia-smi error text doesn't disturb the model", () => {
  const s = run("intel-nvidia")
  assert.equal(Sensors.applyNvidiaLine(s, "NVIDIA-SMI has failed", 3000), s)
})

test("formatters show an em dash for anything missing", () => {
  assert.equal(Format.percent(42.4), "42%")
  assert.equal(Format.celsius(61.6), "62°C")
  assert.equal(Format.watts(144.9), "145 W")
  assert.equal(Format.rpm(1200), "1200 rpm")
  assert.equal(Format.usedOfTotal(12.4 * GIB, 31 * GIB), "12.4 / 31.0 GiB")
  assert.equal(Format.frequency(4400), "4.4 GHz")
  assert.equal(Format.frequency(800.4), "800 MHz")
  assert.deepEqual([0, 4500, 125000, 7300000].map(Format.age), ["0 s ago", "4 s ago", "2 min ago", "2 h ago"])
  for (const f of [Format.percent, Format.celsius, Format.watts, Format.rpm, Format.frequency, Format.age, Format.gib]) {
    for (const v of [null, undefined, NaN, Infinity, "12"]) assert.equal(f(v), Format.DASH, `${f.name}(${v})`)
  }
  assert.equal(Format.usedOfTotal(null, 1), Format.DASH)
  assert.equal(Format.age(-1), Format.DASH)
})
