// A value on an arc: an instrument-cluster gauge (DESIGN.md 9). Also a full
// ring when sweep is 360. The fill is the accent unless the caller says
// otherwise -- accent is reserved for live values.
import QtQuick
import QtQuick.Shapes

Item {
  id: root

  required property var theme
  property real value: 0          // 0..100
  property bool hasValue: true
  property real thickness: Math.max(3, Math.round(Math.min(width, height) * 0.075))
  property color fillColor: root.theme.accent
  property color trackColor: root.theme.alpha(root.theme.foreground, 0.12)
  // PathAngleArc angles: 0 is 3 o'clock, positive is clockwise. The default is
  // a 270-degree gauge open at the bottom.
  property real startAngle: 135
  property real sweep: 270

  EasedValue {
    id: eased
    theme: root.theme
    target: root.hasValue ? Math.max(0, Math.min(100, root.value)) : 0
  }
  readonly property real displayed: eased.value

  readonly property real radius: Math.max(0, Math.min(width, height) / 2 - root.thickness / 2)

  Shape {
    anchors.fill: parent
    // Qt 6.11's curve renderer draws smooth arcs on the GPU directly. The
    // alternative, a multisampled layer, costs an offscreen texture per widget
    // against DESIGN.md 15's memory budget.
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.trackColor
      strokeWidth: root.thickness
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      PathAngleArc {
        centerX: root.width / 2
        centerY: root.height / 2
        radiusX: root.radius
        radiusY: root.radius
        startAngle: root.startAngle
        sweepAngle: root.sweep
      }
    }

    ShapePath {
      // A round cap on a zero-length arc still draws a dot; hide it instead.
      strokeColor: root.displayed > 0.5 ? root.fillColor : "transparent"
      strokeWidth: root.thickness
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      PathAngleArc {
        centerX: root.width / 2
        centerY: root.height / 2
        radiusX: root.radius
        radiusY: root.radius
        startAngle: root.startAngle
        sweepAngle: root.sweep * root.displayed / 100
      }
    }
  }
}
