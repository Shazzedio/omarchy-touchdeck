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

## Driving the deck from a script

`intent` runs the same service intents the widgets call (DECISIONS.md D-34). It
verifies the service side; the touch layer still needs a finger.

```
call() { omarchy-shell shell call shannon.touchdeck intent "$1"; }
call '{"do":"volume","value":0.6}'           # and "mute", "mic"
call '{"do":"outputs"}'                        # the output list as JSON
call '{"do":"output","name":"alsa_output…"}'   # switch output
call '{"do":"sheet"}'                          # open the output sheet (tap outside to close)
call '{"do":"play-pause","player":"mpv"}'      # and "next", "previous"
call '{"do":"seek","player":"chromium","seconds":90}'
call '{"do":"launch","id":"t","settings":{"command":"foot sleep 5"}}'

# Edit mode (D-47): the same calls the edit overlay and sheets make.
call '{"do":"edit","on":true}'                 # or false; no "on" toggles
call '{"do":"items"}'                          # page 0 as JSON
call '{"do":"move","id":"cpu-1","col":6,"row":5}'   # "rejected" if it overlaps or leaves the grid
call '{"do":"resize","id":"mem-1","w":2,"h":2}'     # within the widget's min/max
call '{"do":"remove","id":"key-1"}'; call '{"do":"undo"}'   # undo only within 5 s
call '{"do":"add","type":"cpu","col":6,"row":4}'    # prints the new id
call '{"do":"set","id":"cpu-2","settings":{"tempWarn":70}}'   # null deletes a key
call '{"do":"place","id":"…"}'                 # a parked item
call '{"do":"settings","id":"key-1"}'          # open a sheet, for a screenshot
call '{"do":"add-sheet","col":8,"row":4,"tab":"apps"}'   # tab: widgets | apps | custom
call '{"do":"longpress","x":300,"y":380}'      # the bubble, at a point in the window
call '{"do":"close-sheet"}'
```

Snapshot `~/.config/touchdeck/config.json` before scripting edits, and compare after.

