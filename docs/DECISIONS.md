# Decisions

One short entry per significant call: context, decision, consequence.
Locked decisions D1–D8 live in `DESIGN.md` §3 and need Shannon's agreement to change.

---

## Phase 0 ground truth

Recorded 10 September 2026 on Shannon's machine. Everything below was measured,
not assumed. The `[G-n]` items are facts; the `[D-n]` items are calls made.

### G-1 Versions

| Thing | Version | Note |
|---|---|---|
| Omarchy | `4.0.0.alpha` | `/usr/share/omarchy/version`. `OMARCHY_PATH=/usr/share/omarchy` |
| Hyprland | `0.56.2` (v0.56.2, commit efb5099, 2026-08-05) | Newer than the `0.55+` the design assumed |
| Quickshell | `0.3.1` (Arch package) | Shell runs as `quickshell -n -p /usr/share/omarchy/shell` |
| Node | 26.7.0 (mise) | Dev-only dependency, present |
| qmllint | present at `/usr/lib/qt6/bin/qmllint` | **not on `PATH`** |
| shellcheck | **absent** | See D-8 |
| inotifywait | present | The shell's plugin watcher depends on it |

### G-2 Hardware

- CPU: 12th Gen Intel Core i5-12400F, 12 logical CPUs.
- CPU temperature: `coretemp` at `hwmon4`, `temp1_label = "Package id 0"`,
  `temp1_input` in millidegrees. Per-core labels `Core 0`…`Core 5` on `temp2`…`temp7`.
  Index is not stable across boots — select by `name` + `label`, as Appendix A says.
- GPU: **NVIDIA RTX 4070 only**. PCI `0000:01:00.0`, vendor `0x10de`, drm `card1`.
  **No AMD card is installed** (§18 Q1 answered). AMD support still gets built and
  tested against fixtures per §2, but cannot be verified on hardware yet.
- Other hwmon: `acpitz`, three `nvme`, `r8169_0_300:00`, `iwlwifi_1`.

### G-3 Displays

| | DP-1 (main) | HDMI-A-1 (touch) |
|---|---|---|
| Hyprland description | `Microstep MSI G272CQP 0x00000082` | `Invalid Vendor Codename - RTK Verbatim MT14 demoset-1` |
| Quickshell `model` | `MSI G272CQP` | `Verbatim MT14` |
| Mode | 2560x1440@164.94 | 1920x1080@60 |
| Hyprland scale | 1 | **1.25** |
| Position | `0x0` | `512x1440` (below main) |
| Quickshell logical size | 2560x1440 | **1536x864** |
| Quickshell `devicePixelRatio` | 1 | **2** |

Two consequences:

- **The deck's logical canvas is 1536×864, not 1920×1080.** Quickshell reports
  `devicePixelRatio: 2` for a Hyprland scale of 1.25 (wl_output's legacy integer
  scale), while the *logical* geometry correctly reflects 1.25. Layout must be
  driven by the window's logical size, never by the mode.
  At 16×9 that gives a **96×96 logical cell** ≈ 120 physical px ≈ **19 mm** on a
  310 mm-wide 1920 px panel — comfortably above the 10 mm minimum in §10.
  `DeckTheme.touchScale` should therefore be calibrated against ~96, not the
  ~105 the design guessed from a scale-1 assumption.
  *(Measured in Phase 1: after the bar, margin and gaps the fitted cell is
  89×85 logical, about 17 mm. See D-17.)*
- Matching by description works: `"verbatim"` is a case-insensitive substring of
  Quickshell's `model`. Note Quickshell's `ShellScreen` exposes `name`, `model`,
  `serialNumber` — **there is no `description` or `manufacturer` property**, so
  `config.display.match.by: "description"` must match against `model` (plus
  `name` as a fallback).

Monitor rules are already explicit in `~/.config/hypr/monitors.lua`, inside a
`displaywright`-managed block. §5.5 needs no action from Shannon.

### G-4 Touch input — already configured

`~/.config/hypr/input.lua` already contains:

```lua
hl.config({ input = { touchdevice = { output = "HDMI-A-1" } } })
```

