// MPRIS players -> which one the media widget shows, plus time formatting.
// Pure. MediaService.qml turns live MprisPlayer objects into the plain
// snapshots these functions take: { key, identity, desktopEntry, dbusName,
// isPlaying, hasTrack }.
//
// The ordering mirrors Omarchy's own media service
// (shell/plugins/services/media/Service.qml) so the deck and the bar agree:
// playing players first, among them the one that started earliest, a
// preferred player only while it plays, playerctld proxies last. On top of
// that (DESIGN.md 7.6): a player picked by tapping the chip stays picked, and
// with nothing playing the most recently active player is shown.
// ES2015 only: this also runs in Qt's QML engine.

function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key) }

export function isProxy(p) {
  const dbus = String((p && p.dbusName) || "").toLowerCase()
  const entry = String((p && p.desktopEntry) || "").toLowerCase()
  return dbus.indexOf("playerctld") !== -1 || entry === "playerctld"
}

export function hasMetadata(p) {
  return !!(p && (p.hasTrack || p.identity || p.desktopEntry))
}

export function playerKey(p) {
  return String((p && (p.dbusName || p.desktopEntry || p.identity)) || "")
}

// "Spotify" matches identity "Spotify", desktopEntry "spotify" and
// "org.mpris.MediaPlayer2.spotify".
export function matchesPreferred(p, preferred) {
  const want = String(preferred || "").trim().toLowerCase()
  if (!want || !p) return false
  const identity = String(p.identity || "").toLowerCase()
  const entry = String(p.desktopEntry || "").toLowerCase()
  const dbus = String(p.dbusName || "").toLowerCase().replace(/^org\.mpris\.mediaplayer2\./, "").replace(/\.instance\d+$/, "")
  return identity === want || entry === want || dbus === want
    || (identity !== "" && identity.indexOf(want) !== -1)
}

// Remember when each player started playing (a serial, so "earliest" is
// stable) and when it was last playing -- the moment it stopped, once it has. Players that have gone are
// forgotten.
export function trackActivity(state, players, now) {
  const prev = state || { serial: 0, startedAt: {}, lastActiveAt: {} }
  let serial = prev.serial || 0
  const startedAt = {}
  const lastActiveAt = {}
  const list = players || []
  for (let i = 0; i < list.length; i++) {
    const key = list[i].key
    if (!key) continue
    if (list[i].isPlaying) {
      if (has(prev.startedAt, key)) startedAt[key] = prev.startedAt[key]
      else { serial += 1; startedAt[key] = serial }
      lastActiveAt[key] = now
    } else if (has(prev.startedAt, key)) {
      lastActiveAt[key] = now   // it has just stopped: that's when it was last active
    } else if (has(prev.lastActiveAt, key)) {
      lastActiveAt[key] = prev.lastActiveAt[key]
    }
  }
  return { serial: serial, startedAt: startedAt, lastActiveAt: lastActiveAt }
}

function pick(list, test, better) {
  let best = null
  for (let i = 0; i < list.length; i++) {
    if (!test(list[i])) continue
    if (best === null || better(list[i], best)) best = list[i]
  }
  return best
}

// The key of the player to show, or null when there's nothing worth showing.
//   opts.preferred  the widget's preferredPlayer setting
//   opts.pinnedKey  a player picked by tapping the chip
//   opts.activity   what trackActivity() returned
export function choosePlayer(players, opts) {
  const o = opts || {}
  const activity = o.activity || { startedAt: {}, lastActiveAt: {} }
  const list = []
  const src = players || []
  for (let i = 0; i < src.length; i++) if (hasMetadata(src[i])) list.push(src[i])
  if (list.length === 0) return null

  if (o.pinnedKey) {
    for (let i = 0; i < list.length; i++) if (list[i].key === o.pinnedKey) return list[i].key
  }

  let preferred = null
  for (let i = 0; i < list.length; i++) if (matchesPreferred(list[i], o.preferred)) { preferred = list[i]; break }
  if (preferred && preferred.isPlaying) return preferred.key

  const order = function (p) { return has(activity.startedAt, p.key) ? activity.startedAt[p.key] : 1e15 }
  const earlier = function (a, b) { return order(a) < order(b) }
  const playing = pick(list, function (p) { return p.isPlaying && !isProxy(p) }, earlier)
    || pick(list, function (p) { return p.isPlaying }, earlier)
  if (playing) return playing.key

  if (preferred) return preferred.key

  const seen = function (p) { return has(activity.lastActiveAt, p.key) ? activity.lastActiveAt[p.key] : 0 }
  const recent = pick(list, function (p) { return seen(p) > 0 && !isProxy(p) }, function (a, b) { return seen(a) > seen(b) })
    || pick(list, function (p) { return seen(p) > 0 }, function (a, b) { return seen(a) > seen(b) })
  if (recent) return recent.key

  const withTrack = pick(list, function (p) { return p.hasTrack && !isProxy(p) }, function () { return false })
  if (withTrack) return withTrack.key
  const real = pick(list, function (p) { return !isProxy(p) }, function () { return false })
  return (real || list[0]).key
}

function label(p) { return String(p.identity || p.desktopEntry || p.key || "") }

// Tapping the player chip moves to the next player in a fixed order (real
// players before proxies, then by name), wrapping round.
export function nextPlayer(players, currentKey) {
  const list = []
  const src = players || []
  for (let i = 0; i < src.length; i++) if (hasMetadata(src[i])) list.push(src[i])
  if (list.length === 0) return null
  list.sort(function (a, b) {
    if (isProxy(a) !== isProxy(b)) return isProxy(a) ? 1 : -1
    return label(a).toLowerCase() < label(b).toLowerCase() ? -1 : (label(a).toLowerCase() > label(b).toLowerCase() ? 1 : 0)
  })
  let at = -1
  for (let i = 0; i < list.length; i++) if (list[i].key === currentKey) at = i
  return list[(at + 1) % list.length].key
}

function two(n) { return n < 10 ? "0" + n : String(n) }

// 187 -> "3:07", 3723 -> "1:02:03". Players report seconds.
export function formatTime(seconds) {
  const n = Number(seconds)
  if (seconds === null || seconds === undefined || !isFinite(n) || n < 0) return "—"
  const total = Math.floor(n)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? h + ":" + two(m) + ":" + two(s) : m + ":" + two(s)
}

// 0..1 along the track, or null when the length isn't known.
export function progress(position, length) {
  const p = Number(position)
  const l = Number(length)
  if (!isFinite(p) || !isFinite(l) || l <= 0) return null
  return Math.min(Math.max(p / l, 0), 1)
}
