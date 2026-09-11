// What an item draws as when its type isn't one this Touchdeck knows -- say, a
// config written by a newer version. It is kept, not deleted (DESIGN.md 12),
// and says so plainly, with the way out.
import QtQuick

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0

  readonly property string type: root.entry ? String(root.entry.type || "") : ""
  readonly property bool roomy: root.entry !== null && root.entry.w >= 2 && root.entry.h >= 2

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
    // Reads as urgent rather than pretending to be a widget we can draw.
    invalid: true

    Column {
      anchors.centerIn: parent
      width: parent.width - root.theme.spacing.tilePadding * 2
      spacing: root.theme.spacing.xs

      DeckText {
        theme: root.theme
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        kind: "label"
        tone: "status"
        status: "critical"
        text: "Unknown widget"
      }

      DeckText {
        theme: root.theme
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        visible: root.roomy
        wrapMode: Text.WordWrap
        maximumLineCount: 3
        kind: "caption"
        tone: "muted"
        text: (root.type !== "" ? "“" + root.type + "” isn't a widget this Touchdeck knows. " : "")
          + "Remove it in edit mode, or update Touchdeck."
      }
    }
  }
}
