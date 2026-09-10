# Progress

Current phase: **Phase 2 complete — awaiting Shannon's go for Phase 3.**

Phases are defined in `DESIGN.md` §17. Findings and calls go in `DECISIONS.md`;
how to test lives in `TESTING.md`.

---

## Phase 0 — spike and ground truth ✅

All acceptance items met. The spike plugin has been disabled and deleted.

- [x] Window on the touch display only, at login, stays mounted — G-6
- [x] Recolours live on a theme switch with no reload code — G-6
- [x] Taps register at the right coordinates — all five targets hit, worst case
      22 px off-centre on a 360 px pad (G-7)
- [x] PipeWire and MPRIS import and bind from a third-party plugin — G-6
- [x] `omarchy-shell shell call` reaches a method — G-5
- [x] Tapping the deck moves Hyprland's focus: **yes**, by pointer and by finger;
      §5.6 mitigation required (G-7)
- [x] `keepLoaded` panels need `omarchy-restart-shell` to pick up code — D-1
- [x] Go on D1 — recommended after Phase 0; Shannon started Phase 1 on it.

---

## Phase 1 — skeleton, theme adapter, grid ✅

Built: `Deck.qml` (entry point, screen matching, lifecycle, IPC),
`services/DeckTheme.qml` + `components/DeckSurface.qml` (the only two `qs.*`
importers), `services/ConfigStore.qml`, `components/{DeckGrid,DeckText,Banner,
PlaceholderTile}.qml`, pure `lib/{grid,config,theme}.mjs`, 53 Node tests, and
`tools/check.sh`.

### Acceptance

- [x] **Shows only on the touch display; survives unplug/replug and
      `omarchy-restart-shell`.** Layer `1536x838+512+1466` on HDMI-A-1, nothing
      on DP-1. Disabling HDMI-A-1 made the deck dormant with the reason
      `No screen matches description "Verbatim"` and removed its window;
      re-adding the output (`hyprctl reload`) brought it back with no deck code
      involved. Restarts: several, each came back unsummoned.
- [x] **§8.5 passes with placeholder tiles.** All 22 installed themes, scripted:
      for each, the rendered pixel in an empty cell matched that theme's
      `colors.toml` background exactly (22/22, five of them light), and the deck
      stayed active through every switch. Eyeballed `white` (light + monochrome),
      `catppuccin-latte` and text size 16: text, borders and status swatches
      follow the theme and stay legible. Theme and text size restored.
- [x] **Hand edits apply live; broken JSON shows the banner and keeps the layout.**
      Shrinking the grid to 8×6 in the file applied live and parked 3 items.
      Breaking the JSON showed `config.json line 4: expected a property name,
      found ','` and kept the layout. Restarting the shell *on* the broken file
      came up on the backup layout (D-11). Fixing it cleared the banner live.
- [x] **`tools/check.sh` passes.** Exit 0. Skips, both expected: the collector
      (Phase 2) and `shellcheck` (not installed, D-8).

Also verified: `hide` / `summon` (with `{"edit":true}` → edit mode, "+" in free
cells only) / `toggle` / `toggleEdit` / `reloadConfig` / `status`, all at window
level. The Omarchy lock service is found (`lockServiceFound: true`), so the deck's
`active` flag will drop while locked.

### Bugs found and fixed in Phase 1

| What | How it showed | Fix |
|---|---|---|
| Object spread in `lib/` | Node tests passed; the QML engine refused the module and the whole deck failed to load | `Object.assign`; gate now lints `lib/*.mjs` under the QML parser (D-10) |
| Deploy one-liner gated on `grep "FAIL"` | Deployed a build the gate had just failed | Gate on `check.sh`'s exit code (D-10) |
| Cold start on a broken config | Defaults shown instead of the user's layout | Restore from `config.json.bak` (D-11) |
| QML `JSON.parse` says only "Parse error" | Banner could not name a line | Own JSON error locator (D-13) |
| Tiles mounted via `sourceComponent` | A `TypeError` burst on every load | `Loader.setSource` with initial properties (D-15) |
| Redundant `configChanged` signal | qmllint duplicate-name warning | Removed; the property already notifies |

### Not covered, and why

- **Lock / unlock** — it needs a person to unlock, so it isn't scripted. Wiring is
  verified (lock service found); the behaviour belongs to the manual checklist.
- **`omarchy font set`** — it rewrites fontconfig and restarts the shell. The
  deck binds the same `monospace` alias Omarchy's own shell does. Manual checklist.
- **Scale 1** — only scale 1.25 (current) was exercised. The grid is fitted to
  the window and unit-tested at other sizes; manual checklist.

### For Shannon to apply (optional)

Toggle keybind, `~/.config/hypr/bindings.lua` — `SUPER + CTRL + D` is taken by
Omarchy's Display panel (G-11), so:

```lua
o.bind("SUPER + CTRL + SHIFT + D", "Toggle Touchdeck", "omarchy-shell shell toggle shannon.touchdeck '{}'")
```

---

## Phase 2 — sensors and monitoring widgets ✅

Built:
- **The collector**: `bin/touchdeck-collect`. It never forks in its loop, and costs
  about 1.8 ms of CPU per frame.