Touch device is `silicon-integrated-system-co.-sis-hid-touch-controller`.
**§5.4 is a no-op** — no config snippet is needed from Shannon.

### G-5 The plugin host contract (as implemented)

Read from `shell.qml` (the `Instantiator` over `panelEntries`, ~line 580) and
`services/PluginRegistry.qml`. Verified live with the Phase 0 spike.

- A `panel` entry point is loaded by a `Loader`. With `keepLoaded: true` the
  Loader is active from shell startup, so **the panel mounts at login and can
  open its own window with no `summon`** (§5.7 answered: no autostart line needed).
- The shell injects these onto the entry-point item **only if the item declares
  a property of that name**:
  `omarchyPath` (string), `shell` (the ShellRoot), `manifest` (the parsed
  manifest), `barWidgetRegistry`, `pluginRegistry`, and `service` (the matching
  `service` entry-point singleton, or null). Confirmed live: all present except
  `service`, which is null because the spike declares no `service` kind.
- Summon contract: `open(payloadJson)` receives the payload string **verbatim**;
  `close()` on hide; the host reads back a `opened` property to answer
  `isPluginOpen`. Payloads queue if summoned before the Loader resolves.
- `omarchy-shell shell call <id> <method> <arg>` reaches **any** function on the
  entry-point item and returns `String(result)`; a throw returns `"error"`, an
  unknown method returns `"unknown"`. No registration needed. (§13 answered.)
- Third-party plugins are enabled iff their id appears in `shell.json`;
  `omarchy plugin enable <id>` does that. `omarchy plugin enable` takes a
  *placement* argument, **not** `--yes` (`--yes` is only for `add`/`update`/`remove`).

### G-6 Verified live, as a third-party plugin

Every one of these was read out of the spike over `omarchy-shell shell call`:

- **Window on the touch display only.** `hyprctl layers` shows
  `HDMI-A-1 level=2 ns=touchdeck-spike 1536x838+512+1466` and nothing on DP-1.
  It sits **below the bar** (y offset 1440+26, height 864−26) because
  `exclusionMode: ExclusionMode.Normal` respects the bar's exclusive zone, and it
  **reserves nothing itself** (`hyprctl monitors` still shows `reserved=[0,26,0,0]`).
  Exactly the §5.2 behaviour, with no extra code.
- **Live theming, no reload code.** Cycled ristretto → catppuccin-latte → white →
  vantablack → retro-82 → nord → ristretto. `Color.background/foreground/accent/
  urgent`, `Color.popups.border`, `Style.cornerRadius` all updated in the running
  plugin within ~1 s of `omarchy theme set`, including both light themes.
  `omarchy display text size 16` moved `Style.fontBaseSize` to 16 and back.
  **§8.4's fallback hook is not needed.**
- **PipeWire from a third-party plugin.** `Quickshell.Services.Pipewire` imports and
  binds: read `HECATE G2 II GAMING HEADSET Analog Stereo` at 45 %. External changes
  land immediately — `wpctl set-volume 62%` and `set-mute 1` both showed up in
  under 1.5 s. `PwObjectTracker` is required to bind a node's `audio` sub-object.
- **MPRIS from a third-party plugin.** `Quickshell.Services.Mpris` imports and binds:
  playing a file in mpv produced `playerCount: 1, identity: "mpv",
  title: "Touchdeck Spike Test.wav"`; killing mpv dropped it back to 0 live.
- **IPC.** `summon` (payload delivered verbatim, including `{"edit":true}`), `hide`,
  `toggle` and `call` with a return value all work. The layer surface genuinely
  unmaps on `hide` and remaps on `summon`.

### G-7 Focus does follow the deck — mitigation required

**Answered (§5.6): yes.** With focus on DP-1, moving the pointer onto the deck's
layer surface moved Hyprland's focused monitor to HDMI-A-1, and Quickshell's
`Hyprland.focusedMonitor` reported the change live. So `HyprService` must
implement the §5.6 mitigation: remember the last focused non-deck monitor and
restore focus to it ~250 ms after the last touch.

The spike's tracking of "last focused non-deck monitor" works and the restore
dispatcher exists (see G-8).

