// frame, procstat, meminfo and hwmon parsers.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import * as Frame from "../lib/frame.mjs"
import * as ProcStat from "../lib/procstat.mjs"
import * as Meminfo from "../lib/meminfo.mjs"
import * as Hwmon from "../lib/hwmon.mjs"
import { sysroot } from "./support/fixtures.mjs"

// ---------------------------------------------------------------- frame

test("the assembler builds frames line by line", () => {
  const a = Frame.createAssembler()
  const lines = [
    "@frame 1000", "@stat", "cpu  1 2 3 4", "@meminfo", "MemTotal: 10 kB",
    "@cpufreq", "cpu0=4400000", "@hwmon hwmon4 coretemp", "temp1_label=Package id 0",
    "@drm 0000:01:00.0 0x10DE nvidia", "@end",
  ]
  let done = null
  for (const line of lines) {
    const out = a.push(line)
    if (line !== "@end") assert.equal(out, null, "nothing until @end")
    else done = out
  }
  assert.equal(done.ts, 1000)
  assert.deepEqual(done.stat, ["cpu  1 2 3 4"])
  assert.deepEqual(done.meminfo, ["MemTotal: 10 kB"])
  assert.deepEqual(done.cpufreq, { cpu0: "4400000" })
  assert.deepEqual(done.hwmon, [{ id: "hwmon4", name: "coretemp", values: { temp1_label: "Package id 0" } }])
  assert.deepEqual(done.drm, [{ pci: "0000:01:00.0", vendor: "0x10de", driver: "nvidia", values: {} }],
    "vendor is lowercased")
})

test("a frame cut off mid-write is dropped, never half-applied", () => {
  const frames = Frame.parseFrames([
    "@frame 1", "@stat", "cpu  1 2 3 4",          // collector killed here
    "@frame 2", "@stat", "cpu  5 6 7 8", "@end",
  ].join("\n"))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].ts, 2)
  assert.deepEqual(frames[0].stat, ["cpu  5 6 7 8"])
})

test("junk before the first frame, unknown sections and '=' in values are tolerated", () => {
  const frames = Frame.parseFrames([
    "bash: warning: something", "cpu  9 9 9 9",
    "@frame 5", "@future", "anything at all", "@hwmon hwmon1 k10temp", "temp1_label=a=b", "@end",
  ].join("\n"))
  assert.equal(frames.length, 1)
  assert.deepEqual(frames[0].stat, [], "lines before @frame are ignored")
  assert.deepEqual(frames[0].extra, { future: ["anything at all"] })
  assert.equal(frames[0].hwmon[0].values.temp1_label, "a=b", "split on the first '=' only")
})

// ---------------------------------------------------------------- procstat

test("parseStatLine counts user..steal and excludes guest time", () => {
  // user nice system idle iowait irq softirq steal guest guest_nice
  const row = ProcStat.parseStatLine("cpu0 100 10 50 800 40 5 5 0 70 7")
  assert.equal(row.total, 100 + 10 + 50 + 800 + 40 + 5 + 5 + 0, "guest is already inside user")
  assert.equal(row.busy, row.total - 800 - 40, "idle and iowait are not busy")
  assert.equal(ProcStat.parseStatLine("intr 1 2 3"), null)
  assert.equal(ProcStat.parseStatLine("cpu0 1 2"), null, "too short")
  assert.equal(ProcStat.parseStatLine("cpu0 1 x 3 4"), null, "not a number")
})

test("usage is a ratio of deltas, per CPU and overall", () => {
  const prev = ProcStat.parseStat(["cpu  0 0 0 200 0 0 0 0", "cpu0 0 0 0 100 0 0 0 0", "cpu1 0 0 0 100 0 0 0 0"])
  const curr = ProcStat.parseStat(["cpu  75 0 0 325 0 0 0 0", "cpu0 50 0 0 150 0 0 0 0", "cpu1 25 0 0 175 0 0 0 0"])
  const u = ProcStat.usage(prev, curr)
  assert.equal(u.total, 37.5)
  assert.deepEqual(u.cores, [{ id: 0, pct: 50 }, { id: 1, pct: 25 }])
})

test("usage has no answer on the first frame or when no time has passed", () => {
  const s = ProcStat.parseStat(["cpu  1 0 0 1 0 0 0 0", "cpu0 1 0 0 1 0 0 0 0"])
  assert.deepEqual(ProcStat.usage(null, s), { total: null, cores: [{ id: 0, pct: null }] })
  assert.equal(ProcStat.usage(s, s).total, null)
})

test("a CPU whose counters reset, or that just appeared, reports null; one that vanished is dropped", () => {
  const prev = ProcStat.parseStat([
    "cpu  0 0 0 300 0 0 0 0", "cpu0 0 0 0 100 0 0 0 0", "cpu1 500 0 0 9000 0 0 0 0", "cpu2 0 0 0 100 0 0 0 0",
  ])
  const curr = ProcStat.parseStat([
    "cpu  50 0 0 400 0 0 0 0",
    "cpu0 50 0 0 150 0 0 0 0",   // normal
    "cpu1 10 0 0 90 0 0 0 0",    // went offline and came back: counters reset
    "cpu3 10 0 0 90 0 0 0 0",    // hot-added
  ])                              // cpu2 is gone
  assert.deepEqual(ProcStat.usage(prev, curr).cores, [
    { id: 0, pct: 50 }, { id: 1, pct: null }, { id: 3, pct: null },
  ])
})

