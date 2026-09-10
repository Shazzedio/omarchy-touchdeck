// Owns ~/.config/touchdeck/config.json. All the file *is* lives here; all the
// file *means* lives in lib/config.mjs, which is where the tests are.
//
// The contract (DESIGN.md 12):
//   - first run writes the default layout
//   - valid hand edits apply live
//   - invalid JSON never loses the layout: the deck keeps running on the last
//     good config, shows a banner, and writes nothing until the file is fixed
//   - writes are atomic, and the last known-good copy is kept as config.json.bak
import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/config.mjs" as ConfigLib

QtObject {
  id: root

  readonly property string configDir: {
    var xdg = Quickshell.env("XDG_CONFIG_HOME")
    var base = (xdg && xdg.length > 0) ? xdg : Quickshell.env("HOME") + "/.config"
    return base + "/touchdeck"
  }
  readonly property string configPath: root.configDir + "/config.json"
  readonly property string backupPath: root.configPath + ".bak"

  // The last config that parsed and validated. Never null once loaded, so no
  // consumer has to guard against a broken file.
  property var config: ConfigLib.defaultConfig()

  // Non-fatal repairs the last load had to make (clamped values, dropped items).
  property var repairs: []
  // Set when the file on disk cannot be parsed. The deck shows this verbatim.
  property string parseError: ""
  readonly property bool healthy: root.parseError === ""

  property bool loaded: false

  // ------------------------------------------------------------ reading

  // The text we last wrote. When the watcher reports a change whose content is
  // exactly this, it is our own write coming back rather than a user edit.
  // Comparing content instead of holding a "writing" flag means it no longer
  // matters in which order FileView reports saved / fileChanged / loaded.
  property string _lastWrittenText: ""
  // Set while config.json.bak is being read after a startup load hit broken JSON.
  property bool _restoringBackup: false

  function _applyText(text) {
    if (root.loaded && root.healthy && text === root._lastWrittenText) return

    var result = ConfigLib.parse(text)

    if (!result.ok) {
      // Broken JSON. Keep the last good config and say what to fix. Writes are
      // suspended until the file parses again, so an autosave can't overwrite
      // whatever the user was in the middle of typing.
      root.parseError = result.parseError
      console.warn("touchdeck: config.json " + result.parseError + " -- using the last good layout")
      // Nothing has loaded yet this session -- the shell has just started on a
      // broken file -- so the last good layout is the backup, not the defaults.
      if (!root.loaded) {
        root._restoringBackup = true
        root.backupFile.reload()
      }
      return
    }

    root.parseError = ""

    if (result.isEmpty) {
      // No file yet: first run, so write the default layout. A file that goes
      // missing or empty mid-session is treated as an accident instead: the
      // deck still holds the layout, so it writes that back rather than
      // replacing someone's layout with the defaults.
      if (!root.loaded) {
        root.config = result.config
        root.repairs = []
        root.loaded = true
      } else {
        console.warn("touchdeck: config.json went missing; writing the current layout back")
      }
      root._lastWrittenText = ""
      root.save()
      return
    }

    root.repairs = result.errors
    if (result.errors.length > 0) {
      console.warn("touchdeck: config.json repaired: " + result.errors.join("; "))
    }
    root.config = result.config
    root.loaded = true
    root._writeBackup(text)
  }

  function _applyBackup(text) {
    root._restoringBackup = false
    // config.json was fixed while the backup was being read: that wins.
    if (root.loaded) return
    var result = ConfigLib.parse(text)
    // No usable backup either; the defaults already in memory stand.
    if (!result.ok || result.isEmpty) return
    root.config = result.config
    root.repairs = result.errors
    root.loaded = true
  }

  function reload() {
    root.configFile.reload()
  }

  // ------------------------------------------------------------ writing

  function save() {
    // Refuse to write over a file we could not read. The user's broken edit is
    // more valuable than our in-memory copy, because only they know what they
    // meant by it.
    if (!root.healthy) return false
    var text = ConfigLib.serialize(root.config)
    if (text === root._lastWrittenText) return true
    root._lastWrittenText = text
    root.configFile.setText(text)
    return true
  }

  // Coalesces a burst of edits (a drag emits one per frame) into one write.
  function saveSoon() {
    saveDebounce.restart()
  }

  // Assigning `config` emits configChanged on its own, which is what every
  // consumer binds to; there is no separate notification to fire.
  function setConfig(next) {
    root.config = next
    root.saveSoon()
  }

  function setPageItems(pageIndex, items) {
    root.setConfig(ConfigLib.withPageItems(root.config, pageIndex, items))
  }

  function items(pageIndex) {
    return ConfigLib.pageItems(root.config, pageIndex || 0)
  }

  function _writeBackup(text) {
    if (typeof text !== "string" || text.length === 0) return
    root.backupFile.setText(text)
  }

  readonly property Timer _saveDebounce: Timer {
    id: saveDebounce
    interval: 500
    onTriggered: root.save()
  }

  readonly property FileView configFile: FileView {
    id: configFile
    path: root.configPath
    watchChanges: true
    atomicWrites: true
    printErrors: false

    onLoaded: root._applyText(text())
    // A missing file is the first-run path, not an error.
    onLoadFailed: root._applyText("")
    // text() is stale inside the change signal itself, so re-read and let
    // onLoaded see fresh content.
    onFileChanged: reload()
    onSaveFailed: {
      root._lastWrittenText = ""
      console.warn("touchdeck: could not write " + root.configPath)
    }
  }

  readonly property FileView backupFile: FileView {
    path: root.backupPath
    watchChanges: false
    atomicWrites: true
    printErrors: false

    onLoaded: if (root._restoringBackup) root._applyBackup(text())
    onLoadFailed: root._restoringBackup = false
  }

  function summary() {
    return {
      path: root.configPath,
      loaded: root.loaded,
      healthy: root.healthy,
      parseError: root.parseError,
      repairs: root.repairs,
      itemCount: root.items(0).length,
    }
  }
}