**Confirmed with a real finger** (start of Phase 1): Shannon tapped all four corner
targets and the centre pad. Every tap logged `focus=HDMI-A-1`, and focus returned to
DP-1 only when the pointer went back. All five taps landed inside their targets;
the furthest from centre was 22 px off on a 360 px pad, which is finger placement,
not mapping error. Touch mapping (G-4) is accurate across the whole surface.

### G-8 Hyprland dispatch from Lua

`hyprctl dispatch '<lua>'`, confirmed working:

- `hl.dsp.focus({ monitor = "DP-1" })` — **this is the monitor-focus form.**
  There is no `focusmonitor`/`focus_monitor`; `hl.dsp.focus` takes
  `direction`, `monitor` or `workspace`.
- `hl.dsp.cursor.move({ x = …, y = … })` — pointer move (used for the G-7 probe).
- Full `hl.dsp` surface on 0.56.2: `cursor` (table: `move`, `move_to_corner`),
  `dpms`, `event`, `exec_cmd`, `exec_raw`, `exit`, `focus`, `force_idle`,
  `force_renderer_reload`, `global`, `group` (table), `layout`, `no_op`, `pass`,
  `release_input_capture`, `send_key_state`, `send_shortcut`, `submap`,
  `window` (table), `workspace` (table).

Omarchy's own bar dispatches the same way
(`plugins/bar/widgets/Workspaces.qml:35`), so this is the sanctioned form.

### G-9 App launching

`shell/services/AppLibrary.qml:85` is the first-party launch path:

```
uwsm-app -- gtk-launch <desktop-id>.desktop
```

run through `Util.execDetached`, i.e. `Quickshell.execDetached(["bash","-lc",cmd])`.
The `.desktop` suffix is kept deliberately (ids like `org.telegram.desktop`), and
`gtk-launch` rather than `uwsm app --` because it handles ids with spaces and
entries uwsm rejects. `LaunchService` must copy this exactly (D8).

### G-10 `nvidia-smi` fields verified

Driver/NVML **610.57.04**. The Appendix A query runs unchanged and streams one
CSV line per GPU per interval:

```
nvidia-smi --query-gpu=index,pci.bus_id,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed --format=csv,noheader,nounits -lms 1000
0, 00000000:01:00.0, NVIDIA GeForce RTX 4070, 98, 6751, 12282, 71, 144.92, 59
```

**Gotcha for the parser:** `pci.bus_id` is `00000000:01:00.0` (8-digit domain),
while the sysfs `device` symlink resolves to `0000:01:00.0` (4-digit). GPU keys
must be normalised to one form before NVIDIA and drm data can be joined.

### G-11 Keybind conflict

**`SUPER + CTRL + D` is already bound** to Omarchy's Display panel
(`omarchy-shell shell toggle omarchy.monitor`), so Appendix C's suggested toggle
binding cannot be used as written. Free, checked against `hyprctl binds`:
`SUPER + CTRL + SHIFT + D` and `SUPER + CTRL + SHIFT + T`.

---

## Calls made in Phase 0

### D-1 Deviation: a `keepLoaded` panel does **not** hot-reload on save

**Context.** `shell/README.md` says "Saving a file anywhere under
`~/.config/omarchy/plugins/` reloads plugin code automatically", and the shell
does implement it: an `inotifywait` watcher fires `localPluginChanged`, which
runs `reloadPlugins()` → `unloadPanels()` → `Qt.clearComponentCache()` → rescan.

**What actually happens.** The reload fires reliably (the shell log shows
`Local plugin changed, reloading: shannon.touchdeck-spike` on every save, and
every other plugin visibly re-registers), but **the plugin's QML is re-served
from the engine's component cache**, so code changes do not take effect. A
literal `readonly property string buildStamp` edited on disk still read as its
old value after a save, after 14 s, and after an explicit
`omarchy-shell shell rescanPlugins`. After `omarchy-restart-shell` it read the
new value immediately. Reproduced twice.

**Decision.** The development loop is: edit → `omarchy-restart-shell` → verify.
`tools/check.sh` and the Node test suite carry as much verification as possible
so that most iterations never need a shell restart. This is the §14 question
answered, and a deviation from the installed README worth reporting upstream.

