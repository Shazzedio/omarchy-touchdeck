// Shared test helpers for the fixture sysroots in tests/fixtures/sysroots/.
import { spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import * as Frame from "../../lib/frame.mjs"

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export const COLLECTOR = path.join(REPO, "bin/touchdeck-collect")
export const SYSROOTS = path.join(REPO, "tests/fixtures/sysroots")
export const FIXTURES = ["intel-nvidia", "amd-radeon", "dual-gpu"]

export function sysroot(name) {
  return path.join(SYSROOTS, name)
}

// Run the real collector against a sysroot. Returns spawnSync's result.
export function collect(root, options) {
  const opts = options || {}
  return spawnSync("bash", [COLLECTOR].concat(opts.args || []), {
    env: Object.assign({}, process.env, {
      TOUCHDECK_SYSROOT: root,
      TOUCHDECK_FRAMES: String(opts.frames === undefined ? 1 : opts.frames),
      TOUCHDECK_INTERVAL_MS: String(opts.intervalMs === undefined ? 50 : opts.intervalMs),
    }),
    encoding: "utf8",
    timeout: 20000,
  })
}

// Two frames of collector output for a fixture, as text. A static fixture tree
// can't advance its own counters, so the second frame is the first with its
// @stat section swapped for proc/stat.next -- what the collector would have
// printed a second later.
export function frameTexts(name) {
  const root = sysroot(name)
  const result = collect(root)
  if (result.status !== 0) throw new Error("collector failed on " + name + ": " + result.stderr)
  const nextStat = readFileSync(path.join(root, "proc/stat.next"), "utf8")
    .split("\n").filter((l) => /^cpu/.test(l))
  const out = []
  let inStat = false
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("@frame ")) {
      out.push("@frame " + (Number(line.slice(7)) + 1000))
      continue
    }
    if (line === "@stat") {
      inStat = true
      out.push(line, ...nextStat)
      continue
    }
    if (inStat && line.startsWith("@")) inStat = false
    if (!inStat) out.push(line)
  }
  return { first: result.stdout, second: out.join("\n") }
}

export function framesFor(name) {
  const texts = frameTexts(name)
  return [Frame.parseFrames(texts.first)[0], Frame.parseFrames(texts.second)[0]]
}

export function nvidiaLines(name) {
  const file = path.join(sysroot(name), "nvidia-smi.csv")
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : []
}
