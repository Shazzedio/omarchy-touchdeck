// bin/touchdeck-art: album art fetched outside the desktop shell (D-46).
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ART = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "touchdeck-art")

function run(args) {
  return new Promise(function (resolve) {
    const child = spawn("bash", [ART].concat(args))
    let stdout = ""
    child.stdout.on("data", function (d) { stdout += d })
    child.on("close", function (status) { resolve({ status: status, stdout: stdout.trim() }) })
  })
}

function sha1(s) { return createHash("sha1").update(s).digest("hex") }

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "touchdeck-art-"))
  return Promise.resolve(fn(dir)).finally(function () { rmSync(dir, { recursive: true, force: true }) })
}

test("touchdeck-art: refuses anything but http(s), and needs both arguments", async function () {
  await withDir(async function (dir) {
    for (const url of ["file:///etc/passwd", "ftp://example.com/a.jpg", "-o/tmp/x", "data:image/png;base64,AA"]) {
      const r = await run([url, dir])
      assert.equal(r.status, 1, url)
      assert.equal(r.stdout, "", url)
    }
    assert.equal((await run([])).status, 2)
    assert.equal((await run(["https://example.com/a.jpg"])).status, 2)
    assert.deepEqual(readdirSync(dir), [])
  })
})

test("touchdeck-art: a cached cover is served without the network", async function () {
  await withDir(async function (dir) {
    // Port 9 refuses connections, so a fetch would fail.
    const url = "http://127.0.0.1:9/cover.jpg"
    writeFileSync(join(dir, sha1(url)), "cached")
    const r = await run([url, dir])
    assert.equal(r.status, 0)
    assert.equal(r.stdout, join(dir, sha1(url)))
  })
})

test("touchdeck-art: a failed fetch prints nothing and leaves nothing behind", async function () {
  await withDir(async function (dir) {
    const r = await run(["http://127.0.0.1:9/cover.jpg", dir])
    assert.notEqual(r.status, 0)
    assert.equal(r.stdout, "")
    assert.deepEqual(readdirSync(dir), [])
  })
})

test("touchdeck-art: fetches, caches, and keeps only the 30 most recent", async function () {
  const server = createServer(function (req, res) {
    if (req.url === "/missing.jpg") { res.statusCode = 404; res.end("no"); return }
    res.setHeader("content-type", "image/jpeg")
    res.end("cover:" + req.url)
  })
  await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve) })
  const base = "http://127.0.0.1:" + server.address().port
  try {
    await withDir(async function (dir) {
      // 35 older covers already cached.
      for (let i = 0; i < 35; i++) {
        const f = join(dir, sha1("old" + i))
        writeFileSync(f, "old")
        utimesSync(f, 1000 + i, 1000 + i)
      }
      const url = base + "/new.jpg"
      const r = await run([url, dir])
      assert.equal(r.status, 0)
      assert.equal(r.stdout, join(dir, sha1(url)))
      assert.equal(readFileSync(r.stdout, "utf8"), "cover:/new.jpg")
      const left = readdirSync(dir)
      assert.equal(left.length, 30)
      assert.ok(left.indexOf(sha1(url)) !== -1, "the new cover is kept")
      assert.ok(left.indexOf(sha1("old0")) === -1, "the oldest is pruned")

      // A 404 is a failure, not a cached error page.
      const miss = await run([base + "/missing.jpg", dir])
      assert.notEqual(miss.status, 0)
      assert.equal(miss.stdout, "")
      assert.equal(readdirSync(dir).filter(function (n) { return n.indexOf(".part") !== -1 }).length, 0)
    })
  } finally {
    server.close()
  }
})
