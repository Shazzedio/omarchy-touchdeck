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

---

## Calls made in Phase 2

### D-19 The widget registry is a pure module, not a QML file

**Context.** §7 puts the registry in `widgets/WidgetRegistry.qml`. It holds sizes,
defaults and the settings schema that Phase 4's editor and settings sheets are
generated from — exactly the rules that most need tests.

**Decision.** `lib/widgets.mjs`: type → `{ displayName, source, minSize,
defaultSize, maxSize, defaultSettings, settingsSchema }`, plus `specFor`,
`clampSize` and `settingsFor`. `DeckGrid` resolves `source` against the plugin
root and mounts it. Phase 3's types are registered now and point at the
placeholder until they're built.

**Consequence.** `tests/widgets.test.mjs` checks every spec is coherent, every
source exists on disk, the registry and `config.mjs` agree on the type list, and the
default layout respects every size limit.

### D-20 Status is shape-coded as well as coloured

**Context.** D-14 found four themes where critical can't be told from normal by
colour. Colour alone also fails colour-blind users on *every* theme.

**Decision.** Temperatures carry a glyph: none when ok, `△` at warn, `▲` at critical,
and critical is bold. Colour reinforces the shape rather than carrying the
meaning. The same `△` marks a stale widget's age.

**Consequence.** `criticalDistinct` / `warnDistinct` stay available for widgets that
have no room for a glyph; the readouts built so far don't need them.

### D-21 lib/ is checked in Qt's QML engine, not just linted

**Context.** D-10's lint step catches syntax the QML engine rejects, not a library
method it lacks — that parses fine and fails at runtime, inside the shell.
`padStart` (ES2017) had already crept into `theme.mjs`.

**Decision.** `tests/parity.test.mjs` runs one deterministic scenario through
`lib/` — all three fixture sysroots, formatters, theme maths, config errors, grid
geometry — in Node and in a headless `qs`, and requires identical results (to nine
significant digits, since `Math.pow` may round differently). Quickshell resolves
imports that escape a config's root to `qrc:/qs-blackhole`, so each run builds a
throwaway config root containing copies of `lib/` and the scenario. Skipped when
there's no `qs` or no Wayland session.

**Consequence.** Runs in ~150 ms and passes. `padStart` was replaced anyway.

### D-22 Collector frame format: millisecond timestamps, driver on @drm

**Context.** Appendix A's example shows a nanosecond timestamp and `@drm <pci>
<vendor>`.

**Decision.** `@frame <unix-ms>` (from `$EPOCHREALTIME`, locale-proof), and
`@drm <pci> <vendor> <driver>`. The PCI address comes from the device's `uevent`
(`PCI_SLOT_NAME`), so no `readlink` fork is needed to resolve the symlink. The
collector never forks in its loop: file reads use `read`, the sleep is `read -t` on
an unwritten pipe, each frame is written in one `printf`, and pacing is against a
deadline so frames arrive on a steady clock.

**Consequence.** Measured on this machine: 100 frames cost 0.18 s of CPU, about
1.8 ms per frame — roughly 0.2 % of a core at the default 1 s interval.

### D-23 CPU temperature: Tdie over Tctl on Ryzen

**Context.** Appendix A says k10temp → "Tctl" (or "Tccd*"). On Ryzens that expose
both, Tctl carries an offset of up to 20 °C for fan control and Tdie is the real die
temperature.

**Decision.** Prefer `Tdie`, then `Tctl`, then the hottest `Tccd`. coretemp uses the
hottest `Package id N`, then the hottest `Core N`. Readings outside −40…150 °C are
treated as glitches.

### D-24 GPU junction temperature warns 15 °C above the edge thresholds

**Context.** AMD cards report junction (hotspot) as well as edge. Junction runs well
above edge in normal use; using the edge thresholds would put it permanently in the
warning band.

**Decision.** The junction readout warns and goes critical 15 °C above the widget's
`tempWarn` / `tempCrit` (95 / 105 °C at the defaults, under amdgpu's usual 110 °C
junction limit). No separate setting for v1.

### D-25 The sensor helpers run only when something needs them

**Decision.** `SensorsService.active` is the deck's `active` (visible, display
present, not locked) **and** at least one CPU, GPU or Memory widget on the page.
`nvidia-smi` additionally needs an NVIDIA card in the collector's drm list. Stopping
resets the model, so the deck never shows last session's numbers as "stale" on the
way back. Helper exits are observed through `running`, and stops *we* initiate set a
flag so they aren't mistaken for crashes; a helper that is silent for five intervals
(a hung driver can block a sysfs read) is killed and restarted with the §15 backoff.

**Consequence.** A deck of only app keys runs no helper processes at all.

### D-26 "nvidia-smi not installed" is a marker line, not an exit code

**Context.** The widget should say exactly why there's no GPU data. Reading the exit
code needs the `exited` signal's parameters, one of which is a `QProcess` enum
qmllint can't resolve.

**Decision.** nvidia-smi is started through `bash -c 'command -v nvidia-smi || { echo
@touchdeck:nvidia-smi-missing; exit 127; }; exec nvidia-smi "$@"'`. The marker line
sets the "missing" state; `exec` means the long-running process is nvidia-smi itself.

### D-27 Gauges use Qt's curve renderer

**Decision.** `ArcGauge` and `Sparkline` use `Shape.CurveRenderer` (Qt 6.11), not a
4× multisampled layer, which would cost an offscreen texture per widget against §15's
memory budget.

