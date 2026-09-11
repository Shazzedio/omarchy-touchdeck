// Everything the deck needs from Hyprland: which monitor is focused, the last
// one that wasn't the deck's, and moving focus (DESIGN.md 5.6, 11). All
// dispatching goes through bin/touchdeck-launch, which moves focus without
// warping the pointer (DECISIONS.md G-12).
import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io

QtObject {
  id: root

  // Hyprland's own animations switch, which the deck follows: with Hyprland's
  // animations off, the deck's are too (DECISIONS.md D-49). Read at start and
  // whenever Hyprland reloads its config -- a runtime `hyprctl eval` sends no
  // event, so that case waits for the next reload.
  property bool animationsEnabled: true
  property string _animText: ""

  function queryAnimations() {
    if (root._animQuery.running) return
    root._animText = ""
    root._animQuery.running = true
  }

  readonly property Process _animQuery: Process {
    command: ["hyprctl", "-j", "getoption", "animations:enabled"]
    stdout: SplitParser {
      onRead: function (line) { root._animText += line }
    }
    onRunningChanged: {
      if (running) return
      try {
        var option = JSON.parse(root._animText)
        if (typeof option.bool === "boolean") root.animationsEnabled = option.bool
        else if (typeof option.int === "number") root.animationsEnabled = option.int !== 0
      } catch (e) {
        // Not answered (an older Hyprland, or none): leave animations as they are.
      }
    }
  }

  readonly property Connections _events: Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (event.name === "configreloaded") root.queryAnimations()
    }
  }

  Component.onCompleted: root.queryAnimations()

  property var deckOutputs: []
  property bool active: false
  // Give focus back after a touch. Off when the deck sits on the bottom or
  // background layer: then someone wants windows on that screen.
  property bool restoreFocus: true
  // While someone is typing into the deck, focus is theirs to keep.
  property bool typing: false
  property string launcherPath: ""

  readonly property string focusedMonitor: Hyprland.focusedMonitor ? String(Hyprland.focusedMonitor.name) : ""
  property string lastMonitor: ""

  function isDeck(name) {
    return root.deckOutputs.indexOf(String(name)) !== -1
  }

  // Before anything has been focused this session: any monitor that isn't the deck's.
  function fallbackMonitor() {
    var list = Hyprland.monitors ? Hyprland.monitors.values : []
    for (var i = 0; i < list.length; i++) {
      var name = String(list[i].name)
      if (!root.isDeck(name)) return name
    }
    return ""
  }

  // Where "the main screen" is: the monitor Shannon was last working on.
  readonly property string mainMonitor: root.lastMonitor !== "" ? root.lastMonitor : root.fallbackMonitor()

  // A touch on the deck moves Hyprland's focus to its output (DECISIONS.md
  // G-7), where new windows and keystrokes would land underneath the deck.
  // Hand focus back ~250 ms after the last touch -- but only after a *touch*:
  // a mouse user who moved onto the deck put focus there on purpose. The deck
  // tells us about touches (a passive handler over its whole window, Deck.qml)
  // rather than this guessing from the pointer, which a tap can move onto the
  // deck too (DECISIONS.md D-43).
  property real lastTouchAt: 0
  readonly property int touchWindowMs: 1500

  function touched() {
    root.lastTouchAt = Date.now()
    if (root.isDeck(root.focusedMonitor)) root._scheduleRestore()
  }

  function _scheduleRestore() {
    if (root.active && root.restoreFocus && !root.typing && root.mainMonitor !== "") restoreTimer.restart()
  }

  onFocusedMonitorChanged: {
    if (root.focusedMonitor === "") return
    if (!root.isDeck(root.focusedMonitor)) {
      root.lastMonitor = root.focusedMonitor
      restoreTimer.stop()
      return
    }
    // The focus change and the touch arrive in either order; this covers
    // focus arriving second.
    if (Date.now() - root.lastTouchAt < root.touchWindowMs) root._scheduleRestore()
  }

  readonly property Timer restoreTimer: Timer {
    id: restoreTimer
    interval: 250
    onTriggered: root.run(["--restore-focus", root.mainMonitor, "--deck", root.focusedMonitor])
  }

  // Runs bin/touchdeck-launch detached, through a login shell exactly as
  // Omarchy's Util.execArgv does, so launched apps get the same environment
  // they would from Omarchy's own launcher.
  function run(args) {
    if (root.launcherPath === "") return
    Quickshell.execDetached(["bash", "-lc", "exec \"$@\"", "bash", "bash", root.launcherPath].concat(args))
  }

  function summary() {
    return { focused: root.focusedMonitor, lastMonitor: root.lastMonitor, mainMonitor: root.mainMonitor,
      restoreFocus: root.restoreFocus, restorePending: restoreTimer.running,
      animationsEnabled: root.animationsEnabled,
      lastTouchMsAgo: root.lastTouchAt > 0 ? Date.now() - root.lastTouchAt : -1 }
  }
}