**Consequence.** Slower QML iteration (~12 s per cycle) and a brief bar/notification
blink on each restart. It also means any QML syntax error is only discovered at
restart, which raises the value of the `qmllint` gate in `tools/check.sh`.

### D-2 Screen matching goes against `model`, not `description`

**Context.** §5.1 specifies `{ "by": "description", "value": "Verbatim" }`, but
Quickshell's `ShellScreen` has no `description` property (G-3).

**Decision.** Keep `by: "description"` as the config spelling (it is what the user
means, and it matches Hyprland's vocabulary), and have the matcher test the value
as a case-insensitive substring of `model + " " + name`. `by: "name"` matches
`name` exactly.

**Consequence.** The documented config shape is unchanged; only the implementation
differs from the design's wording. Matching `"Verbatim"` selects HDMI-A-1 today.

### D-3 Touch scale calibrates against a 96 px cell

**Context.** §8.3 defines `touchScale = clamp(cellSize / 105, 0.8, 1.8)`, derived
from an assumed 1920×1080 logical canvas. The real canvas is 1536×864 (G-3), so a
16×9 grid yields 96 px cells and that formula would sit at 0.91 — shrinking the
type on a display meant to be read at arm's length.

**Decision.** Calibrate against the real cell: `touchScale = clamp(cellSize / 96,
0.8, 1.8) × config.appearance.scale`. The clamp and the config multiplier are
unchanged.

**Consequence.** `touchScale` lands at 1.0 on this hardware, and still tracks
Omarchy text-size changes through `Style.font.*`. Revisit if Shannon changes the
display scale; §16's manual checklist already covers scale 1.25 (which is what is
running) and should add scale 1.

### D-4 Deck reserves nothing and respects the bar — keep the bar on both screens

**Context.** §18 Q2. Shannon chose to leave the Omarchy bar on the touch display.

**Decision.** `exclusionMode: ExclusionMode.Normal` with all four anchors. No
`screens` restriction on the bar is needed, so nothing in `shell.json` changes.

**Consequence.** The deck's canvas is 1536×838 (864 − 26 for the bar). The grid is
fitted to the window's actual logical size, so nothing else has to know.

### D-5 Launch target: last focused non-deck monitor

**Context.** §18 Q3. Shannon chose the plan's proposal.

**Decision.** `HyprService` tracks `Hyprland.focusedMonitor`, ignoring the deck's
own output, and keeps the most recent other monitor. `LaunchService` dispatches
`hl.dsp.focus({ monitor = <that> })`, then launches. Verified working in the spike
(G-7, G-8).

**Consequence.** This mechanism is shared with the §5.6 focus-restore mitigation,
so both come from one piece of state.

### D-6 Plugin id stays `shannon.touchdeck`

**Context.** §18 Q5. Shannon chose to keep the placeholder.

**Decision.** `manifest.json` uses `shannon.touchdeck`; the plugin installs to
`~/.config/omarchy/plugins/shannon.touchdeck/`. Rename before any marketplace
publish (Phase 5, optional).

**Consequence.** A later rename means a new directory and one
`omarchy plugin enable` — cheap, because `config.json` lives in
`~/.config/touchdeck/` and is not keyed by plugin id.

### D-7 Keybinds proposed as `SUPER + CTRL + SHIFT + D`

**Context.** Appendix C's `SUPER + CTRL + D` collides with Omarchy's Display panel
(G-11).

**Decision.** Propose `SUPER + CTRL + SHIFT + D` for toggle. Edit mode is reachable
by long-press on the deck and over IPC, so a second keybind is optional;
`SUPER + CTRL + SHIFT + T` is free if Shannon wants one.

**Consequence.** Shannon applies the snippet by hand at the end of Phase 1, once
there is something worth toggling.

### D-8 `shellcheck` is optional in `tools/check.sh`

**Context.** `shellcheck` is not installed (G-1), but §16 lists it as a gate.

**Decision.** `tools/check.sh` runs `shellcheck` when present and skips it with a
loud, non-fatal warning when absent, so the gate never blocks on a missing
dev-only tool. It runs `qmllint` from `/usr/lib/qt6/bin` when not on `PATH`.

