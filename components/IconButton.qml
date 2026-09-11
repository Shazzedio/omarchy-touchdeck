// A touch button: a glyph, an optional label, and the deck's one signature
// press (DESIGN.md 9) -- it depresses and its edge takes the accent.
import QtQuick

Item {
  id: root

  required property var theme
  property string glyph: ""
  property string label: ""
  // "On" in a way worth seeing (a playing player's play button).
  property bool selected: false
  // An unmistakable "this is off" (a muted microphone, DESIGN.md 7.5).
  property bool alert: false

  signal clicked()

  readonly property bool pressed: tap.pressed
  opacity: root.enabled ? 1 : 0.35
  scale: tap.pressed ? 0.96 : 1
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
    invalid: root.alert

    Rectangle {
      anchors.fill: parent
      radius: parent.radius
      visible: root.alert
      color: root.theme.alpha(root.theme.statusCritical, 0.22)
    }
  }

  Column {
    anchors.centerIn: parent
    width: parent.width - root.theme.spacing.sm * 2
    spacing: root.theme.spacing.xs

    DeckText {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      theme: root.theme
      visible: root.glyph !== ""
      text: root.glyph
      font.pixelSize: Math.max(1, Math.round(Math.min(root.width, root.height) * (root.label !== "" ? 0.3 : 0.4)))
      tone: root.alert ? "status" : (root.selected ? "accent" : "normal")
      status: "critical"
    }

    DeckText {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      theme: root.theme
      visible: root.label !== "" && root.height >= root.theme.minTarget
      kind: "caption"
      tone: root.alert ? "status" : "muted"
      status: "critical"
      font.bold: root.alert
      text: root.label
    }
  }

  TapHandler {
    id: tap
    gesturePolicy: TapHandler.ReleaseWithinBounds
    longPressThreshold: root.theme.tapMaxSeconds
    dragThreshold: root.theme.tapSlop
    onTapped: root.clicked()
  }
}
