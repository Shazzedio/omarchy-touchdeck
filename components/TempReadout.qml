// A temperature, coloured by status and shape-coded so it reads without colour
// too: nothing when ok, an open triangle at warn, a filled one at critical.
// Four installed themes can't tell critical from normal by hue, and colour
// alone never works for everyone anyway (DECISIONS.md D-14, D-20).
import QtQuick
import "../lib/format.mjs" as Format

DeckText {
  id: root

  property var celsius: null
  // Named `level` because DeckText already has a `status` (the name of the
  // status colour to use); this feeds it.
  property string level: "unknown"   // ok | warn | critical | unknown
  property string prefix: ""

  kind: "body"
  tone: root.level === "warn" || root.level === "critical" ? "status" : "normal"
  status: root.level
  font.bold: root.level === "critical"
  font.features: ({ "tnum": 1 })
  text: (root.level === "critical" ? "▲ " : root.level === "warn" ? "△ " : "")
    + root.prefix + Format.celsius(root.celsius)
}
