// The headline of a monitoring widget: a big number, optionally inside an arc
// gauge, with the temperature beneath. Shared by the CPU and GPU widgets so the
// two read as one family.
import QtQuick

Item {
  id: root

  required property var theme
  property bool gauge: false
  property real value: 0
  property bool hasValue: false
  property string valueText: ""
  property var tempC: null
  property string tempStatus: "unknown"
  property string caption: ""

  readonly property int gap: root.theme.spacing.sm
  readonly property real gaugeSize: Math.max(0, Math.min(root.width, root.height - temp.height - root.gap))

  ArcGauge {
    id: arc
    visible: root.gauge
    theme: root.theme
    width: root.gaugeSize
    height: root.gaugeSize
    x: (root.width - width) / 2
    y: 0
    value: root.value
    hasValue: root.hasValue
  }

  DeckText {
    id: number
    theme: root.theme
    kind: "value"
    // Follows the theme's type scale, but never outgrows its space: a text
    // size bump can't push the number out of the gauge.
    font.pixelSize: Math.max(1, Math.round(root.gauge
      ? Math.min(root.theme.font.displayLarge * 1.3, arc.width * 0.26)
      : Math.min(root.theme.font.displayLarge * 1.3, root.width * 0.32, root.height * 0.38)))
    x: (root.width - width) / 2
    y: root.gauge
      ? arc.y + (arc.height - height) / 2
      : (root.height - height - root.gap - temp.height) / 2
    text: root.valueText
  }

  TempReadout {
    id: temp
    theme: root.theme
    x: (root.width - width) / 2
    y: root.gauge ? arc.y + arc.height + root.gap - arc.height * 0.1 : number.y + number.height + root.gap
    celsius: root.tempC
    level: root.tempStatus
    prefix: root.caption
  }
}
