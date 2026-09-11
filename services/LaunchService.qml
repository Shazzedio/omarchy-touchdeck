// Launching an app key (DESIGN.md 7.1, 11): focus the target monitor, then
// launch through the same path as Omarchy's own launcher. Also tracks the
// brief "opening" state each key shows until the app's window appears.
import QtQuick
import Quickshell
import Quickshell.Wayland
import "../lib/apps.mjs" as AppsLib

QtObject {
  id: root

  required property var hypr

  // item id -> { at, toplevels } while that key's app is starting.
  property var launching: ({})
  readonly property int feedbackMs: 5000

  function isLaunching(itemId) {
    return root.launching[itemId] !== undefined
  }

  function toplevelCount() {
    try { return ToplevelManager.toplevels.values.length } catch (e) { return 0 }
  }

  function launch(itemId, settings) {
    var args = AppsLib.launchArgs(settings, {
      lastMonitor: root.hypr.mainMonitor,
      deckMonitor: root.hypr.deckOutputs.length > 0 ? root.hypr.deckOutputs[0] : "",
    })
    if (!args) return false
    root.hypr.run(args)
    var next = {}
    for (var k in root.launching) next[k] = root.launching[k]
    next[itemId] = { at: Date.now(), toplevels: root.toplevelCount() }
    root.launching = next
    return true
  }

  function _finish(test) {
    var next = {}
    var changed = false
    for (var k in root.launching) {
      if (test(root.launching[k])) changed = true
      else next[k] = root.launching[k]
    }
    if (changed) root.launching = next
  }

  // A new window means the app is up. A single-instance app that just raises
  // an existing window adds none, so there is also a time limit.
  readonly property Connections _windows: Connections {
    target: ToplevelManager.toplevels
    function onValuesChanged() {
      var count = root.toplevelCount()
      root._finish(function (entry) { return count > entry.toplevels })
    }
  }

  readonly property Timer _expiry: Timer {
    interval: 500
    repeat: true
    running: Object.keys(root.launching).length > 0
    onTriggered: {
      var now = Date.now()
      root._finish(function (entry) { return now - entry.at > root.feedbackMs })
    }
  }

  function summary() {
    return { launching: Object.keys(root.launching) }
  }
}