### D-28 The CPU budget is measured per part, not by sampling the shell

**Context.** §15's CPU budget is 1 % of one core for the collector, nvidia-smi and
the QML together. The obvious measurement — omarchy-shell's CPU with the deck
visible minus hidden — is useless here: the shell runs Qt's *basic* render loop
(there is no per-window render thread), so the deck shares one GUI thread with the
bar and every other plugin, and three identical 30 s rounds gave the deck +0.13 %,
+3.0 % and +2.8 %. Only the hidden baseline was stable. A standalone Quickshell
instance hosting just the deck would isolate it, but in Quickshell's config-root
mode `import "services"` failed with "SensorsService is not a type" (the plugin
itself, loaded by URL inside omarchy-shell, is unaffected; see D-32).

**Decision.** Measure each part where it happens, and keep the probe permanently:

- **render** — `Deck.qml` counts frames on its own window (`beforeSynchronizing` →
  `frameSwapped`) and reports `render: { frames, busyMs, at }` in `status`
- **JS** — `SensorsService.frameCostMs`, the rolling cost of applying a frame
  including the bindings it re-evaluates
- **helpers** — CPU time of the collector and nvidia-smi from `/proc`

`tools/measure-budget.py` samples all three.

**Result** (60 s windows, default layout, this machine):

| | redraws | per redraw | render | JS | helpers | **total** |
|---|---|---|---|---|---|---|
| easing on (threshold 8) | 5.7 /s | 0.12 ms | 0.07 % | 0.02 % | 0.47 % | **0.55 %** |
| reduceMotion | 2.0 /s | 0.17 ms | 0.03 % | 0.02 % | 0.82 % | **0.87 %** |

Within budget either way. The helpers dominate and nvidia-smi is the variable one
(0.3–0.6 % across runs); the collector is a steady ~0.2 %. JS per frame inside Qt's
engine, benchmarked separately over 2 000 frames: 0.13 ms on this machine's real
fixture, 0.25 ms on the 32-thread one (budget 2 ms).

**Consequence.** Honest limits: the probe times sync, render and swap, not polish
(text layout) or Wayland event handling, both small. The whole-shell A/B means
sat above the probe's figure but inside that method's noise, so they can neither
confirm nor refute it. Memory, measured the only way that isolates it (shell Pss
with the plugin disabled vs enabled, fresh restarts): 736.0 MB vs 735.7 MB — the
deck is lost in the noise, far under 60 MB.

### D-29 Easing only for changes of 8 points or more

**Context.** §9 asks for 250 ms value easing. With once-a-second sensor data every
small wobble eased, keeping the deck redrawing at 60 fps for a quarter of every
second. D-28 later showed each redraw costs ~0.1 ms, so this was never the CPU
problem it first looked like — but it is still 15 redraws for a change nobody can see.

**Decision.** `EasedValue` eases a change only when it is at least
`DeckTheme.easeThreshold` (8) points; smaller ones land. `reduceMotion` turns all
easing off.

### D-30 One update per interval

**Decision.** nvidia-smi lines are held and folded into the next collector frame, so
both sources land in one update. The always-on 1 s clock is gone: a single-shot
`staleTimer` is pushed back by every frame and only fires when a frame is overdue,
then ticks each interval (updating the stale state, "N s ago", held GPU lines and
the watchdog) until frames return. A hidden label no longer changes every second.

**Consequence.** GPU readings lag by up to one interval. If the collector stops,
held nvidia-smi lines are applied on the stale timer, so the GPU widget keeps moving.

### D-31 The watchdog uses SIGKILL

**Context.** Stopping a Quickshell `Process` sends SIGTERM. A frozen collector
(simulated with SIGSTOP) never acted on it: same PID, still "running", for as long as
the test ran (11 s).

**Decision.** `Process.signal(9)`. Verified: stale at 3.5 s, killed at 5 s, a new
PID at 6 s, fresh again; the frozen process is gone. A process in uninterruptible
sleep (a truly hung sysfs read) can't be killed by anything until the read returns;
the deck then shows stale, which is the truth.

### D-32 Known limitation: the deck doesn't load as a standalone Quickshell config

**Context.** Found while trying to isolate CPU (D-28). Copied into a fresh Quickshell
config root with Omarchy's `Commons` and `Ui` beside it, `Deck.qml`'s
`SensorsService { }` failed with "is not a type"; `ConfigStore` from the same
directory loaded fine. Inside omarchy-shell, where the plugin is loaded by file URL,
everything loads.

**Decision.** Not pursued: it doesn't affect the plugin as shipped. It *would*
matter for Appendix B's standalone fallback host, so it's recorded here for whoever
reaches for that.

### D-33 GPU utilisation can't be checked under load on this machine

**Context.** §17 asks for values within tolerance of nvidia-smi idle and under load.
No GPU load generator is installed (`vkcube`, `glmark2`, `vkmark`, `glxgears` all
absent). GPU utilisation is also a bursty sampled counter: a one-shot nvidia-smi read
next to the deck's stream disagreed by 20–30 points in *both* directions; over 10 s
the means were 3.3 % (deck) vs 11.5 % (independent stream).

**Decision.** The deck's nvidia-smi parsing is exact (unit-tested on real output), and
VRAM, GPU temperature and power match a separate nvidia-smi read to the MiB, degree
and ~1 W. The under-load GPU utilisation comparison goes on the manual checklist:
run a game and watch the deck against `nvidia-smi dmon`.
