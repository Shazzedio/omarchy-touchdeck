// Touchdeck panel entry point.
//
// Hosted inside omarchy-shell as a keepLoaded `panel` plugin (DESIGN.md D1).
// The shell injects omarchyPath/shell/manifest onto this item if we declare
// them, calls open(payloadJson) on summon and close() on hide, and reads back
// `opened`. `omarchy-shell shell call io.github.shazzedio.touchdeck <method> <arg>` reaches
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
import "editor"
import "lib/widgets.mjs" as Widgets
import "lib/settings.mjs" as SettingsLib

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

  // Scripting and test hook: drive the deck's services exactly as its widgets
  // do. It skips the touch layer -- that still needs a finger -- but it lets
  // the service side be verified from a script, and makes the deck scriptable
  // from keybinds (DECISIONS.md D-34). For example:
  //   omarchy-shell shell call io.github.shazzedio.touchdeck intent '{"do":"volume","value":0.6}'
  //   omarchy-shell shell call io.github.shazzedio.touchdeck intent '{"do":"move","id":"cpu","col":4,"row":0}'
  signal sheetRequested(string title, var options)
  // Sheets, the bubble: things only a window can show.
  signal uiRequested(var request)

  function mediaPlayer(name) {
    var want = String(name || "").toLowerCase()
    if (want !== "") {
      for (var i = 0; i < media.players.length; i++) {
        var q = media.players[i]
        if (String(q.identity).toLowerCase().indexOf(want) !== -1 || String(q.desktopEntry).toLowerCase() === want) return q
      }
    }
    return media.playerFor(media.choose("", ""))
  }

  function intent(json) {
    var r
    try { r = JSON.parse(json || "{}") || {} } catch (e) { return "error: not JSON" }
    var p = null
    if (["play-pause", "next", "previous", "seek"].indexOf(r.do) !== -1) {
      p = root.mediaPlayer(r.player)
      if (!p) return "error: no player"
    }
    switch (r.do) {
    case "volume": audio.setVolume(Number(r.value), Number(r.max) > 0 ? Number(r.max) : 1); return "ok"
    case "mute": audio.toggleMute(); return "ok"
    case "mic": audio.toggleMic(); return "ok"
    case "outputs": audio.refreshOutputs(); return JSON.stringify(audio.outputs)
    case "output": return audio.selectOutput(String(r.name || "")) ? "ok" : "error: no such output"
    case "sheet":
      audio.refreshOutputs()
      var options = []
      for (var i = 0; i < audio.outputs.length; i++)
        options.push({ key: audio.outputs[i].name, label: audio.outputs[i].label, detail: "", selected: audio.outputs[i].isDefault })
      root.sheetRequested("Output", options)
      return "ok"
    case "play-pause": media.togglePlaying(p); return "ok: " + p.identity
    case "next": media.next(p); return "ok: " + p.identity
    case "previous": media.previous(p); return "ok: " + p.identity
    case "seek": media.seekTo(p, Number(r.seconds)); return "ok: " + p.identity
    case "launch": return launcher.launch(String(r.id || "intent"), r.settings || {}) ? "ok" : "error: nothing to launch"
    // What the touch overlay reports, for simulating a touch from a script.
    case "touched": hypr.touched(); return "ok"
    // Edit mode: the same intents the edit overlay and sheets call.
    case "edit":
      root.editing = r.on === undefined ? !root.editing : r.on === true
      return root.editing ? "editing" : "idle"
    case "items": return JSON.stringify(editor.items)
    case "move": return editor.move(String(r.id), Number(r.col), Number(r.row)) ? "ok" : "rejected"
    case "resize": return editor.resize(String(r.id), Number(r.w), Number(r.h)) ? "ok" : "rejected"
    case "remove": return editor.remove(String(r.id)) ? "ok" : "error: no such item"
    case "undo": return editor.undo() ? "ok" : "error: nothing to undo"
    case "add":
      if (Widgets.types().indexOf(String(r.type)) === -1) return "error: unknown type"
      var at = r.col !== undefined && r.row !== undefined ? { col: Number(r.col), row: Number(r.row) } : null
      var added = editor.add(String(r.type), r.settings || {}, at)
      return added ? added.id : "error: no room"
    case "place": return editor.placeParked(String(r.id)) ? "ok" : "error: no room"
    case "set": return editor.updateSettings(String(r.id), r.settings || {}) ? "ok" : "error: no such item"
    case "settings":
    case "add-sheet":
    case "close-sheet":
    case "longpress":
      root.uiRequested(r)
      return "ok"
    }
    return "error: unknown intent"
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
      sensors: sensors.summary(),
      audio: audio.summary(),
      media: media.summary(),
      apps: apps.summary(),
      launch: launcher.summary(),
      hypr: hypr.summary(),
      editor: editor.summary(),
      motion: { reduced: root.reduceMotion, config: root.appearance.reduceMotion === true, hyprlandAnimations: hypr.animationsEnabled },
      unplaced: root.unplacedCount,
      render: { frames: root.renderFrames, busyMs: root.renderMs, at: Date.now() },
    })
  }

  // ------------------------------------------------------------ config

  readonly property ConfigStore configStore: ConfigStore { id: configStore }

  // ------------------------------------------------------------ services
  //
  // One instance of each, shared by every widget on every window. Widgets are
  // views: they bind to these and call their intents (DESIGN.md 4).

  function localPath(url) {
    return decodeURIComponent(String(url).replace(/^file:\/\//, ""))
  }

  function layoutHas(types) {
    var items = configStore.items(0)
    for (var i = 0; i < items.length; i++) if (types.indexOf(items[i].type) !== -1) return true
    return false
  }

  // Each service only runs while something on screen needs it.
  readonly property bool needsSensors: root.layoutHas(["cpu", "gpu", "memory"])
  readonly property bool needsAudio: root.layoutHas(["volume"])
  readonly property bool needsMedia: root.layoutHas(["media"])

  readonly property SensorsService sensors: SensorsService {
    id: sensors
    collectorPath: root.localPath(Qt.resolvedUrl("bin/touchdeck-collect"))
    intervalMs: configStore.config.sensors.intervalMs
    active: root.active && root.needsSensors
  }

  readonly property HyprService hypr: HyprService {
    id: hypr
    deckOutputs: root.matchedNames
    active: root.active
    restoreFocus: {
      var layer = String(root.displayConfig.layer || "top")
      return (layer === "top" || layer === "overlay") && configStore.config.launch.restoreFocus !== false
    }
    typing: editor.textInput
    launcherPath: root.localPath(Qt.resolvedUrl("bin/touchdeck-launch"))
  }

  readonly property LaunchService launcher: LaunchService {
    id: launcher
    hypr: hypr
  }

  readonly property AppsService apps: AppsService {
    id: apps
    shell: root.shell
    configStore: configStore
    defaultsPath: root.localPath(Qt.resolvedUrl("bin/touchdeck-defaults"))
  }

  readonly property AudioService audio: AudioService {
    id: audio
    active: root.active && root.needsAudio
  }

  readonly property MediaService media: MediaService {
    id: media
    active: root.active && root.needsMedia
    artPath: root.localPath(Qt.resolvedUrl("bin/touchdeck-art"))
  }

  readonly property EditorService editor: EditorService {
    id: editor
    configStore: configStore
    columns: root.appearance.columns
    rows: root.appearance.rows
  }

  readonly property var services: ({
    sensors: sensors, audio: audio, media: media, apps: apps, launch: launcher, hypr: hypr, editor: editor,
  })

  readonly property var appearance: configStore.config.appearance
  readonly property var displayConfig: configStore.config.display

  // Still, when asked to be or when Hyprland's own animations are off (D-49).
  readonly property bool reduceMotion: root.appearance.reduceMotion === true || !hypr.animationsEnabled

  // Problems the last load of config.json worked around, for the banner. An
  // unknown widget type isn't one: it keeps its place and says so on its tile.
  readonly property var configRepairs: {
    var out = []
    var list = configStore.repairs || []
    for (var i = 0; i < list.length; i++) if (String(list[i]).indexOf("unknown type") === -1) out.push(String(list[i]))
    return out
  }

  property int unplacedCount: 0

  // ------------------------------------------------------------ edit mode
  //
  // Ends on its own after a minute without a touch (DESIGN.md 6.1) -- but not
  // while a sheet is open, which would pull it out from under someone reading it.
  property bool sheetOpen: false

  function noteActivity() {
    if (root.editing) editTimeout.restart()
  }

  Timer {
    id: editTimeout
    interval: 60000
    running: root.editing && !root.sheetOpen
    onTriggered: root.editing = false
  }

  Connections {
    target: editor
    function onActivity() { root.noteActivity() }
  }

  // Render accounting for DESIGN.md 15: how many frames the deck's window has
  // drawn and the milliseconds spent drawing them, measured on the window
  // itself so the rest of the shell's work doesn't blur the number. Sample
  // `status` twice to get a rate.
  property int renderFrames: 0
  property real renderMs: 0

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
      // Never steal typing from the main screen -- except while a text field
      // on the deck is active, and then all of it, the way Omarchy's own search
      // overlays take it (DESIGN.md 5.2, DECISIONS.md D-44).
      WlrLayershell.keyboardFocus: editor.textInput ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
      // Respect other surfaces' exclusive zones (so the deck lays out below
      // the Omarchy bar) while reserving none of its own.
      exclusionMode: ExclusionMode.Normal

      // For the sheet Components below. Inside an inline Component, `theme:
      // theme` finds the new object's own `theme` property before this
      // window's `theme` id, and binds it to itself (DECISIONS.md D-45).
      readonly property var deckTheme: theme

      // The shared services plus this window's sheets.
      readonly property var deckServices: Object.assign({
        overlay: sheetHost,
        openSettings: function (id) { panel.openSettings(id) },
      }, root.services)

      function settingsTitle(item) {
        return item.type === "app" ? "Key settings" : Widgets.specFor(item.type).displayName + " settings"
      }

      function openSettings(id) {
        var item = editor.item(id)
        if (item) sheetHost.show(panel.settingsTitle(item), settingsSheet, id, false)
      }

      function openAdd(col, row, tab) {
        sheetHost.show("Add to the deck", addSheet, { col: col, row: row, tab: tab || "" }, true)
      }

      // A long-press, at a point in the window (DESIGN.md 6.1). It only
      // offers; it never changes anything by itself.
      function longPress(x, y) {
        if (root.editing || sheetHost.open || bubble.shown) return
        var p = grid.mapFromItem(touchLayer, x, y)
        var item = grid.itemAtPoint(p.x, p.y)
        var actions = [{ label: "Edit layout", run: function () { root.editing = true } }]
        if (item && SettingsLib.fields(item.type).length > 0)
          actions.push({ label: panel.settingsTitle(item), run: function () { panel.openSettings(item.id) } })
        bubble.showAt(x, y, actions)
      }

      Item {
        id: renderProbe
        property real syncAt: 0
        Connections {
          target: renderProbe.Window.window
          function onBeforeSynchronizing() { renderProbe.syncAt = Date.now() }
          // Date.now() is millisecond-grained, but the rounding is unbiased
          // over many frames, so the running total is a fair estimate.
          function onFrameSwapped() {
            root.renderFrames++
            if (renderProbe.syncAt > 0) root.renderMs += Date.now() - renderProbe.syncAt
            renderProbe.syncAt = 0
          }
        }
      }

      DeckTheme {
        id: theme
        windowWidth: panel.width
        windowHeight: panel.height
        columns: root.appearance.columns
        rows: root.appearance.rows
        appearanceScale: root.appearance.scale
        reduceMotion: root.reduceMotion
      }

      Banner {
        id: banner
        theme: theme
        anchors { top: parent.top; left: parent.left; right: parent.right }
        severity: configStore.healthy ? "warn" : "critical"
        text: {
          if (!configStore.healthy)
            return "config.json " + configStore.parseError
          // In edit mode the edit bar lists them instead.
          if (grid.unplacedItems.length > 0 && !root.editing)
            return grid.unplacedItems.length + " item"
              + (grid.unplacedItems.length === 1 ? "" : "s")
              + " don't fit the grid and are parked"
          if (root.configRepairs.length > 0)
            return "config.json: " + root.configRepairs[0]
              + (root.configRepairs.length > 1 ? " (and " + (root.configRepairs.length - 1) + " more)" : "")
          return ""
        }
        hint: {
          if (!configStore.healthy) return "Using the last good layout. Fix the file and it reloads."
          if (grid.unplacedItems.length > 0 && !root.editing) return "Make room for them in edit mode, or widen the grid."
          if (root.configRepairs.length > 0) return "The deck worked around it. Fix the file, or make any edit to save a corrected copy."
          return ""
        }
      }

      // Edit mode's bar: what you can do, the parked tray, and Done. A strip
      // of its own rather than floating over the grid, so no cell is ever
      // hidden behind it.
      Item {
        id: editBar
        anchors { top: banner.bottom; left: parent.left; right: parent.right }
        visible: root.editing
        height: visible ? theme.minTarget + theme.spacing.gridMargin * 2 : 0

        DeckText {
          anchors {
            left: parent.left
            right: parked.left
            verticalCenter: parent.verticalCenter
            leftMargin: theme.spacing.gridMargin
            rightMargin: theme.spacing.xl
          }
          theme: theme
          kind: "body"
          tone: "muted"
          text: grid.unplacedItems.length > 0
            ? "Parked, tap to place:"
            : "Drag to move · corner to resize · tap for settings · + to add"
        }

        Row {
          id: parked
          anchors { right: done.left; verticalCenter: parent.verticalCenter; rightMargin: theme.spacing.xl }
          spacing: theme.spacing.md

          Repeater {
            model: grid.unplacedItems

            TextButton {
              required property var modelData
              theme: theme
              text: editor.label(modelData)
              onClicked: editor.placeParked(modelData.id)
            }
          }
        }

        TextButton {
          id: done
          anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: theme.spacing.gridMargin }
          theme: theme
          selected: true
          text: "Done"
          onClicked: root.editing = false
        }
      }

      DeckGrid {
        id: grid
        theme: theme
        anchors {
          top: editBar.bottom
          left: parent.left
          right: parent.right
          bottom: parent.bottom
        }
        items: configStore.items(0)
        columns: root.appearance.columns
        rows: root.appearance.rows
        editing: root.editing
        services: panel.deckServices
        widgetBase: String(Qt.resolvedUrl("Deck.qml")).replace(/Deck\.qml$/, "")

        onUnplacedItemsChanged: root.unplacedCount = unplacedItems.length
        onCellTapped: function (col, row) { panel.openAdd(col, row) }
        onSettingsRequested: function (id) { panel.openSettings(id) }
      }

      // Shown only when the deck has nothing to draw, so an empty grid reads
      // as a state rather than as a failure.
      DeckText {
        theme: theme
        anchors.centerIn: grid
        visible: grid.placedItems.length === 0 && grid.unplacedItems.length === 0 && !root.editing
        kind: "body"
        tone: "muted"
        text: "Hold anywhere to edit"
      }

      Component {
        id: settingsSheet
        SettingsSheet {
          theme: panel.deckTheme
          services: panel.deckServices
          itemId: String(sheetHost.arg || "")
          host: sheetHost
        }
      }

      Component {
        id: addSheet
        AddSheet {
          theme: panel.deckTheme
          services: panel.deckServices
          at: sheetHost.arg
          host: sheetHost
        }
      }

      SheetHost {
        id: sheetHost
        anchors.fill: parent
        theme: theme
        // Not `editor: editor`: that id lives in the outer context, so the
        // name would find SheetHost's own property first (D-45).
        editor: root.editor
        onOpenChanged: root.sheetOpen = open
      }

      Toast {
        id: toast
        theme: theme
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: theme.spacing.xxl }
      }

      Bubble {
        id: bubble
        anchors.fill: parent
        theme: theme
      }

      // Notices every touch on the deck without taking it. On top of
      // everything so it sees a touch first, but a PointHandler only ever
      // takes a passive grab, so the tap, drag or fader underneath still gets
      // it exactly as before.
      Item {
        id: touchLayer
        anchors.fill: parent
        z: 1000

        // A long-press is 700 ms without moving further than a tap may
        // (DESIGN.md 10). A press that then moves was a drag -- a fader held
        // still for a moment -- so moving also takes back a bubble it opened.
        Timer {
          id: hold
          interval: 700
          property point at
          // This press opened the bubble.
          property bool fired: false
          onTriggered: {
            hold.fired = true
            panel.longPress(hold.at.x, hold.at.y)
          }
        }

        function moved(point) {
          return Math.hypot(point.position.x - point.pressPosition.x, point.position.y - point.pressPosition.y) > theme.tapSlop
        }

        PointHandler {
          id: touchPoint
          acceptedDevices: PointerDevice.TouchScreen
          onActiveChanged: {
            if (active) {
              hypr.touched()
              root.noteActivity()
              hold.at = touchPoint.point.pressPosition
              hold.fired = false
              hold.restart()
            } else {
              hold.stop()
            }
          }
          onPointChanged: {
            if (!active || !touchLayer.moved(touchPoint.point)) return
            if (hold.running) hold.stop()
            else if (hold.fired && bubble.shown) bubble.dismiss()
          }
        }

        PointHandler {
          acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
          onActiveChanged: if (active) root.noteActivity()
        }

        // Right-click is the mouse's long-press (DESIGN.md 10).
        TapHandler {
          acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) { panel.longPress(eventPoint.position.x, eventPoint.position.y) }
        }
      }

      Connections {
        target: root
        function onSheetRequested(title, options) {
          sheetHost.showList(title, options, function (key) { audio.selectOutput(key) }, root)
        }
        function onUiRequested(r) {
          if (r.do === "settings") panel.openSettings(String(r.id))
          else if (r.do === "add-sheet") panel.openAdd(Number(r.col) || 0, Number(r.row) || 0, String(r.tab || ""))
          else if (r.do === "longpress") panel.longPress(Number(r.x), Number(r.y))
          else if (r.do === "close-sheet") {
            sheetHost.close()
            bubble.dismiss()
          }
        }
      }

      Connections {
        target: editor
        function onToastRequested(text, actionLabel, action) { toast.show(text, actionLabel, action) }
      }

      Connections {
        target: root
        function onEditingChanged() {
          bubble.dismiss()
          if (root.editing) editTimeout.restart()
        }
      }
    }
  }
}
