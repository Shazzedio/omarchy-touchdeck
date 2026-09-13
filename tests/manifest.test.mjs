// The plugin manifest against what the Omarchy marketplace requires of a
// third-party plugin (plugins.omarchy.org/develop.html, and the shell's own
// README). Checked here so the gate catches a manifest the installer or the
// marketplace would reject.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
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

// Agent control files -- CLAUDE.md, AGENTS.md, .cursorrules, .claude/ and the
// like -- are ingested automatically as instructions by coding agents working
// in or near a checkout. This repository *is* the plugin, and it gets cloned
// onto other people's machines, so one committed here is an instruction
// injection surface that has nothing to do with what the deck does
// (DESIGN.md 0.7, DECISIONS.md D-55). Project guidance lives in docs/ instead.
// A personal copy is fine as long as it stays untracked; .gitignore lists the
// usual names.
const AGENT_CONTROL_FILE =
  /^(claude|claude\.local|agent|agents|gemini|qwen|codex|copilot-instructions)\.md$|^\.(cursorrules|windsurfrules|clinerules|goosehints|roomodes)$|^\.aider\.conf\.ya?ml$|^\.mcp\.json$/i
const AGENT_CONTROL_DIR = /^\.(claude|cursor|codex|gemini|continue|windsurf|roo|opencode|aider)$/i

// What actually ships: the tracked files in a checkout, or everything present
// in an already-installed plugin directory.
function shippedPaths() {
  if (existsSync(join(ROOT, ".git"))) {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    return out.split("\0").filter(function (p) { return p.length > 0 })
  }
  const paths = []
  const walk = function (dir, prefix) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (lstatSync(path).isDirectory()) walk(path, prefix + name + "/")
      else paths.push(prefix + name)
    }
  }
  walk(ROOT, "")
  return paths
}

test("plugin folder: no agent control files ship with the plugin", function () {
  for (const path of shippedPaths()) {
    const segments = path.split("/")
    const name = segments[segments.length - 1]
    assert.ok(!AGENT_CONTROL_FILE.test(name), "agent control file: " + path)
    for (const dir of segments.slice(0, -1)) {
      assert.ok(!AGENT_CONTROL_DIR.test(dir), "agent control directory: " + path)
    }
  }
})
