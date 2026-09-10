// RAM, optional swap, and one GPU's VRAM (DESIGN.md 7.4).
//   narrower than 4   two rings, RAM and VRAM
//   4 wide            labelled bars: "12.4 / 31.0 GiB"
//   4 tall and up     adds RAM history
// Used is MemTotal - MemAvailable, as btop and free count it.
import QtQuick
import "../components"
import "../lib/format.mjs" as Format

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0

  readonly property var sensors: root.services ? root.services.sensors : null
  readonly property var memory: root.sensors ? root.sensors.memory : null
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})
  readonly property bool showSwap: root.settings.showSwap === true
  readonly property string vramSetting: root.settings.vramGpu ? String(root.settings.vramGpu) : "auto"
  readonly property var gpu: root.sensors && root.vramSetting !== "none" ? root.sensors.gpu(root.vramSetting) : null
  readonly property bool hasVram: root.gpu !== null && root.gpu.available && root.gpu.vramTotalBytes > 0

  readonly property int cols: root.entry ? root.entry.w : 2
  readonly property int rows: root.entry ? root.entry.h : 2
  readonly property bool bars: root.cols >= 4
  readonly property bool showHistory: root.bars && root.rows >= 4

  readonly property bool hasRam: root.memory !== null && root.memory.usedPct !== null
  readonly property real vramPct: root.hasVram ? root.gpu.vramUsedBytes / root.gpu.vramTotalBytes * 100 : 0

  MonitorFrame {
    anchors.fill: parent
    theme: root.theme
    title: "Memory"
    loading: !root.hasRam
    stale: root.sensors ? root.sensors.stale : false
    ageMs: root.sensors ? root.sensors.lastFrameAge : -1

    // Rings, for the small sizes.
    Row {
      id: ringRow
      visible: !root.bars
      anchors.fill: parent
      spacing: root.theme.spacing.md

      Repeater {
        model: root.hasVram ? 2 : 1

        Item {
          id: ringCell
          required property int index
          readonly property bool isRam: index === 0
          width: (ringRow.width - ringRow.spacing * (root.hasVram ? 1 : 0)) / (root.hasVram ? 2 : 1)
          height: ringRow.height

          ArcGauge {
            id: ring
            theme: root.theme
            width: Math.min(parent.width, parent.height - ringLabel.height - root.theme.spacing.xs)
            height: width
            x: (parent.width - width) / 2
            startAngle: -90
            sweep: 360
            value: ringCell.isRam ? (root.hasRam ? root.memory.usedPct : 0) : root.vramPct
            hasValue: ringCell.isRam ? root.hasRam : root.hasVram
          }
          DeckText {
            anchors.centerIn: ring
            theme: root.theme
            kind: "body"
            font.bold: true
            font.features: ({ "tnum": 1 })
            text: Format.percent(ringCell.isRam ? (root.hasRam ? root.memory.usedPct : null) : root.vramPct)
          }
          DeckText {
            id: ringLabel
            anchors { top: ring.bottom; topMargin: root.theme.spacing.xs; horizontalCenter: parent.horizontalCenter }
            theme: root.theme
            kind: "caption"
            tone: "muted"
            text: ringCell.isRam ? "RAM" : "VRAM"
          }
        }
      }
    }

    // Bars, from 4 wide.
    Column {
      id: barColumn
      visible: root.bars
      anchors { left: parent.left; right: parent.right; top: parent.top }
      spacing: root.theme.spacing.lg

      BarMeter {
        width: parent.width
        theme: root.theme
        label: "RAM"
        valueText: root.memory ? Format.usedOfTotal(root.memory.usedBytes, root.memory.totalBytes) : ""
        value: root.hasRam ? root.memory.usedPct : 0
        hasValue: root.hasRam
      }
      BarMeter {
        visible: root.hasVram
        width: parent.width
        theme: root.theme
        label: "VRAM"
        valueText: root.hasVram ? Format.usedOfTotal(root.gpu.vramUsedBytes, root.gpu.vramTotalBytes) : ""
        value: root.vramPct
        hasValue: root.hasVram
      }
      BarMeter {
        visible: root.showSwap && root.memory !== null && root.memory.swapTotalBytes > 0
        width: parent.width
        theme: root.theme
        label: "Swap"
        valueText: root.memory ? Format.usedOfTotal(root.memory.swapUsedBytes, root.memory.swapTotalBytes) : ""
        value: root.memory && root.memory.swapPct !== null ? root.memory.swapPct : 0
        hasValue: root.memory !== null && root.memory.swapPct !== null
      }
    }

    Sparkline {
      visible: root.showHistory
      anchors {
        left: parent.left
        right: parent.right
        top: barColumn.bottom
        bottom: parent.bottom
        topMargin: root.theme.spacing.xl
      }
      theme: root.theme
      values: root.memory ? root.memory.history : []
    }
  }
}