`status` reports every service: `audio`, `media` (with the chosen player's position),
`apps`, `launch`, `hypr`.

## Simulating a touch's focus change

A touch on the deck moves Hyprland's focus to its output without moving the pointer.
`hl.dsp.focus` warps the pointer and moving the pointer refocuses a monitor, so the
only faithful simulation is with warping briefly off (G-12). Always put it back:

```
trap 'hyprctl eval "hl.config({ cursor = { no_warps = false } })"' EXIT
hyprctl eval 'hl.config({ cursor = { no_warps = true } })'
hyprctl dispatch 'hl.dsp.focus({ monitor = "HDMI-A-1" })'   # the "touch"
sleep 0.7; hyprctl -j monitors | jq -r '.[]|select(.focused)|.name'   # DP-1 again
```

## Media players for testing

- mpv: `mpv --no-video --idle=yes some.wav`.
- A Chromium tab, in a throwaway profile so nothing touches a real one: a local page
  with an `<audio>` element and `navigator.mediaSession` metadata and `seekto` handler,
  opened with `chromium --user-data-dir=<tmp> --no-first-run
  --autoplay-policy=no-user-gesture-required --app=file://<page>`.
- Spotify needs an account, so it's manual.

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

### Motion *(from Phase 5, D-49)*
- [ ] `appearance.reduceMotion: true`, or Hyprland's `animations.enabled = false`
      (followed at start and on config reload, not a live `eval`: G-19).
      `status.motion.reduced` is true, and values jump instead of gliding.
      Scripted: read `status.render.frames`, change the volume by 16 points, wait
      0.6 s and read it again. Expect about 9–16 frames normally and 1–3 reduced.

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

### Touch *(from Phase 3; needs a finger — nothing installed can tap a Wayland surface)*
- [ ] App key: pressing depresses it at once with an accent edge; releasing launches;
      "Opening…" until the window appears. Holding past half a second doesn't launch.
      Dragging off the key cancels.
- [ ] Tap an app key, then type straight away: keystrokes go to the main monitor's
      window, not into nothing (the focus return, D-35).
- [ ] A key with "Ask before launching": the first tap says "Tap again to open".
- [ ] A 1×1 key is comfortable to hit.
- [ ] Volume fader: drag from anywhere on it moves the level relatively (no jump); a
      tap on the track jumps; the mouse wheel steps. Hold the fader with one finger
      and tap Mute with another.
- [ ] Mute and mic buttons flip, and the volume keys / Omarchy's audio panel show it.
- [ ] Output button opens the sheet; picking an output switches; tapping outside closes it.
- [ ] Media: play/pause, previous, next; drag the seek bar (it follows the finger, seeks
      on release); tap the player chip to cycle players. With Spotify too.
- [ ] Touches near the deck's edges aren't swallowed by hyprgrass gestures (G-16).

### Edit mode *(from Phase 4; needs a finger)*
- [ ] Hold anywhere for ~0.7 s: a bubble offers "Edit layout", plus "Key settings" on
      an app key. Nothing changes by itself. Tapping outside the bubble closes it and
      doesn't launch the key underneath.
- [ ] Hold the volume fader still, then drag: the bubble appears, then closes as the
      finger moves. The fader follows.
- [ ] Right-click does what a long-press does.
- [ ] In edit mode, drag a tile: the ghost snaps to cells, turns the urgent colour over
      another tile, and a bad drop snaps back. The corner grip resizes within limits.
- [ ] × removes; Undo within 5 s puts it back in the same place.
- [ ] Tap an empty cell: the add sheet opens there. Add a widget, an app (rail and
      list, no typing), and a custom command.
- [ ] Tap a tile: its settings. Change a stepper, a choice and a switch; the widget
      follows at once. Pick a different app for a key.
- [ ] Tap the search field: typing goes to the deck, not the main monitor. Tap Done or
      Enter, and typing goes back to the main monitor.
- [ ] A key for an uninstalled app: a tap opens its settings (D-48).
- [ ] Leave edit mode alone for a minute: it exits by itself. With a sheet open, it
      doesn't.
- [ ] Rebuild the default layout from an empty page, by touch only (Phase 4 acceptance).
- [ ] Budget while dragging: `tools/measure-budget.py 20` while dragging a tile around
      continuously. Redraws should hold near 60/s, with render time per frame well
      under 16 ms.

### Media art *(from Phase 4, D-46)*
- [ ] Skip a Spotify track: the new cover appears within a second or two, and
      `ls $XDG_RUNTIME_DIR/touchdeck/art` has one more file (at most 30).

### Sensors *(from Phase 2)*
- [ ] `kill -9` the collector (`status` has its pid): it's back within ~1 s, and
      the deck doesn't even go stale. Same for nvidia-smi.
- [ ] `kill -STOP` the collector: widgets dim with "△ N s ago" after 3 s, the
      watchdog kills it at ~5 s, and a new one takes over. Then `kill -9` the
      frozen pid if it's somehow still there (it shouldn't be).
- [ ] `omarchy-shell shell hide shannon.touchdeck`, then
      `pgrep -f touchdeck-collect` and `pgrep -f query-gpu`: nothing. Summon: both back.
- [ ] A layout with no CPU/GPU/Memory widget runs no helpers at all.

## README screenshots

Taken from the live deck, with no real album art in the repository (D-51):

1. Snapshot `config.json`.
2. Start a silent, muted demo track:
   `mpv --no-video --mute=yes --loop=inf --force-media-title="Night Drive" demo.ogg`.
   Make `demo.ogg` with `ffmpeg -f lavfi -i anullsrc -t 600 demo.ogg`.
3. `intent '{"do":"set","id":"media-1","settings":{"preferredPlayer":"mpv"}}'`.
4. `grim -o HDMI-A-1` the deck. Then `edit`, `settings` and
   `add-sheet ... "tab":"apps"`, one at a time.
5. Restore the snapshot, and stop mpv.
6. `magick in.png -strip -resize 1600x out.png` into `docs/screenshots/`.

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
