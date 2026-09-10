// A themed card surface. The second and last file allowed to import qs.Ui /
// qs.Commons (DESIGN.md D7): it wraps Omarchy's BorderSurface so themes with
// gradient or per-side borders render correctly on the deck too, instead of
// the deck drawing its own flat rectangle and quietly looking wrong.
//
// Callers pass a DeckTheme and, optionally, a state -- everything else about
// borders and radius comes from the theme's tokens.
import QtQuick
import qs.Commons
import qs.Ui

BorderSurface {
  id: root

  required property var theme

  // "surface" -- a resting widget card, using the popups border role.
  // "control" -- an interactive control, using Omarchy's shared [controls]
  //              state tokens so buttons on the deck match buttons elsewhere.
  property string role: "surface"
  property bool pressed: false
  property bool selected: false
  property bool invalid: false

  // Widgets that want the deck background to show through (a borderless gauge,
  // DESIGN.md 9) set this false rather than fighting the border spec.
  property bool filled: true

  readonly property int borderWidth: Math.max(1, theme ? theme.space(2) : 1)

  color: {
    if (!root.filled) return "transparent"
    if (root.role === "control") {
      if (root.pressed) return Style.pressedFill
      if (root.selected) return Style.selectedFill
      return Style.normalFill
    }
    return root.theme.surface
  }

  radius: root.theme ? root.theme.cornerRadius : 0

  borderSpec: {
    // An invalid drop target in edit mode reads as urgent whatever the role,
    // because "this move will be rejected" outranks the surface's own styling.
    if (root.invalid)
      return Border.flat(Color.urgent, root.borderWidth)
    // A pressed key takes the accent on its edge: the deck's one signature
    // moment (DESIGN.md 9). Accent is otherwise reserved for live values.
    if (root.pressed)
      return Border.flat(Color.accent, root.borderWidth)
    if (root.role === "control")
      return Border.controlSpec(root.selected ? "selected" : "normal",
        Color.foreground, Color.accent, Color.urgent)
    return Border.surfaceSpec("popups", "border", Color.popups.border, root.borderWidth)
  }

  Behavior on color {
    enabled: root.theme && !root.theme.reduceMotion
    ColorAnimation { duration: root.theme ? root.theme.pressDuration : 0 }
  }
}