**Consequence.** Shannon can get full coverage with `sudo pacman -S shellcheck`;
until then the bash collector is still covered by the fixture-driven collector
test (§16 item 4), which is the check that actually matters.

### D-9 `qmllint` needs a `qs` import shim

**Context.** `qs.Commons` and `qs.Ui` are declared by `qmldir` files under
`$OMARCHY_PATH/shell/{Commons,Ui}`, but the module path is `qs.*` — Quickshell
maps the config root to `qs` at runtime. `qmllint -I $OMARCHY_PATH/shell` cannot
resolve them.

**Decision.** `tools/check.sh` builds a throwaway directory containing a single
symlink `qs -> $OMARCHY_PATH/shell` and passes that as the import path. The shim
lives outside the repo, so §14's no-symlinks-in-the-plugin-folder rule is not
violated.

**Consequence.** `qmllint` resolves both modules. Two warning classes remain and
are filtered as known-benign: grouped-property access through `QtObject`
properties (`Style.font.family`, `Color.popups.border` — qmllint cannot see
through a `QtObject` property, and Omarchy's own code trips the same warning),
and `PanelWindow is not creatable` (it is created by Quickshell, not QML).

---

## Calls made in Phase 1

### D-10 `lib/` must stay inside the QML engine's JavaScript dialect

**Context.** `lib/*.mjs` runs in two engines: Node for the tests, and Qt's QML
engine inside the shell. They accept different JavaScript. Object spread
(`{ ...a }`, ES2018) is fine in Node and a *syntax error* in the QML engine. The
JSON error locator used it; every Node test passed, and on restart the shell logged
`Script .../lib/config.mjs unavailable`, which took the **whole deck** down
(`call ... status` returned `unknown`).

**Decision.** No object spread in `lib/` — use `Object.assign`. `tools/check.sh`
now runs `qmllint` directly on every `lib/*.mjs`, which parses it with the QML
engine's parser and fails on exactly this (verified: a one-line spread module
exits 255 with `Unexpected token '...' [syntax]`).

**Consequence.** Node-only syntax fails the gate instead of the touch display.
Also fixed: my deploy one-liner gated on `grep` finding "FAIL" in the check output,
which *succeeds* when the check fails. Deploys now gate on `check.sh`'s exit code.

### D-11 A cold start on a broken `config.json` restores the backup, not the defaults

**Context.** §12 says broken JSON must not lose the layout. Within a session that
held — the last good config stays in memory. But after `omarchy-restart-shell` (or
a login) on a broken file there *is* no last good config in memory, and the deck
fell back to the defaults: the user's layout was effectively gone until they fixed
the file. `config.json.bak` was being written on every good load and never read.

**Decision.** When the first load of a session fails to parse, `ConfigStore` reads
`config.json.bak` and runs on that, still showing the banner and still refusing to
write. If the backup is missing or also broken, the defaults stand.

**Consequence.** Verified: restarted the shell on a deliberately broken file whose
backup held an 8×6 hand edit; the deck came up on the 8×6 layout (3 items parked),
with the banner reading `config.json line 4: expected a property name, found ','`.

### D-12 A config file that vanishes mid-session is rewritten, not reset

**Context.** A missing file means "first run, write the defaults". Applied
mid-session, that rule would replace someone's layout with the defaults the moment
the file was deleted or truncated — by accident, by an editor's save dance, or by a
sync tool.

**Decision.** Defaults are written only if nothing has loaded yet this session.
After that, a missing or empty file gets the in-memory layout written back, with a
log line saying so.

**Consequence.** Deleting `config.json` is no longer a "reset to defaults" gesture.
If that is wanted later it should be an explicit IPC method, not a side effect.

### D-13 JSON errors are located by our own scanner

**Context.** §12's banner promises "config.json line 42: unexpected ','". Node's
`JSON.parse` reports a position; the **QML engine's reports only `Parse error`** —
no position, nothing to put in a banner.

