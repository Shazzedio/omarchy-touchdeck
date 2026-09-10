// Recent history as a line, newest at the right. Gaps in the data (null) are
// gaps in the line, not interpolated over.
import QtQuick
import QtQuick.Shapes

Item {
  id: root

  required property var theme
  property var values: []         // 0..100 or null, oldest first
  property int capacity: 120
  property color lineColor: root.theme.accent

  readonly property real stroke: Math.max(1.5, root.theme.space(2))

  // One polyline per unbroken run of readings. A single point draws nothing,
  // so runs shorter than two are dropped.
  readonly property var segments: {
    var out = []
    var list = root.values || []
    var n = list.length
    if (n < 2 || root.width <= 0 || root.height <= 0) return out
    var step = root.width / Math.max(1, root.capacity - 1)
    var top = root.stroke / 2
    var span = root.height - root.stroke
    var run = []
    for (var i = 0; i < n; i++) {
      var v = list[i]
      if (v === null || v === undefined || !isFinite(v)) {
        if (run.length > 1) out.push(run)
        run = []
        continue
      }
      var x = root.width - (n - 1 - i) * step
      var y = top + span * (1 - Math.max(0, Math.min(100, v)) / 100)
      run.push(Qt.point(x, y))
    }
    if (run.length > 1) out.push(run)
    return out
  }

  Shape {
    anchors.fill: parent
    // Qt 6.11's curve renderer draws smooth lines on the GPU directly. The
    // alternative, a multisampled layer, costs an offscreen texture per widget
    // against DESIGN.md 15's memory budget.
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.lineColor
      strokeWidth: root.stroke
      fillColor: "transparent"
      joinStyle: ShapePath.RoundJoin
      capStyle: ShapePath.RoundCap
      PathMultiline { paths: root.segments }
    }
  }
}
