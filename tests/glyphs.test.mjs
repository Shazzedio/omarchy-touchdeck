// The deck's icons must stay the same as Omarchy's own OSD icons.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import * as Glyphs from "../lib/glyphs.mjs"

const OSD = "/usr/share/omarchy/shell/plugins/osd/OsdModel.js"

test("each glyph is one private-use code point", () => {
  for (const name of Object.keys(Glyphs.OMARCHY_NAMES)) {
    const g = Glyphs[name]
    assert.equal([...g].length, 1, `${name} is a single code point`)
    const cp = g.codePointAt(0)
    assert.ok((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0xFFFFD), `${name} U+${cp.toString(16)}`)
  }
})

test("volume() picks the glyph for each level", () => {
  assert.equal(Glyphs.volume("muted"), Glyphs.VOLUME_MUTED)
  assert.equal(Glyphs.volume("low"), Glyphs.VOLUME_LOW)
  assert.equal(Glyphs.volume("medium"), Glyphs.VOLUME_MEDIUM)
  assert.equal(Glyphs.volume("high"), Glyphs.VOLUME_HIGH)
})

test("glyphs match Omarchy's OSD", { skip: !existsSync(OSD) }, () => {
  const src = readFileSync(OSD, "utf8")
  for (const [name, osdName] of Object.entries(Glyphs.OMARCHY_NAMES)) {
    const line = src.split("\n").find((l) => l.includes(`"${osdName}"`) && l.includes("return"))
    assert.ok(line, `Omarchy's OSD still has "${osdName}"`)
    assert.ok(line.includes(Glyphs[name]), `${name} matches the OSD's "${osdName}"`)
  }
})
