// A sheet that slides over the deck: a list to pick one thing from (the
// output device picker now; Phase 4's settings and add sheets later). One per
// window, handed to widgets as services.overlay, so a widget's sheet can be
// bigger than the widget and sit above the whole grid.
import QtQuick

Item {
  id: root

  required property var theme

  property bool open: false
  property string title: ""
  property var options: []       // [{ key, label, detail, selected }]
  property var _onPick: null
  property var _owner: null

  visible: root.open

  function showList(title, options, onPick, owner) {
    root.title = title
    root.options = options || []
    root._onPick = onPick
    root._owner = owner || null
    root.open = true
  }

  // Refresh the list in place, e.g. when output availability arrives after the
  // sheet opened. Only if the sheet still belongs to whoever is asking.
  function update(owner, options) {
    if (root.open && root._owner === owner) root.options = options || []
  }

  function close() {
    root.open = false
    root._onPick = null
    root._owner = null
  }

  function pick(key) {
    var cb = root._onPick
    root.close()
    if (cb) cb(key)
  }

  // Scrim: tapping outside the sheet dismisses it.
  Rectangle {
    anchors.fill: parent
    color: root.theme.alpha(root.theme.background, 0.7)
    TapHandler { onTapped: root.close() }
  }

  DeckSurface {
    id: sheet
    theme: root.theme
    anchors.centerIn: parent
    width: Math.min(parent.width - root.theme.spacing.xxl * 2, root.theme.space(560))
    height: Math.min(parent.height - root.theme.spacing.xxl * 2, list.implicitHeight + heading.height + root.theme.spacing.xxl * 3)

    // Swallow taps on the sheet itself so they don't reach the scrim.
    TapHandler {}

    DeckText {
      id: heading
      theme: root.theme
      anchors { left: parent.left; right: parent.right; top: parent.top; margins: root.theme.spacing.xxl }
      kind: "heading"
      tone: "surface"
      text: root.title
    }

    Flickable {
      anchors {
        left: parent.left
        right: parent.right
        top: heading.bottom
        bottom: parent.bottom
        margins: root.theme.spacing.xxl
      }
      contentHeight: list.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      Column {
        id: list
        width: parent.width
        spacing: root.theme.spacing.sm

        Repeater {
          model: root.options

          Item {
            id: row
            required property var modelData
            width: list.width
            height: root.theme.minTarget
            scale: rowTap.pressed ? 0.98 : 1

            DeckSurface {
              anchors.fill: parent
              theme: root.theme
              role: "control"
              pressed: rowTap.pressed
              selected: row.modelData.selected === true
            }

            DeckText {
              theme: root.theme
              anchors { left: parent.left; right: mark.left; verticalCenter: parent.verticalCenter; leftMargin: root.theme.spacing.xl }
              kind: "body"
              text: row.modelData.label + (row.modelData.detail ? "   " + row.modelData.detail : "")
            }

            DeckText {
              id: mark
              theme: root.theme
              anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: root.theme.spacing.xl }
              tone: "accent"
              text: row.modelData.selected === true ? "●" : ""
            }

            TapHandler {
              id: rowTap
              gesturePolicy: TapHandler.ReleaseWithinBounds
              longPressThreshold: root.theme.tapMaxSeconds
              dragThreshold: root.theme.tapSlop
              onTapped: root.pick(row.modelData.key)
            }
          }
        }
      }
    }
  }
}
