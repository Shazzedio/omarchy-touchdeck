// Drawn in place of a widget that failed to load, so one broken widget costs a
// tile rather than the grid (DESIGN.md 15).
import QtQuick

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0
  property string message: ""

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
    invalid: true

    DeckText {
      anchors.centerIn: parent
      width: parent.width - root.theme.spacing.tilePadding * 2
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.Wrap
      maximumLineCount: 3
      theme: root.theme
      kind: "label"
      tone: "status"
      status: "critical"
      text: root.message !== "" ? root.message : "This widget couldn't load"
    }
  }
}
