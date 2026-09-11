import { test } from "node:test"
import assert from "node:assert/strict"
import * as Audio from "../lib/audio.mjs"

// The three outputs on Shannon's machine, as PipeWire describes them.
const SINKS = [
  { name: "alsa_output.pci-0000_00_1f.3.iec958-stereo", nickname: "ALC897 Digital",
    description: "Built-in Audio Digital Stereo (IEC958)", isSink: true, isStream: false },
  { name: "alsa_output.usb-C-Media_Electronics_Inc._HECATE_G2_II_GAMING_HEADSET_20210525-00.analog-stereo",
    nickname: "HECATE G2 II GAMING HEADSET", description: "HECATE G2 II GAMING HEADSET Analog Stereo",
    isSink: true, isStream: false },
  { name: "alsa_output.pci-0000_01_00.1.hdmi-stereo", nickname: "MSI G272CQP",
    description: "AD104 High Definition Audio Controller Digital Stereo (HDMI)", isSink: true, isStream: false },
]

test("labels prefer the nickname, as Omarchy's audio panel does", () => {
  assert.equal(Audio.sinkLabel(SINKS[1]), "HECATE G2 II GAMING HEADSET")
  assert.equal(Audio.sinkLabel({ description: "Built-in Audio Analog Stereo" }), "Analog Stereo")
  assert.equal(Audio.sinkLabel({ name: "raw.name" }), "raw.name")
  assert.equal(Audio.sinkLabel({}), "Unknown output")
  assert.equal(Audio.friendlyLabel("Laptop Microphones Input"), "Laptop Microphone")
})

test("sink availability parses the helper's tab-separated output", () => {
  assert.deepEqual(Audio.parseSinkAvailability("a\t1\nb\t0\n\njunk\n"), { a: true, b: false })
})

test("the output list: real sinks only, unplugged ones hidden, default kept and marked", () => {
  const nodes = SINKS.concat([
    { name: "Brave", isSink: true, isStream: true },                 // an app's playback stream
    { name: "alsa_input.mic", isSink: false, isStream: false },       // a source
  ])
  const avail = { [SINKS[2].name]: false }
  const list = Audio.outputOptions(nodes, avail, SINKS[1].name)
  assert.deepEqual(list.map((o) => o.label), ["ALC897 Digital", "HECATE G2 II GAMING HEADSET"],
    "HDMI is unplugged, streams and sources aren't outputs, sorted by label")
  assert.deepEqual(list.map((o) => o.isDefault), [false, true])

  const keepDefault = Audio.outputOptions(SINKS, avail, SINKS[2].name)
  assert.ok(keepDefault.some((o) => o.name === SINKS[2].name && o.isDefault),
    "the current default never disappears, even if its port reports unplugged")
})

test("outputs sharing a label are told apart by description", () => {
  const list = Audio.outputOptions([
    { name: "a", nickname: "Built-in Audio", description: "Built-in Audio Analog Stereo", isSink: true },
    { name: "b", nickname: "Built-in Audio", description: "Built-in Audio Digital Stereo (HDMI)", isSink: true },
  ], {}, "a")
  assert.deepEqual(list.map((o) => o.label), ["Analog Stereo", "Digital Stereo (HDMI)"])
})

test("volume maths clamps to [0, max] and steps on whole percents", () => {
  assert.equal(Audio.clampVolume(1.3, 1), 1)
  assert.equal(Audio.clampVolume(1.3, 1.5), 1.3)
  assert.equal(Audio.clampVolume(-1, 1), 0)
  assert.equal(Audio.clampVolume("x", 1), 0)
  assert.equal(Audio.stepVolume(0.45, 0.05, 1), 0.5)
  assert.equal(Audio.stepVolume(0.98, 0.05, 1), 1, "capped at max, like the keys cap at 100 %")
  assert.equal(Audio.stepVolume(0.02, -0.05, 1), 0)
  assert.equal(Audio.stepVolume(0.1 + 0.2, 0, 1), 0.3, "no floating-point dust")
})

test("fraction and volume convert both ways for a fader with headroom", () => {
  assert.equal(Audio.fractionOf(0.75, 1.5), 0.5)
  assert.equal(Audio.volumeAt(0.5, 1.5), 0.75)
  assert.equal(Audio.volumeAt(2, 1), 1)
  assert.equal(Audio.fractionOf(3, 1), 1)
})

test("dragging is relative to where the level was, not where the finger landed", () => {
  assert.equal(Audio.dragVolume(0.5, 100, 400, 1), 0.75)
  assert.equal(Audio.dragVolume(0.5, -400, 400, 1), 0)
  assert.equal(Audio.dragVolume(0.9, 400, 400, 1), 1)
  assert.equal(Audio.dragVolume(0.5, 50, 0, 1), 0.5, "a zero-length track can't move anything")
})

test("wheel steps carry the remainder between events", () => {
  assert.deepEqual(Audio.wheelSteps(0, 120), { steps: 1, accumulator: 0 })
  assert.deepEqual(Audio.wheelSteps(0, -240), { steps: -2, accumulator: 0 })
  let acc = 0
  let steps = 0
  for (let i = 0; i < 6; i++) { const r = Audio.wheelSteps(acc, 30); acc = r.accumulator; steps += r.steps }
  assert.equal(steps, 1, "six touchpad nudges of 30 make one notch")
  assert.equal(acc, 60)
})

test("volume level picks the glyph", () => {
  assert.equal(Audio.volumeLevel(0.5, true), "muted")
  assert.equal(Audio.volumeLevel(0, false), "muted")
  assert.equal(Audio.volumeLevel(0.2, false), "low")
  assert.equal(Audio.volumeLevel(0.5, false), "medium")
  assert.equal(Audio.volumeLevel(1.2, false), "high")
  assert.equal(Audio.percent(0.4499969), 45)
})
