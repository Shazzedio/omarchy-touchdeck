// nvidia-smi and amdgpu backends.
import { test } from "node:test"
import assert from "node:assert/strict"
import * as Nvidia from "../lib/nvidia.mjs"
import * as Amdgpu from "../lib/amdgpu.mjs"
import { nvidiaLines } from "./support/fixtures.mjs"

const MIB = 1048576

test("PCI addresses normalise to one spelling", () => {
  assert.equal(Nvidia.normalizePci("00000000:01:00.0"), "0000:01:00.0", "nvidia-smi's 8-digit domain")
  assert.equal(Nvidia.normalizePci("0000:01:00.0"), "0000:01:00.0", "sysfs")
  assert.equal(Nvidia.normalizePci("01:00.0"), "0000:01:00.0", "no domain")
  assert.equal(Nvidia.normalizePci("0000:0A:00.1"), "0000:0a:00.1", "lowercased")
  assert.equal(Nvidia.normalizePci("10000:e1:00.0"), "10000:e1:00.0", "a real 5-digit VMD domain survives")
  for (const bad of ["", "gpu0", "0000:01:00", "0000:01:00.9", null, undefined]) {
    assert.equal(Nvidia.normalizePci(bad), "", `rejects ${bad}`)
  }
})

test("a real nvidia-smi line from this machine parses", () => {
  const lines = nvidiaLines("intel-nvidia")
  assert.ok(lines.length > 0, "the captured fixture has nvidia-smi lines")
  const r = Nvidia.parseLine(lines[0])
  assert.equal(r.index, 0)
  assert.equal(r.pci, "0000:01:00.0")
  assert.equal(r.name, "NVIDIA GeForce RTX 4070")
  assert.equal(r.vramTotalBytes, 12282 * MIB)
  for (const key of ["usagePct", "vramUsedBytes", "tempC", "powerW", "fanPct"]) {
    assert.equal(typeof r[key], "number", key)
  }
})

test("[N/A], [Not Supported] and blank fields become null, not NaN or 0", () => {
  const r = Nvidia.parseLine("1, 00000000:02:00.0, Tesla T4, [N/A], 100, 15360, 45, [Not Supported], ")
  assert.equal(r.usagePct, null)
  assert.equal(r.powerW, null)
  assert.equal(r.fanPct, null, "passively cooled: no fan")
  assert.equal(r.vramUsedBytes, 100 * MIB)
  assert.equal(Nvidia.parseLine("0, 00000000:01:00.0, X, N/A, 1, 2, 3, 4, 5").usagePct, null)
})

test("several GPUs, one line each, keep their own PCI addresses", () => {
  const out = [
    "0, 00000000:01:00.0, NVIDIA GeForce RTX 4070, 12, 700, 12282, 40, 30.1, 0",
    "1, 00000000:21:00.0, NVIDIA RTX A2000, 90, 5000, 12288, 70, 69.9, 55",
  ].map(Nvidia.parseLine)
  assert.deepEqual(out.map((r) => [r.index, r.pci, r.usagePct]), [[0, "0000:01:00.0", 12], [1, "0000:21:00.0", 90]])
})

test("anything that isn't a data line is ignored", () => {
  for (const line of [
    "", "   ",
    "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.",
    "No devices were found",
    "x, 00000000:01:00.0, n, 1, 2, 3, 4, 5, 6",
    "0, nope, n, 1, 2, 3, 4, 5, 6",
  ]) assert.equal(Nvidia.parseLine(line), null, JSON.stringify(line))
})

test("a comma in the GPU name doesn't shift the fields after it", () => {
  const r = Nvidia.parseLine("0, 00000000:01:00.0, Some GPU, Rev 2, 10, 100, 200, 50, 60.5, 30")
  assert.equal(r.name, "Some GPU, Rev 2")
  assert.equal(r.usagePct, 10)
  assert.equal(r.fanPct, 30)
})

test("the nvidia-smi command matches the fields the parser expects", () => {
  const args = Nvidia.commandArgs(1000)
  assert.equal(args[0], "--query-gpu=" + Nvidia.QUERY_FIELDS.join(","))
  assert.deepEqual(args.slice(1), ["--format=csv,noheader,nounits", "-lms", "1000"])
  assert.equal(Nvidia.commandArgs(5)[3], "100", "a floor, so a bad config can't spin the driver")
  assert.equal(Nvidia.commandArgs("junk")[3], "1000")
})

const amd = (values) => ({ pci: "0000:03:00.0", vendor: "0x1002", driver: "amdgpu", values })

test("amdgpu: busy, VRAM, labelled temps, power and fan, in display units", () => {
  const r = Amdgpu.fromDrm(amd({
    gpu_busy_percent: "13", mem_info_vram_used: "2147483648", mem_info_vram_total: "25753026560",
    "hwmon.temp1_label": "edge", "hwmon.temp1_input": "51000",
    "hwmon.temp2_label": "junction", "hwmon.temp2_input": "58000",
    "hwmon.temp3_label": "mem", "hwmon.temp3_input": "62000",
    "hwmon.power1_average": "45000000", "hwmon.fan1_input": "1200",
  }))
  assert.deepEqual(r, {
    usagePct: 13, vramUsedBytes: 2147483648, vramTotalBytes: 25753026560,
    tempC: 51, junctionC: 58, memTempC: 62, powerW: 45, fanRpm: 1200,
  })
})

test("amdgpu: power1_input when there is no power1_average (RDNA3)", () => {
  assert.equal(Amdgpu.fromDrm(amd({ "hwmon.power1_input": "212000000" })).powerW, 212)
  assert.equal(Amdgpu.fromDrm(amd({
    "hwmon.power1_average": "10000000", "hwmon.power1_input": "99000000",
  })).powerW, 10, "average wins when both exist")
})

test("amdgpu: unlabelled temp1 is edge; everything missing is null", () => {
  assert.equal(Amdgpu.fromDrm(amd({ "hwmon.temp1_input": "48000" })).tempC, 48)
  const empty = Amdgpu.fromDrm(amd({}))
  assert.deepEqual(Object.values(empty).filter((v) => v !== null), [])
  assert.deepEqual(Object.values(Amdgpu.fromDrm(null)).filter((v) => v !== null), [])
})
