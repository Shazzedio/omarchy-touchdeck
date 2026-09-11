// A touch button with a text label: sheets, tabs, choices, the edit toolbar.
// Same press as every other control on the deck (DESIGN.md 9).
import QtQuick

Item {
  id: root

  required property var theme
  property string text: ""
  property bool selected: false
  property bool danger: false
  property string kind: "body"

  signal clicked()

  implicitHeight: root.theme.minTarget
  implicitWidth: label.implicitWidth + root.theme.spacing.xxl * 2
  opacity: root.enabled ? 1 : 0.35
  scale: tap.pressed ? 0.97 : 1
  Behavior on scale {
    enabled: !root.theme.reduceMotion
    NumberAnimation { duration: root.theme.pressDuration }
  }

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
    role: "control"
    pressed: tap.pressed
    selected: root.selected
  }

  DeckText {
    id: label
    anchors.centerIn: parent
    width: Math.min(label.implicitWidth, root.width - root.theme.spacing.md * 2)
    horizontalAlignment: Text.AlignHCenter
    theme: root.theme
    kind: root.kind
    tone: root.danger ? "status" : (root.selected ? "accent" : "normal")
    status: "critical"
    text: root.text
  }

  TapHandler {
    id: tap
    gesturePolicy: TapHandler.ReleaseWithinBounds
    longPressThreshold: root.theme.tapMaxSeconds
    dragThreshold: root.theme.tapSlop
    onTapped: root.clicked()
  }
}
