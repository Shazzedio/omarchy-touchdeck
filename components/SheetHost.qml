// Sheets that slide over the deck: a list to pick from (the output picker), or
// any content -- a widget's settings, the add sheet, the app picker. One per
// window, handed to widgets as services.overlay, so a sheet can be bigger than
// the widget that opened it and sit above the whole grid.
import QtQuick

Item {
  id: root

  required property var theme
  // So closing a sheet always gives the keyboard back.
  property var editor: null

  property bool open: false
  property string title: ""
  property string mode: "list"   // list | custom
  property var options: []       // list mode: [{ key, label, detail, selected }]
  property var _onPick: null
  property var _owner: null
  property Component content: null
  property var arg: null
  property bool tall: false

  visible: root.open

  function showList(title, options, onPick, owner) {
    root.mode = "list"
    root.content = null
    root.title = title
    root.options = options || []
    root._onPick = onPick
    root._owner = owner || null
    root.tall = false
    root.open = true
  }

  // Refresh a list in place, e.g. when output availability arrives after the
  // sheet opened. Only if the sheet still belongs to whoever is asking.
  function update(owner, options) {
    if (root.open && root.mode === "list" && root._owner === owner) root.options = options || []
  }

  // Custom content. `arg` is available to the content's bindings when it is
  // created, because the component reads it from here.
  function show(title, component, arg, tall) {
    root.content = null
    root.mode = "custom"
    root.title = title
    root.arg = arg
    root.tall = tall === true
    root.content = component
    root.open = true
  }

  function close() {
    root.open = false
    root._onPick = null
    root._owner = null
    root.content = null
    root.arg = null
    if (root.editor) root.editor.clearTextFocus()
  }

  function pick(key) {
    var cb = root._onPick
    root.close()
    if (cb) cb(key)
  }

  Rectangle {
    anchors.fill: parent
    color: root.theme.alpha(root.theme.background, 0.7)
    TapHandler {
      gesturePolicy: TapHandler.ReleaseWithinBounds
      onTapped: root.close()
    }
  }

  DeckSurface {
    id: sheet
    theme: root.theme
    anchors.centerIn: parent
    width: Math.min(parent.width - root.theme.spacing.xxl * 2, root.theme.space(root.tall ? 900 : 620))
    height: root.tall
      ? parent.height - root.theme.spacing.xxl * 2
      : Math.min(parent.height - root.theme.spacing.xxl * 2, header.height + body.implicitHeight + root.theme.spacing.xxl * 3)

    TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds }

    Item {
      id: header
      anchors { left: parent.left; right: parent.right; top: parent.top; margins: root.theme.spacing.xxl }
      height: Math.max(heading.implicitHeight, closeButton.height)

      DeckText {
        id: heading
        anchors { left: parent.left; right: closeButton.left; verticalCenter: parent.verticalCenter }
        theme: root.theme
        kind: "heading"
        tone: "surface"
        text: root.title
      }

      TextButton {
        id: closeButton
        anchors { right: parent.right; verticalCenter: parent.verticalCenter }
        theme: root.theme
        height: root.theme.minTarget
        text: "Done"
        onClicked: root.close()
      }
    }

    Item {
      id: body
      anchors {
        left: parent.left
        right: parent.right
        top: header.bottom
        bottom: parent.bottom
        margins: root.theme.spacing.xxl
      }
      implicitHeight: root.mode === "list" ? list.implicitHeight : (loader.item ? loader.item.implicitHeight : 0)

      Flickable {
        anchors.fill: parent
        visible: root.mode === "list"
        contentHeight: list.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: list
          width: parent.width
          spacing: root.theme.spacing.sm

          Repeater {
            model: root.mode === "list" ? root.options : []

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

      Loader {
        id: loader
        anchors.fill: parent
        active: root.open && root.mode === "custom" && root.content !== null
        sourceComponent: root.content
      }
    }
  }
}
