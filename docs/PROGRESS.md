# Progress

Current phase: **Phase 0 — spike and ground truth.** Nearly complete; one item
needs Shannon at the touch display.

Phases are defined in `DESIGN.md` §17. Findings go in `DECISIONS.md`.

---

## Phase 0 — spike and ground truth

Spike plugin: `~/.config/omarchy/plugins/shannon.touchdeck-spike/`
(`shannon.touchdeck-spike`, currently **enabled**). Throwaway — deleted once the
last item below is signed off.

### Acceptance

- [x] **A window appears on the touch display only, at login, and stays mounted.**
      `hyprctl layers` → `HDMI-A-1 level=2 ns=touchdeck-spike 1536x838+512+1466`,
      nothing on DP-1. It laid out below the bar and reserved no zone of its own.
      Survived `omarchy-restart-shell` and reappeared with no `summon`, so a
      `keepLoaded` panel does open itself on load (§5.7). — `DECISIONS.md` G-6
- [x] **It recolours live on a theme switch with no reload code.**
      Six themes cycled including two light ones, plus a text-size change;
      every `Color`/`Style` token followed within ~1 s. §8.4's fallback hook is
      not needed. — G-6
- [ ] **Taps register at the right coordinates.** Touch mapping was already
      configured (G-4) and the spike draws four corner targets plus a centre pad
      that log window coordinates. **Needs one pass of Shannon's finger.**
- [x] **As a third-party plugin, it imports `Quickshell.Services.Pipewire` and
      `Quickshell.Services.Mpris` and reads the default output's volume and a
      player's track title.** Read 45 % on the HECATE headset; external `wpctl`
      volume and mute changes landed in <1.5 s; mpv appeared as
      `identity: "mpv", title: "Touchdeck Spike Test.wav"` and vanished on kill. — G-6
- [x] **`omarchy-shell shell call ...` reaches a method on it.** `status` and
      `echo` both round-tripped; `summon`/`hide`/`toggle` work and the payload
      arrives at `open()` verbatim. — G-5, G-6
- [x] **Answered: does tapping it move Hyprland's focused monitor? (§5.6)**
      Yes — confirmed with the pointer, and `Hyprland.focusedMonitor` tracks it
      live. The §5.6 focus-restore mitigation is required. Touch-specific
      confirmation rides along with the tap test above. — G-7
- [x] **Answered: does a `keepLoaded` panel hot-reload on save, or need a shell
      restart?** It needs `omarchy-restart-shell`. The shell's watcher fires and
      the reload runs, but QML is re-served from the engine's component cache.
      Reproduced twice. — `DECISIONS.md` D-1
- [ ] **Go/no-go on D1, agreed with Shannon.** Recommendation: **go.** Every
      assumption D1 rests on held on the real system — persistent window on a
      chosen screen, live theming, PipeWire, MPRIS, IPC. Appendix B is not needed.

### Also recorded

Versions, hardware, both displays, the plugin host contract, the Hyprland Lua
dispatcher surface, the first-party launch path, verified `nvidia-smi` fields,
and a keybind conflict — all in `DECISIONS.md` G-1 … G-11.

### Deviations from `DESIGN.md` found in Phase 0

| Design says | Reality | Recorded as |
|---|---|---|
| Deck canvas 1920×1080, ~105 px cells | 1536×864 logical (scale 1.25), 96 px cells | G-3, D-3 |
| Match screens by `description` | Quickshell has no `description`; use `model` | G-3, D-2 |
| Plugin code hot-reloads on save | Needs `omarchy-restart-shell` | D-1 |
| Shannon must add a touch-mapping snippet | Already present in `input.lua` | G-4 |
| Toggle on `SUPER + CTRL + D` | Taken by Omarchy's Display panel | G-11, D-7 |
| Hyprland 0.55+ | 0.56.2; `hl.dsp.focus({ monitor = … })` is the form | G-1, G-8 |
| `nvidia-smi` and sysfs agree on PCI address | 8-digit vs 4-digit domain; normalise | G-10 |

### Left to do in Phase 0

1. Shannon taps the four corners and the centre pad on the deck (see below).
2. Read the tap log back, confirm coordinates and the touch-focus behaviour.
3. Sign off D1 go/no-go.
4. Delete the spike plugin and disable it.

---

## Phase 1 — skeleton, theme adapter, grid

Not started.
