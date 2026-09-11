// Lays items out on the deck's grid and mounts a widget in each. Geometry and
// collision live in lib/grid.mjs (pure, fuzz-tested); which component draws
// which type lives in lib/widgets.mjs. This file only turns those into
// positioned, loaded delegates.
//
// The grid is fitted to the window's actual logical size, never to the display
// mode -- on this hardware those differ (1536x838 logical for a 1920x1080
// panel at scale 1.25, less the bar). See DECISIONS.md G-3.
import QtQuick
import "../lib/grid.mjs" as GridLib
import "../lib/widgets.mjs" as Widgets
import "../lib/edit.mjs" as EditLib
import "../editor"

Item {
  id: root

  required property var theme
  property var items: []
  property int columns: 16
  property int rows: 9
  property bool editing: false
  // Handed to every widget: { sensors, ... }. Widgets bind to services;
  // they never spawn processes or read files themselves (DESIGN.md 4).
  property var services: ({})
  // Base URL that lib/widgets.mjs sources are relative to: the plugin root.
  property string widgetBase: ""

  readonly property int gap: root.theme.spacing.gridGap
  readonly property int margin: root.theme.spacing.gridMargin

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

  // Edit mode (DESIGN.md 6.1).
  signal cellTapped(int col, int row)
  signal settingsRequested(string id)
  readonly property bool dragging: overlay.item ? overlay.item.dragging : false

  // The placed item under a point in this item's coordinates, or null (a gap,
  // the margin, or an empty cell).
  function itemAtPoint(px, py) {
    var cell = GridLib.cellAt(root.geometry, px, py)
    var it = EditLib.itemAt(root.items, cell.col, cell.row, root.columns, root.rows)
    if (!it) return null
    var r = root.rectFor(it)
    return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height ? it : null
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

      TapHandler {
        gesturePolicy: TapHandler.ReleaseWithinBounds
        longPressThreshold: root.theme.tapMaxSeconds
        dragThreshold: root.theme.tapSlop
        onTapped: root.cellTapped(emptyCell.col, emptyCell.row)
      }
    }
  }

  Repeater {
    model: root.placedItems

    Loader {
      id: tile
      required property var modelData
      readonly property var rect: root.rectFor(modelData)
      property bool failed: false

      x: rect.x
      y: rect.y
      width: rect.width
      height: rect.height
      // In edit mode widgets are shown but not live: a drag moves the tile,
      // it doesn't turn the volume up (DESIGN.md 6.1).
      enabled: !root.editing

      // A widget that fails to load becomes an error tile: the grid and every
      // other widget keep working (DESIGN.md 15).
      onStatusChanged: {
        if (status !== Loader.Error || tile.failed) return
        tile.failed = true
        console.warn("touchdeck: widget " + modelData.id + " (" + modelData.type + ") failed to load")
        setSource(root.widgetBase + Widgets.ERROR_SOURCE, {
          theme: root.theme,
          entry: modelData,
          services: root.services,
          message: "The " + Widgets.specFor(modelData.type).displayName + " widget couldn't load",
        })
      }

      onLoaded: {
        // theme, entry and services are set at construction (setSource) so a
        // widget's first binding pass already has them. These two change over
        // its life, so they are bound.
        item.editing = Qt.binding(function () { return root.editing })
        item.cellSize = Qt.binding(function () { return root.cellSize })
      }

      function mount() {
        if (root.widgetBase === "") return
        tile.failed = false
        setSource(root.widgetBase + Widgets.specFor(modelData.type).source, {
          theme: root.theme,
          entry: modelData,
          services: root.services,
        })
      }

      Component.onCompleted: mount()

      Connections {
        target: root
        function onWidgetBaseChanged() { tile.mount() }
      }
    }
  }

  Loader {
    id: overlay
    anchors.fill: parent
    active: root.editing
    sourceComponent: EditOverlay {
      theme: root.theme
      grid: root
      editor: root.services ? root.services.editor : null
      onSettingsRequested: function (id) { root.settingsRequested(id) }
    }
  }
}
