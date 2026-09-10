// Text, themed. Exists so no other file has to repeat the family/colour/size
// triple, and so nothing outside the two adapter files reaches for qs.Commons
// just to draw a label.
import QtQuick

Text {
  id: root

  required property var theme

  // "body" | "caption" | "label" | "value" | "heading"
  // `value` is for readouts: large, tabular figures that don't jitter as
  // digits change (DESIGN.md 9).
  property string kind: "body"
  property string tone: "normal"   // normal | muted | accent | surface | status
  property string status: ""       // used when tone is "status"

  font.family: theme.font.family
  font.pixelSize: {
    if (root.kind === "caption") return theme.font.caption
    if (root.kind === "label") return theme.font.bodySmall
    if (root.kind === "heading") return theme.font.heading
    if (root.kind === "value") return theme.font.display
    return theme.font.body
  }
  font.bold: root.kind === "value" || root.kind === "heading"
  // Tabular figures keep a readout from shifting as it counts.
  font.features: root.kind === "value" ? ({ "tnum": 1 }) : ({})

  color: {
    if (root.tone === "muted") return theme.muted
    if (root.tone === "accent") return theme.accent
    if (root.tone === "surface") return theme.surfaceText
    if (root.tone === "status") return theme.statusColor(root.status)
    return theme.foreground
  }

  textFormat: Text.PlainText
  renderType: Text.NativeRendering
  elide: Text.ElideRight
}
