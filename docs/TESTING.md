# Testing

Two layers. `tools/check.sh` is the automated gate and must pass before any phase
is marked done. The manual checklist below is run on the real hardware at the end of
each phase (`DESIGN.md` §16), because the things most likely to go wrong on a
touch deck — mapping, focus, theming, hotplug — only show up on the device.

## The automated gate

```
tools/check.sh
```

| Step | What it catches |
|---|---|
| `omarchy plugin validate` | a manifest the installer would reject |
| no symlinks | a plugin folder the installer would reject |
| `qmllint` on every `.qml` | QML errors that otherwise only appear after a shell restart (hot reload does not work, `DECISIONS.md` D-1) |
| `qmllint` on every `lib/*.mjs` | JavaScript Node accepts but the QML engine refuses — this took the whole deck down once (D-10) |
| `node --test` | the grid engine (including a 4 000-step fuzz), config handling, JSON error location, theme maths across every installed theme, every sensor parser, the sensor model's exact figures, the widget registry, and the collector run for real against each fixture sysroot |
| QML-engine parity | the same scenario through `lib/` in Node and in a headless `qs`, results compared — catches a library method Qt's engine lacks, which linting can't (D-21). Needs a Wayland session |
| collector selftest | `bin/touchdeck-collect --selftest` produces two well-formed frames on this machine |
| `shellcheck` | skipped with a warning when not installed (D-8) |
| guards | `qs.*` imports outside the two adapters (D7), colour literals in QML, synchronous I/O in QML |

## Deploying to the running shell

Only after the gate exits 0 — gate on the exit code, not on grepping its output (D-10):

```
tools/check.sh \
  && rsync -a --delete --exclude .git --exclude docs ./ ~/.config/omarchy/plugins/shannon.touchdeck/ \
  && omarchy-restart-shell
```

Useful afterwards:

```
omarchy-shell shell call shannon.touchdeck status ''   # JSON: visibility, output, config health
qs log -p "$OMARCHY_PATH/shell" --tail 100 | grep -i touchdeck
hyprctl -j layers | jq '..|objects|select(.namespace?=="touchdeck")'
grim -o HDMI-A-1 /tmp/deck.png                          # what the deck actually drew
```

Escape hatch if the deck ever misbehaves: `omarchy plugin disable shannon.touchdeck`
then `omarchy-restart-shell`.

## Sensor fixtures

`tests/fixtures/sysroots/` holds miniature `/proc` + `/sys` trees the collector reads
via `TOUCHDECK_SYSROOT`: one captured from this machine, two synthetic (AMD, and
Intel + NVIDIA + AMD). See `tests/fixtures/README.md`.

- Capture a real one from whatever hardware is installed:
  `tools/capture-fixture.sh <name>` — e.g. `intel-nvidia-radeon` once the Radeon is in.
- Rebuild the synthetic ones: `python3 tests/fixtures/make_synthetic.py`.

## Measuring the budgets (§15)

With the deck visible:

```
tools/measure-budget.py 60
```

prints redraws per second, render time, JS per frame and the helpers' CPU, measured
where each happens rather than by sampling the whole shell — that doesn't work (D-28).
Memory: compare omarchy-shell's Pss (`/proc/<pid>/smaps_rollup`) with the plugin
disabled and enabled, each after a fresh `omarchy-restart-shell`.

## Manual checklist

Run at the end of each phase. Items marked *(from Phase n)* don't apply earlier.

### Display and input
- [ ] Tap all four corners and the centre; each lands where it looks like it lands.
- [ ] The deck is on the touch display only (`hyprctl layers`), below the bar, and
      reserves no space of its own (`hyprctl monitors` → `reserved` unchanged).
- [ ] Unplug and replug the display — see *Simulating hotplug* below. The deck goes
      dormant with a reason in `status`, then comes back on its own.
- [ ] `omarchy-restart-shell`: the deck comes back with no `summon`.
- [ ] Scale 1.25 (current) and scale 1: the grid fills the window at both.

### Theme (§8.5)
- [ ] Every installed theme, including light ones. Scripted: for each theme, set it,
      screenshot HDMI-A-1, and compare an empty-cell pixel with the theme's
      `colors.toml` background. Then eyeball at least one light and one monochrome
      theme for legible text, borders and status swatches.
- [ ] `omarchy display text size 16`, then back to 12: type grows, cells shrink a
      little (margins and gaps scale with the font), nothing clips.
- [ ] `omarchy font set <family>`, then back: the deck follows. (It binds the same
      `monospace` alias as Omarchy's own shell; this one restarts the shell.)

### Config (§12)
- [ ] A valid hand edit to `~/.config/touchdeck/config.json` applies live.
- [ ] Shrink the grid in the file: items that no longer fit are parked and the banner
      says how many; nothing is deleted.
- [ ] Break the JSON: the banner names the line, the layout stays, nothing is written.
- [ ] Restart the shell with the file still broken: the deck comes up on the *backup*
      layout, not the defaults (D-11).
- [ ] Fix the file: the banner clears with no restart.

### IPC (§13)
- [ ] `hide` removes the layer surface; `summon` restores it.
- [ ] `summon ... '{"edit":true}'` opens in edit mode (empty cells show "+").
- [ ] `toggle` flips visibility; `call ... toggleEdit`, `reloadConfig`, `status` answer.

### Session
- [ ] Lock and unlock: the deck is covered while locked and `status` shows
      `locked: true`; it returns after unlock. (Needs a person to unlock — not
      scripted.)
- [ ] Launch an app while the main monitor is focused and while it isn't
      *(from Phase 3)*.
- [ ] Widgets agree with `btop` / `nvidia-smi`, idle and under load: CPU within
      5 points, temperatures within 2 °C *(from Phase 2)*. CPU load:
      `for i in $(seq 12); do timeout 15 bash -c 'while :; do :; done' & done`.
      GPU load needs a game or benchmark — nothing is installed that makes one;
      compare against `nvidia-smi dmon` (D-33).

### Sensors *(from Phase 2)*
- [ ] `kill -9` the collector (`status` has its pid): it's back within ~1 s, and
      the deck doesn't even go stale. Same for nvidia-smi.
- [ ] `kill -STOP` the collector: widgets dim with "△ N s ago" after 3 s, the
      watchdog kills it at ~5 s, and a new one takes over. Then `kill -9` the
      frozen pid if it's somehow still there (it shouldn't be).
- [ ] `omarchy-shell shell hide shannon.touchdeck`, then
      `pgrep -f touchdeck-collect` and `pgrep -f query-gpu`: nothing. Summon: both back.
- [ ] A layout with no CPU/GPU/Memory widget runs no helpers at all.

## Simulating hotplug

`hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = true })'` disables the
output at runtime — a faithful unplug. **Re-enabling it with another `hyprctl eval`
does not work** on Hyprland 0.56.2 (the output stays unknown). Bring it back with
`hyprctl reload`, which re-applies `~/.config/hypr/monitors.lua` and re-adds the
output exactly as a real replug does. An empty workspace on that output disappears
while it's gone and comes back with it.

```
hyprctl eval 'hl.monitor({ output = "HDMI-A-1", disabled = true })'
omarchy-shell shell call shannon.touchdeck status ''    # dormant: true, with a reason
hyprctl reload
omarchy-shell shell call shannon.touchdeck status ''    # active again, output HDMI-A-1
```
