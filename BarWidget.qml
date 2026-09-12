// The bar button that shows and hides the deck.
//
// It owns no panel of its own: the deck is this plugin's `panel` entry point,
// so the shell keeps its loader and this only asks the shell to summon, hide
// or toggle it (DECISIONS.md D-52). That is also why a right click can open
// straight into edit mode -- it is the same `{"edit": true}` payload the IPC
// route takes.
//
// This file and the two theme adapters are the only ones allowed to import
// qs.* (DESIGN.md D7): a bar widget has to be drawn with the bar's own
// controls so it matches every other widget in the bar.
import QtQuick
import qs.Ui

BarWidget {
  id: root
  moduleName: "io.github.shazzedio.touchdeck"

  // Nerd Font "monitor" (U+F0379), the glyph Omarchy's OSD uses for a display.
  readonly property string glyph: "󰍹"

  readonly property var shell: root.bar ? root.bar.shell : null
  readonly property bool ready: root.shell !== null && typeof root.shell.toggle === "function"

  // Mirrors the deck's own `opened`, so the button lights up while the deck
  // is on screen however it was opened -- the button, a keybind, or IPC.
  readonly property bool opened: root.shell && typeof root.shell.isPluginOpen === "function"
    ? root.shell.isPluginOpen(root.moduleName) === true
    : false

  function open() { if (root.ready) root.shell.summon(root.moduleName, "") }
  function close() { if (root.ready) root.shell.hide(root.moduleName) }
  function toggle() { if (root.ready) root.shell.toggle(root.moduleName, "") }
  function openEdit() { if (root.ready) root.shell.summon(root.moduleName, "{\"edit\": true}") }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.glyph
    active: root.opened
    tooltipText: root.opened ? "Hide Touchdeck" : "Show Touchdeck  ·  right click to edit"

    onPressed: function (mouseButton) {
      if (mouseButton === Qt.RightButton) root.openEdit()
      else root.toggle()
    }
  }
}
