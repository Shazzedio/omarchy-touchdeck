// A key that opens an app or runs a command (DESIGN.md 7.1).
//   1×1       the icon, the name underneath if it fits
//   2×2 up    icon and name
// A tap depresses it at once, then it shows "Opening…" until the app's window
// appears or five seconds pass. A key whose app has been uninstalled says so
// in muted type rather than failing silently.
import QtQuick
import "../components"

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0

  readonly property var apps: root.services ? root.services.apps : null
  readonly property var launcher: root.services ? root.services.launch : null
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})
  readonly property var info: root.apps ? root.apps.describe(root.settings) : ({ state: "loading", title: "", icon: "" })
  readonly property bool usable: root.info.state === "app" || root.info.state === "command"
  readonly property bool opening: root.launcher && root.entry ? root.launcher.isLaunching(root.entry.id) : false
  readonly property bool dimmed: root.info.state === "missing" || root.info.state === "unset"

  // "Ask before launching": the first tap arms the key, a second one within
  // three seconds launches.
  property bool armed: false
  Timer { id: disarm; interval: 3000; onTriggered: root.armed = false }

  function activate() {
    if (root.editing || !root.usable || !root.launcher) return
    if (root.settings.confirm === true && !root.armed) {
      root.armed = true
      disarm.restart()
      return
    }
    root.armed = false
    root.launcher.launch(root.entry.id, root.settings)
  }

  readonly property string statusText: {
    if (root.opening) return "Opening…"
    if (root.armed) return "Tap again to open"
    if (root.info.state === "missing") return "Not installed"
    if (root.info.state === "unset") return "No app set"
    return ""
  }

  readonly property bool showName: root.height >= root.theme.primaryTarget * 1.2
  readonly property real iconSize: Math.round(Math.min(root.width, root.height) * (root.showName ? 0.42 : 0.56))

  scale: tap.pressed ? 0.96 : 1
  Behavior on scale {
    enabled: !root.theme.reduceMotion
    NumberAnimation { duration: root.theme.pressDuration }
  }

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
    role: "control"
    pressed: tap.pressed
    selected: root.opening || root.armed
  }

  Column {
    anchors.centerIn: parent
    width: parent.width - root.theme.spacing.md * 2
    spacing: root.theme.spacing.sm
    opacity: root.dimmed ? 0.5 : 1

    Item {
      width: parent.width
      height: root.iconSize

      Image {
        id: icon
        anchors.centerIn: parent
        width: root.iconSize
        height: root.iconSize
        visible: status === Image.Ready && root.info.icon !== ""
        source: root.apps && root.info.icon !== "" ? root.apps.iconSource(root.info.icon) : ""
        sourceSize: Qt.size(root.iconSize, root.iconSize)
        asynchronous: true
        fillMode: Image.PreserveAspectFit
        smooth: true
      }

      // No icon (or it didn't load): the name's first letter, so a key is
      // never blank.
      DeckText {
        anchors.centerIn: parent
        visible: !icon.visible
        theme: root.theme
        kind: "value"
        tone: "muted"
        font.pixelSize: Math.max(1, Math.round(root.iconSize * 0.6))
        text: root.info.state === "unset" ? "+" : String(root.info.title || "?").charAt(0).toUpperCase()
      }
    }

    DeckText {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      visible: root.showName && root.info.title !== ""
      theme: root.theme
      kind: "label"
      tone: "surface"
      text: root.info.title
    }

    DeckText {
      width: parent.width
      horizontalAlignment: Text.AlignHCenter
      visible: root.statusText !== "" && (root.showName || root.opening)
      theme: root.theme
      kind: "caption"
      tone: root.opening || root.armed ? "accent" : "muted"
      text: root.statusText
    }
  }

  TapHandler {
    id: tap
    gesturePolicy: TapHandler.ReleaseWithinBounds
    longPressThreshold: root.theme.tapMaxSeconds
    dragThreshold: root.theme.tapSlop
    onTapped: root.activate()
  }
}
