// Phase 1 stand-in for a real widget. It exists to prove the grid, the config
// round-trip and the theme adapter on real hardware before any sensor code is
// written, so it deliberately shows the things that would be wrong if any of
// those were broken: which item this is, how big the grid thinks it is, and
// what the current theme's status colours look like side by side.
//
// Replaced by the widget registry in Phase 2.
import QtQuick

Item {
  id: root

  property var theme: null
  property var entry: null
  property bool editing: false
  property real cellSize: 0

  readonly property string type: entry ? String(entry.type) : "?"
  readonly property bool known: ["cpu", "gpu", "memory", "volume", "media", "app"].indexOf(root.type) !== -1

  DeckSurface {
    id: surface
    anchors.fill: parent
    theme: root.theme
    // An unknown type -- a config from a newer Touchdeck -- reads as urgent
    // rather than pretending to be a widget we can draw.
    invalid: !root.known

    Column {
      anchors.centerIn: parent
      width: parent.width - root.theme.spacing.tilePadding * 2
      spacing: root.theme.spacing.xs

      DeckText {
        theme: root.theme
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        kind: "value"
        tone: root.known ? "surface" : "status"
        status: "critical"
        text: root.type
      }

      DeckText {
        theme: root.theme
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        kind: "caption"
        tone: "muted"
        text: root.entry
          ? root.entry.w + "×" + root.entry.h + "  ·  " + Math.round(root.cellSize) + "px"
          : ""
      }

      DeckText {
        theme: root.theme
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        kind: "caption"
        tone: "muted"
        visible: !root.known
        text: "unknown widget"
      }

      // Three status swatches. Phase 1's acceptance test is a walk through
      // every installed theme (DESIGN.md 8.5); having ok/warn/critical on
      // screen makes it obvious at a glance when a theme's hues collapse into
      // each other -- which four of them do.
      Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: root.theme.spacing.xs
        visible: root.entry !== null && root.entry.h >= 3

        Repeater {
          model: ["ok", "warn", "critical"]

          Rectangle {
            required property string modelData
            width: root.theme.space(14)
            height: root.theme.space(6)
            radius: root.theme.cornerRadius
            color: root.theme.statusColor(modelData)
            opacity: (modelData === "critical" && !root.theme.criticalDistinct)
              || (modelData === "warn" && !root.theme.warnDistinct) ? 0.45 : 1.0
          }
        }
      }
    }
  }
}
