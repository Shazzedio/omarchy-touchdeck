// Touchdeck panel entry point.
//
// Hosted inside omarchy-shell as a keepLoaded `panel` plugin (DESIGN.md D1).
// The shell injects omarchyPath/shell/manifest onto this item if we declare
// them, calls open(payloadJson) on summon and close() on hide, and reads back
// `opened`. `omarchy-shell shell call shannon.touchdeck <method> <arg>` reaches
// any function here. All verified in Phase 0 (DECISIONS.md G-5).
//
// This file runs inside Shannon's desktop shell process. A blocking call here
// freezes the bar, notifications and the lock screen -- not just the deck.
// Nothing below does synchronous file or process I/O.
import QtQuick
import Quickshell
import Quickshell.Wayland
import "components"
import "services"
import "lib/config.mjs" as ConfigLib

Item {
  id: root

  // ------------------------------------------------------------ host contract

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  property bool opened: false
  property bool editing: false

  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (e) { payload = {} }
    root.opened = true
    if (payload.edit === true) root.editing = true
  }

  function close() {
    root.opened = false
    root.editing = false
  }

  function toggleEdit() {
    root.editing = !root.editing
    return root.editing ? "editing" : "idle"
  }

  function reloadConfig() {
    configStore.reload()
    return "ok"
  }

  function status() {
    return JSON.stringify({
      opened: root.opened,
      active: root.active,
      editing: root.editing,
      output: root.matchedNames,
      dormant: root.dormant,
      dormantReason: root.dormantReason,
      locked: root.sessionLocked,
      lockServiceFound: root.lockService !== null,
      config: configStore.summary(),
      unplaced: root.unplacedCount,
    })
  }

  // ------------------------------------------------------------ config

  readonly property ConfigStore configStore: ConfigStore { id: configStore }

  readonly property var appearance: configStore.config.appearance
  readonly property var displayConfig: configStore.config.display

  property int unplacedCount: 0

  Component.onCompleted: {
    // startVisible is only meaningful at load; after that, visibility is
    // whatever summon/hide/toggle last said. A keepLoaded panel is mounted at
    // shell startup, so this is what puts the deck on screen at login with no
    // autostart line (DECISIONS.md G-5).
    root.opened = configStore.config.display.startVisible !== false
  }

  // ------------------------------------------------------------ screens
  //
  // Quickshell's ShellScreen has no `description` -- the user-facing config key
  // keeps that name because it is what the user means, and it matches against
  // `model` (DECISIONS.md D-2).

  function screenMatches(screen) {
    if (!screen) return false
    var match = root.displayConfig.match || {}
    var value = String(match.value || "")
    if (value === "") return false
    if (match.by === "name") return String(screen.name) === value
    var hay = (String(screen.model || "") + " " + String(screen.name || "")).toLowerCase()
    return hay.indexOf(value.toLowerCase()) !== -1
  }

  readonly property var matchedScreens: {
    var out = []
    var all = Quickshell.screens || []
    for (var i = 0; i < all.length; i++) if (root.screenMatches(all[i])) out.push(all[i])
    return out
  }

  readonly property var matchedNames: {
    var out = []
    for (var i = 0; i < root.matchedScreens.length; i++) out.push(String(root.matchedScreens[i].name))
    return out
  }

  // ------------------------------------------------------------ lifecycle
  //
  // Everything pauses when the deck isn't on screen: hidden, display
  // unplugged, or the session locked. In Phase 1 that is only the window; from
  // Phase 2 the helper processes hang off `active` too, which is why it is one
  // property rather than three checks scattered about.

  readonly property var lockService: root.shell && root.shell.firstPartyServiceFor
    ? root.shell.firstPartyServiceFor("omarchy.lock") : null
  readonly property bool sessionLocked: root.lockService ? root.lockService.locked === true : false

  readonly property bool dormant: root.matchedScreens.length === 0
  readonly property string dormantReason: {
    if (!root.dormant) return ""
    var match = root.displayConfig.match || {}
    return "No screen matches " + (match.by || "description") + " \"" + (match.value || "") + "\""
  }

  readonly property bool active: root.opened && !root.dormant && !root.sessionLocked

  // ------------------------------------------------------------ window
  //
  // Variants over the filtered screen list, so unplugging the display destroys
  // the window and replugging recreates it with no hotplug code of our own.

  Variants {
    model: root.matchedScreens

    PanelWindow {
      id: panel
      required property var modelData

      screen: modelData
      visible: root.active
      color: theme.background

      anchors { top: true; bottom: true; left: true; right: true }
      WlrLayershell.namespace: "touchdeck"
      WlrLayershell.layer: {
        var layer = String(root.displayConfig.layer || "top")
        if (layer === "background") return WlrLayer.Background
        if (layer === "bottom") return WlrLayer.Bottom
        if (layer === "overlay") return WlrLayer.Overlay
        return WlrLayer.Top
      }
      // Never steal typing from the main screen. Phase 4 flips this to
      // OnDemand only while the app picker's search field is open.
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      // Respect other surfaces' exclusive zones (so the deck lays out below
      // the Omarchy bar) while reserving none of its own.
      exclusionMode: ExclusionMode.Normal

      DeckTheme {
        id: theme
        windowWidth: panel.width
        windowHeight: panel.height
        columns: root.appearance.columns
        rows: root.appearance.rows
        appearanceScale: root.appearance.scale
        reduceMotion: root.appearance.reduceMotion === true
      }

      Banner {
        id: banner
        theme: theme
        anchors { top: parent.top; left: parent.left; right: parent.right }
        severity: configStore.healthy ? "warn" : "critical"
        text: {
          if (!configStore.healthy)
            return "config.json " + configStore.parseError
          if (grid.unplacedItems.length > 0)
            return grid.unplacedItems.length + " item"
              + (grid.unplacedItems.length === 1 ? "" : "s")
              + " don't fit the grid and are parked"
          return ""
        }
        hint: {
          if (!configStore.healthy) return "Using the last good layout. Fix the file and it reloads."
          if (grid.unplacedItems.length > 0) return "Make room for them in edit mode, or widen the grid."
          return ""
        }
      }

      DeckGrid {
        id: grid
        theme: theme
        anchors {
          top: banner.bottom
          left: parent.left
          right: parent.right
          bottom: parent.bottom
        }
        items: configStore.items(0)
        columns: root.appearance.columns
        rows: root.appearance.rows
        editing: root.editing
        delegateSource: Qt.resolvedUrl("components/PlaceholderTile.qml")

        onUnplacedItemsChanged: root.unplacedCount = unplacedItems.length
      }

      // Shown only when the deck has nothing to draw, so an empty grid reads
      // as a state rather than as a failure.
      DeckText {
        theme: theme
        anchors.centerIn: grid
        visible: grid.placedItems.length === 0 && grid.unplacedItems.length === 0
        kind: "body"
        tone: "muted"
        text: root.editing ? "Tap a cell to add something" : "Hold anywhere to edit"
      }
    }
  }
}
