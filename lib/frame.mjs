// Collector frames -> plain objects. Pure. The format is documented at the top
// of bin/touchdeck-collect.
//
// Like everything in lib/, this runs in both Node (tests) and Qt's QML engine
// (the deck), so it sticks to ES2015: no object spread, no ?. or ??, no
// ES2017+ library methods. tools/check.sh lints lib/ under the QML parser.

export function emptyFrame(ts) {
  return { ts: ts, stat: [], meminfo: [], cpufreq: {}, hwmon: [], drm: [], extra: {} }
}

function splitValue(text) {
  const at = text.indexOf("=")
  if (at <= 0) return null
  return { key: text.slice(0, at), value: text.slice(at + 1) }
}

// SplitParser hands lines over one at a time, so frames are assembled
// incrementally: push() returns a complete frame when it sees @end, otherwise
// null. A frame cut off part-way (the collector was killed mid-write) is
// dropped when the next @frame starts -- it is never half-applied.
export function createAssembler() {
  let frame = null
  let section = null

  function header(text) {
    const parts = text.slice(1).split(" ")
    const kind = parts[0]
    if (kind === "frame") {
      const ts = Number(parts[1])
      frame = emptyFrame(isFinite(ts) ? ts : 0)
      section = null
      return null
    }
    if (!frame) return null
    if (kind === "end") {
      const done = frame
      frame = null
      section = null
      return done
    }
    if (kind === "stat" || kind === "meminfo") {
      section = { kind: "lines", target: frame[kind] }
    } else if (kind === "cpufreq") {
      section = { kind: "values", target: frame.cpufreq }
    } else if (kind === "hwmon") {
      const chip = { id: parts[1] || "", name: parts[2] || "", values: {} }
      frame.hwmon.push(chip)
      section = { kind: "values", target: chip.values }
    } else if (kind === "drm") {
      const gpu = {
        pci: parts[1] || "",
        vendor: String(parts[2] || "").toLowerCase(),
        driver: parts[3] || "",
        values: {},
      }
      frame.drm.push(gpu)
      section = { kind: "values", target: gpu.values }
    } else {
      // Unknown section: keep it rather than choke, so a newer collector can
      // add sections without breaking an older parser.
      frame.extra[kind] = []
      section = { kind: "lines", target: frame.extra[kind] }
    }
    return null
  }

  return {
    push: function (line) {
      const text = String(line === undefined || line === null ? "" : line)
      if (text.charAt(0) === "@") return header(text)
      if (!frame || !section || text === "") return null
      if (section.kind === "lines") {
        section.target.push(text)
      } else {
        const kv = splitValue(text)
        if (kv) section.target[kv.key] = kv.value
      }
      return null
    },
    reset: function () {
      frame = null
      section = null
    },
  }
}

export function parseFrames(text) {
  const assembler = createAssembler()
  const frames = []
  const lines = String(text || "").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const done = assembler.push(lines[i])
    if (done) frames.push(done)
  }
  return frames
}
