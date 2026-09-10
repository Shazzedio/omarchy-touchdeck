// A single line across the top of the deck for something the user has to know
// about and can act on -- a config file that won't parse, items parked because
// the grid shrank. DESIGN.md 9: say what happened and what to do, in one line.
import QtQuick

Item {
  id: root

  required property var theme
  property string text: ""
  property string hint: ""
  property string severity: "critical"   // critical | warn

  readonly property bool active: root.text !== ""

  visible: active
  height: active ? content.implicitHeight + theme.spacing.md * 2 : 0

  Rectangle {
    anchors.fill: parent
    color: root.theme.alpha(root.theme.statusColor(root.severity), 0.16)

    // A left rule rather than a full-bleed fill: readable in a light theme and
    // in one whose status hues are nearly the background.
    Rectangle {
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      width: Math.max(2, root.theme.space(3))
      color: root.theme.statusColor(root.severity)
    }
  }

  Column {
    id: content
    anchors {
      left: parent.left
      right: parent.right
      verticalCenter: parent.verticalCenter
      leftMargin: root.theme.spacing.lg
      rightMargin: root.theme.spacing.lg
    }
    spacing: root.theme.spacing.xs

    DeckText {
      theme: root.theme
      width: parent.width
      kind: "body"
      tone: "status"
      status: root.severity
      text: root.text
      maximumLineCount: 2
      wrapMode: Text.Wrap
    }

    DeckText {
      theme: root.theme
      width: parent.width
      kind: "caption"
      tone: "muted"
      visible: root.hint !== ""
      text: root.hint
    }
  }
}
