// The QML engine the deck actually runs in throws a bare "Parse error" with no
// position, so config.mjs locates the fault itself rather than relying on the
// engine's message. These are the mistakes a person actually makes editing
// config.json by hand.
import { test } from "node:test"
import assert from "node:assert/strict"
import * as config from "../lib/config.mjs"

test("locateJsonError points at the real fault for common hand edits", () => {
  const cases = [
    ['{\n  "a": 1,\n  "b": {\n    "c": 1,,\n  }\n}', 4, /expected a property name, found ','/],
    ['{\n  "a": 1,\n}', 3, /trailing ',' before '}'/],
    ['{\n  "a": [1, 2,]\n}', 2, /trailing ',' before ']'/],
    ['{\n "a": 1\n "b": 2\n}', 3, /expected ',' or '}', found a string/],
    ["{\n  \"a\": 'single'\n}", 2, /JSON needs double quotes/],
    ['{\n  "a": "unterminated\n}', 2, /unterminated string/],
    ['{\n  "a": 1\n  "b"\n}', 3, /expected ',' or '}'/],
    // Errors point at the token actually found, consistently: here the '}' on
    // line 3 is where a ':' was expected.
    ['{\n  "a"\n}', 3, /expected ':', found '}'/],
    ['{', 1, /end of file/],
    ['[1, 2', 1, /end of file/],
    ['{"a":1} trailing', 1, /unexpected 't'/],
  ]
  for (const [text, line, pattern] of cases) {
    // Confirm the input really is broken, so the test cannot pass vacuously.
    assert.throws(() => JSON.parse(text), `${JSON.stringify(text)} should be invalid JSON`)
    const located = config.locateJsonError(text)
    assert.equal(located.line, line,
      `${JSON.stringify(text)} -> line ${located.line}: ${located.message}`)
    assert.match(located.message, pattern)
    assert.ok(located.column > 0, "a column is always reported")
  }
})

test("locateJsonError finds nothing wrong with valid JSON", () => {
  const valid = [
    "{}",
    "[]",
    '{"a":1}',
    '  {  "a"  :  [ 1 , 2 ]  }  ',
    '{"nested":{"deep":[{"x":true},null,-1.5e10]}}',
    '{"escaped":"a \\" b \\\\ c"}',
    '{"unicode":"\\u00e9"}',
    config.serialize(config.defaultConfig()),
  ]
  for (const text of valid) {
    assert.doesNotThrow(() => JSON.parse(text), `${text} should be valid JSON`)
    const located = config.locateJsonError(text)
    assert.equal(located.line, 0, `${text} -> ${located.message}`)
  }
})

test("locateJsonError never throws, whatever it is handed", () => {
  const nasty = ["", "   ", null, undefined, '"\\', '{"a":', "]]]]",
    "{".repeat(500), '"' + "x".repeat(10000)]
  for (const text of nasty) {
    assert.doesNotThrow(() => config.locateJsonError(text),
      `threw on ${JSON.stringify(String(text).slice(0, 30))}`)
    const located = config.locateJsonError(text)
    assert.equal(typeof located.message, "string")
    assert.ok(located.message.length > 0)
  }
})

test("describeJsonError is exactly what the banner shows", () => {
  assert.equal(config.describeJsonError('{\n  "a": 1,\n}'), "line 3: trailing ',' before '}'")
  assert.equal(config.describeJsonError(""), "the file is empty")
})

test("parse routes a broken file through the locator", () => {
  const r = config.parse('{\n "version": 1,\n "appearance": {\n  "scale": 1,,\n }\n}\n')
  assert.equal(r.ok, false)
  assert.equal(r.config, null, "the caller keeps its last good config")
  assert.equal(r.parseError, "line 4: expected a property name, found ','")
})
