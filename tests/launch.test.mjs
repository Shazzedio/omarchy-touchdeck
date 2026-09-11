// bin/touchdeck-launch in --dry-run, and bin/touchdeck-defaults.
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { REPO } from "./support/fixtures.mjs"

const LAUNCH = path.join(REPO, "bin/touchdeck-launch")

// Shannon's two monitors: DP-1 at 0x0 (2560x1440, scale 1) and the deck,
// HDMI-A-1, below it at 512x1440 (1920x1080 at scale 1.25 = 1536x864 logical).
const MONITORS = (focused) => JSON.stringify([
  { name: "DP-1", x: 0, y: 0, width: 2560, height: 1440, scale: 1, transform: 0, focused: focused === "DP-1" },
  { name: "HDMI-A-1", x: 512, y: 1440, width: 1920, height: 1080, scale: 1.25, transform: 0, focused: focused === "HDMI-A-1" },
])

function run(args, env) {
  const r = spawnSync("bash", [LAUNCH, "--dry-run"].concat(args), {
    env: Object.assign({}, process.env, env || {}), encoding: "utf8", timeout: 10000,
  })
  return { status: r.status, out: r.stdout.trim().split("\n").filter(Boolean), err: r.stderr }
}

test("focus the main monitor without moving the pointer, then launch", () => {
  const r = run(["--deck", "HDMI-A-1", "--monitor", "DP-1", "--desktop", "brave-browser.desktop"],
    { TOUCHDECK_CURSOR: "827, 1267", TOUCHDECK_MONITORS_JSON: MONITORS("DP-1") })
  assert.equal(r.status, 0, r.err)
  assert.deepEqual(r.out, [
    'run: hyprctl eval hl.dispatch(hl.dsp.focus({ monitor = "DP-1" })); hl.dispatch(hl.dsp.cursor.move({ x = 827, y = 1267 }))',
    "launch: uwsm-app -- gtk-launch brave-browser.desktop",
  ])
})

// The bug Shannon found: a tap leaves the pointer on the deck. Putting it back
// there after focusing the main monitor made Hyprland refocus the deck, and
// every app opened underneath it.
test("a pointer on the deck leaves with focus, so the app can't open under the deck", () => {
  const r = run(["--deck", "HDMI-A-1", "--monitor", "DP-1", "--desktop", "org.gnome.Nautilus"],
    { TOUCHDECK_CURSOR: "1200, 1900", TOUCHDECK_MONITORS_JSON: MONITORS("HDMI-A-1") })
  assert.deepEqual(r.out, [
    'run: hyprctl dispatch hl.dsp.focus({ monitor = "DP-1" })',
    "launch: uwsm-app -- gtk-launch org.gnome.Nautilus.desktop",
  ], "no cursor.move back onto the deck")
})

test("a workspace target and a custom command", () => {
  const r = run(["--workspace", "4", "--command", "xdg-terminal-exec btop"], { TOUCHDECK_CURSOR: "10, 20" })
  assert.equal(r.status, 0, r.err)
  assert.match(r.out[0], /hl\.dsp\.focus\(\{ workspace = "4" \}\)/)
  assert.equal(r.out[1], "launch: uwsm-app -- sh -c xdg-terminal-exec btop")
})

test("without a readable cursor, focus falls back to a plain dispatch", () => {
  const r = run(["--monitor", "DP-1"], { TOUCHDECK_CURSOR: "garbage" })
  assert.deepEqual(r.out, ['run: hyprctl dispatch hl.dsp.focus({ monitor = "DP-1" })'])
})

test("launch with no focus change when no monitor is known", () => {
  assert.deepEqual(run(["--desktop", "brave-browser"]).out, ["launch: uwsm-app -- gtk-launch brave-browser.desktop"])
})

test("names that would break out of the Lua string are refused", () => {
  for (const args of [
    ["--monitor", 'DP-1" }) os.exit() --'],
    ["--workspace", "1\"; x"],
    ["--desktop", "../../evil"],
    ["--restore-focus", "a b", "--deck", "HDMI-A-1"],
    ["--deck", "x\"y", "--monitor", "DP-1"],
    ["--monitor", "DP-1", "--workspace", "2"],
    ["--bogus"],
  ]) {
    const r = run(args, { TOUCHDECK_CURSOR: "1, 1" })
    assert.equal(r.status, 2, `${JSON.stringify(args)} should be refused`)
    assert.deepEqual(r.out, [], "nothing runs")
  }
})

test("restore-focus after a touch: back to the main monitor, pointer kept if it's elsewhere", () => {
  const r = run(["--restore-focus", "DP-1", "--deck", "HDMI-A-1"],
    { TOUCHDECK_CURSOR: "827, 1267", TOUCHDECK_MONITORS_JSON: MONITORS("HDMI-A-1") })
  assert.deepEqual(r.out, [
    'run: hyprctl eval hl.dispatch(hl.dsp.focus({ monitor = "DP-1" })); hl.dispatch(hl.dsp.cursor.move({ x = 827, y = 1267 }))',
  ])
})

test("restore-focus with the pointer on the deck takes the pointer along", () => {
  const onDeck = run(["--restore-focus", "DP-1", "--deck", "HDMI-A-1"],
    { TOUCHDECK_CURSOR: "1200, 1900", TOUCHDECK_MONITORS_JSON: MONITORS("HDMI-A-1") })
  assert.deepEqual(onDeck.out, ['run: hyprctl dispatch hl.dsp.focus({ monitor = "DP-1" })'])
  const edge = run(["--restore-focus", "DP-1", "--deck", "HDMI-A-1"],
    { TOUCHDECK_CURSOR: "2047, 2303", TOUCHDECK_MONITORS_JSON: MONITORS("HDMI-A-1") })
  assert.deepEqual(edge.out, ['run: hyprctl dispatch hl.dsp.focus({ monitor = "DP-1" })'],
    "the deck's last logical pixel (512+1536-1, 1440+864-1) is on the deck")
  const past = run(["--restore-focus", "DP-1", "--deck", "HDMI-A-1"],
    { TOUCHDECK_CURSOR: "2048, 1900", TOUCHDECK_MONITORS_JSON: MONITORS("HDMI-A-1") })
  assert.match(past.out[0], /^run: hyprctl eval/, "one pixel past the deck is not on it (logical, not physical, size)")
})

test("restore-focus does nothing once focus has already moved on", () => {
  const r = run(["--restore-focus", "DP-1", "--deck", "HDMI-A-1"],
    { TOUCHDECK_CURSOR: "827, 1267", TOUCHDECK_MONITORS_JSON: MONITORS("DP-1") })
  assert.deepEqual(r.out, ["skip: focus is not on the deck"])
})

test("touchdeck-defaults prints the three roles", () => {
  const r = spawnSync("bash", [path.join(REPO, "bin/touchdeck-defaults")], { encoding: "utf8", timeout: 10000 })
  assert.equal(r.status, 0)
  assert.deepEqual(r.stdout.split("\n").filter(Boolean).map((l) => l.split("=")[0]), ["browser", "files", "terminal"])
})
