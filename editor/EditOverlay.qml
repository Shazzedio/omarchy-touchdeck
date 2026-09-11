// Edit mode's handles over every placed item (DESIGN.md 6.1):
//   drag the tile     move it
//   drag the corner   resize it, within the widget's limits
//   ×                 remove it (undoable for five seconds)
//   tap               open its settings
// While dragging, a ghost shows where it will land: the accent when it fits,
// the theme's urgent colour when it won't -- and letting go then snaps back.
// Nothing reflows (DESIGN.md 6): predictable beats clever.
import QtQuick
import "../components"
import "../lib/edit.mjs" as EditLib

Item {
  id: root

  required property var theme
  required property var grid
  property var editor: null

  signal settingsRequested(string id)

  readonly property real stepX: root.grid.geometry.cellW + root.grid.gap
  readonly property real stepY: root.grid.geometry.cellH + root.grid.gap
  property int _busy: 0
  readonly property bool dragging: root._busy > 0

  Repeater {
    model: root.grid.placedItems

    Item {
      id: tile
      required property var modelData
      readonly property var home: root.grid.rectFor(tile.modelData)
      readonly property bool busy: move.active || grow.active
      readonly property var target: move.active
        ? EditLib.moveTarget(tile.modelData,
            EditLib.cells(move.activeTranslation.x, root.stepX), EditLib.cells(move.activeTranslation.y, root.stepY),
            root.grid.columns, root.grid.rows)
        : (grow.active
          ? EditLib.resizeTarget(tile.modelData,
              EditLib.cells(grow.activeTranslation.x, root.stepX), EditLib.cells(grow.activeTranslation.y, root.stepY),
              root.grid.columns, root.grid.rows)
          : null)
      readonly property bool fits: tile.target !== null
        && EditLib.fits(root.grid.items, tile.target, root.grid.columns, root.grid.rows, tile.modelData.id)
      readonly property var ghost: tile.target !== null ? root.grid.rectFor(tile.target) : null

      // The last target seen while dragging: by the time the drag's "active"
      // drops, `target` has already gone back to null.
      property var pending: null
      property bool pendingFits: false
      function remember() {
        if (tile.target === null) return
        tile.pending = tile.target
        tile.pendingFits = tile.fits
      }
      onTargetChanged: tile.remember()
      onFitsChanged: tile.remember()
      onBusyChanged: root._busy += tile.busy ? 1 : -1
      Component.onDestruction: if (tile.busy) root._busy -= 1

      function commit(kind) {
        var t = tile.pending
        var ok = tile.pendingFits
        tile.pending = null
        if (!t || !ok || !root.editor) return
        var m = tile.modelData
        if (kind === "move" && (t.col !== m.col || t.row !== m.row)) root.editor.move(m.id, t.col, t.row)
        if (kind === "grow" && (t.w !== m.w || t.h !== m.h)) root.editor.resize(m.id, t.w, t.h)
      }

      x: tile.home.x + (move.active ? move.activeTranslation.x : 0)
      y: tile.home.y + (move.active ? move.activeTranslation.y : 0)
      width: tile.home.width
      height: tile.home.height
      z: tile.busy ? 10 : 1

      // Where it will land.
      Rectangle {
        visible: tile.ghost !== null
        z: -1
        x: tile.ghost ? tile.ghost.x - tile.x : 0
        y: tile.ghost ? tile.ghost.y - tile.y : 0
        width: tile.ghost ? tile.ghost.width : 0
        height: tile.ghost ? tile.ghost.height : 0
        radius: root.theme.cornerRadius
        color: root.theme.alpha(tile.fits ? root.theme.accent : root.theme.urgent, 0.18)
        border.width: Math.max(1, root.theme.space(2))
        border.color: tile.fits ? root.theme.accent : root.theme.urgent
      }

      // The item's outline while editing; lifted while it moves.
      Rectangle {
        anchors.fill: parent
        radius: root.theme.cornerRadius
        color: root.theme.alpha(root.theme.background, tile.busy ? 0.55 : 0.2)
        border.width: Math.max(1, root.theme.space(2))
        border.color: root.theme.alpha(root.theme.accent, tile.busy ? 1 : 0.6)
      }

      DragHandler {
        id: move
        target: null
        dragThreshold: root.theme.tapSlop
        onActiveChanged: if (!active) tile.commit("move")
      }

      TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        longPressThreshold: root.theme.tapMaxSeconds
        dragThreshold: root.theme.tapSlop
        onTapped: root.settingsRequested(tile.modelData.id)
      }

      readonly property real handle: Math.min(root.theme.minTarget, tile.home.height * 0.45, tile.home.width * 0.45)

      TextButton {
        anchors { top: parent.top; right: parent.right }
        width: tile.handle
        height: tile.handle
        theme: root.theme
        kind: "heading"
        danger: true
        text: "×"
        visible: !tile.busy
        onClicked: if (root.editor) root.editor.remove(tile.modelData.id)
      }

      // Resize grip.
      Item {
        anchors { right: parent.right; bottom: parent.bottom }
        width: tile.handle
        height: tile.handle
        visible: !move.active

        DeckText {
          anchors { right: parent.right; bottom: parent.bottom; margins: root.theme.spacing.sm }
          theme: root.theme
          tone: "accent"
          font.pixelSize: Math.round(tile.handle * 0.5)
          text: "◢"
        }

        DragHandler {
          id: grow
          target: null
          dragThreshold: root.theme.tapSlop / 2
          onActiveChanged: if (!active) tile.commit("grow")
        }
      }
    }
  }
}
