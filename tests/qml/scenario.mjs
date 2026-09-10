// One deterministic run through lib/, executed by both Node
// (tests/parity.test.mjs) and Qt's QML engine (a harness that test builds), whose
// results must match exactly.
//
// Why this exists: lib/ runs in two JavaScript engines. Linting catches syntax
// one of them rejects (DECISIONS.md D-10), but not a library method one of
// them lacks -- that only fails at runtime, inside the desktop shell. This
// file runs in QML, so it keeps to ES2015 itself.
import * as Frame from "../../lib/frame.mjs"
import * as Sensors from "../../lib/sensors.mjs"
import * as Format from "../../lib/format.mjs"
import * as Theme from "../../lib/theme.mjs"
import * as Config from "../../lib/config.mjs"
import * as Grid from "../../lib/grid.mjs"

// Doubles may differ in the last bit between engines (Math.pow is not
// required to be correctly rounded), so compare at 9 significant digits.
function stable(value) {
  if (typeof value === "number") return isFinite(value) ? Number(value.toPrecision(9)) : String(value)
  if (Array.isArray(value)) {
    const list = []
    for (let i = 0; i < value.length; i++) list.push(stable(value[i]))
    return list
  }
  if (value && typeof value === "object") {
    const out = {}
    const keys = Object.keys(value).sort()
    for (let i = 0; i < keys.length; i++) out[keys[i]] = stable(value[keys[i]])
    return out
  }
  return value
}

function runFixture(f) {
  let state = Sensors.createState()
  state = Sensors.applyFrame(state, Frame.parseFrames(f.first)[0], 1000)
  state = Sensors.applyFrame(state, Frame.parseFrames(f.second)[0], 2000)
  const lines = f.nvidia || []
  for (let i = 0; i < lines.length; i++) state = Sensors.applyNvidiaLine(state, lines[i], 2000 + i)
  const gpus = Sensors.gpuList(state, 2500, 1000, "running")
  const chosen = Sensors.selectGpu(gpus, "auto")
  return {
    cpu: state.cpu,
    memory: state.memory,
    gpus: gpus,
    auto: chosen ? chosen.pci : null,
    text: {
      cpu: Format.percent(state.cpu.usagePct),
      temp: Format.celsius(state.cpu.tempC),
      freq: Format.frequency(state.cpu.freqMHz),
      mem: Format.usedOfTotal(state.memory.usedBytes, state.memory.totalBytes),
      vram: chosen ? Format.usedOfTotal(chosen.vramUsedBytes, chosen.vramTotalBytes) : "",
      power: chosen ? Format.watts(chosen.powerW) : "",
    },
  }
}

export function run(input) {
  const fixtures = (input && input.fixtures) || {}
  const names = Object.keys(fixtures).sort()
  const out = { fixtures: {} }
  for (let i = 0; i < names.length; i++) out.fixtures[names[i]] = runFixture(fixtures[names[i]])

  out.format = {
    age: [0, 4500, 125000, 7300000].map(Format.age),
    gib: Format.gib(13314398618),
    dash: [Format.percent(null), Format.celsius(undefined)],
  }
  const palette = { named: { green: "#adda78", yellow: "#f9cc6c", red: "#fd6883" }, accent: "#f38d70", urgent: "#fd6883" }
  const grey = { named: {}, accent: "#8d8d8d", urgent: "#a4a4a4" }
  out.theme = {
    status: Theme.statusColors(palette),
    fallback: Theme.statusColors(grey),
    legibility: [Theme.statusLegibility(Theme.statusColors(palette)), Theme.statusLegibility(Theme.statusColors(grey))],
    contrast: Theme.contrastRatio("#2c2525", "#e6d9db"),
    mixed: Theme.mix("#000000", "#ffffff", 0.5),
    touch: Theme.touchScale(1536, 838, 16, 9, 1),
    parsed: Theme.parseColorsToml('mode = "light"\ngreen = "#ADDA78"\n'),
  }
  out.config = {
    broken: Config.describeJsonError('{\n  "a": 1,\n}'),
    located: Config.locateJsonError("{\n  \"a\": 'x'\n}"),
    roundTrip: Config.serialize(Config.parse(Config.serialize(Config.defaultConfig())).config),
  }
  out.grid = {
    geometry: Grid.geometry(1536, 838, 16, 9, 10, 6),
    parked: Grid.partitionByFit(Config.pageItems(Config.defaultConfig(), 0), 8, 6).unplaced.length,
  }
  return stable(out)
}
