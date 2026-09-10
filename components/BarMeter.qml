// A labelled horizontal meter: "RAM  12.4 / 31.0 GiB" over a bar.
import QtQuick

Item {
  id: root

  required property var theme
  property string label: ""
  property string valueText: ""
  property real value: 0          // 0..100
  property bool hasValue: true
  property color fillColor: root.theme.accent

  readonly property int barHeight: Math.max(4, root.theme.space(6))
  implicitHeight: labelText.implicitHeight + root.theme.spacing.xs + root.barHeight

  DeckText {
    id: labelText
    theme: root.theme
    anchors { left: parent.left; top: parent.top }
    width: parent.width - valueLabel.implicitWidth - root.theme.spacing.md
    kind: "label"
    tone: "muted"
    text: root.label
  }

  DeckText {
    id: valueLabel
    theme: root.theme
    anchors { right: parent.right; top: parent.top }
    kind: "label"
    font.features: ({ "tnum": 1 })
    text: root.valueText
  }

  Rectangle {
    id: track
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: root.barHeight
    radius: Math.min(root.theme.cornerRadius, height / 2)
    color: root.theme.alpha(root.theme.foreground, 0.12)

    Rectangle {
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      radius: parent.radius
      color: root.fillColor
      width: parent.width * fill.value / 100
    }

    EasedValue {
      id: fill
      theme: root.theme
      target: root.hasValue ? Math.max(0, Math.min(100, root.value)) : 0
    }
  }
}
