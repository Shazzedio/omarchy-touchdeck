// Audio -> labels and volume maths. Pure. AudioService.qml owns PipeWire;
// everything it decides about labels, the output list and the fader's numbers
// is here, where it is tested. ES2015 only: this also runs in Qt's QML engine.
//
// Volumes are PipeWire's linear scale: 1.0 is 100 %.

// Omarchy's own device-label clean-up (shell/plugins/panels/audio/Model.js),
// so outputs are named the same on the deck as in the audio panel.
export function friendlyLabel(text) {
  let label = String(text || "").trim()
  label = label.replace(/^sof-soundwire\s+/i, "")
  label = label.replace(/^built-?in audio\s+/i, "")
  label = label.replace(/\s+Output$/i, "")
  label = label.replace(/\s+Input$/i, "")
  label = label.replace(/\bMicrophones\b/g, "Microphone")
  return label
}

// The node nickname reads best ("HECATE G2 II GAMING HEADSET", "MSI G272CQP");
// the description is the fallback, then the raw name.
export function sinkLabel(node) {
  const n = node || {}
  const nick = friendlyLabel(n.nickname || "")
  if (nick) return nick
  return friendlyLabel(n.description || n.name || "") || "Unknown output"
}

// omarchy-audio-sink-availability prints "<sink name>\t<1|0>" per line; 0
// means the port behind it is unplugged.
export function parseSinkAvailability(raw) {
  const out = {}
  const lines = String(raw || "").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split("\t")
    if (parts.length >= 2 && parts[0]) out[parts[0]] = parts[1] !== "0"
  }
  return out
}

// The outputs worth offering: real sinks (not app streams), minus unplugged
// ones -- though the current default always stays, so it can't vanish from
// under the person looking at it. Two outputs with the same label (two
// "Built-in Audio"s) fall back to their descriptions so they can be told apart.
export function outputOptions(nodes, availability, defaultName) {
  const avail = availability || {}
  const list = []
  const src = nodes || []
  for (let i = 0; i < src.length; i++) {
    const n = src[i]
    if (!n || !n.isSink || n.isStream || !n.name) continue
    if (avail[n.name] === false && n.name !== defaultName) continue
    list.push({ name: String(n.name), label: sinkLabel(n), description: String(n.description || ""), isDefault: n.name === defaultName })
  }
  const counts = {}
  for (let i = 0; i < list.length; i++) counts[list[i].label] = (counts[list[i].label] || 0) + 1
  for (let i = 0; i < list.length; i++) {
    if (counts[list[i].label] > 1 && list[i].description) list[i].label = friendlyLabel(list[i].description)
  }
  list.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0) })
  return list
}

export function clampVolume(v, max) {
  const top = max > 0 ? max : 1
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.min(Math.max(n, 0), top)
}

// One step up or down, rounded to a whole percent so repeated steps land on
// the same numbers the volume keys do.
export function stepVolume(v, delta, max) {
  return clampVolume(Math.round((Number(v) + Number(delta)) * 100) / 100, max)
}

export function fractionOf(v, max) {
  const top = max > 0 ? max : 1
  return Math.min(Math.max(Number(v) / top, 0), 1)
}

export function volumeAt(fraction, max) {
  const top = max > 0 ? max : 1
  return clampVolume(Math.min(Math.max(Number(fraction), 0), 1) * top, top)
}

// Dragging is relative (DESIGN.md 7.5): the level moves by how far the finger
// travels along the track, wherever the drag started, so grabbing the fader
// never makes it jump.
export function dragVolume(startVolume, deltaPx, trackPx, max) {
  if (!(trackPx > 0)) return clampVolume(startVolume, max)
  const top = max > 0 ? max : 1
  return clampVolume(Number(startVolume) + Number(deltaPx) / trackPx * top, top)
}

export function percent(v) {
  const n = Number(v)
  return isFinite(n) ? Math.round(n * 100) : 0
}

// Mouse wheels send 120 per notch; touchpads send many small deltas. Carry the
// remainder between events so a slow two-finger scroll still moves the fader.
export function wheelSteps(accumulator, angleDelta) {
  const total = Number(accumulator || 0) + Number(angleDelta || 0)
  const steps = total > 0 ? Math.floor(total / 120) : Math.ceil(total / 120)
  return { steps: steps, accumulator: total - steps * 120 }
}

// Which speaker glyph to show.
export function volumeLevel(v, muted) {
  if (muted) return "muted"
  const p = percent(v)
  if (p <= 0) return "muted"
  if (p < 34) return "low"
  if (p < 67) return "medium"
  return "high"
}
