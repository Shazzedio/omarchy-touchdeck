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
| `node --test` | the grid engine (including a 4 000-step fuzz), config handling, JSON error location, theme maths across every installed theme |
| collector fixtures | from Phase 2 |
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
- [ ] Widgets agree with `btop` / `nvidia-smi` under load: CPU within 5 %,
      temperatures within 2 °C *(from Phase 2)*.

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
