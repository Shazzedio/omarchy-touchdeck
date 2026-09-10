// The shell every monitoring widget sits in: a quiet title, the widget's body,
// and the three non-happy states DESIGN.md 7 requires --
//   loading      the first reading hasn't arrived yet
//   unavailable  a one-line reason, e.g. "No GPU data: nvidia-smi not found"
//   stale        the source missed three intervals: values dim, age shows
//
// Borderless on the deck background by design (DESIGN.md 9): gauges read as
// instruments, keys and the media widget get the surfaces.
import QtQuick

Item {
  id: root

  required property var theme
  property string title: ""
  property string subtitle: ""
  property bool loading: false
  property string unavailable: ""
  property bool stale: false
  property real ageMs: -1

  default property alias content: body.data

  readonly property int pad: root.theme.spacing.tilePadding
  readonly property bool ready: !root.loading && root.unavailable === ""

  DeckText {
    id: titleText
    theme: root.theme
    anchors { left: parent.left; top: parent.top; leftMargin: root.pad; topMargin: root.pad }
    kind: "label"
    tone: "muted"
    text: root.title
  }

  DeckText {
    theme: root.theme
    anchors {
      left: titleText.right
      right: ageText.left
      baseline: titleText.baseline
      leftMargin: root.theme.spacing.md
      rightMargin: root.theme.spacing.md
    }
    kind: "caption"
    tone: "muted"
    text: root.subtitle
  }

  DeckText {
    id: ageText
    theme: root.theme
    anchors { right: parent.right; baseline: titleText.baseline; rightMargin: root.pad }
    kind: "caption"
    tone: "muted"
    visible: root.stale && root.ready
    // Computed only while stale: otherwise this (hidden) label would change
    // every second and ask the window to redraw for nothing.
    text: root.stale && root.ready ? "△ " + root.formatAge(root.ageMs) : ""
  }

  function formatAge(ms) {
    if (!(ms >= 0)) return ""
    var s = Math.floor(ms / 1000)
    return s < 60 ? s + " s ago" : Math.floor(s / 60) + " min ago"
  }

  Item {
    id: body
    anchors {
      left: parent.left
      right: parent.right
      top: titleText.bottom
      bottom: parent.bottom
      margins: root.pad
      topMargin: root.theme.spacing.md
    }
    visible: root.ready
    opacity: root.stale ? 0.45 : 1
    Behavior on opacity {
      enabled: !root.theme.reduceMotion
      NumberAnimation { duration: root.theme.valueDuration }
    }
  }

  DeckText {
    anchors.centerIn: body
    width: body.width
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.Wrap
    maximumLineCount: 3
    theme: root.theme
    kind: "label"
    tone: "muted"
    visible: !root.ready
    text: root.unavailable !== "" ? root.unavailable : "Waiting for data"
  }
}
