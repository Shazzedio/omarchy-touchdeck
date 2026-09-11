// The default output's volume, mute, output device and the mic (DESIGN.md 7.5).
// Vertical when taller than wide. Changes made anywhere else -- the volume
// keys, Omarchy's audio panel -- show here at once, because this binds to the
// same PipeWire node they change.
import QtQuick
import "../components"
import "../lib/audio.mjs" as AudioLib
import "../lib/glyphs.mjs" as Glyphs

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0

  readonly property var audio: root.services ? root.services.audio : null
  readonly property var overlay: root.services ? root.services.overlay : null
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})

  function numberSetting(key, fallback, lo, hi) {
    var raw = root.settings[key]
    var n = Number(raw)
    return raw !== null && raw !== undefined && raw !== "" && isFinite(n) ? Math.min(Math.max(n, lo), hi) : fallback
  }
  readonly property real maxVolume: root.numberSetting("maxVolume", 1.0, 1.0, 1.5)
  readonly property real step: root.numberSetting("step", 0.05, 0.01, 0.1)
  readonly property bool showMic: root.settings.showMic !== false

  readonly property int cols: root.entry ? root.entry.w : 4
  readonly property int rows: root.entry ? root.entry.h : 6
  readonly property bool vertical: root.rows > root.cols
  readonly property bool available: root.audio !== null && root.audio.hasOutput

  readonly property real volume: root.audio ? root.audio.volume : 0
  readonly property bool muted: root.audio ? root.audio.muted : false
  readonly property int pad: root.theme.spacing.tilePadding
  readonly property int gap: root.theme.spacing.lg
  readonly property int button: Math.min(root.theme.primaryTarget,
    root.vertical ? (root.width - root.pad * 2) * 0.45 : (root.height - root.pad * 2) * 0.45)

  function set(v) { if (root.audio) root.audio.setVolume(v, root.maxVolume) }

  function openOutputs() {
    if (!root.audio || !root.overlay) return
    root.audio.refreshOutputs()
    root.overlay.showList("Output", root.options(), function (name) { root.audio.selectOutput(name) }, root)
  }

  function options() {
    var list = root.audio ? root.audio.outputs : []
    var out = []
    for (var i = 0; i < list.length; i++)
      out.push({ key: list[i].name, label: list[i].label, detail: "", selected: list[i].isDefault })
    return out
  }

  // Availability arrives a moment after the sheet opens; keep the list current.
  Connections {
    target: root.audio
    function onOutputsChanged() { if (root.overlay) root.overlay.update(root, root.options()) }
  }

  // The readout sets the top line; the small title sits on its baseline, so
  // the big number never pokes above the tile.
  DeckText {
    id: readout
    theme: root.theme
    anchors { right: parent.right; top: parent.top; margins: root.pad }
    kind: "value"
    font.pixelSize: Math.round(root.theme.font.displayLarge * 1.1)
    tone: root.muted ? "status" : "normal"
    status: "critical"
    text: !root.available ? "" : root.muted ? "Muted" : AudioLib.percent(root.volume) + "%"
  }

  DeckText {
    id: title
    theme: root.theme
    anchors { left: parent.left; baseline: readout.baseline; leftMargin: root.pad }
    kind: "label"
    tone: "muted"
    text: "Volume"
  }

  DeckText {
    anchors.centerIn: parent
    visible: !root.available
    theme: root.theme
    kind: "label"
    tone: "muted"
    text: root.audio ? "No audio output" : "Waiting for audio"
  }

  Item {
    id: body
    visible: root.available
    anchors {
      left: parent.left
      right: parent.right
      top: readout.bottom
      bottom: outputButton.top
      margins: root.pad
      topMargin: root.gap
      bottomMargin: root.gap
    }

    Fader {
      id: fader
      theme: root.theme
      vertical: root.vertical
      dim: root.muted
      fraction: AudioLib.fractionOf(root.volume, root.maxVolume)
      x: 0
      y: 0
      width: root.vertical ? body.width - root.button - root.gap : body.width
      height: root.vertical ? body.height : body.height - root.button - root.gap
      onMoved: function (f) { root.set(AudioLib.volumeAt(f, root.maxVolume)) }
      onStepped: function (steps) { root.set(AudioLib.stepVolume(root.volume, steps * root.step, root.maxVolume)) }
    }

    Grid {
      id: buttons
      columns: root.vertical ? 1 : 2
      spacing: root.gap
      x: root.vertical ? body.width - root.button : 0
      y: root.vertical ? 0 : body.height - root.button

      IconButton {
        theme: root.theme
        width: root.button
        height: root.button
        glyph: Glyphs.volume(AudioLib.volumeLevel(root.volume, root.muted))
        label: root.muted ? "Unmute" : "Mute"
        alert: root.muted
        onClicked: if (root.audio) root.audio.toggleMute()
      }

      IconButton {
        visible: root.showMic && root.audio !== null && root.audio.hasInput
        theme: root.theme
        width: root.button
        height: root.button
        glyph: root.audio && root.audio.micMuted ? Glyphs.MIC_OFF : Glyphs.MIC
        label: root.audio && root.audio.micMuted ? "Mic muted" : "Mic on"
        alert: root.audio !== null && root.audio.micMuted
        onClicked: if (root.audio) root.audio.toggleMic()
      }
    }
  }

  // The output device, and the way to change it.
  Item {
    id: outputButton
    visible: root.available
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: root.pad }
    height: root.theme.minTarget
    scale: outTap.pressed ? 0.98 : 1

    DeckSurface {
      anchors.fill: parent
      theme: root.theme
      role: "control"
      pressed: outTap.pressed
    }

    DeckText {
      theme: root.theme
      anchors {
        left: parent.left
        right: chevron.left
        verticalCenter: parent.verticalCenter
        leftMargin: root.theme.spacing.xl
        rightMargin: root.theme.spacing.md
      }
      kind: "label"
      text: root.audio ? root.audio.outputLabel : ""
    }

    DeckText {
      id: chevron
      theme: root.theme
      anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: root.theme.spacing.xl }
      tone: "muted"
      text: "▾"
    }

    TapHandler {
      id: outTap
      gesturePolicy: TapHandler.ReleaseWithinBounds
      longPressThreshold: root.theme.tapMaxSeconds
      dragThreshold: root.theme.tapSlop
      onTapped: root.openOutputs()
    }
  }
}
