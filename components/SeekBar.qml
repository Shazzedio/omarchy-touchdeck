// Track progress, and seeking where the player allows it (DESIGN.md 7.6): tap
// to jump, or drag -- the bar follows the finger and the seek happens on
// release, so the player isn't sent a seek for every frame of a drag.
import QtQuick

Item {
  id: root

  required property var theme
  property real fraction: 0
  property bool seekable: false

  signal seek(real fraction)

  implicitHeight: root.theme.minTarget * 0.6

  property real _preview: -1
  property real _start: 0
  readonly property real shown: root._preview >= 0 ? root._preview : Math.max(0, Math.min(1, root.fraction))

  Rectangle {
    id: track
    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
    height: Math.max(3, root.theme.space(6))
    radius: Math.min(root.theme.cornerRadius, height / 2)
    color: root.theme.alpha(root.theme.foreground, 0.12)

    Rectangle {
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      width: parent.width * root.shown
      radius: parent.radius
      color: root.theme.accent
    }
  }

  Rectangle {
    visible: root.seekable
    width: Math.max(8, root.theme.space(16))
    height: width
    radius: width / 2
    color: root.theme.accent
    x: track.width * root.shown - width / 2
    anchors.verticalCenter: track.verticalCenter
  }

  DragHandler {
    enabled: root.seekable
    target: null
    yAxis.enabled: false
    onActiveChanged: {
      if (active) {
        root._start = root.shown
        root._preview = root.shown
      } else if (root._preview >= 0) {
        root.seek(root._preview)
        root._preview = -1
      }
    }
    onTranslationChanged: if (active) root._preview = Math.max(0, Math.min(1, root._start + translation.x / Math.max(1, root.width)))
  }

  TapHandler {
    enabled: root.seekable
    gesturePolicy: TapHandler.ReleaseWithinBounds
    longPressThreshold: root.theme.tapMaxSeconds
    dragThreshold: root.theme.tapSlop
    onTapped: function (point) { root.seek(Math.max(0, Math.min(1, point.position.x / Math.max(1, root.width)))) }
  }
}
