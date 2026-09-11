import { test } from "node:test"
import assert from "node:assert/strict"
import * as Media from "../lib/media.mjs"

const player = (key, extra) => Object.assign({
  key, identity: key, desktopEntry: key.toLowerCase(), dbusName: "org.mpris.MediaPlayer2." + key.toLowerCase(),
  isPlaying: false, hasTrack: true,
}, extra || {})

test("a playing player wins over paused ones", () => {
  const list = [player("mpv"), player("Spotify", { isPlaying: true })]
  const act = Media.trackActivity(null, list, 1000)
  assert.equal(Media.choosePlayer(list, { activity: act }), "Spotify")
})

test("with two playing, the one that started first stays shown", () => {
  let list = [player("Spotify", { isPlaying: true }), player("mpv")]
  let act = Media.trackActivity(null, list, 1000)
  list = [player("Spotify", { isPlaying: true }), player("mpv", { isPlaying: true })]
  act = Media.trackActivity(act, list, 2000)
  assert.equal(Media.choosePlayer(list, { activity: act }), "Spotify")
})

test("a preferred player wins only while it plays", () => {
  const list = [player("mpv", { isPlaying: true }), player("Spotify")]
  const act = Media.trackActivity(null, list, 1000)
  assert.equal(Media.choosePlayer(list, { activity: act, preferred: "spotify" }), "mpv")
  const playing = [player("mpv", { isPlaying: true }), player("Spotify", { isPlaying: true })]
  assert.equal(Media.choosePlayer(playing, { activity: Media.trackActivity(act, playing, 2000), preferred: "Spotify" }), "Spotify")
})

test("with nothing playing: preferred, then the most recently active", () => {
  let list = [player("mpv", { isPlaying: true }), player("Chromium")]
  let act = Media.trackActivity(null, list, 1000)
  list = [player("mpv"), player("Chromium", { isPlaying: true })]
  act = Media.trackActivity(act, list, 2000)
  list = [player("mpv"), player("Chromium")]
  act = Media.trackActivity(act, list, 3000)
  assert.equal(Media.choosePlayer(list, { activity: act }), "Chromium", "Chromium played last")
  assert.equal(Media.choosePlayer(list, { activity: act, preferred: "mpv" }), "mpv")
})

test("a pinned player stays shown while it exists", () => {
  const list = [player("mpv", { isPlaying: true }), player("Spotify")]
  const act = Media.trackActivity(null, list, 1000)
  assert.equal(Media.choosePlayer(list, { activity: act, pinnedKey: "Spotify" }), "Spotify")
  assert.equal(Media.choosePlayer([list[0]], { activity: act, pinnedKey: "Spotify" }), "mpv", "gone: pin ignored")
})

test("playerctld proxies come last", () => {
  const proxy = player("playerctld", { isPlaying: true, dbusName: "org.mpris.MediaPlayer2.playerctld", desktopEntry: "" })
  const list = [proxy, player("Spotify", { isPlaying: true })]
  assert.ok(Media.isProxy(proxy))
  assert.equal(Media.choosePlayer(list, { activity: Media.trackActivity(null, list, 1) }), "Spotify")
  assert.equal(Media.choosePlayer([proxy], { activity: Media.trackActivity(null, [proxy], 1) }), "playerctld")
})

test("nothing to show: no players, or none with anything to say", () => {
  assert.equal(Media.choosePlayer([], {}), null)
  assert.equal(Media.choosePlayer([{ key: "x", isPlaying: false, hasTrack: false }], {}), null)
})

test("activity forgets players that have gone", () => {
  const act = Media.trackActivity(Media.trackActivity(null, [player("a", { isPlaying: true })], 1), [], 2)
  assert.deepEqual(act.startedAt, {})
  assert.deepEqual(act.lastActiveAt, {})
})

test("preferred matches identity, desktop entry or bus name, case-insensitively", () => {
  const p = { key: "k", identity: "Spotify", desktopEntry: "spotify", dbusName: "org.mpris.MediaPlayer2.spotify" }
  for (const want of ["Spotify", "spotify", "SPOT"]) assert.ok(Media.matchesPreferred(p, want), want)
  assert.ok(Media.matchesPreferred({ dbusName: "org.mpris.MediaPlayer2.chromium.instance4321" }, "chromium"))
  assert.ok(!Media.matchesPreferred(p, ""))
  assert.ok(!Media.matchesPreferred(p, "mpv"))
})

test("the chip cycles through players in a stable order and wraps", () => {
  const list = [player("Spotify"), player("mpv"), player("Chromium")]
  assert.equal(Media.nextPlayer(list, "Chromium"), "mpv")
  assert.equal(Media.nextPlayer(list, "mpv"), "Spotify")
  assert.equal(Media.nextPlayer(list, "Spotify"), "Chromium", "wraps round")
  assert.equal(Media.nextPlayer(list, "gone"), "Chromium")
  assert.equal(Media.nextPlayer([], "x"), null)
})

test("time formats like a player's own clock", () => {
  assert.equal(Media.formatTime(0), "0:00")
  assert.equal(Media.formatTime(187.9), "3:07")
  assert.equal(Media.formatTime(3723), "1:02:03")
  for (const bad of [null, undefined, NaN, -1, "x"]) assert.equal(Media.formatTime(bad), "—")
  assert.equal(Media.progress(30, 120), 0.25)
  assert.equal(Media.progress(200, 120), 1)
  assert.equal(Media.progress(30, 0), null, "unknown length: no progress bar")
})

test("most recently active means most recently *stopped*", () => {
  // mpv played first and long; Chromium started later but stopped first.
  let act = Media.trackActivity(null, [player("mpv", { isPlaying: true }), player("Chromium")], 1000)
  act = Media.trackActivity(act, [player("mpv", { isPlaying: true }), player("Chromium", { isPlaying: true })], 2000)
  act = Media.trackActivity(act, [player("mpv", { isPlaying: true }), player("Chromium")], 3000)
  act = Media.trackActivity(act, [player("mpv"), player("Chromium")], 9000)
  assert.equal(act.lastActiveAt.mpv, 9000)
  assert.equal(act.lastActiveAt.Chromium, 3000)
  assert.equal(Media.choosePlayer([player("mpv"), player("Chromium")], { activity: act }), "mpv")
})
