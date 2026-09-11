// The default output's volume and mute, the default input's mute, and
// switching outputs (DESIGN.md 7.5, D5), through Quickshell's PipeWire
// service: event-driven, nothing polled.
//
// Two things mirror Omarchy's own audio panel exactly, so the deck, the panel
// and the volume keys never disagree (DECISIONS.md G-14):
//   - volume and mute act on the sink `omarchy-audio-output-sink` resolves
//     -- the physical output behind a speaker tuning or EasyEffects, the one
//     the keys move -- not blindly on the default sink;
//   - choosing an output sets PipeWire's preferred default *and* runs
//     `omarchy-audio-output-set-default`, which moves playing streams across.
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import "../lib/audio.mjs" as AudioLib

QtObject {
  id: root

  property bool active: false

  readonly property var sink: Pipewire.defaultAudioSink
  readonly property var source: Pipewire.defaultAudioSource
  property string volumeSinkName: ""

  readonly property var volumeSink: {
    var s = root.sink
    if (root.volumeSinkName === "" || !s) return s
    if (String(s.name) === root.volumeSinkName) return s
    var nodes = Pipewire.nodes ? Pipewire.nodes.values : []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n && n.isSink && !n.isStream && String(n.name) === root.volumeSinkName && n.audio) return n
    }
    return s
  }

  readonly property bool hasOutput: !!(root.volumeSink && root.volumeSink.audio)
  readonly property bool hasInput: !!(root.source && root.source.audio)
  readonly property real volume: root.hasOutput ? root.volumeSink.audio.volume : 0
  readonly property bool muted: root.hasOutput ? root.volumeSink.audio.muted : false
  readonly property bool micMuted: root.hasInput ? root.source.audio.muted : false
  readonly property string outputLabel: root.sink
    ? AudioLib.sinkLabel({ nickname: root.sink.nickname, description: root.sink.description, name: root.sink.name })
    : ""

  // A node's audio properties only update while it is tracked; track just the
  // three that matter, and only while the deck shows a volume widget.
  readonly property PwObjectTracker _tracker: PwObjectTracker {
    objects: root.active ? [root.sink, root.source, root.volumeSink].filter(function (n) { return !!n }) : []
  }

  // ------------------------------------------------------------ intents

  function setVolume(v, max) {
    if (!root.hasOutput) return
    var next = AudioLib.clampVolume(v, max)
    // Exactly like the volume keys: omarchy-audio-output-volume unmutes on
    // every change, up or down, so moving the fader does too.
    if (root.muted) root.volumeSink.audio.muted = false
    root.volumeSink.audio.volume = next
  }

  function toggleMute() {
    if (root.hasOutput) root.volumeSink.audio.muted = !root.muted
  }

  function toggleMic() {
    if (root.hasInput) root.source.audio.muted = !root.micMuted
  }

  function selectOutput(name) {
    var nodes = Pipewire.nodes ? Pipewire.nodes.values : []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n || !n.isSink || n.isStream || String(n.name) !== String(name)) continue
      Pipewire.preferredDefaultAudioSink = n
      Quickshell.execDetached(["omarchy-audio-output-set-default", String(n.id), String(n.name)])
      return true
    }
    return false
  }

  // ------------------------------------------------------------ output list
  //
  // A snapshot, taken when the picker opens, not a live model: Omarchy's panel
  // documents that rebuilding views from PipeWire's removal signal path can
  // crash its PipeWire service, so it lists snapshots too.

  property var outputs: []
  property var _availability: ({})
  property string _availabilityText: ""

  function refreshOutputs() {
    root._snapshotOutputs()
    if (!root._availabilityProc.running) root._availabilityProc.running = true
  }

  function _snapshotOutputs() {
    var nodes = Pipewire.nodes ? Pipewire.nodes.values : []
    var plain = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n || !n.isSink || n.isStream) continue
      plain.push({ name: String(n.name || ""), nickname: String(n.nickname || ""),
        description: String(n.description || ""), isSink: true, isStream: false })
    }
    root.outputs = AudioLib.outputOptions(plain, root._availability, root.sink ? String(root.sink.name) : "")
  }

  readonly property Process _availabilityProc: Process {
    command: ["omarchy-audio-sink-availability"]
    stdout: SplitParser {
      onRead: function (line) { root._availabilityText += line + "\n" }
    }
    onRunningChanged: {
      if (running) {
        root._availabilityText = ""
        return
      }
      root._availability = AudioLib.parseSinkAvailability(root._availabilityText)
      root._snapshotOutputs()
    }
  }

  // ------------------------------------------------------------ volume sink

  readonly property Process _resolver: Process {
    command: ["omarchy-audio-output-sink"]
    stdout: SplitParser {
      onRead: function (line) {
        var name = String(line).trim()
        if (name !== "") root.volumeSinkName = name
      }
    }
  }

  function resolveVolumeSink() {
    if (!root._resolver.running) root._resolver.running = true
  }

  onSinkChanged: root.resolveVolumeSink()
  onActiveChanged: if (root.active) root.resolveVolumeSink()

  // A safety net for a speaker tuning appearing or going underneath us, as
  // Omarchy's panel has. Only while a volume widget is on screen.
  readonly property Timer _reresolve: Timer {
    interval: 15000
    repeat: true
    running: root.active
    onTriggered: root.resolveVolumeSink()
  }

  function summary() {
    return {
      active: root.active, output: root.outputLabel, sink: root.sink ? String(root.sink.name) : "",
      volumeSink: root.volumeSink ? String(root.volumeSink.name) : "", volume: root.volume,
      muted: root.muted, micMuted: root.micMuted,
    }
  }
}
