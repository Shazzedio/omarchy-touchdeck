import { test } from "node:test"
import assert from "node:assert/strict"
import * as Apps from "../lib/apps.mjs"

const ENTRIES = {
  "brave-browser": { name: "Brave", icon: "brave-desktop" },
  "org.gnome.Nautilus": { name: "Files", icon: "org.gnome.Nautilus" },
  "com.mitchellh.ghostty": { name: "Ghostty", icon: "com.mitchellh.ghostty" },
}
const lookup = (id) => ENTRIES[id] || null
const exists = (id) => !!ENTRIES[id]

test("desktop ids normalise to the bare form DesktopEntries.byId wants", () => {
  assert.equal(Apps.normalizeDesktopId("brave-browser.desktop"), "brave-browser")
  assert.equal(Apps.normalizeDesktopId(" org.telegram.desktop.desktop "), "org.telegram.desktop",
    "only the file suffix goes: ids like org.telegram.desktop survive")
  assert.equal(Apps.normalizeDesktopId("com.mitchellh.ghostty.desktop:new-window"), "com.mitchellh.ghostty")
  assert.equal(Apps.normalizeDesktopId(null), "")
})

test("targets", () => {
  assert.deepEqual(Apps.parseTarget("auto"), { kind: "auto" })
  assert.deepEqual(Apps.parseTarget(undefined), { kind: "auto" })
  assert.deepEqual(Apps.parseTarget("touch"), { kind: "touch" })
  assert.deepEqual(Apps.parseTarget("workspace:3"), { kind: "workspace", workspace: "3" })
  assert.deepEqual(Apps.parseTarget("nonsense"), { kind: "auto" })
})

test("a key's state: app, command, missing, loading, unset", () => {
  assert.deepEqual(Apps.describeKey({ desktopId: "brave-browser.desktop" }, lookup, true),
    { state: "app", title: "Brave", icon: "brave-desktop", desktopId: "brave-browser", command: "" })
  assert.equal(Apps.describeKey({ desktopId: "brave-browser", label: "Web" }, lookup, true).title, "Web")
  assert.deepEqual(Apps.describeKey({ command: "xdg-terminal-exec btop", label: "btop", icon: "utilities-system-monitor" }, lookup, true),
    { state: "command", title: "btop", icon: "utilities-system-monitor", desktopId: "", command: "xdg-terminal-exec btop" })
  assert.equal(Apps.describeKey({ desktopId: "gone-app.desktop" }, lookup, true).state, "missing")
  assert.equal(Apps.describeKey({ desktopId: "gone-app.desktop" }, lookup, false).state, "loading",
    "entries not read yet: never claim 'Not installed'")
  assert.equal(Apps.describeKey({}, lookup, true).state, "unset")
  assert.equal(Apps.describeKey({ desktopId: "brave-browser", command: "x" }, lookup, true).state, "app", "the entry wins")
})

test("launch arguments follow the key's target", () => {
  const ctx = { lastMonitor: "DP-1", deckMonitor: "HDMI-A-1" }
  assert.deepEqual(Apps.launchArgs({ desktopId: "brave-browser.desktop" }, ctx),
    ["--monitor", "DP-1", "--desktop", "brave-browser"])
  assert.deepEqual(Apps.launchArgs({ desktopId: "brave-browser", target: "touch" }, ctx),
    ["--monitor", "HDMI-A-1", "--desktop", "brave-browser"])
  assert.deepEqual(Apps.launchArgs({ command: "xdg-terminal-exec btop", target: "workspace:4" }, ctx),
    ["--workspace", "4", "--command", "xdg-terminal-exec btop"])
  assert.deepEqual(Apps.launchArgs({ desktopId: "brave-browser" }, {}), ["--desktop", "brave-browser"],
    "no known monitor yet: launch without moving focus")
  assert.equal(Apps.launchArgs({}, ctx), null)
})

test("defaults from bin/touchdeck-defaults", () => {
  assert.deepEqual(
    Apps.parseDefaults("browser=brave-browser.desktop\nfiles=org.gnome.Nautilus.desktop\nterminal=com.mitchellh.ghostty.desktop\n"),
    { browser: "brave-browser", files: "org.gnome.Nautilus", terminal: "com.mitchellh.ghostty" })
  assert.deepEqual(Apps.parseDefaults("browser=\njunk\n"), { browser: "", files: "", terminal: "" })
})

test("first-run roles resolve once, and unresolvable ones are cleared", () => {
  const items = [
    { id: "cpu-1", type: "cpu", settings: {} },
    { id: "key-1", type: "app", settings: { defaultRole: "browser", target: "auto" } },
    { id: "key-2", type: "app", settings: { defaultRole: "files", target: "auto" } },
    { id: "key-3", type: "app", settings: { defaultRole: "terminal", target: "auto" } },
    { id: "key-4", type: "app", settings: { desktopId: "keep.desktop" } },
  ]
  assert.ok(Apps.needsDefaultRoles(items))
  const r = Apps.applyDefaultRoles(items, { browser: "brave-browser", files: "org.gnome.Nautilus", terminal: "not-installed" }, exists)
  assert.equal(r.changed, true)
  assert.deepEqual(r.items[1].settings, { target: "auto", desktopId: "brave-browser.desktop" })
  assert.deepEqual(r.items[2].settings, { target: "auto", desktopId: "org.gnome.Nautilus.desktop" })
  assert.deepEqual(r.items[3].settings, { target: "auto" }, "no such app: hint cleared, key stays empty")
  assert.equal(r.items[0], items[0], "other items untouched")
  assert.equal(r.items[4], items[4])
  assert.ok(!Apps.needsDefaultRoles(r.items), "nothing left to resolve")
  assert.equal(items[1].settings.defaultRole, "browser", "input not mutated")
  assert.equal(Apps.applyDefaultRoles(r.items, {}, exists).changed, false)
})

test("a key someone already configured keeps its app even if it carries a stale role", () => {
  const r = Apps.applyDefaultRoles([{ id: "k", type: "app", settings: { defaultRole: "browser", desktopId: "mine.desktop" } }],
    { browser: "brave-browser" }, exists)
  assert.deepEqual(r.items[0].settings, { desktopId: "mine.desktop" })
})
