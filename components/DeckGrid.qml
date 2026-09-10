// Lays items out on the deck's grid. Geometry and collision live in
// lib/grid.mjs (pure, fuzz-tested); this file only turns the result into
// positioned delegates.
//
// The grid is fitted to the window's actual logical size, never to the display
// mode -- on this hardware those differ (1536x838 logical for a 1920x1080
// panel at scale 1.25, less the bar). See DECISIONS.md G-3.
import QtQuick
import "../lib/grid.mjs" as GridLib

Item {
  id: root

  required property var theme
  property var items: []
  property int columns: 16
  property int rows: 9
  property bool editing: false

  // URL of the component used to draw each item. A URL rather than a Component
  // because Loader.setSource can hand over `theme` and `entry` *before* the
  // instance's bindings first evaluate; with sourceComponent the only hook is
  // onLoaded, which runs a frame too late and every tile spends its first frame
  // dereferencing a null theme. Phase 1 passes a placeholder; the widget
  // registry takes over from Phase 2.
  property url delegateSource

  readonly property int gap: theme.spacing.gridGap
  readonly property int margin: theme.spacing.gridMargin

  readonly property var geometry: GridLib.geometry(
    root.width, root.height, root.columns, root.rows, root.margin, root.gap)

  readonly property real cellSize: Math.min(root.geometry.cellW, root.geometry.cellH)

  // Items that no longer fit (the grid shrank, or a hand edit put two on top of
  // each other) are parked rather than deleted, and reported so the deck can
  // say so instead of silently losing them.
  readonly property var _fitted: GridLib.partitionByFit(root.items, root.columns, root.rows)
  readonly property var placedItems: root._fitted.placed
  readonly property var unplacedItems: root._fitted.unplaced

  function rectFor(item) {
    return GridLib.cellRect(root.geometry, item.col, item.row, item.w, item.h)
  }

  // Empty cells show a "+" only in edit mode, so the deck stays quiet at rest.
  Repeater {
    model: root.editing ? root.columns * root.rows : 0

    Item {
      id: emptyCell
      required property int index
      readonly property int col: index % root.columns
      readonly property int row: Math.floor(index / root.columns)
      readonly property bool free: GridLib.canPlace(
        root.placedItems, { col: col, row: row, w: 1, h: 1 }, root.columns, root.rows, null)

      visible: free
      x: root.geometry.originX + col * (root.geometry.cellW + root.gap)
      y: root.geometry.originY + row * (root.geometry.cellH + root.gap)
      width: root.geometry.cellW
      height: root.geometry.cellH

      Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: 1
        border.color: root.theme.alpha(root.theme.foreground, 0.18)
        radius: root.theme.cornerRadius

        Text {
          anchors.centerIn: parent
          text: "+"
          font.family: root.theme.font.family
          font.pixelSize: root.theme.font.title
          color: root.theme.alpha(root.theme.foreground, 0.35)
        }
      }
    }
  }

  Repeater {
    model: root.placedItems

    Loader {
      id: tile
      required property var modelData
      readonly property var rect: root.rectFor(modelData)

      x: rect.x
      y: rect.y
      width: rect.width
      height: rect.height

      // A widget that fails to load shows as a gap rather than taking the grid
      // and every other widget down with it (DESIGN.md 15).
      onStatusChanged: {
        if (status === Loader.Error)
          console.warn("touchdeck: item " + modelData.id + " failed to load: "
            + (sourceComponent ? sourceComponent.errorString() : ""))
      }

      onLoaded: {
        // `theme` and `entry` were set at construction; these two change over
        // the tile's life, so they are bound rather than assigned.
        item.editing = Qt.binding(function () { return root.editing })
        item.cellSize = Qt.binding(function () { return root.cellSize })
      }

      function mount() {
        if (String(root.delegateSource) === "") return
        setSource(root.delegateSource, { theme: root.theme, entry: modelData })
      }

      Component.onCompleted: mount()

      Connections {
        target: root
        function onDelegateSourceChanged() { tile.mount() }
      }
    }
  }
}
