// Edit mode's intents (DESIGN.md 6.1): move, resize, remove with undo, add,
// place a parked item, change settings. The rules live in lib/edit.mjs; this
// hands each result to ConfigStore, which saves it (debounced, atomic).
import QtQuick
import "../lib/edit.mjs" as EditLib
import "../lib/widgets.mjs" as Widgets

QtObject {
  id: root

  required property var configStore
  property int columns: 16
  property int rows: 9

  signal toastRequested(string text, string actionLabel, var action)
  // Anything that should keep edit mode from timing out.
  signal activity()

  readonly property var items: root.configStore.items(0)

  function item(id) {
    for (var i = 0; i < root.items.length; i++) if (root.items[i].id === id) return root.items[i]
    return null
  }

  function label(it) {
    if (!it) return ""
    if (it.type === "app" && it.settings && it.settings.label) return it.settings.label
    return Widgets.specFor(it.type).displayName
  }

  function _commit(next) {
    root.activity()
    if (!next) return false
    root.configStore.setPageItems(0, next)
    return true
  }

  function move(id, col, row) {
    return root._commit(EditLib.move(root.items, id, col, row, root.columns, root.rows))
  }

  function resize(id, w, h) {
    return root._commit(EditLib.resize(root.items, id, w, h, root.columns, root.rows))
  }

  // Removing is one tap, so it is undoable for five seconds (DESIGN.md 6.1).
  property var _removed: null
  readonly property Timer _undoWindow: Timer {
    interval: 5000
    onTriggered: root._removed = null
  }

  function remove(id) {
    var r = EditLib.remove(root.items, id)
    if (!r) return false
    root._commit(r.items)
    root._removed = r.removed
    root._undoWindow.restart()
    root.toastRequested("Removed " + root.label(r.removed.item), "Undo", function () { root.undo() })
    return true
  }

  function undo() {
    var removed = root._removed
    if (!removed) return false
    root._removed = null
    root._undoWindow.stop()
    if (root._commit(EditLib.undoRemove(root.items, removed, root.columns, root.rows))) return true
    root.toastRequested("No room to put it back", "", null)
    return false
  }

  // Returns the new item, or null if the page is full.
  function add(type, settings, at) {
    var a = EditLib.add(root.items, type, settings, at, root.columns, root.rows)
    if (!a) {
      root.activity()
      root.toastRequested("No room for that. Make space first.", "", null)
      return null
    }
    root._commit(a.items)
    return a.item
  }

  function placeParked(id) {
    if (root._commit(EditLib.placeParked(root.items, id, root.columns, root.rows))) return true
    root.toastRequested("No room for it yet. Make space first.", "", null)
    return false
  }

  function updateSettings(id, patch) {
    return root._commit(EditLib.updateSettings(root.items, id, patch))
  }

  function parked() {
    return EditLib.parked(root.items, root.columns, root.rows)
  }

  // ------------------------------------------------------------ typing
  //
  // The deck takes the keyboard only while a text field is active
  // (DESIGN.md 5.2), exclusively, as Omarchy's own search overlays do. One
  // owner at a time; a field that goes away gives it back.
  property var textOwner: null
  readonly property bool textInput: root.textOwner !== null

  function setTextFocus(owner, focused) {
    if (focused) root.textOwner = owner
    else if (root.textOwner === owner) root.textOwner = null
  }

  function clearTextFocus() { root.textOwner = null }

  function summary() {
    return { typing: root.textInput, parked: root.parked().length, canUndo: root._removed !== null }
  }
}
