// One GPU: usage, VRAM, temperature, power and fan (DESIGN.md 7.3).
//   2×2      the number and the temperature
//   3×3      the number in an arc gauge
//   4×3 up   adds VRAM, junction temperature, power, fan and history
// `gpu: "auto"` is the first discrete GPU; otherwise a PCI address. GPUs are
// always identified by PCI address, never cardN (DECISIONS.md G-10).
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
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})
  readonly property string gpuSetting: root.settings.gpu ? String(root.settings.gpu) : "auto"
  readonly property var gpu: root.sensors ? root.sensors.gpu(root.gpuSetting) : null

  function numberSetting(key, fallback) {
    var raw = root.settings[key]
    var n = Number(raw)
    return raw !== null && raw !== undefined && raw !== "" && isFinite(n) ? n : fallback
  }
  readonly property real tempWarn: root.numberSetting("tempWarn", 80)
  readonly property real tempCrit: root.numberSetting("tempCrit", 90)

  readonly property int cols: root.entry ? root.entry.w : 2
  readonly property int rows: root.entry ? root.entry.h : 2
  readonly property bool showGauge: root.cols >= 3 && root.rows >= 3
  readonly property bool showDetail: root.cols >= 4 && root.rows >= 3
  readonly property bool showHistory: root.showDetail && root.rows >= 4

  readonly property bool hasUsage: root.gpu !== null && root.gpu.available && root.gpu.usagePct !== null
  readonly property string tempStatus: root.theme.statusFor(root.gpu ? root.gpu.tempC : null, root.tempWarn, root.tempCrit)

  // "NVIDIA GeForce RTX 4070" -> "RTX 4070": the vendor is obvious and the
  // title row is short.
  function shortName(name) {
    return String(name || "").replace(/^NVIDIA (GeForce )?/, "").replace(/^AMD /, "")
  }

  readonly property string unavailableReason: {
    if (!root.sensors || root.sensors.loading) return ""
    if (root.gpu === null)
      return root.gpuSetting === "auto" ? "No GPU found" : "GPU " + root.gpuSetting + " not found"
    return root.gpu.reason
  }

  MonitorFrame {
    anchors.fill: parent
    theme: root.theme
    title: "GPU"
    subtitle: root.cols >= 3 && root.gpu ? root.shortName(root.gpu.name) : ""
    loading: root.unavailableReason === "" && !root.hasUsage
    unavailable: root.unavailableReason
    stale: root.gpu ? root.gpu.stale : false
    ageMs: root.gpu && root.gpu.lastAt > 0 && root.sensors ? root.sensors.now - root.gpu.lastAt : -1

    Readout {
      id: headline
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      width: root.showDetail ? Math.min(parent.height, parent.width * 0.45) : parent.width
      theme: root.theme
      gauge: root.showGauge
      value: root.hasUsage ? root.gpu.usagePct : 0
      hasValue: root.hasUsage
      valueText: Format.percent(root.hasUsage ? root.gpu.usagePct : null)
      tempC: root.gpu ? root.gpu.tempC : null
      tempStatus: root.tempStatus
    }

    Column {
      visible: root.showDetail
      anchors {
        left: headline.right
        right: parent.right
        top: parent.top
        bottom: parent.bottom
        leftMargin: root.theme.spacing.xl
      }
      spacing: root.theme.spacing.lg

      BarMeter {
        width: parent.width
        theme: root.theme
        label: "VRAM"
        valueText: root.gpu ? Format.usedOfTotal(root.gpu.vramUsedBytes, root.gpu.vramTotalBytes) : ""
        hasValue: root.gpu !== null && root.gpu.vramTotalBytes > 0
        value: root.gpu && root.gpu.vramTotalBytes > 0 ? root.gpu.vramUsedBytes / root.gpu.vramTotalBytes * 100 : 0
      }

      // Secondary readouts: whatever this card's driver actually exposes.
      Flow {
        width: parent.width
        spacing: root.theme.spacing.xl

        TempReadout {
          theme: root.theme
          visible: root.gpu !== null && root.gpu.junctionC !== null
          prefix: "Junction "
          celsius: root.gpu ? root.gpu.junctionC : null
          level: root.theme.statusFor(root.gpu ? root.gpu.junctionC : null, root.tempWarn + 15, root.tempCrit + 15)
        }
        DeckText {
          theme: root.theme
          kind: "body"
          tone: "muted"
          visible: root.gpu !== null && root.gpu.powerW !== null
          text: root.gpu ? Format.watts(root.gpu.powerW) : ""
        }
        DeckText {
          theme: root.theme
          kind: "body"
          tone: "muted"
          visible: root.gpu !== null && (root.gpu.fanPct !== null || root.gpu.fanRpm !== null)
          text: root.gpu === null ? ""
            : root.gpu.fanPct !== null ? "Fan " + Format.percent(root.gpu.fanPct)
            : "Fan " + Format.rpm(root.gpu.fanRpm)
        }
      }
    }

    Sparkline {
      visible: root.showHistory
      anchors {
        left: headline.right
        right: parent.right
        bottom: parent.bottom
        leftMargin: root.theme.spacing.xl
      }
      height: parent.height * 0.35
      theme: root.theme
      values: root.gpu ? root.gpu.history : []
    }
  }
}