- **Pure parsers and model**: `lib/{frame,procstat,meminfo,hwmon,amdgpu,nvidia,sensors,format,widgets}.mjs`.
- **The service**: `services/SensorsService.qml`. It owns both helpers, with pausing,
  backoff restarts, a SIGKILL watchdog and one update per interval.
- **Components**: gauge, meter, sparkline, frame and temperature readout.
- **Widgets**: CPU, GPU and Memory, at every size.
- **Fixtures**: three sysroots (one captured from this machine, two synthetic), plus
  `tools/capture-fixture.sh` for future hardware.
- **Test tooling**: a QML-engine parity test, and `tools/measure-budget.py`.

`tools/check.sh` runs 102 tests.

### Acceptance

- [x] **Values within tolerance of btop and nvidia-smi, idle and under load.** Deck vs
      independent readings taken at the same moment (5 samples each):

      | | idle, worst gap | under load (12 busy threads), worst gap | limit |
      |---|---|---|---|
      | CPU usage | 0.7 pts | 0.0 pts (100.0 vs 100.0) | 5 pts |
      | CPU temperature | 2 °C | 1 °C | 2 °C |
      | GPU temperature | 0 °C | 0 °C | 2 °C |
      | RAM, VRAM, GPU power | match to 0.05 GiB, the MiB, ~1 W | same | — |

      GPU *utilisation* can't be load-tested here: no GPU load generator is installed,
      and it's a bursty sampled counter that two readers disagree on in both
      directions. The parsing is exact; the under-load comparison is on the manual
      checklist (D-33).
- [x] **Killing the collector shows the stale state, then recovers on its own.**
      `kill -9`: back with a new pid within ~1 s — fast enough that the deck never
      goes stale (same for nvidia-smi). `kill -STOP` (a hung collector): stale after
      3 s with "△ N s ago" on each widget, killed by the watchdog at ~5 s, a new pid
      at ~5.5 s, fresh again. GPU readings kept updating while the collector was
      frozen. Found and fixed on the way: the watchdog originally sent SIGTERM, which a
      frozen process ignores (D-31).
- [x] **With the deck hidden, both helper processes are stopped.** `pgrep` for the
      collector and nvidia-smi finds nothing; `status` shows both "stopped"; summoning
      starts fresh ones. A layout with no monitoring widget never starts them.
- [x] **§15 budgets measured and recorded** (D-28):

      | Budget | Target | Measured |
      |---|---|---|
      | Added CPU, deck visible, 1 s interval | < 1 % of a core | **0.55 %** (0.87 % with reduceMotion; nvidia-smi varies) |
      | Added memory in omarchy-shell | < 60 MB | **~0** — 736.0 vs 735.7 MB Pss, plugin disabled vs enabled |
      | JS work per frame | < 2 ms | **0.13 ms** real fixture, 0.25 ms 32-thread, in Qt's engine |
      | Wakeups while hidden / unplugged / locked | none | **none**: no helper processes, stale timer stopped |
      | Dragging in edit mode | 60 fps | Phase 4 (the render probe that will measure it is in place) |

Every widget size and state was checked on the real display: 2×2 number + temperature,
3×3 gauge, 4×3+ with per-core bars / VRAM / power / fan / history, memory rings and
bars, shape-coded warn (△) and critical (▲) temperatures, "GPU 0000:09:00.0 not found",
and the dimmed stale state.

### Bugs found and fixed in Phase 2

| What | How it showed | Fix |
|---|---|---|
| Watchdog stopped helpers with SIGTERM | A frozen collector sat untouched for 11 s | SIGKILL (D-31) |
| A deliberate stop could be mistaken for a crash | Found while replacing `onExited` | Explicit stop flags; exits observed via `running` (D-25) |
| `padStart` (ES2017) in `lib/theme.mjs` | Would only fail at runtime in Qt's engine | Removed; parity test added (D-21) |
| Parity harness imported outside its config root | Quickshell blackholed the import | Throwaway config root per run (D-21) |
| `TempReadout.status` shadowed `DeckText.status` | qmllint property-override | Renamed `level` |
| A comment starting with "qmllint" | Parsed as a lint directive | Reworded |
| The deck drew ~2–3 updates per second | Found while chasing CPU | One update per interval; clock only when stale (D-30) |

I also misdiagnosed the CPU cost once: I blamed value easing, but per-window measurement
showed each redraw costs ~0.1 ms and the helpers dominate. The threshold easing (D-29)
stays as cheap insurance; the measurement method is what changed (D-28).

### Not covered, and why

- **AMD GPUs on real hardware** — none installed. Built and tested against synthetic
  sysroots from the kernel docs; run `tools/capture-fixture.sh` when the Radeon arrives.
- **GPU utilisation under load** — no load generator installed (D-33). Manual checklist.
- **The GPU picker in settings** — Phase 4's settings sheets. `gpu` and `vramGpu` accept
  a PCI address in either spelling today.

### For Shannon (optional)

- `sudo pacman -S shellcheck` to turn on the last skipped gate step.
- Run a game with the deck showing and compare its GPU numbers with `nvidia-smi dmon`.

---

## Phase 3 — audio, media, app keys, launching

Not started.
