// Everything the deck needs from Hyprland: which monitor is focused, the last
// one that wasn't the deck's, and moving focus (DESIGN.md 5.6, 11). All
// dispatching goes through bin/touchdeck-launch, which moves focus without
// warping the pointer (DECISIONS.md G-12).
import QtQuick
import Quickshell
import Quickshell.Hyprland

QtObject {
  id: root

  property var deckOutputs: []
  property bool active: false
  // Give focus back after a touch. Off when the deck sits on the bottom or
  // background layer: then someone wants windows on that screen.
  property bool restoreFocus: true
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

  onFocusedMonitorChanged: {
    if (root.focusedMonitor === "") return
    if (!root.isDeck(root.focusedMonitor)) {
      root.lastMonitor = root.focusedMonitor
      restoreTimer.stop()
      return
    }
    // A touch on the deck moves Hyprland's focus to its output (DECISIONS.md
    // G-7), where new windows and keystrokes would land under the deck. Hand
    // it back shortly after. The launcher does nothing if the pointer is on
    // the deck -- a mouse user put focus there on purpose.
    if (root.active && root.restoreFocus && root.mainMonitor !== "") restoreTimer.restart()
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
      restoreFocus: root.restoreFocus, restorePending: restoreTimer.running }
  }
}
