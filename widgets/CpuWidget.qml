// CPU usage, temperature and clock (DESIGN.md 7.2).
//   2×2      the number and the temperature
//   3×3      the number in an arc gauge
//   4×3 up   adds per-core bars and a history sparkline
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
  readonly property var cpu: root.sensors ? root.sensors.cpu : null
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})

  function numberSetting(key, fallback) {
    var raw = root.settings[key]
    var n = Number(raw)
    return raw !== null && raw !== undefined && raw !== "" && isFinite(n) ? n : fallback
  }
  readonly property real tempWarn: root.numberSetting("tempWarn", 80)
  readonly property real tempCrit: root.numberSetting("tempCrit", 95)

  readonly property int cols: root.entry ? root.entry.w : 2
  readonly property int rows: root.entry ? root.entry.h : 2
  readonly property bool showGauge: root.cols >= 3 && root.rows >= 3
  readonly property bool showDetail: root.cols >= 4 && root.rows >= 3

  readonly property bool hasUsage: root.cpu !== null && root.cpu.usagePct !== null
  readonly property int coreCount: root.cpu ? root.cpu.cores.length : 0

  MonitorFrame {
    anchors.fill: parent
    theme: root.theme
    title: "CPU"
    subtitle: root.showDetail && root.cpu ? Format.frequency(root.cpu.freqMHz) : ""
    loading: !root.hasUsage
    stale: root.sensors ? root.sensors.stale : false
    ageMs: root.sensors ? root.sensors.lastFrameAge : -1

    Readout {
      id: headline
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      width: root.showDetail ? Math.min(parent.height, parent.width * 0.45) : parent.width
      theme: root.theme
      gauge: root.showGauge
      value: root.hasUsage ? root.cpu.usagePct : 0
      hasValue: root.hasUsage
      valueText: Format.percent(root.hasUsage ? root.cpu.usagePct : null)
      tempC: root.cpu ? root.cpu.tempC : null
      tempStatus: root.theme.statusFor(root.cpu ? root.cpu.tempC : null, root.tempWarn, root.tempCrit)
    }

    Item {
      id: detail
      visible: root.showDetail
      anchors {
        left: headline.right
        right: parent.right
        top: parent.top
        bottom: parent.bottom
        leftMargin: root.theme.spacing.xl
      }

      // One thin bar per logical CPU. The model is the count, not the array:
      // the array is rebuilt every frame, and a Repeater over it would tear
      // down and rebuild every bar every second.
      Row {
        id: cores
        anchors { left: parent.left; right: parent.right; top: parent.top }
        height: parent.height * 0.55
        spacing: Math.max(1, root.theme.space(2))

        Repeater {
          model: root.coreCount

          Rectangle {
            id: coreBar
            required property int index
            readonly property var pct: root.cpu && root.cpu.cores[index] ? root.cpu.cores[index].pct : null
            width: Math.max(1, (cores.width - cores.spacing * (root.coreCount - 1)) / Math.max(1, root.coreCount))
            height: cores.height
            radius: Math.min(root.theme.cornerRadius, width / 2)
            color: root.theme.alpha(root.theme.foreground, 0.08)

            Rectangle {
              anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
              radius: parent.radius
              color: root.theme.accent
              height: parent.height * coreFill.value / 100
            }

            EasedValue {
              id: coreFill
              theme: root.theme
              target: coreBar.pct === null ? 0 : Math.max(0, Math.min(100, coreBar.pct))
            }
          }
        }
      }

      Sparkline {
        anchors {
          left: parent.left
          right: parent.right
          top: cores.bottom
          bottom: parent.bottom
          topMargin: root.theme.spacing.lg
        }
        theme: root.theme
        values: root.cpu ? root.cpu.history : []
      }
    }
  }
}
