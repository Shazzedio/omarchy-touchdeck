// The theme adapter. This file and components/DeckSurface.qml are the ONLY
// two allowed to import qs.Commons or qs.Ui (DESIGN.md D3/D7) -- everything
// else in the deck styles itself through a DeckTheme instance. Keeping the
// surface area to two files is what makes it cheap to follow Omarchy's token
// API as it moves, and what makes the Appendix B fallback a two-file swap.
//
// Nothing here copies a token into a plain variable: every property below is a
// binding, so a theme push re-renders the deck with no reload code at all.
// Verified across every installed theme in Phase 0 (DECISIONS.md G-6).
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "../lib/theme.mjs" as ThemeLib

QtObject {
  id: root

  // Set by the window that owns this instance.
  property real windowWidth: 0
  property real windowHeight: 0
  property int columns: 16
  property int rows: 9
  property real appearanceScale: 1.0
  property bool reduceMotion: false

  // ------------------------------------------------------------ scale
  //
  // Omarchy's type scale is sized for a 26px bar; the deck is read at arm's
  // length. Everything typographic and spatial is multiplied by this, so the
  // deck still tracks `omarchy display text size` while staying legible.
  //
  // Derived from the window's logical size rather than the fitted cell, which
  // would be circular: the grid's margin and gap come from this scale.
  readonly property real touchScale: ThemeLib.touchScale(
    root.windowWidth, root.windowHeight, root.columns, root.rows, root.appearanceScale)

  function space(px) {
    var n = Style.space(px) * root.touchScale
    return n <= 0 ? 0 : Math.max(1, Math.round(n))
  }

  function fontSize(px) {
    return Math.max(1, Math.round(px * root.touchScale))
  }

  readonly property int cornerRadius: Style.cornerRadius

  // ------------------------------------------------------------ palette

  readonly property color background: Color.background
  readonly property color foreground: Color.foreground
  readonly property color muted: Color.muted
  readonly property color accent: Color.accent
  readonly property color urgent: Color.urgent

  // Widget cards use the `popups` roles: Omarchy uses them for flyouts and
  // popup cards, which is the closest semantic match to a deck tile.
  readonly property color surface: Color.popups.background
  readonly property color surfaceText: Color.popups.text
  readonly property color surfaceBorder: Color.popups.border

  function alpha(c, a) { return Util.alpha(c, a) }

  // ------------------------------------------------------------ typography

  readonly property QtObject font: QtObject {
    readonly property string family: Style.font.family
    readonly property string resolvedFamily: Style.resolvedFontFamily
    readonly property int caption: root.fontSize(Style.font.caption)
    readonly property int bodySmall: root.fontSize(Style.font.bodySmall)
    readonly property int body: root.fontSize(Style.font.body)
    readonly property int subtitle: root.fontSize(Style.font.subtitle)
    readonly property int title: root.fontSize(Style.font.title)
    readonly property int heading: root.fontSize(Style.font.heading)
    readonly property int display: root.fontSize(Style.font.display)
    readonly property int displayLarge: root.fontSize(Style.font.displayLarge)
  }

  // ------------------------------------------------------------ spacing

  readonly property QtObject spacing: QtObject {
    readonly property int xs: root.space(3)
    readonly property int sm: root.space(4)
    readonly property int md: root.space(6)
    readonly property int lg: root.space(8)
    readonly property int xl: root.space(10)
    readonly property int xxl: root.space(12)
    // The grid's own metrics. Deliberately derived from Omarchy's spacing
    // tokens so a theme that asks for a denser shell gets a denser deck.
    readonly property int gridGap: root.space(6)
    readonly property int gridMargin: root.space(10)
    readonly property int tilePadding: root.space(10)
  }

  // ------------------------------------------------------------ motion
  //
  // DESIGN.md 9: motion only ever answers input or data. reduceMotion turns
  // every duration to zero rather than making them shorter, so bindings that
  // read these need no special case.

  readonly property int pressDuration: root.reduceMotion ? 0 : 80
  // Smaller changes to a live value land without easing, so once-a-second
  // sensor wobble doesn't redraw the deck at 60 fps (see EasedValue.qml).
  readonly property real easeThreshold: 8
  readonly property int valueDuration: root.reduceMotion ? 0 : 250
  readonly property int editDuration: root.reduceMotion ? 0 : 150

  // ------------------------------------------------------------ status
  //
  // Omarchy's Color singleton carries the foundational palette and per-surface
  // roles but not the named hues, so ok/warn/critical are read out of the
  // active theme's colors.toml. Re-read on two independent triggers because
  // neither alone is reliable: the file is replaced wholesale on a theme
  // switch (which can lose an inotify watch), and Omarchy pushes new tokens
  // over IPC without touching the file the shell already read.

  readonly property string themePath:
    Quickshell.env("HOME") + "/.local/state/omarchy/current/theme"

  property var _themeColors: ({})
  property string mode: "dark"
  readonly property bool isDark: root.mode !== "light"

  readonly property var status: ThemeLib.statusColors({
    named: root._themeColors,
    accent: String(root.accent),
    urgent: String(root.urgent),
  })

  readonly property color statusOk: root.status.ok
  readonly property color statusWarn: root.status.warn
  readonly property color statusCritical: root.status.critical

  // Several themes are monochrome or put green and yellow in the same corner
  // of the wheel. Widgets ask these before relying on hue alone; when a band
  // is not distinguishable they add a non-colour cue instead of pretending.
  readonly property var _legibility: ThemeLib.statusLegibility(root.status)
  readonly property bool criticalDistinct: root._legibility.criticalDistinct
  readonly property bool warnDistinct: root._legibility.warnDistinct

  function statusColor(name) {
    if (name === "critical") return root.statusCritical
    if (name === "warn") return root.statusWarn
    if (name === "ok") return root.statusOk
    return root.muted
  }

  function statusFor(value, warn, crit) {
    return ThemeLib.statusFor(value, warn, crit)
  }

  function applyColorsToml(text) {
    var parsed = ThemeLib.parseColorsToml(text)
    root._themeColors = parsed.colors
    root.mode = parsed.mode
  }

  readonly property FileView colorsFile: FileView {
    path: root.themePath + "/colors.toml"
    watchChanges: true
    printErrors: false
    onLoaded: root.applyColorsToml(text())
    // text() is stale inside the change signal itself, so route both paths
    // through reload() -> onLoaded and always parse fresh content.
    onFileChanged: reload()
    onLoadFailed: root.applyColorsToml("")
  }

  // The IPC theme push updates Color without touching colors.toml on disk, so
  // watch a token that always moves with a theme and re-read when it does.
  readonly property Connections _themePush: Connections {
    target: Color
    function onBackgroundChanged() { root.colorsFile.reload() }
    function onAccentChanged() { root.colorsFile.reload() }
  }
}
