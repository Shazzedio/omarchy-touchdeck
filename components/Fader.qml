// A mixing-desk fader (DESIGN.md 7.5, 9). Vertical or horizontal.
//   drag   relative: the level moves by how far the finger travels, wherever
//          it started, so grabbing the fader never makes it jump
//   tap    on the track jumps to that level
//   wheel  steps, with touchpad remainders carried between events
// It only reports intent (moved, stepped); the caller owns the value.
import QtQuick
import "../lib/audio.mjs" as AudioLib

Item {
  id: root

  required property var theme
  property real fraction: 0        // 0..1
  property bool vertical: true
  property bool dim: false         // muted: the level still shows, greyed

  signal moved(real fraction)
  signal stepped(int steps)

  readonly property real length: root.vertical ? root.height : root.width
  readonly property real breadth: root.vertical ? root.width : root.height
  readonly property int slot: Math.max(6, root.theme.space(10))
  readonly property real capAlong: Math.max(root.theme.space(28), 20)
  readonly property real capAcross: Math.min(root.breadth, Math.max(root.theme.primaryTarget * 0.8, root.breadth * 0.7))
  readonly property real travel: Math.max(1, root.length - root.capAlong)
  readonly property real shown: Math.max(0, Math.min(1, root.fraction))
  // Distance of the cap's leading edge from the "zero" end.
  readonly property real capOffset: root.travel * root.shown

  property real _start: 0
  property real _wheel: 0

  function clamp(f) { return Math.max(0, Math.min(1, f)) }

  // The slot the cap runs in.
  Rectangle {
    id: slotRect
    radius: Math.min(root.theme.cornerRadius, root.slot / 2)
    color: root.theme.alpha(root.theme.foreground, 0.12)
    x: root.vertical ? (root.width - root.slot) / 2 : root.capAlong / 2
    y: root.vertical ? root.capAlong / 2 : (root.height - root.slot) / 2
    width: root.vertical ? root.slot : root.travel
    height: root.vertical ? root.travel : root.slot
  }

  // The level, from zero up to the cap.
  Rectangle {
    radius: slotRect.radius
    color: root.dim ? root.theme.muted : root.theme.accent
    x: slotRect.x
    y: root.vertical ? slotRect.y + root.travel - root.capOffset : slotRect.y
    width: root.vertical ? root.slot : root.capOffset
    height: root.vertical ? root.capOffset : root.slot
  }

  // The cap.
  Rectangle {
    id: cap
    radius: Math.min(root.theme.cornerRadius, root.capAlong / 3)
    color: root.theme.surface
    border.width: Math.max(1, root.theme.space(2))
    border.color: drag.active ? root.theme.accent : root.theme.alpha(root.theme.foreground, 0.5)
    width: root.vertical ? root.capAcross : root.capAlong
    height: root.vertical ? root.capAlong : root.capAcross
    x: root.vertical ? (root.width - width) / 2 : root.capOffset
    y: root.vertical ? root.travel - root.capOffset : (root.height - height) / 2

    // A grip line across the cap, as on a real fader.
    Rectangle {
      anchors.centerIn: parent
      width: root.vertical ? parent.width * 0.6 : Math.max(1, root.theme.space(2))
      height: root.vertical ? Math.max(1, root.theme.space(2)) : parent.height * 0.6
      color: root.dim ? root.theme.muted : root.theme.accent
    }
  }

  DragHandler {
    id: drag
    target: null
    xAxis.enabled: !root.vertical
    yAxis.enabled: root.vertical
    onActiveChanged: if (active) root._start = root.shown
    onTranslationChanged: {
      if (!active) return
      var delta = root.vertical ? -translation.y : translation.x
      root.moved(root.clamp(root._start + delta / root.travel))
    }
  }

  TapHandler {
    gesturePolicy: TapHandler.ReleaseWithinBounds
    longPressThreshold: root.theme.tapMaxSeconds
    dragThreshold: root.theme.tapSlop
    onTapped: function (point) {
      var along = root.vertical ? root.travel - (point.position.y - root.capAlong / 2)
                                : point.position.x - root.capAlong / 2
      root.moved(root.clamp(along / root.travel))
    }
  }

  WheelHandler {
    onWheel: function (event) {
      var r = AudioLib.wheelSteps(root._wheel, event.angleDelta.y !== 0 ? event.angleDelta.y : event.angleDelta.x)
      root._wheel = r.accumulator
      if (r.steps !== 0) root.stepped(r.steps)
    }
  }
}
