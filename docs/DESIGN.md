# Touchdeck: a touch launchpad for Omarchy

Design and build plan, written for Claude Code.

| | |
|---|---|
| Working name | Touchdeck (plugin id `io.github.shazzedio.touchdeck`, a placeholder to rename before publishing) |
| Owner | Shannon |
| Target platform | Omarchy 4.x "Quattro", Hyprland 0.55 or newer (Lua config), Quickshell as shipped with Omarchy |
| Display | Verbatim 14" portable touch monitor, 1920×1080 |
| Written | 10 September 2026, against the Omarchy Quattro shell, plugin and theming docs |

---

## 0. Read this first (instructions for Claude Code)

You will build this in phases (§17). These rules apply throughout.

1. **Installed reality beats this document.** Omarchy Quattro, its shell plugin API, Quickshell, and Hyprland's Lua config are newer than most training data and still moving. Before writing code that touches them, read the installed sources: `$OMARCHY_PATH/shell/README.md`, the first-party plugins under `$OMARCHY_PATH/shell/plugins/` (these are the reference implementations), the `Commons` and `Ui` QML modules under `$OMARCHY_PATH/shell/`, and the Quickshell documentation for the version `qs --version` reports. Where this plan and the installed code disagree, follow the installed code and record the deviation in `docs/DECISIONS.md`.
2. **Never modify** anything under `$OMARCHY_PATH` or `/usr/share/omarchy`, and never edit Shannon's own config files (`~/.config/hypr/*`, `~/.config/omarchy/shell.json`, theme files). When a config change is needed, print the snippet and the file it belongs in, and let Shannon apply it. Running Omarchy's own commands (`omarchy plugin enable`, `omarchy-shell shell ...`) is fine; they are the supported way to change shell state.
3. **Locked decisions (§3) need Shannon's agreement to change.** Everything else is your call. Record significant calls in `docs/DECISIONS.md`, one short paragraph each covering context, decision and consequence.
4. **One phase at a time.** Meet the phase's acceptance criteria, run `tools/check.sh`, update `docs/PROGRESS.md`, then stop and summarise for Shannon before starting the next phase.
5. **The deck runs inside the desktop shell process.** A blocking call or runaway loop freezes Shannon's bar, notifications and lock screen, not just the deck. No synchronous file or process I/O in QML. Follow §15.
6. At the start of Phase 0, ask Shannon the open questions in §18 that are still unanswered.

Suggested repo setup: save this file as `docs/DESIGN.md` and create a `CLAUDE.md` at the repo root containing: "Read docs/DESIGN.md §0 and §3 before any work. Current phase and status live in docs/PROGRESS.md. Run tools/check.sh before declaring anything done."

---

## 1. What we're building

Touchdeck is a persistent, touch-first control surface for a dedicated 14" touch display sitting beside Shannon's main monitor. It launches apps with one tap, shows system health at a glance (CPU, GPU, RAM, VRAM and temperatures), and controls audio and media. It stays visible on that display, never takes keyboard focus away from the main screen, and restyles itself instantly whenever the Omarchy theme, font or text size changes. That last property comes for free because Touchdeck is built as a plugin inside the Omarchy shell rather than as a separate app imitating it.

**In scope for v1**

- App keys: tap to launch any installed app (desktop entries, which includes Omarchy web apps and TUI launchers) or a custom command.
- Monitoring widgets: CPU (usage, per-core, temperature), GPU (usage, VRAM, temperature, power), memory (RAM, swap, VRAM).
- Volume widget: master fader, mute, output device switching, mic mute.
- Media widget: now playing with album art, transport controls and seek, for any MPRIS player.
- Layout editing on the device itself: add, move, resize, remove and configure widgets and keys by touch.
- Live theme following with zero hardcoded colours.

**Out of scope for v1:** notifications, weather/network/disk widgets, multiple pages, a per-app mixer, folder keys, and anything that needs root. These sit in the backlog at the end of §17.

---

## 2. Target environment

| Area | Assumption | Verify in Phase 0 |
|---|---|---|
| Display | Verbatim 14" portable touch monitor, 1920×1080, touch over USB (a libinput touch device), roughly 157 PPI | Connector name and monitor description from `hyprctl monitors all`; touch device name from `hyprctl devices` |
| OS | Omarchy 4.x "Quattro". The desktop is `omarchy-shell`, a single long-running Quickshell process that hosts plugins. Hyprland 0.55+ with Lua config. uwsm-managed session | Omarchy version, `hyprctl version`, `qs --version` |
| Machine | Intel i5-12400F with an NVIDIA RTX 4070, so `coretemp` for CPU temperature and `nvidia-smi` for GPU data. A Radeon card may be added later for AI inference, so AMD and multi-GPU support are requirements, not extras | `lspci -k` (VGA/3D controllers), `nvidia-smi -L`, `cat /sys/class/hwmon/*/name` |
| Monitors | One main monitor plus the touch display, landscape | Output names, positions, scales |

---

## 3. Locked decisions

