// A short message at the bottom of the deck, with at most one action --
// "Removed CPU · Undo" (DESIGN.md 6.1). Gone after five seconds.
import QtQuick

Item {
  id: root

  required property var theme
  property string text: ""
  property string actionLabel: ""
  property var _action: null
  property bool shown: false

  function show(text, actionLabel, action) {
    root.text = text
    root.actionLabel = actionLabel || ""
    root._action = action || null
    root.shown = true
    hide.restart()
  }

  visible: opacity > 0
  opacity: root.shown ? 1 : 0
  Behavior on opacity {
    enabled: !root.theme.reduceMotion
    NumberAnimation { duration: root.theme.editDuration }
  }
  width: row.implicitWidth + root.theme.spacing.xl * 2
  height: root.theme.minTarget + root.theme.spacing.sm * 2

  Timer { id: hide; interval: 5000; onTriggered: root.shown = false }

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
  }

  Row {
    id: row
    anchors.centerIn: parent
    spacing: root.theme.spacing.xl

    DeckText {
      anchors.verticalCenter: parent.verticalCenter
      theme: root.theme
      kind: "body"
      tone: "surface"
      text: root.text
    }

    TextButton {
      visible: root.actionLabel !== ""
      anchors.verticalCenter: parent.verticalCenter
      theme: root.theme
      height: root.theme.minTarget
      text: root.actionLabel
      selected: true
      onClicked: {
        var run = root._action
        root.shown = false
        if (run) run()
      }
    }
  }
}