**Decision.** `lib/config.mjs` has a small tokenizer plus recursive-descent
validator (`locateJsonError`) that runs only after `JSON.parse` has already failed,
and reports the line and column of the token it found, with messages written for
the mistakes people actually make: `trailing ',' before '}'`, `JSON needs double
quotes`, `unterminated string`, `expected ',' or '}'`.

**Consequence.** It always points at the token *found*, consistently — so a missing
`:` after `"a"` on line 2 reports the `}` on line 3. Covered by
`tests/jsonerror.test.mjs`, which also asserts every case really is invalid JSON so
the tests can't pass vacuously.

### D-14 Status-colour legibility is two questions, not one

**Context.** §8.3 takes ok/warn/critical from the theme's `green`/`yellow`/`red`.
Measured across all 22 installed themes, several make those unusable: `lumon` is
three blues, `hackerman` three greens, `white` and `vantablack` greyscale, and
`everforest`/`osaka-jade` put green and yellow side by side. On a monitoring deck, a
critical temperature that looks normal is a functional failure.

**Decision.** `DeckTheme` exposes `criticalDistinct` and `warnDistinct` separately
(threshold 0.10 on a channel-weighted RGB distance), because they have different
consequences: when critical isn't distinct, widgets must add a non-colour cue
(weight, a marked track); when only warn blurs into ok, that band needs the cue.
The four monochrome themes come out critical-blind.

**Consequence.** The theme test asserts invariants — the monochrome themes are
caught, the clearly hued ones aren't — rather than pinning the full roster, because
`gruvbox` sits 0.0015 above the threshold and a cosmetic upstream tweak would
otherwise fail the suite. Phase 2 widgets consume these flags.

### D-15 Grid tiles mount through `Loader.setSource`

**Context.** With `Loader.sourceComponent`, the only hook to hand a tile its
`theme` is `onLoaded`, which runs after the tile's bindings first evaluate — so
every tile spent its first frame dereferencing a null theme (a burst of
`TypeError`s in the shell log on every load).

**Decision.** `DeckGrid` takes a `delegateSource` URL and mounts tiles with
`setSource(url, { theme, entry })`, which sets those properties before the first
binding. `editing` and `cellSize`, which change over a tile's life, are bound in
`onLoaded`.

**Consequence.** Clean logs. Phase 2's widget registry maps widget type to a URL,
which fits this naturally.

### D-16 First-run app keys are filled in Phase 3, not Phase 1

**Context.** §6 has first run fill three keys from the default browser, file
manager and terminal. That needs process calls (`xdg-settings`, `xdg-mime`) and a
desktop-entry resolver — which is `AppsService`, a Phase 3 deliverable.

**Decision.** The default layout carries the three app keys with a one-shot
`settings.defaultRole` of `browser`, `files` or `terminal`. Phase 3's `AppsService`
resolves each to a desktop id the first time it can, then clears the hint.

**Consequence.** No throwaway discovery code in Phase 1, and the layout on disk is
already the final shape.

### D-17 Cells are fitted, not square: 89×85 logical on this display

**Context.** D-3 estimated 96 px cells from the logical canvas alone. The real grid
also loses the bar (26 px), a margin and 15/8 gaps.

**Decision.** Keep the grid fitted to the window, not forced square. On
HDMI-A-1 today: **89×85 logical ≈ 111×106 physical px ≈ 17 mm**, still far above
§10's 10 mm floor. `touchScale` is computed from the window size rather than the
fitted cell (the grid's gap and margin come *from* `touchScale`, so deriving it from
the cell would be circular); it lands at 0.97.

**Consequence.** A "2×2" key is 184×176, very slightly wide. Invisible in practice.

### D-18 Development install is a copy, not a symlink

**Context.** §14 suggests making the plugin path a symlink to the working copy.
Hot reload doesn't work anyway (D-1), and the repo holds `docs/` and `.git`, which
don't belong in an installed plugin.

**Decision.** Deploy is `rsync -a --delete --exclude .git --exclude docs` into
`~/.config/omarchy/plugins/shannon.touchdeck/`, then `omarchy-restart-shell` — and
only after `tools/check.sh` exits 0.

**Consequence.** What runs is exactly what passed the gate.