| # | Decision | Why | Trade-off and mitigation |
|---|---|---|---|
| D1 | **Host: an Omarchy shell plugin** (`kinds: ["panel"]`, `keepLoaded: true`), not a standalone app | The shell pushes theme changes into its `Color`, `Style` and `Border` singletons, so following the theme is automatic and exact. Omarchy's plugin development guide says plugins must not start a second Quickshell process. Enable, disable, update and IPC tooling come with it | Plugin code runs unsandboxed in the desktop process; mitigated by D4 and §15. If Phase 0 shows a third-party panel can't hold a persistent window on a chosen screen, switch to the fallback host in Appendix B, with Shannon's agreement |
| D2 | **UI: QML / Qt Quick via Quickshell**, touch handled with Qt Quick pointer handlers | Strongest touch and animation story on Linux, and the same toolkit as the shell | QML/JS rather than Rust or Go. Pure logic lives in plain ES modules so it is unit-testable with Node |
| D3 | **Surface: a layer-shell window** pinned to the touch output and covering it, layer `top`, keyboard focus none (on-demand only while a text field is active) | Doesn't tile, can't be buried by stray windows, never steals typing | Layer is configurable (`top` or `bottom`) for times Shannon wants a window on that screen |
| D4 | **Data: one long-running collector script** for `/proc` and `/sys`, plus one long-running `nvidia-smi` stream; all parsing in pure JS | Keeps blocking I/O and slow tools off the shell's GUI thread. Parsers are testable against fixtures | Two helper processes; both restarted with backoff if they exit |
| D5 | **Audio and media via Quickshell's native PipeWire and MPRIS services** | Event-driven, no polling `wpctl` or `playerctl` | Tied to Quickshell's API. Mirror what Omarchy's first-party audio and media plugins do |
| D6 | **Config: one plugin-owned JSON file**, `~/.config/touchdeck/config.json` | Rich layout data doesn't belong in `shell.json`. Hand-editable, and survives plugin updates (the plugin directory is a git checkout) | Must cope with hand edits and invalid JSON (§12) |
| D7 | **Theme adapter: only `services/DeckTheme.qml` and `components/DeckSurface.qml` may import `qs.Commons` or `qs.Ui`.** Every other file gets styling through `DeckTheme` | One adapter over Omarchy's token API: easy to fix when that API moves, and it makes the Appendix B fallback a two-file swap | Enforced by `tools/check.sh` |
| D8 | **Launching: reuse the launch path Omarchy's own launcher uses** (uwsm), after focusing the target monitor | Launched apps get their own systemd scope, so they survive a shell restart, and they open on the main screen rather than under the deck | Workspace-specific targets are best-effort (§11) |

---

## 4. Architecture

```
omarchy theme set / omarchy font set / text size change
        |   Omarchy pushes new tokens into the running shell
        v
+--------------------------- omarchy-shell (one Quickshell process) ----------------------------+
|  qs.Commons: Color, Style, Border          qs.Ui: BorderSurface                               |
|        |                                                                                      |
|  +-----+---------------------------- io.github.shazzedio.touchdeck ----------------------------------+    |
|  |  DeckTheme            derived tokens: touch scale, status colours                     |    |
|  |                                                                                       |    |
|  |  Deck.qml             panel entry point, keepLoaded                                   |    |
|  |    Variants over screens matching config.display.match                                |    |
|  |      PanelWindow      layer-shell, namespace "touchdeck"                              |    |
|  |        Grid engine -> widget instances (views only)                                   |    |
|  |        Edit overlay, pickers, settings sheets, toasts                                 |    |
|  |                                                                                       |    |
|  |  Services             plain QML objects owned by Deck                                 |    |
|  |    SensorsService  <- bin/touchdeck-collect (bash)       <- /proc, /sys               |    |
|  |                    <- nvidia-smi --query-gpu=... -lms N  (only if NVIDIA present)     |    |
|  |    AudioService    <- Quickshell.Services.Pipewire                                    |    |
|  |    MediaService    <- Quickshell.Services.Mpris                                       |    |
|  |    AppsService     <- Quickshell DesktopEntries                                       |    |
|  |    HyprService     <-> Quickshell.Hyprland (monitors, focus, events, dispatch)        |    |
|  |    LaunchService   -> HyprService, then uwsm launch                                   |    |
|  |    ConfigStore     <-> ~/.config/touchdeck/config.json                                |    |
|  +---------------------------------------------------------------------------------------+    |
+-----------------------------------------------------------------------------------------------+
IPC:  omarchy-shell shell summon | hide | toggle | call  io.github.shazzedio.touchdeck ...
```

Principles:

- Services own all I/O. They expose read-only reactive properties plus intent methods (`setVolume`, `launch`, `next`, and so on). Widgets are views: they bind to service properties and call intents. A widget never spawns a process or reads a file.
- One clock. SensorsService's frame drives every monitoring widget; there are no per-widget timers.
- Everything pauses when the deck isn't visible (hidden, display unplugged, session locked): helper processes stop and timers stop.
- v1 has no `service` plugin kind. If a companion bar widget is added later (backlog), move the services into a `service` entry point first so both surfaces share one data source.

---

## 5. Display, window and input integration

### 5.1 Finding the touch display

`config.display.match` selects the output, either `{ "by": "name", "value": "DP-3" }` or `{ "by": "description", "value": "Verbatim" }` (case-insensitive substring of the monitor description or model). Prefer description, because the connector name can change when the USB-C cable moves to another port. Build the window inside a `Variants` whose model is the filtered screen list, so plugging and unplugging the display creates and destroys the window with no extra code. When no screen matches, the deck is dormant (services paused) and `status` reports why.

### 5.2 The layer surface

- Namespace `touchdeck`, so Shannon can write Hyprland layer rules against it.
- Anchored to all four edges of its screen. It respects other surfaces' exclusive zones (so it lays out below the Omarchy bar if the bar is on that screen) and reserves no exclusive zone of its own.
- Layer comes from config, `top` by default. The session lock covers it automatically; don't fight that.
- Keyboard focus is none. Switch to on-demand only while the app picker's search field is open, and back to none when it closes.

### 5.3 The Omarchy bar on the touch display

