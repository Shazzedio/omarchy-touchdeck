// Owns every sensor helper process and turns their output into what the
// monitoring widgets draw (DESIGN.md D4, 4).
//
//   bin/touchdeck-collect   /proc and /sys, one frame per interval
//   nvidia-smi -lms N       one CSV line per NVIDIA GPU per interval, started
//                           only on a machine that has one
//
// Both are long-running and read line by line: nothing here blocks the shell's
// GUI thread (DESIGN.md 15). All parsing and maths is in lib/sensors.mjs.
//
// Everything stops when `active` goes false -- the deck hidden, its display
// unplugged, the session locked, or no monitoring widget on the page. Stopped
// means no processes and no timers: no wakeups at all.
import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/frame.mjs" as FrameLib
import "../lib/sensors.mjs" as SensorsLib
import "../lib/nvidia.mjs" as NvidiaLib

QtObject {
  id: root

  property bool active: false
  property int intervalMs: 1000
  property string collectorPath: ""

  // ------------------------------------------------------------ outputs

  property var state: SensorsLib.createState()
  // Time as the widgets see it. It moves when a frame arrives -- once a
  // second, together with any nvidia-smi lines that came in since -- and,
  // only once frames are overdue, on staleTimer, so a source that stops
  // talking is still noticed. When all is well nothing else moves it, and the
  // deck redraws once per interval rather than on every event (DESIGN.md 4, 15).
  property real now: 0

  property string collectorStatus: "stopped"   // stopped | running | restarting
  property string nvidiaStatus: "stopped"      // stopped | starting | running | missing | failed
  property int collectorRestarts: 0
  property int nvidiaRestarts: 0
  // Rolling mean of the JS work per frame, for DESIGN.md 15's 2 ms budget.
  property real frameCostMs: 0

  readonly property var cpu: root.state.cpu
  readonly property var memory: root.state.memory
  readonly property bool loading: root.state.frames === 0
  readonly property bool stale: SensorsLib.isStale(root.state.lastFrameAt, root.now, root.intervalMs)
  readonly property real lastFrameAge: root.state.lastFrameAt > 0
    ? Math.max(0, root.now - root.state.lastFrameAt) : -1
  readonly property var gpus: SensorsLib.gpuList(root.state, root.now, root.intervalMs, root.nvidiaStatus)
  readonly property bool hasNvidia: SensorsLib.hasVendor(root.state, "nvidia")

  function gpu(setting) {
    return SensorsLib.selectGpu(root.gpus, setting)
  }

  // ------------------------------------------------------------ lifecycle

  // Restart delays for a helper that died (DESIGN.md 15).
  readonly property var backoffMs: [1000, 2000, 5000, 10000, 30000]
  // A helper that is running but has said nothing for this many intervals is
  // assumed stuck -- a hung GPU driver can block a sysfs read indefinitely --
  // and is killed so the restart path takes over.
  readonly property int watchdogIntervals: 5

  function backoff(attempt) {
    return root.backoffMs[Math.min(attempt, root.backoffMs.length - 1)]
  }

  property var _assembler: FrameLib.createAssembler()
  // nvidia-smi lines held until the next frame, so both sources land in one
  // update. A plain array mutated in place: nothing binds to it.
  property var _pendingNvidia: []
  readonly property int staleAfterMs: SensorsLib.STALE_AFTER_INTERVALS * root.intervalMs
  property real _lastCollectorOutput: 0
  property real _lastNvidiaOutput: 0
  property int _collectorAttempt: 0
  property int _nvidiaAttempt: 0
  // Set when the nvidia-smi wrapper reports the tool isn't installed.
  property bool _nvidiaMissing: false
  // Set when *we* stop a helper, so its exit isn't mistaken for a crash and
  // restarted. The watchdog deliberately leaves these unset: a helper it kills
  // should come back.
  property bool _collectorStopping: false
  property bool _nvidiaStopping: false

  onActiveChanged: root._sync()
  onCollectorPathChanged: root._sync()
  onIntervalMsChanged: {
    // The interval is baked into both command lines: restart with the new one.
    if (!root.active) return
    root._stopAll()
    root._sync()
  }
  Component.onCompleted: root._sync()

  function _sync() {
    if (!root.active || root.collectorPath === "") {
      root._stopAll()
      return
    }
    root.staleTimer.interval = root.staleAfterMs + 50
    root.staleTimer.restart()
    if (!root.collector.running && !root.collectorRestart.running) root._startCollector()
    root._syncNvidia()
  }

  function _stopCollector() {
    root.collectorRestart.stop()
    if (root.collector.running) {
      root._collectorStopping = true
      root.collector.running = false
    }
    root.collectorStatus = "stopped"
  }

  function _stopNvidia() {
    root.nvidiaRestart.stop()
    if (root.nvidia.running) {
      root._nvidiaStopping = true
      root.nvidia.running = false
    }
    if (root.nvidiaStatus !== "missing") root.nvidiaStatus = "stopped"
  }

  function _stopAll() {
    root.staleTimer.stop()
    root._pendingNvidia = []
    root._stopCollector()
    root._stopNvidia()
    root.nvidiaStatus = "stopped"
    root._collectorAttempt = 0
    root._nvidiaAttempt = 0
    root._assembler.reset()
    // Start clean next time. Last session's numbers aren't worth showing as
    // "stale" for a second after the deck comes back.
    root.state = SensorsLib.createState()
    root.frameCostMs = 0
  }

  function _startCollector() {
    root._collectorStopping = false
    root._assembler.reset()
    root._lastCollectorOutput = Date.now()
    root.collectorStatus = "running"
    root.collector.running = true
  }

  function _syncNvidia() {
    var want = root.active && root.hasNvidia
    if (!want) {
      root._stopNvidia()
      return
    }
    // Not installed: say so rather than retrying forever. Re-checked the next
    // time the deck is shown.
    if (root.nvidiaStatus === "missing") return
    if (!root.nvidia.running && !root.nvidiaRestart.running) {
      root._lastNvidiaOutput = Date.now()
      root.nvidiaStatus = "starting"
      root._nvidiaMissing = false
      root._nvidiaStopping = false
      root.nvidia.running = true
    }
  }

  function _onCollectorLine(line) {
    root._lastCollectorOutput = Date.now()
    var frame = root._assembler.push(line)
    if (!frame) return
    var started = Date.now()
    var next = SensorsLib.applyFrame(root.state, frame, started)
    // Fold in whatever nvidia-smi said since the last frame, so the widgets
    // update once for both sources instead of twice.
    for (var i = 0; i < root._pendingNvidia.length; i++)
      next = SensorsLib.applyNvidiaLine(next, root._pendingNvidia[i].line, root._pendingNvidia[i].at)
    root._pendingNvidia = []
    root.state = next
    root.now = started
    // Measured after the assignments, so it includes the bindings that
    // re-evaluate because of them, not just the parse.
    var cost = Date.now() - started
    root.frameCostMs = root.state.frames <= 1 ? cost : root.frameCostMs * 0.9 + cost * 0.1
    root._collectorAttempt = 0   // a good frame: the next failure starts the backoff over
    // Frames are flowing: push the stale deadline back.
    root.staleTimer.interval = root.staleAfterMs + 50
    root.staleTimer.restart()
    root._watchdog()
    root._syncNvidia()
  }

  function _onNvidiaLine(line) {
    root._lastNvidiaOutput = Date.now()
    if (line === root.nvidiaMissingMarker) {
      root._nvidiaMissing = true
      return
    }
    // Not a data line: the driver prints its errors on this stream too.
    if (NvidiaLib.parseLine(line) === null) return
    root._pendingNvidia.push({ line: line, at: root._lastNvidiaOutput })
    if (root.nvidiaStatus !== "running") root.nvidiaStatus = "running"
    root._nvidiaAttempt = 0
  }

  // Apply held nvidia-smi lines now: used when frames have stopped, so GPU
  // readings don't freeze just because the collector did.
  function _flushNvidia() {
    if (root._pendingNvidia.length === 0) return
    var next = root.state
    for (var i = 0; i < root._pendingNvidia.length; i++)
      next = SensorsLib.applyNvidiaLine(next, root._pendingNvidia[i].line, root._pendingNvidia[i].at)
    root._pendingNvidia = []
    root.state = next
  }

  // SIGKILL, not `running = false`: stopping a Process sends SIGTERM, which a
  // frozen or wedged helper never acts on -- measured in Phase 2, a stopped
  // collector sat there untouched for as long as the test ran. Once killed it
  // exits, `running` drops, and the normal restart path takes over.
  readonly property int sigkill: 9

  function _watchdog() {
    var limit = root.watchdogIntervals * root.intervalMs
    if (root.collector.running && root.now - root._lastCollectorOutput > limit) {
      console.warn("touchdeck: collector silent for " + (root.now - root._lastCollectorOutput) + " ms; killing it")
      root._lastCollectorOutput = root.now   // once, not every tick while it dies
      root.collector.signal(root.sigkill)
    }
    if (root.nvidia.running && root.now - root._lastNvidiaOutput > limit) {
      console.warn("touchdeck: nvidia-smi silent for " + (root.now - root._lastNvidiaOutput) + " ms; killing it")
      root._lastNvidiaOutput = root.now
      root.nvidia.signal(root.sigkill)
    }
  }

  // ------------------------------------------------------------ processes

  readonly property Timer staleTimer: Timer {
    // While frames flow, each one pushes this back and it never fires. It runs
    // out only when a frame is overdue; from then until frames return it ticks
    // once per interval, keeping the stale state, its "N s ago", held GPU
    // readings and the watchdog moving.
    repeat: false
    onTriggered: {
      root.now = Date.now()
      root._flushNvidia()
      root._watchdog()
      interval = root.intervalMs
      restart()
    }
  }

  readonly property Process collector: Process {
    // `bash <path>` rather than executing the file, so the plugin works
    // whatever its exec bit (git checkouts and copies don't always keep it).
    command: ["bash", root.collectorPath, "--interval-ms", String(root.intervalMs)]
    running: false
    stdout: SplitParser {
      onRead: function (line) { root._onCollectorLine(line) }
    }
    // Exit is observed through `running` rather than the exited signal:
    // exited's second parameter is a QProcess enum the lint step can't
    // resolve, and nothing here needs the exit code anyway.
    onRunningChanged: {
      if (root.collector.running) return
      if (root._collectorStopping) {
        root._collectorStopping = false
        return
      }
      if (!root.active) {
        root.collectorStatus = "stopped"
        return
      }
      // It died on its own, or the watchdog killed it: bring it back.
      root.collectorStatus = "restarting"
      root.collectorRestarts++
      root.collectorRestart.interval = root.backoff(root._collectorAttempt)
      root._collectorAttempt++
      console.warn("touchdeck: collector exited; restarting in "
        + root.collectorRestart.interval + " ms")
      root.collectorRestart.restart()
    }
  }

  readonly property Timer collectorRestart: Timer {
    repeat: false
    onTriggered: if (root.active && !root.collector.running) root._startCollector()
  }

  readonly property string nvidiaMissingMarker: "@touchdeck:nvidia-smi-missing"

  readonly property Process nvidia: Process {
    // Through bash so "not installed" arrives as a line we can recognise
    // rather than a spawn failure, and the widget can say exactly that. `exec`
    // means the running process is nvidia-smi itself, not a bash around it.
    command: ["bash", "-c",
      "command -v nvidia-smi >/dev/null 2>&1 || { echo " + root.nvidiaMissingMarker + "; exit 127; }; "
        + "exec nvidia-smi \"$@\"",
      "touchdeck-nvidia"].concat(NvidiaLib.commandArgs(root.intervalMs))
    running: false
    stdout: SplitParser {
      onRead: function (line) { root._onNvidiaLine(line) }
    }
    onRunningChanged: {
      if (root.nvidia.running) return
      if (root._nvidiaStopping) {
        root._nvidiaStopping = false
        return
      }
      if (!root.active || !root.hasNvidia) {
        if (root.nvidiaStatus !== "missing") root.nvidiaStatus = "stopped"
        return
      }
      if (root._nvidiaMissing) {
        root.nvidiaStatus = "missing"
        console.warn("touchdeck: an NVIDIA GPU is present but nvidia-smi is not installed")
        return
      }
      root.nvidiaStatus = "failed"
      root.nvidiaRestarts++
      root.nvidiaRestart.interval = root.backoff(root._nvidiaAttempt)
      root._nvidiaAttempt++
      console.warn("touchdeck: nvidia-smi exited; restarting in "
        + root.nvidiaRestart.interval + " ms")
      root.nvidiaRestart.restart()
    }
  }

  readonly property Timer nvidiaRestart: Timer {
    repeat: false
    onTriggered: root._syncNvidia()
  }

  // ------------------------------------------------------------ status

  function summary() {
    var gpus = []
    for (var i = 0; i < root.gpus.length; i++) {
      var g = root.gpus[i]
      gpus.push({ pci: g.pci, vendor: g.vendor, name: g.name, available: g.available,
        loading: g.loading, stale: g.stale, reason: g.reason, usagePct: g.usagePct,
        tempC: g.tempC, vramUsedBytes: g.vramUsedBytes, vramTotalBytes: g.vramTotalBytes,
        powerW: g.powerW })
    }
    return {
      active: root.active,
      collector: { status: root.collectorStatus, pid: root.collector.running ? root.collector.processId : null,
        restarts: root.collectorRestarts },
      nvidia: { status: root.nvidiaStatus, pid: root.nvidia.running ? root.nvidia.processId : null,
        restarts: root.nvidiaRestarts },
      frames: root.state.frames,
      lastFrameAgeMs: root.lastFrameAge,
      stale: root.stale,
      frameCostMs: Math.round(root.frameCostMs * 100) / 100,
      cpu: { usagePct: root.cpu.usagePct, tempC: root.cpu.tempC, freqMHz: root.cpu.freqMHz },
      memory: { usedBytes: root.memory.usedBytes, totalBytes: root.memory.totalBytes },
      gpus: gpus,
    }
  }
}
