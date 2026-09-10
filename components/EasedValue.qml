// A number that eases to its target -- but only when the change is worth
// seeing.
//
// Sensor values arrive once a second. Easing every small wobble redraws the
// whole deck at 60 fps for a quarter of every second, and that redraw was the
// largest part of the deck's CPU cost (DECISIONS.md D-28). So a change smaller
// than the theme's easeThreshold just lands; a real jump still eases, as
// DESIGN.md 9 asks. With reduceMotion on, nothing eases.
import QtQuick

QtObject {
  id: root

  required property var theme
  property real target: 0
  property real value: 0

  readonly property NumberAnimation _ease: NumberAnimation {
    target: root
    property: "value"
    duration: root.theme.valueDuration
    easing.type: Easing.OutCubic
  }

  onTargetChanged: {
    if (root.theme.reduceMotion || Math.abs(root.target - root.value) < root.theme.easeThreshold) {
      root._ease.stop()
      root.value = root.target
      return
    }
    root._ease.from = root.value
    root._ease.to = root.target
    root._ease.restart()
  }

  Component.onCompleted: root.value = root.target
}