By default the Omarchy bar creates one bar per screen. Either leave it (the deck gets about 26 px less height) or restrict the bar to the main monitor if the installed Omarchy supports a `screens` list under `bar` in `shell.json` (proposed in Omarchy PR #6501; check whether it has landed). This is Shannon's call (§18); the grid adapts either way.

### 5.4 Touch mapping (Shannon applies this manually)

Without an explicit mapping, touches on a USB touch display can land on the wrong monitor. In `~/.config/hypr/input.lua`:

```lua
-- device name comes from `hyprctl devices` (touch section)
hl.device({ name = "<touch-device-name>", output = "<connector, e.g. DP-3>" })

-- or, for all touch devices:
-- hl.config({ input = { touchdevice = { output = "<connector>" } } })
```

Confirm the option names against the Hyprland wiki for the installed version. Use `libinput debug-events` to confirm touches arrive, then tap all four corners of the deck during Phase 0.

### 5.5 Monitor rule and scale

In `~/.config/hypr/monitors.lua`, give the touch display an explicit rule so its scale isn't guessed:

```lua
hl.monitor({ output = "<connector>", mode = "1920x1080@60", position = "<x>x<y>", scale = 1 })
```

The deck is resolution-independent. Test at scale 1 and 1.25.

### 5.6 Focus behaviour (Phase 0 must answer this)

Find out whether tapping a layer surface on the touch display moves Hyprland's focused monitor. If it does, keyboard shortcuts and new windows would start targeting the touch display, where they'd be hidden under the deck. In that case HyprService remembers the last focused non-deck monitor and restores focus to it about 250 ms after the last touch on the deck. Separately, recommend (for Shannon to apply) a workspace rule that reserves a dedicated workspace on the touch output, so nothing tiles there by accident (Appendix C).

### 5.7 Visibility and lifecycle

- Shown automatically at login when `display.startVisible` is true (the default). Phase 0 determines whether a keepLoaded panel may open itself on load or needs a `summon` from `~/.config/hypr/autostart.lua`.
- Toggled with a keybind (Appendix C) or `omarchy-shell shell toggle io.github.shazzedio.touchdeck '{}'`. A summon payload of `{"edit": true}` opens straight into edit mode.
- Paused when hidden, when no matching screen exists, and while the session is locked.

---

## 6. Layout system

- A grid of 16 columns × 9 rows (configurable), fitted to the window's actual logical size. Outer margin and gap come from `DeckTheme` (Omarchy spacing tokens multiplied by the touch scale). At 1920×1080 and scale 1, cells come out around 105 px (about 17 mm), so a 1×1 key is comfortably touchable and a 2×2 key (about 220 px) feels like a hardware key.
- Each item is `{ id, type, col, row, w, h, settings }`. Each widget type declares `minSize`, `defaultSize` and `maxSize`, and picks a compact or full presentation from its current size.
- No overlaps. A move or resize that would overlap another item or leave the grid is rejected with a snap-back. Predictable beats clever, so there is no automatic reflow.
- If the grid shrinks (fewer rows, or a scale change), items that no longer fit are parked in an "unplaced" tray in edit mode rather than deleted.
- The data model has `pages[]` from day one; v1 renders only the first page.

**Default layout**, written to config on first run:

```
+-----------+-----------+---------------+-----------------------+
| CPU  3x3  | GPU  3x3  | Memory  4x3   | Media  6x3            |
|   .---.   |   .---.   | RAM  #####... | +-----+ Title         |
|   |42%|   |   |87%|   | VRAM ######.. | | art | Artist        |
|   '---'   |   '---'   | 12.4/31.0 GiB | +-----+ |<  >||  >|   |
|   61 C    |   72 C    |  9.1/12.0 GiB | ============o-------- |
+-------+---+---+-------+-------+-------+-------+---------------+
|  [#]  |  [#]  |  [#]  |  [#]  |  [#]  |  [#]  | Volume  4x6   |
| app   | app   | app   | app   | app   | app   |   |  62%      |
+-------+-------+-------+-------+-------+-------+   |           |
|  [#]  |  [#]  |  [#]  |  [#]  |  [#]  |   +   |   |  [mute]   |
| app   | app   | app   | app   | app   |       |   o  [mic]    |
+-------+-------+-------+-------+-------+-------+               |
|       |       |       |       |       |       |  Speakers  v  |
|       |       |       |       |       |       |               |
+-------+-------+-------+-------+-------+-------+---------------+
  App keys: 2x2 each, 12 columns x 6 rows          Volume: 4x6
```

On first run, fill up to three keys from the default browser (`xdg-settings get default-web-browser`), the default file manager (`xdg-mime query default inode/directory`) and the terminal Omarchy is configured to use, when each can be found. The rest start empty. Empty cells show "+" only in edit mode.

### 6.1 Edit mode

- **Enter:** a long-press (700 ms) anywhere opens a small bubble offering "Edit layout" (and "Key settings" when pressed on an app key). Also available via IPC and a keybind. A long-press never changes anything by itself, so an accidental one is harmless.
- **While editing:** items show an outline and handles. Drag to move (the ghost snaps to cells; invalid positions tint with the theme's urgent colour). Drag the corner handle to resize within min and max. "×" removes the item, with a five-second undo toast. Tapping an item opens its settings sheet. Tapping an empty cell opens the add sheet with three tabs: Widgets, Apps, Custom command.
- **Leave:** the "Done" button, or automatically after 60 seconds without a touch.
- Changes save automatically (debounced 500 ms) using the atomic write in §12.
- Outside edit mode nothing can be dragged, and keys fire only on a clean tap (§10).

---

## 7. Widgets

Every widget type registers in `widgets/WidgetRegistry.qml` with `type`, `displayName`, `icon`, `minSize`, `defaultSize`, `maxSize`, `defaultSettings`, and a small `settingsSchema` (fields of type `enum`, `bool`, `number`, `string`, `app`, `gpu` or `sink`) from which the settings sheet is generated. A widget receives `settings`, `cellSize`, `editing` and the services it needs, and emits nothing but intents.

Every widget designs three non-happy states up front:

- **Loading:** the first frame hasn't arrived yet.
- **Unavailable:** shown with a one-line reason, for example "No GPU data: nvidia-smi not found".
- **Stale:** the source has missed three intervals. Values dim and the age of the last update shows.

### 7.1 App key (`app`)

- Settings: `desktopId` or `command`; optional `label` and `icon` (icon name or file path); `target` (`auto`, `touch`, or `workspace:N`); `confirm` (default false).
- Sizes from 1×1 (icon, label underneath if it fits) to 3×3. Default 2×2.
- Tap launches via LaunchService. Feedback within 50 ms (the key visibly depresses), then a brief "launching" state until Hyprland reports a new window or five seconds pass.
- If the desktop entry has gone (app uninstalled), the key shows the stored name in muted style with "Not installed", and a tap opens its settings.
- For v1.1: a running indicator when the app has open windows, matching Hyprland window class against `StartupWMClass` or the desktop id.

### 7.2 CPU (`cpu`)

- Data: total usage %, per-core %, package temperature, average frequency, and a 120-sample history.
- Sizes: 2×2 shows the number and temperature; 3×3 adds an arc gauge; 4×3 and larger add per-core bars and a history sparkline.
- Temperature thresholds (configurable): warn at 80 °C, critical at 95 °C. The i5-12400F's maximum junction temperature is 100 °C.
- Sources are listed in Appendix A.

### 7.3 GPU (`gpu`)

- Settings: `gpu` (`auto` means the first discrete GPU; otherwise a PCI address) and which extras to show.
- Data: usage %, VRAM used and total, core temperature (plus junction and memory temperature where the driver exposes them, typically AMD), power draw and fan.
- Backends: NVIDIA via the `nvidia-smi` stream; AMD via amdgpu sysfs; Intel integrated graphics detected but shown as "Usage not available" in v1.
- One widget per GPU. The settings picker lists detected GPUs by name and PCI address. Always identify GPUs by PCI address, never by `cardN`, because card numbering isn't stable across boots.
- Temperature thresholds: warn at 80 °C, critical at 90 °C, configurable per widget.

### 7.4 Memory (`memory`)

- RAM used and total (used = MemTotal − MemAvailable), optional swap, and VRAM for a selected GPU (taken from the GPU backend).
- Sizes: 2×2 shows two rings; 4×2 and 4×3 show labelled bars ("12.4 / 31.0 GiB"); larger sizes add history.

### 7.5 Volume (`volume`)

- A master fader for the default output, vertical when the widget is taller than it is wide. Dragging the thumb or the track is relative; tapping the track jumps to that level. The mouse wheel works too.
- Mute toggle, percentage readout, an output device picker (a sheet listing outputs by description; choosing one makes it the default), and a mic mute toggle for the default input with an unmistakable muted state.
- Settings: `maxVolume` (default 1.0, up to 1.5), `showMic`, step size.
- Changes made elsewhere (keyboard volume keys, Omarchy's own audio widget) must show on the fader immediately, and changes on the fader must show there.

### 7.6 Media (`media`)

- Player selection: the player that is currently playing, otherwise the most recently active. Tap the player chip to cycle. Optional `preferredPlayer` matches the MPRIS identity, for example "Spotify".
- Shows album art (with a fallback glyph), title, artist, and album at larger sizes; a progress bar with position and length; seek by tap or drag when the player allows it.
- Controls: previous, play/pause and next, each at least 88 px, with a disabled look when the player can't perform the action.
- MPRIS doesn't push position updates, so refresh the position once a second while playing.
- Empty state: "Nothing playing", plus an optional key to launch the preferred player.

---

## 8. Omarchy theme integration

### 8.1 How Quattro theming works

Verified against the Omarchy docs in September 2026; re-check against the installed version.

- Themes live in `/usr/share/omarchy/themes/<name>/` (built-in) and `~/.config/omarchy/themes/<name>/` (user). Each starts from a `colors.toml` palette (`mode`, `accent`, `selection`, `muted`, background and foreground ramps, and named colours). A `shell.toml` holds shell surface roles, control states, spacing, typography and bar sizing.
- Switching themes (`omarchy theme set <name>` or the Omarchy menu) renders the active theme into `~/.local/state/omarchy/current/theme/`, writes `~/.local/state/omarchy/current/theme.name`, pushes the new tokens into the running shell, and fires any `~/.config/omarchy/hooks/theme-set*` hooks.
- In QML, `qs.Commons` exposes three singletons. `Color` carries the palette (foreground, background, accent, urgent) and per-surface roles such as `Color.popups.*`. `Style` carries the corner radius, `Style.spacing.*`, `Style.space(px)` and the `Style.font.*` type scale. `Border` provides border-spec helpers used with `BorderSurface` from `qs.Ui`, so gradient and per-side theme borders render correctly.
- The shell font family is the fontconfig `monospace` alias, set by `omarchy font set`. Machine-level overrides such as text size live in `~/.config/omarchy/shell.toml`, which the shell watches live.

### 8.2 Rules

- Every colour, radius, border, spacing value and font in the deck derives from those tokens through `DeckTheme`. No colour literals in QML outside `tests/`, enforced by `tools/check.sh`.
- Widget surfaces use `DeckSurface` (which wraps `BorderSurface`), so themes with gradient or asymmetric borders look right on the deck too.
- Don't copy token values into JS variables; bind to them, so a theme push re-renders everything without reload code.

### 8.3 DeckTheme, the only adapter

- **Touch scale.** Omarchy's type scale is sized for a bar (body text is 12 px). The deck multiplies `Style.font.*` and `Style.space()` by `touchScale = clamp(cellSize / 105, 0.8, 1.8) × config.appearance.scale`. It stays readable at arm's length and still follows Omarchy text-size changes.
- **Surfaces.** Deck background from `Color.background`. Widget surfaces and borders from the `popups` section, which Omarchy uses for flyouts and popup cards and is the closest semantic match (confirm after reading `Commons`). Buttons use the shared `[controls]` states (normal, pressed, selected) through `Border.controlSpec` and the `Style` helpers.
- **Status colours** (ok, warn, critical). Use named palette colours (`green`, `yellow`, `red`) if `Color` exposes them. Otherwise read them from the active `colors.toml`, re-reading whenever `Color.background` or `Color.accent` changes and when `theme.name` changes. Fallbacks: critical uses `Color.urgent`, warn uses a mix of accent and urgent, ok uses accent.
- **Mode** (dark or light) comes from `colors.toml` and is used only for details like the scrim behind album art.

### 8.4 Fallback

Only if Phase 0 proves the shell's theme push doesn't reach a third-party plugin: add a `theme-set` hook that runs `omarchy-shell shell call io.github.shazzedio.touchdeck reloadTheme ''`, and have `DeckTheme` read `colors.toml` and `shell.toml` directly.

### 8.5 Acceptance test

With the deck visible, switch through every installed theme (everything in `/usr/share/omarchy/themes` and `~/.config/omarchy/themes`), including at least one light theme, then change the font and the text size. The deck restyles each time with no restart, nothing keeps a previous theme's colour, and all text stays legible.

---

## 9. Visual direction

The palette belongs to the theme, so the design work here is structure, hierarchy and restraint.

- **Concept: a hardware control surface.** Think mixing-desk faders, instrument-cluster gauges and stream-deck keys, not a web dashboard. Controls should look like the thing they do.
- **Accent is reserved for live values:** gauge fill, fader level, the playing state, a pressed key's edge. Everything else sits in the theme's neutral ramp. This is what makes every theme look intentional on the deck.
- **One signature moment: the key press.** The key depresses (scale about 0.96) and its border takes the accent for the duration of the press. Everything around it stays quiet.
- **Type:** the theme's monospace family throughout, with large tabular numerals for readouts (`display` and `displayLarge` × touch scale). Sentence-case labels; no all-caps eyebrows or decorative dividers.
- **Surfaces:** theme border and radius; no drop shadows unless the theme's tokens provide them. Don't make every widget an identical card. Gauges can sit borderless on the deck background while keys and the media widget get surfaces, so the hierarchy reads at a glance.
- **Motion only answers input or data:** press feedback 80 ms, value easing 250 ms, edit transitions 150 ms. No idle or entrance animations. `appearance.reduceMotion` turns easing off.
- **Copy** is short and plain, and says what happened and what to do: "Nothing playing", "No GPU data: nvidia-smi not found", "Hold anywhere to edit".

---

## 10. Touch interaction rules

- Minimum target 64 px logical (about 10 mm at 157 PPI). Primary controls (transport buttons, mute, keys) are at least 88 px.
- Use Qt Quick pointer handlers (`TapHandler`, `DragHandler`, `WheelHandler`) accepting both touch and mouse, rather than `MouseArea`, so multi-touch works (for example holding the fader while tapping mute).
- A tap is a release within 12 px and 500 ms of the press. A long-press is 700 ms. A drag that starts on a key cancels its tap.
- Visual press feedback within 50 ms. No hover-only affordances.
- Mouse fallback: the wheel adjusts faders, and right-click equals long-press.

---

## 11. Launching apps

- AppsService indexes desktop entries through Quickshell's DesktopEntries and refreshes when entries change. Omarchy web apps and TUI launchers are ordinary `.desktop` files, so they appear automatically. The app picker offers fuzzy and acronym search (reuse Omarchy's launcher matcher if it can be imported, otherwise `lib/fuzzy.mjs`) and an A–Z rail for browsing without a keyboard.
- **Launch path:** find how Omarchy's first-party launcher starts apps (under `$OMARCHY_PATH/shell/plugins/`) and do exactly the same. Expect a uwsm form such as `uwsm app -- <id>.desktop`. Custom commands go through the same wrapper via `sh -c`. Launch detached and never wait on the child.
- **Target monitor:** Hyprland opens new windows on the focused monitor. `target: auto` means the monitor that was focused most recently before the deck was touched, which HyprService tracks from Hyprland focus events, ignoring the deck's own output. LaunchService focuses that monitor, then launches.
- **`workspace:N` is best-effort:** focus that workspace, then launch. Hyprland exec rules match on PID, which fails for uwsm-launched and single-instance apps, so don't rely on them.
- All Hyprland calls go through HyprService. From Hyprland 0.55, dispatchers use Lua syntax (for example `hl.dsp.focus({ ... })`). Confirm the exact form against the installed version and against how Omarchy's own scripts dispatch.

---

## 12. Configuration and persistence

- File: `$XDG_CONFIG_HOME/touchdeck/config.json` (default `~/.config/touchdeck/config.json`), created with the default layout on first run.
- Versioned with `"version": 1`. `lib/config.mjs` validates, fills defaults and migrates. Unknown fields are preserved on write.
- Writes are atomic (temp file then rename; Quickshell's FileView may support this directly, so check) and keep `config.json.bak` as the last known-good copy.
- The file is watched. Valid hand edits apply live. On invalid JSON, keep running on the last good config, show a banner on the deck ("config.json line 42: unexpected ','. Using the last good layout."), and write nothing until the file is fixed.

Example (desktop ids and the custom command are illustrative):

```json
{
  "version": 1,
  "display": {
    "match": { "by": "description", "value": "Verbatim" },
    "layer": "top",
    "startVisible": true
  },
  "appearance": { "scale": 1.0, "columns": 16, "rows": 9, "reduceMotion": false },
  "sensors": { "intervalMs": 1000 },
  "launch": { "target": "auto" },
  "pages": [
    {
      "id": "main",
      "items": [
        { "id": "cpu-1",   "type": "cpu",    "col": 0,  "row": 0, "w": 3, "h": 3,
          "settings": { "tempWarn": 80, "tempCrit": 95 } },
        { "id": "gpu-1",   "type": "gpu",    "col": 3,  "row": 0, "w": 3, "h": 3,
          "settings": { "gpu": "auto", "tempWarn": 80, "tempCrit": 90 } },
        { "id": "mem-1",   "type": "memory", "col": 6,  "row": 0, "w": 4, "h": 3,
          "settings": { "showSwap": false, "vramGpu": "auto" } },
        { "id": "media-1", "type": "media",  "col": 10, "row": 0, "w": 6, "h": 3,
          "settings": { "preferredPlayer": "" } },
        { "id": "vol-1",   "type": "volume", "col": 12, "row": 3, "w": 4, "h": 6,
          "settings": { "maxVolume": 1.0, "showMic": true } },
        { "id": "key-1",   "type": "app",    "col": 0,  "row": 3, "w": 2, "h": 2,
          "settings": { "desktopId": "chromium.desktop", "target": "auto" } },
        { "id": "key-2",   "type": "app",    "col": 2,  "row": 3, "w": 2, "h": 2,
          "settings": { "command": "xdg-terminal-exec btop", "label": "btop",
                        "icon": "utilities-system-monitor", "target": "auto" } }
      ]
    }
  ]
}
```

---

## 13. IPC surface

The standard shell routes map to the entry point's `open(payloadJson)` and `close()`:

```
omarchy-shell shell summon io.github.shazzedio.touchdeck '{}'
omarchy-shell shell summon io.github.shazzedio.touchdeck '{"edit": true}'
omarchy-shell shell hide   io.github.shazzedio.touchdeck
omarchy-shell shell toggle io.github.shazzedio.touchdeck '{}'
```

Plugin methods via `omarchy-shell shell call io.github.shazzedio.touchdeck <method> <arg>`:

- `toggleEdit`
- `reloadConfig`
- `status`, returning JSON: visible, matched output, helper process states, age of the last sensor frame, config errors.

Confirm in Phase 0 exactly how a third-party entry point exposes methods to `call`.

---

## 14. Repository layout

The repo root is the plugin folder, because `omarchy plugin add` expects `manifest.json` at the root. No symlinks anywhere inside it; the validator rejects them.

```
touchdeck/
├── manifest.json            schemaVersion 1, id, kinds ["panel"], entryPoints.panel, keepLoaded
├── Deck.qml                 panel entry point
├── components/              DeckSurface, Key, ArcGauge, BarMeter, Fader, Sparkline, IconButton, Sheet, Toast
├── widgets/                 WidgetRegistry, AppKey, CpuWidget, GpuWidget, MemoryWidget, VolumeWidget, MediaWidget
├── services/                DeckTheme, ConfigStore, SensorsService, AudioService, MediaService,
│                            AppsService, HyprService, LaunchService
├── editor/                  EditOverlay, AddSheet, AppPicker, WidgetPicker, SettingsSheet
├── lib/                     pure ES modules (.mjs), no QML imports: procstat, meminfo, hwmon, amdgpu,
│                            nvidia, frame, grid, config, fuzzy, format, toml (Appendix B only)
├── bin/touchdeck-collect    bash collector, invoked as `bash <path>` so the exec bit doesn't matter
├── tests/                   node --test suites plus fixtures (sysroots, nvidia-smi output, frames, configs)
├── tools/check.sh           the single quality gate (§16)
├── docs/                    DESIGN.md (this file), PROGRESS.md, DECISIONS.md, TESTING.md
├── README.md
└── LICENSE
```

Starting manifest:

```json
{
  "schemaVersion": 1,
  "id": "io.github.shazzedio.touchdeck",
  "name": "Touchdeck",
  "version": "0.1.0",
  "author": "Shannon",
  "license": "MIT",
  "description": "Touch launchpad and system deck for a dedicated touch display.",
  "kinds": ["panel"],
  "entryPoints": { "panel": "Deck.qml" },
  "keepLoaded": true
}
```

**Development loop:** clone the repo straight into `~/.config/omarchy/plugins/io.github.shazzedio.touchdeck/` (or make that path a symlink to the working copy), run `omarchy-shell shell rescanPlugins`, then `omarchy plugin enable io.github.shazzedio.touchdeck`. Saving a file reloads plugin code, but a keepLoaded instance may only pick up changes after `omarchy-restart-shell`; find out which in Phase 0. Read logs with `qs log -p "$OMARCHY_PATH/shell" --tail 100`.

---

## 15. Performance and reliability

| Budget | Target |
|---|---|
| Added CPU with the deck visible at a 1 s interval | Under 1 % of one core, averaged (collector, nvidia-smi and QML together) |
| Added memory in omarchy-shell | Under 60 MB RSS (cap album art `sourceSize` to the widget's size) |
| JS work per sensor frame | Under 2 ms, measured in a debug build |
| Dragging in edit mode | 60 fps on the touch display with no dropped frames |
| Wakeups while hidden, unplugged or locked | None from the deck |

Reliability rules:

- No synchronous I/O in QML. The collector and `nvidia-smi` run as long-running `Process`es whose stdout is parsed line by line.
- If either helper exits, restart it with backoff (1, 2, 5, 10, then 30 seconds). Widgets show the stale state after three missed intervals.
- A widget that throws renders an inline error tile; the grid and the other widgets keep working.
- The deck must never stop the lock screen, notifications or the bar from working. The escape hatch is `omarchy plugin disable io.github.shazzedio.touchdeck` followed by `omarchy-restart-shell`; document it in the README.

---

## 16. Testing

`tools/check.sh` runs all of the following and must pass before any phase is marked done.

1. `omarchy plugin validate .`
2. `qmllint -I "$OMARCHY_PATH/shell"` on every `.qml` file.
3. `node --test tests/` covering: parsers (including `[N/A]` and `[Not Supported]` values from nvidia-smi, multiple GPUs, counter wrap, CPUs appearing and disappearing); the grid engine (placement, collision, bounds, parking on shrink, different logical sizes); config handling (validation, defaults, migration, preserving unknown keys, invalid JSON); fuzzy search.
4. A collector test: run `bin/touchdeck-collect` with `TOUCHDECK_SYSROOT=tests/fixtures/<sysroot>` for two frames per fixture (Intel with NVIDIA, AMD Ryzen with Radeon, and a dual-GPU tree), parse the output and assert on the results.
5. `shellcheck bin/touchdeck-collect tools/*.sh`
6. Guards: no `qs.Commons` or `qs.Ui` imports outside the two adapter files (D7), and no colour literals in QML outside `tests/`.

Node is a development-only dependency. Early in Phase 2, capture real fixtures from this machine: `/proc/stat`, `/proc/meminfo`, the relevant hwmon and drm directories, and a few lines of `nvidia-smi` output. Build the AMD fixtures from the amdgpu sysfs documentation.

**Manual checklist** (`docs/TESTING.md`), run on the real hardware at the end of each phase: touch accuracy at all four corners; every widget compared against `btop` and `nvidia-smi` under load (CPU within 5 %, temperatures within 2 °C); the theme, font and text-size cycle from §8.5; unplugging and replugging the display; lock and unlock; `omarchy-restart-shell`; scale 1.25; launching an app while the main monitor is focused and while it isn't.

---

## 17. Phases

### Phase 0: spike and ground truth (throwaway code)

Tasks:

- Record the versions and hardware facts from §2 in `docs/DECISIONS.md`.
- Read `$OMARCHY_PATH/shell/README.md` and at least these first-party plugins: a panel that owns its own window (such as the OSD), the image selector overlay (keepLoaded), media, audio, and the launcher/menu. Write up the host contract as it actually is: which properties third-party entry points receive, how a plugin opens a layer-shell window on a chosen screen, how `call` reaches plugin methods, and how Omarchy launches apps and dispatches to Hyprland.
- Build a minimal `io.github.shazzedio.touchdeck-spike` panel plugin that proves each point below.

Acceptance, with evidence for each (a log line, screenshot or command output):

- [ ] A window appears on the touch display only, at login, and stays mounted.
- [ ] It recolours live on a theme switch with no reload code.
- [ ] Taps register at the right coordinates (touch mapping done).
- [ ] As a third-party plugin, it imports `Quickshell.Services.Pipewire` and `Quickshell.Services.Mpris` and reads the default output's volume and a player's track title.
- [ ] `omarchy-shell shell call ...` reaches a method on it.
- [ ] Answered: does tapping it move Hyprland's focused monitor? (§5.6)
- [ ] Answered: does a keepLoaded panel hot-reload on save, or need a shell restart?
- [ ] Go/no-go on D1, agreed with Shannon.

### Phase 1: skeleton, theme adapter, grid

Deck surface with screen matching and hotplug; `DeckTheme` and `DeckSurface`; the grid engine rendering placeholder tiles from config; ConfigStore with the first-run default layout; IPC; pause and resume; `tools/check.sh`.

- [ ] The deck shows only on the touch display and survives unplug/replug and `omarchy-restart-shell`.
- [ ] §8.5 passes using placeholder tiles.
- [ ] Hand edits to `config.json` apply live; broken JSON shows the banner and doesn't lose the layout.
- [ ] `tools/check.sh` passes.

### Phase 2: sensors and monitoring widgets

The collector, parsers and SensorsService (CPU, RAM, hwmon, AMD, NVIDIA); CPU, GPU and Memory widgets at every size.

- [ ] Values within tolerance of `btop` and `nvidia-smi`, both idle and under load.
- [ ] Killing the collector shows the stale state, then recovers on its own.
- [ ] With the deck hidden, both helper processes are stopped (check with `ps`).
- [ ] The §15 budgets are measured and recorded.

### Phase 3: audio, media, app keys, launching

AudioService with the Volume widget; MediaService with the Media widget; AppsService, AppKey, HyprService and LaunchService.

- [ ] Volume and mute stay in sync with the keyboard volume keys and Omarchy's audio widget, in both directions. Output switching works.
- [ ] Media controls work with Spotify, a Chromium tab and mpv, including seek where the player supports it.
- [ ] Apps launched from the deck open on the main monitor, including when the deck was the last thing touched.
- [ ] A key for an uninstalled app shows "Not installed" rather than failing silently.

### Phase 4: edit mode

Long-press bubble, edit overlay, move/resize/remove with undo, the add sheet, the app picker (search and A–Z rail), the widget picker, schema-driven settings sheets, autosave.

- [ ] The default layout can be rebuilt entirely by touch (typing in search is optional).
- [ ] A week of normal use produces no accidental layout changes.
- [ ] `config.json` stays valid through every edit operation (fuzz the grid engine in tests).

### Phase 5: polish and release

A copy pass over empty and error states; reduce-motion; README covering install, touch mapping and the escape hatch; screenshots; tag v1.0.0. Optionally publish to the Omarchy plugin marketplace.

### Backlog after v1

Multiple pages with swipe; a per-app volume mixer; action keys (shell command, Omarchy command, Hyprland dispatch, URL); folder keys; desktop-entry quick actions on long-press; running indicators on app keys; clock, network, disk and weather widgets; a companion bar widget showing CPU and GPU at a glance (move services to a `service` entry point first); dim or pause on idle; a portrait layout; an on-screen keyboard for search.

---

## 18. Open questions for Shannon

1. Is this going on the i5-12400F / RTX 4070 machine, and is an AMD GPU in it yet?
2. Should the Omarchy bar also appear on the touch display, or only on the main monitor?
3. Should launched apps default to the last-focused main monitor (proposed), or somewhere else?
4. Where does the touch display sit relative to the main monitor (for the monitor rule), and is it staying in landscape?
5. What plugin id should it use, and will it be published? (`io.github.shazzedio.touchdeck` is a placeholder.)

---

## Appendix A: data sources

| Metric | Source | Notes |
|---|---|---|
| CPU usage | `/proc/stat`, lines `cpu` and `cpuN` | busy = total − (idle + iowait); usage = Δbusy ÷ Δtotal between frames. Handle CPUs appearing and disappearing |
| CPU temperature | `/sys/class/hwmon/hwmon*/name`: `coretemp` → the `temp*_label` reading "Package id 0"; `k10temp` → "Tctl" (or "Tccd*") | Millidegrees. Choose sensors by name and label, never by hwmon index |
| CPU frequency | `/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq` | kHz, averaged across online CPUs |
| RAM and swap | `/proc/meminfo`: MemTotal, MemAvailable, SwapTotal, SwapFree | kB |
| AMD GPU | `/sys/class/drm/card[0-9]*/device/` where `vendor` is `0x1002`: `gpu_busy_percent`, `mem_info_vram_used`, `mem_info_vram_total`; `hwmon/hwmon*/temp{1,2,3}_input` with labels edge, junction, mem; `power1_average` or `power1_input`; `fan1_input` | Bytes, millidegrees, microwatts, RPM. Skip connector entries such as `card1-DP-1`. Key each GPU by the PCI address the `device` symlink resolves to |
| NVIDIA GPU | `nvidia-smi --query-gpu=index,pci.bus_id,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed --format=csv,noheader,nounits -lms <interval>` | One long-running process, one CSV line per GPU per interval. Fields can read `[N/A]` or `[Not Supported]`. Check field names with `nvidia-smi --help-query-gpu` on the installed driver |
| Intel integrated GPU | Detection only in v1 | Busy % needs perf privileges (as `intel_gpu_top` does), so it's out of scope |

**Collector frame format.** `bin/touchdeck-collect` loops at `TOUCHDECK_INTERVAL_MS` and prints one frame per tick. `TOUCHDECK_SYSROOT` prefixes `/proc` and `/sys` so tests can run it against fixture trees. It emits only files that exist, and the parser in `lib/frame.mjs` tolerates missing or unknown sections. Deltas and all maths happen in JS, not in bash.

```
@frame 1757480000123456789
@stat
cpu  4705 356 584 3699 23 23 0 0 0 0
cpu0 1393 81 157 912 5 7 0 0 0 0
@meminfo
MemTotal:       32617460 kB
MemAvailable:   19843120 kB
@cpufreq
cpu0=4400000
@hwmon hwmon3 coretemp
temp1_label=Package id 0
temp1_input=54000
@drm 0000:03:00.0 0x1002
gpu_busy_percent=13
mem_info_vram_used=2147483648
mem_info_vram_total=34342961152
hwmon.temp1_label=edge
hwmon.temp1_input=51000
@end
```

---

## Appendix B: fallback host

Use this only if D1 fails Phase 0, and only with Shannon's agreement. Touchdeck then runs as its own Quickshell config, started at login from `~/.config/hypr/autostart.lua` (`qs -p <repo>/standalone`). That goes against Omarchy's "no second Quickshell process" guidance for plugins, which is why it's a fallback and not the plan. D7 keeps the change small:

- `standalone/shell.qml` hosts the deck's content directly.
- An alternate `DeckTheme.qml` reads `~/.local/state/omarchy/current/theme/colors.toml` and `shell.toml` (via a minimal `lib/toml.mjs` for the flat key/section subset), merges `~/.config/omarchy/shell.toml` on top, and reloads when `theme.name` changes or when a `theme-set` hook pokes the instance over Quickshell IPC.
- An alternate `DeckSurface.qml` draws solid borders (the first gradient stop), since `BorderSurface` isn't available outside the shell.
- IPC moves from `omarchy-shell shell ...` to Quickshell's own IPC handler.

Services, widgets, `lib/` and tests stay unchanged.

---

## Appendix C: Hyprland and Omarchy snippets

Shannon applies these by hand. Placeholders in angle brackets; confirm syntax against the installed Hyprland and Omarchy versions, and check a key combination is free with `hyprctl binds` first.

```lua
-- ~/.config/hypr/monitors.lua : explicit rule for the touch display
hl.monitor({ output = "<connector>", mode = "1920x1080@60", position = "<x>x<y>", scale = 1 })

-- ~/.config/hypr/monitors.lua (or wherever Omarchy keeps workspace rules):
-- optional dedicated workspace on the touch display so nothing tiles under the deck
hl.workspace_rule({ workspace = "10", monitor = "<connector>", default = true })

-- ~/.config/hypr/input.lua : map touch input to the touch display
hl.device({ name = "<touch-device-name>", output = "<connector>" })

-- ~/.config/hypr/bindings.lua : toggle and edit shortcuts
o.bind("SUPER + CTRL + D", "Toggle Touchdeck", "omarchy-shell shell toggle io.github.shazzedio.touchdeck '{}'")
o.bind("SUPER + CTRL + SHIFT + D", "Edit Touchdeck", [[omarchy-shell shell summon io.github.shazzedio.touchdeck '{"edit": true}']])
```

If Phase 0 shows the panel can't open itself at login, add a `summon` to `~/.config/hypr/autostart.lua` following the pattern already in that file.

---

## Appendix D: alternatives considered

- **Rust with GTK4 and gtk4-layer-shell.** Typed, a single binary, and a good match for Shannon's Rust. Rejected for v1: following the theme would mean re-implementing Omarchy's token model outside the shell and chasing it as it evolves; touch drag-and-resize editing and animated gauges are noticeably more work in GTK4; and it adds a second UI toolkit process beside the shell. Worth revisiting if Touchdeck ever needs to run outside Omarchy.
- **A standalone Quickshell config.** Kept as the Appendix B fallback.
- **Web technologies (Tauri or Electron).** Weak layer-shell support and a heavier runtime, with no benefit for this job.
