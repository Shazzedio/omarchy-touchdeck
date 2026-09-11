// What a long-press opens (DESIGN.md 6.1): "Edit layout", and the pressed
// item's settings. A long-press never changes anything by itself -- it only
// offers -- so an accidental one costs a tap outside to dismiss.
import QtQuick

Item {
  id: root

  required property var theme
  property var actions: []       // [{ label, run }]
  property bool shown: false

  visible: root.shown

  function showAt(x, y, actions) {
    root.actions = actions
    // Above the finger where there's room, so the hand doesn't cover it.
    card.x = Math.max(root.theme.spacing.lg, Math.min(root.width - card.width - root.theme.spacing.lg, x - card.width / 2))
    var above = y - card.height - root.theme.spacing.xxl
    card.y = above > root.theme.spacing.lg ? above : Math.min(root.height - card.height - root.theme.spacing.lg, y + root.theme.spacing.xxl)
    root.shown = true
    autoHide.restart()
  }

  function dismiss() { root.shown = false }

  Timer { id: autoHide; interval: 6000; onTriggered: root.shown = false }

  // Anywhere else dismisses it -- and only that: the tap doesn't fall through
  // to the key underneath.
  TapHandler {
    gesturePolicy: TapHandler.ReleaseWithinBounds
    onTapped: root.dismiss()
  }

  DeckSurface {
    id: card
    theme: root.theme
    width: root.theme.space(260)
    height: column.implicitHeight + root.theme.spacing.lg * 2

    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds }

    Column {
      id: column
      anchors { fill: parent; margins: root.theme.spacing.lg }
      spacing: root.theme.spacing.sm

      Repeater {
        model: root.actions

        TextButton {
          required property var modelData
          width: column.width
          theme: root.theme
          text: modelData.label
          onClicked: {
            root.dismiss()
            modelData.run()
          }
        }
      }
    }
  }
}
