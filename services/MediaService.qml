// MPRIS players for the media widget (DESIGN.md 7.6, D5), through Quickshell's
// MPRIS service. Which player to show is decided in lib/media.mjs, which
// mirrors Omarchy's own media service so the deck and the bar agree.
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Mpris
import "../lib/media.mjs" as MediaLib

QtObject {
  id: root

  property bool active: false

  readonly property var players: Mpris.players ? Mpris.players.values : []

  // Plain snapshots for lib/media.mjs. Reading each player's properties here
  // makes this re-evaluate when any of them changes -- but not on position,
  // which isn't read.
  readonly property var snapshots: {
    var out = []
    for (var i = 0; i < root.players.length; i++) out.push(root.snapshot(root.players[i]))
    return out
  }

  function snapshot(p) {
    return {
      key: MediaLib.playerKey({ dbusName: p.dbusName, desktopEntry: p.desktopEntry, identity: p.identity }),
      identity: String(p.identity || ""),
      desktopEntry: String(p.desktopEntry || ""),
      dbusName: String(p.dbusName || ""),
      isPlaying: !!p.isPlaying,
      hasTrack: !!(p.trackTitle || p.trackArtist || p.trackAlbum || p.trackArtUrl),
    }
  }

  property var activity: ({ serial: 0, startedAt: {}, lastActiveAt: {} })
  onSnapshotsChanged: root.activity = MediaLib.trackActivity(root.activity, root.snapshots, Date.now())

  readonly property bool anyPlaying: {
    for (var i = 0; i < root.snapshots.length; i++) if (root.snapshots[i].isPlaying) return true
    return false
  }

  function choose(preferred, pinnedKey) {
    return MediaLib.choosePlayer(root.snapshots, { preferred: preferred, pinnedKey: pinnedKey, activity: root.activity })
  }

  function nextKey(currentKey) {
    return MediaLib.nextPlayer(root.snapshots, currentKey)
  }

  function playerFor(key) {
    for (var i = 0; i < root.players.length; i++) {
      if (root.snapshots[i] && root.snapshots[i].key === key) return root.players[i]
    }
    return null
  }

  // MPRIS doesn't push position (DESIGN.md 7.6). Quickshell computes it fresh
  // on every read, but bindings only re-read when told, so tell them once a
  // second -- only while something plays and the deck shows a media widget.
  readonly property Timer _positionTick: Timer {
    interval: 1000
    repeat: true
    running: root.active && root.anyPlaying
    onTriggered: {
      for (var i = 0; i < root.players.length; i++) if (root.players[i].isPlaying) root.players[i].positionChanged()
    }
  }

  // ------------------------------------------------------------ album art
  //
  // Remote covers are fetched by bin/touchdeck-art, never by an Image in this
  // process: an https Image does TLS in omarchy-shell's image loader thread,
  // and that once crashed the whole shell (DECISIONS.md D-46). Local covers
  // (file://) load as they are.

  property string artPath: ""
  readonly property string artDir: {
    var runtime = String(Quickshell.env("XDG_RUNTIME_DIR") || "")
    return runtime !== "" ? runtime + "/touchdeck/art" : ""
  }

  property var _art: ({})     // remote URL -> local file URL, or "" if it couldn't be had
  property var _artQueue: []
  property string _artFetching: ""
  property string _artResult: ""

  // What an Image may load for a player's trackArtUrl: the cached copy, or
  // "" until it arrives (the widget shows its glyph meanwhile).
  function artSource(url) {
    var u = String(url || "")
    if (u === "") return ""
    if (!/^https?:\/\//i.test(u)) return u
    var known = root._art[u]
    if (known !== undefined) return known
    Qt.callLater(root._requestArt, u)
    return ""
  }

  function _requestArt(u) {
    if (root._art[u] !== undefined || u === root._artFetching || root._artQueue.indexOf(u) !== -1) return
    if (root.artPath === "" || root.artDir === "") return
    root._artQueue = root._artQueue.concat([u])
    root._nextArt()
  }

  function _nextArt() {
    if (root._artFetcher.running || root._artQueue.length === 0) return
    root._artFetching = root._artQueue[0]
    root._artQueue = root._artQueue.slice(1)
    root._artResult = ""
    root._artFetcher.command = ["bash", root.artPath, root._artFetching, root.artDir]
    root._artFetcher.running = true
  }

  readonly property Process _artFetcher: Process {
    stdout: SplitParser {
      onRead: function (line) { if (line !== "") root._artResult = line }
    }
    onRunningChanged: {
      if (running) return
      // A session's worth of tracks is small, but don't let it grow forever.
      var next = Object.keys(root._art).length > 200 ? {} : Object.assign({}, root._art)
      next[root._artFetching] = root._artResult !== "" ? "file://" + root._artResult : ""
      root._art = next
      root._artFetching = ""
      root._nextArt()
    }
  }

  // ------------------------------------------------------------ intents

  function togglePlaying(p) {
    if (!p) return
    if (p.canTogglePlaying) p.togglePlaying()
    else if (p.isPlaying && p.canPause) p.pause()
    else if (!p.isPlaying && p.canPlay) p.play()
  }

  function next(p) { if (p && p.canGoNext) p.next() }
  function previous(p) { if (p && p.canGoPrevious) p.previous() }

  // Assigning position seeks (checked with mpv, DECISIONS.md G-15).
  function seekTo(p, seconds) {
    if (!p || !p.canSeek) return
    p.position = Math.max(0, Number(seconds) || 0)
  }

  function summary() {
    var list = []
    for (var i = 0; i < root.snapshots.length; i++) list.push(root.snapshots[i].identity + (root.snapshots[i].isPlaying ? " (playing)" : ""))
    var chosen = root.playerFor(root.choose("", ""))
    return {
      active: root.active, players: list,
      chosen: chosen ? { identity: String(chosen.identity), title: String(chosen.trackTitle || ""),
        playing: !!chosen.isPlaying, position: Math.round(chosen.position * 10) / 10,
        length: chosen.length, canSeek: !!chosen.canSeek } : null,
    }
  }
}
