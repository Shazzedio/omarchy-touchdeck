// The plugin manifest against what the Omarchy marketplace requires of a
// third-party plugin (plugins.omarchy.org/develop.html, and the shell's own
// README). Checked here so the gate catches a manifest the installer or the
// marketplace would reject.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"))

const ENTRY_POINT_KEYS = {
  "bar-widget": "barWidget",
  "panel": "panel",
  "overlay": "overlay",
  "menu": "menu",
  "service": "service",
  "bar": "bar",
}

test("manifest: required fields", function () {
  assert.equal(manifest.schemaVersion, 1)
  for (const field of ["id", "name", "version", "author", "license", "description"]) {
    assert.equal(typeof manifest[field], "string", field)
    assert.ok(manifest[field].length > 0, field + " is empty")
  }
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "semantic version")
  assert.ok(Array.isArray(manifest.kinds) && manifest.kinds.length > 0)
})

test("manifest: a third-party id may not claim the omarchy namespace", function () {
  assert.ok(manifest.id.indexOf("omarchy.") !== 0, manifest.id)
  assert.match(manifest.id, /^[a-z0-9][a-z0-9.-]*$/)
})

test("manifest: every kind has an entry point, and every file exists", function () {
  for (const kind of manifest.kinds) {
    const key = ENTRY_POINT_KEYS[kind]
    assert.ok(key, "unknown kind " + kind)
    const file = manifest.entryPoints[key]
    assert.equal(typeof file, "string", kind + " needs entryPoints." + key)
    assert.ok(!file.startsWith("/") && file.indexOf("..") === -1, "relative path: " + file)
    assert.ok(existsSync(join(ROOT, file)), "missing " + file)
  }
  // No entry point may name a kind the plugin doesn't declare.
  for (const key of Object.keys(manifest.entryPoints)) {
    const kinds = Object.keys(ENTRY_POINT_KEYS).filter(function (k) { return ENTRY_POINT_KEYS[k] === key })
    assert.ok(kinds.some(function (k) { return manifest.kinds.indexOf(k) !== -1 }), key + " has no kind")
  }
})

test("manifest: bar widget metadata", function () {
  if (manifest.kinds.indexOf("bar-widget") === -1) return
  const meta = manifest.barWidget
  assert.ok(meta && typeof meta === "object", "barWidget metadata")
  assert.equal(typeof meta.displayName, "string")
  assert.ok(["left", "center", "right"].indexOf(meta.defaultSection) !== -1, meta.defaultSection)
  assert.equal(typeof meta.allowMultiple, "boolean")
  // The widget must name the plugin it belongs to, or the bar can't find its
  // settings (Omarchy's BarWidget base: moduleName is the canonical id).
  const widget = readFileSync(join(ROOT, manifest.entryPoints.barWidget), "utf8")
  assert.ok(widget.indexOf('moduleName: "' + manifest.id + '"') !== -1, "moduleName must match the id")
})

test("plugin folder: what the marketplace asks for, and no symlinks", function () {
  for (const file of ["README.md", "LICENSE"]) {
    assert.ok(existsSync(join(ROOT, file)), "missing " + file)
  }
  const walk = function (dir) {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue
      const path = join(dir, name)
      const stat = lstatSync(path)
      assert.ok(!stat.isSymbolicLink(), "symlinks are not allowed in a plugin folder: " + path)
      if (stat.isDirectory()) walk(path)
    }
  }
  walk(ROOT)
})
