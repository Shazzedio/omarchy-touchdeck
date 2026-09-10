# Progress

Current phase: **Phase 1 complete — awaiting Shannon's go for Phase 2.**

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

## Phase 2 — sensors and monitoring widgets

Not started. First step per §16: capture real fixtures from this machine
(`/proc/stat`, `/proc/meminfo`, hwmon, drm, `nvidia-smi` lines).
