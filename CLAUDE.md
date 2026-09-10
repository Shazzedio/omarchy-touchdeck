# Touchdeck

Read `docs/DESIGN.md` §0 and §3 before any work.
Current phase and status live in `docs/PROGRESS.md`.
Ground-truth findings and deviations from the design live in `docs/DECISIONS.md`.
Run `tools/check.sh` before declaring anything done.

Hard rules (from DESIGN.md §0):
- Never modify anything under `$OMARCHY_PATH` (`/usr/share/omarchy`).
- Never edit Shannon's config files (`~/.config/hypr/*`, `~/.config/omarchy/shell.json`,
  theme files). Print the snippet and the file it belongs in instead.
  Running `omarchy plugin ...` / `omarchy-shell shell ...` is fine.
- Only `services/DeckTheme.qml` and `components/DeckSurface.qml` may import
  `qs.Commons` or `qs.Ui` (D7). Everything else styles through `DeckTheme`.
- No colour literals in QML outside `tests/`.
- No synchronous file or process I/O in QML — the deck runs inside the desktop
  shell process (§15).
- One phase at a time. Meet the acceptance criteria, run `tools/check.sh`,
  update `docs/PROGRESS.md`, then stop and summarise.
