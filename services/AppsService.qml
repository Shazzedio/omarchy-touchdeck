// Installed apps, for app keys (DESIGN.md 7.1, 11). Desktop entries come from
// Quickshell's DesktopEntries -- the same index Omarchy's launcher uses, so
// web apps and TUI launchers appear with no extra work. Icons go through
// omarchy-shell's own icon index when it is available: it finds icons
// installed after the shell started, which Qt's themed lookup misses.
import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/apps.mjs" as AppsLib

QtObject {
  id: root

  property var shell: null
  property var configStore: null
  property string defaultsPath: ""

  // Entries load asynchronously, roughly half a second after the shell starts
  // (DECISIONS.md G-13). Until then keys say nothing rather than "Not installed".
  readonly property int count: DesktopEntries.applications.values.length
  readonly property bool loaded: root.count > 0
  // Bumped when the set of entries changes, so bindings that look entries up
  // re-evaluate (an app installed or removed while the deck is up).
  property int revision: 0

  function lookup(id) {
    root.revision
    var entry = DesktopEntries.byId(AppsLib.normalizeDesktopId(id))
    return entry ? { name: String(entry.name || ""), icon: String(entry.icon || ""), startupClass: String(entry.startupClass || "") } : null
  }

  function describe(settings) {
    root.revision
    return AppsLib.describeKey(settings, root.lookup, root.loaded)
  }

  function iconSource(icon) {
    var name = String(icon || "")
    var library = root.shell ? root.shell.appLibrary : null
    if (library && typeof library.iconSource === "function") return library.iconSource(name)
    if (name === "") return Quickshell.iconPath("application-x-executable", true)
    if (name.charAt(0) === "/") return "file://" + encodeURI(name)
    var themed = Quickshell.iconPath(name, true)
    return themed !== "" ? themed : Quickshell.iconPath("application-x-executable", true)
  }

  readonly property Connections _entries: Connections {
    target: DesktopEntries.applications
    function onValuesChanged() {
      root.revision++
      root._resolveDefaults()
    }
  }

  // ------------------------------------------------------------ first-run keys
  //
  // The default layout's three app keys carry a one-shot `defaultRole`
  // (DECISIONS.md D-16). Once entries are loaded, ask the session for its
  // default browser, file manager and terminal, fill in the keys, and write
  // the result back so it happens once.

  property bool _resolving: false
  property string _defaultsText: ""

  function _resolveDefaults() {
    if (!root.loaded || !root.configStore || root._resolving || root.defaultsPath === "") return
    if (!AppsLib.needsDefaultRoles(root.configStore.items(0))) return
    root._resolving = true
    root._defaultsText = ""
    root._defaults.running = true
  }

  function _applyDefaults() {
    var defaults = AppsLib.parseDefaults(root._defaultsText)
    var result = AppsLib.applyDefaultRoles(root.configStore.items(0), defaults, function (id) {
      return DesktopEntries.byId(id) !== null
    })
    if (result.changed) {
      console.log("touchdeck: first-run keys: browser=" + defaults.browser + " files=" + defaults.files
        + " terminal=" + defaults.terminal)
      root.configStore.setPageItems(0, result.items)
    }
    root._resolving = false
  }

  readonly property Process _defaults: Process {
    command: ["bash", root.defaultsPath]
    stdout: SplitParser {
      onRead: function (line) { root._defaultsText += line + "\n" }
    }
    onRunningChanged: if (!running && root._resolving) root._applyDefaults()
  }

  readonly property Connections _config: Connections {
    target: root.configStore
    function onConfigChanged() { root._resolveDefaults() }
  }

  Component.onCompleted: root._resolveDefaults()

  function summary() {
    return { loaded: root.loaded, count: root.count }
  }
}
