// bin/touchdeck-collect, run for real against each fixture sysroot (DESIGN.md 16.4).
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import * as Frame from "../lib/frame.mjs"
import { COLLECTOR, FIXTURES, sysroot, collect } from "./support/fixtures.mjs"

function frames(name, options) {
  const r = collect(sysroot(name), options)
  assert.equal(r.status, 0, name + " exited " + r.status + ": " + r.stderr)
  assert.equal(r.stderr, "", name + " wrote to stderr")
  return Frame.parseFrames(r.stdout)
}

function withSysroot(build, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "touchdeck-sysroot-"))
  try {
    build(dir)
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function put(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  writeFileSync(path.join(root, rel), text)
}

test("two well-formed frames per fixture, paced by the interval", () => {
  for (const name of FIXTURES) {
    const list = frames(name, { frames: 2, intervalMs: 50 })
    assert.equal(list.length, 2, name)
    const gap = list[1].ts - list[0].ts
    assert.ok(gap >= 40 && gap < 1000, `${name}: frames ${gap} ms apart at a 50 ms interval`)
    for (const f of list) {
      assert.ok(f.stat.length > 1, `${name}: has cpu lines`)
      assert.ok(f.stat.every((l) => /^cpu\d* /.test(l)),
        `${name}: @stat holds only cpu lines (the huge intr line is skipped)`)
      assert.equal(f.meminfo.length, 4, `${name}: exactly the four meminfo keys`)
      assert.ok(Object.keys(f.cpufreq).length > 0, `${name}: cpufreq`)
    }
  }
})

test("only CPU temperature chips are reported from /sys/class/hwmon", () => {
  const names = (fixture) => frames(fixture)[0].hwmon.map((c) => c.name)
  assert.deepEqual(names("intel-nvidia"), ["coretemp"], "nvme, acpitz, iwlwifi and the NIC are skipped")
  assert.deepEqual(names("amd-radeon"), ["k10temp"],
    "nvme and the class-view of the amdgpu chip are skipped")
  assert.deepEqual(names("dual-gpu"), ["coretemp"])
})

test("one drm entry per GPU, keyed by PCI address, connectors skipped", () => {
  assert.deepEqual(frames("intel-nvidia")[0].drm,
    [{ pci: "0000:01:00.0", vendor: "0x10de", driver: "nvidia", values: {} }],
    "NVIDIA gets a header only: its numbers come from nvidia-smi")

  const amd = frames("amd-radeon")[0].drm
  assert.equal(amd.length, 1)
  assert.equal(amd[0].pci, "0000:03:00.0")
  assert.equal(amd[0].driver, "amdgpu")
  assert.equal(amd[0].values.gpu_busy_percent, "13")
  assert.equal(amd[0].values.mem_info_vram_total, "25753026560")
  assert.equal(amd[0].values["hwmon.temp2_label"], "junction")
  assert.equal(amd[0].values["hwmon.power1_average"], "45000000")
  assert.equal(amd[0].values["hwmon.fan1_input"], "1200")

  const dual = frames("dual-gpu")[0].drm
  assert.deepEqual(dual.map((d) => d.pci), ["0000:05:00.0", "0000:01:00.0"],
    "card0 is the Radeon even though its PCI address is later")
  assert.equal(dual[0].values["hwmon.power1_input"], "212000000")
  assert.equal(dual[0].values["hwmon.power1_average"], undefined)
})

test("a sysroot with almost nothing in it still frames cleanly", () => {
  withSysroot((root) => {
    put(root, "proc/stat", "cpu  1 2 3 4 5 6 7 8 0 0\ncpu0 1 2 3 4 5 6 7 8 0 0\nintr 1 2 3\n")
  }, (root) => {
    const r = collect(root)
    assert.equal(r.status, 0)
    assert.equal(r.stderr, "", "missing files are silent, not errors")
    const f = Frame.parseFrames(r.stdout)[0]
    assert.deepEqual(f.stat, ["cpu  1 2 3 4 5 6 7 8 0 0", "cpu0 1 2 3 4 5 6 7 8 0 0"])
    assert.deepEqual([f.meminfo, f.cpufreq, f.hwmon, f.drm], [[], {}, [], []])
  })
  withSysroot(() => {}, (root) => {
    const r = collect(root)
    assert.equal(r.status, 0)
    assert.equal(Frame.parseFrames(r.stdout).length, 1, "an empty sysroot is still one frame")
  })
})

test("a drm card with no PCI address is ignored", () => {
  withSysroot((root) => {
    put(root, "sys/class/drm/card0/device/vendor", "0x1234\n")
    put(root, "sys/class/drm/card0/device/uevent", "DRIVER=simple-framebuffer\n")
  }, (root) => {
    assert.deepEqual(Frame.parseFrames(collect(root).stdout)[0].drm, [])
  })
})

test("flags win over the environment; bad values fall back; unknown flags fail", () => {
  const override = collect(sysroot("dual-gpu"), { frames: 3, args: ["--frames", "1"] })
  assert.equal(Frame.parseFrames(override.stdout).length, 1)

  const badInterval = collect(sysroot("dual-gpu"), { frames: 1, intervalMs: "soon" })
  assert.equal(badInterval.status, 0)
  assert.equal(Frame.parseFrames(badInterval.stdout).length, 1)

  const unknown = collect(sysroot("dual-gpu"), { args: ["--bogus"] })
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /unknown argument: --bogus/)
})

test("--selftest passes on this machine", { skip: !existsSync("/proc/stat") }, () => {
  const r = spawnSync("bash", [COLLECTOR, "--selftest"], { encoding: "utf8", timeout: 20000 })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /selftest ok/)
})