test("iowait going backwards is clamped, not reported as over 100%", () => {
  const prev = { busy: 100, total: 200 }
  const curr = { busy: 205, total: 300 }   // idle fell by 5
  assert.equal(ProcStat.busyPercent(prev, curr), 100)
})

test("real /proc/stat deltas from this machine are sane", () => {
  const read = (f) => readFileSync(path.join(sysroot("intel-nvidia"), f), "utf8").split("\n")
  const u = ProcStat.usage(ProcStat.parseStat(read("proc/stat")), ProcStat.parseStat(read("proc/stat.next")))
  assert.ok(u.total >= 0 && u.total <= 100, `total ${u.total}`)
  assert.equal(u.cores.length, 12, "i5-12400F: 12 threads")
  for (const c of u.cores) assert.ok(c.pct === null || (c.pct >= 0 && c.pct <= 100))
})

// ---------------------------------------------------------------- meminfo

test("used memory is MemTotal - MemAvailable, in bytes", () => {
  const m = Meminfo.parseMeminfo([
    "MemTotal:       32665976 kB", "MemAvailable:   27812792 kB",
    "SwapTotal:      65331580 kB", "SwapFree:       65000000 kB",
  ])
  assert.equal(m.totalBytes, 32665976 * 1024)
  assert.equal(m.usedBytes, (32665976 - 27812792) * 1024)
  assert.equal(m.swapUsedBytes, 331580 * 1024)
})

test("missing meminfo fields give nulls, never NaN", () => {
  const m = Meminfo.parseMeminfo(["MemTotal: 100 kB", "Garbage line"])
  assert.equal(m.availableBytes, null)
  assert.equal(m.usedBytes, null)
  assert.equal(m.swapUsedBytes, null)
  assert.deepEqual(Object.values(Meminfo.parseMeminfo([])).filter((v) => v !== null), [])
  assert.equal(Meminfo.parseMeminfo(["constructor:  5 kB"]).totalBytes, null, "no prototype keys")
})

// ---------------------------------------------------------------- hwmon

const chip = (name, values) => ({ id: "hwmonX", name, values })

test("coretemp: the package temperature, hottest package on multi-socket", () => {
  assert.deepEqual(Hwmon.cpuTemperature([chip("coretemp", {
    temp1_label: "Package id 0", temp1_input: "54000", temp2_label: "Core 0", temp2_input: "60000",
  })]), { celsius: 54, source: "coretemp: Package id 0" }, "package beats a hotter core")
  assert.equal(Hwmon.cpuTemperature([chip("coretemp", {
    temp1_label: "Package id 0", temp1_input: "54000", temp9_label: "Package id 1", temp9_input: "71000",
  })]).celsius, 71)
  assert.equal(Hwmon.cpuTemperature([chip("coretemp", {
    temp2_label: "Core 0", temp2_input: "50000", temp3_label: "Core 1", temp3_input: "58000",
  })]).celsius, 58, "no package sensor: hottest core")
})

test("k10temp: Tdie over Tctl over the hottest Tccd", () => {
  assert.equal(Hwmon.cpuTemperature([chip("k10temp", {
    temp1_label: "Tctl", temp1_input: "87000", temp2_label: "Tdie", temp2_input: "67000",
  })]).celsius, 67, "Tdie is Tctl without the fan-control offset")
  assert.deepEqual(Hwmon.cpuTemperature([chip("k10temp", {
    temp1_label: "Tctl", temp1_input: "67500", temp3_label: "Tccd1", temp3_input: "60250",
  })]), { celsius: 67.5, source: "k10temp: Tctl" })
  assert.equal(Hwmon.cpuTemperature([chip("k10temp", {
    temp3_label: "Tccd1", temp3_input: "60250", temp4_label: "Tccd2", temp4_input: "63000",
  })]).celsius, 63)
})

test("other chips are ignored, and implausible readings dropped", () => {
  assert.equal(Hwmon.cpuTemperature([chip("nvme", { temp1_input: "40000" })]), null)
  assert.equal(Hwmon.cpuTemperature([chip("coretemp", {
    temp1_label: "Package id 0", temp1_input: "255000", temp2_label: "Core 0", temp2_input: "50000",
  })]).celsius, 50, "a 255 °C glitch is not a temperature")
  assert.equal(Hwmon.cpuTemperature([chip("coretemp", { temp1_input: "-273000" })]), null)
  assert.equal(Hwmon.cpuTemperature([]), null)
  assert.equal(Hwmon.cpuTemperature([chip("zenpower", { temp1_label: "Tdie", temp1_input: "44000" })]).celsius, 44)
})

test("cpu frequency is the mean across CPUs, kHz to MHz", () => {
  assert.equal(Hwmon.cpuFrequencyMHz({ cpu0: "5200000", cpu1: "4000000" }), 4600)
  assert.equal(Hwmon.cpuFrequencyMHz({ cpu0: "0", cpu1: "x", cpu2: "3000000" }), 3000)
  assert.equal(Hwmon.cpuFrequencyMHz({}), null)
})
