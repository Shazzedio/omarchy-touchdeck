// lib/ must compute the same thing in Qt's QML engine as in Node. See
// tests/qml/scenario.mjs for why.
//
// Quickshell refuses imports that escape a config's root directory (it
// resolves them to qrc:/qs-blackhole), so the harness can't live in
// tests/qml and reach ../../lib. Instead each run builds a throwaway config
// root holding copies of lib/ and the scenario, in the same relative layout
// as the repo, and starts `qs -p` on that.
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { run } from "./qml/scenario.mjs"
import { REPO, FIXTURES, frameTexts, nvidiaLines } from "./support/fixtures.mjs"

const HARNESS = `import QtQuick
import Quickshell
import "tests/qml/scenario.mjs" as Scenario

ShellRoot {
  Component.onCompleted: {
    var out
    try {
      var input = JSON.parse(Quickshell.env("TOUCHDECK_PARITY_INPUT") || "{}")
      out = JSON.stringify({ ok: true, result: Scenario.run(input) })
    } catch (e) {
      out = JSON.stringify({ ok: false, error: String(e) + (e && e.stack ? "\\n" + e.stack : "") })
    }
    console.log("TOUCHDECK_PARITY " + out)
    Qt.callLater(Qt.quit)
  }
}
`

function buildRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "touchdeck-parity-"))
  mkdirSync(path.join(root, "lib"))
  for (const f of readdirSync(path.join(REPO, "lib"))) {
    if (f.endsWith(".mjs")) copyFileSync(path.join(REPO, "lib", f), path.join(root, "lib", f))
  }
  mkdirSync(path.join(root, "tests/qml"), { recursive: true })
  copyFileSync(path.join(REPO, "tests/qml/scenario.mjs"), path.join(root, "tests/qml/scenario.mjs"))
  writeFileSync(path.join(root, "shell.qml"), HARNESS)
  return root
}

const hasQs = spawnSync("sh", ["-c", "command -v qs"], { encoding: "utf8" }).status === 0
const skip = !hasQs ? "qs (Quickshell) is not installed"
  : !process.env.WAYLAND_DISPLAY ? "needs a Wayland session to start qs"
  : false

test("lib/ gives identical results in Qt's QML engine and in Node", { skip }, () => {
  const fixtures = {}
  for (const name of FIXTURES) {
    const texts = frameTexts(name)
    fixtures[name] = { first: texts.first, second: texts.second, nvidia: nvidiaLines(name) }
  }
  const input = { fixtures }
  const expected = run(input)

  const root = buildRoot()
  let r
  try {
    r = spawnSync("qs", ["-p", root], {
      env: Object.assign({}, process.env, { TOUCHDECK_PARITY_INPUT: JSON.stringify(input) }),
      encoding: "utf8",
      timeout: 30000,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const output = ((r.stdout || "") + (r.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "")
  const marker = "TOUCHDECK_PARITY "
  const line = output.split("\n").find((l) => l.includes(marker))
  assert.ok(line, "the QML harness printed no result:\n" + output.slice(-3000))
  const payload = JSON.parse(line.slice(line.indexOf(marker) + marker.length).trim())
  assert.equal(payload.ok, true, "lib/ threw inside the QML engine: " + payload.error)
  assert.deepEqual(payload.result, expected)
})
