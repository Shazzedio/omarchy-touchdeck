// Pick an installed app (DESIGN.md 11): search -- typing is optional -- or
// browse with the A–Z rail. The rail's letters are small, so it works by
// sliding a finger along it, the way phone contact lists do, rather than by
// hitting a letter exactly.
import QtQuick
import "../components"
import "../lib/fuzzy.mjs" as Fuzzy

Item {
  id: root

  required property var theme
  property var services: null

  signal picked(string id)

  property string query: ""
  readonly property var apps: root.services && root.services.apps ? root.services.apps.list(root.query) : []
  readonly property var letters: {
    if (root.query !== "") return ({})
    var names = []
    for (var i = 0; i < root.apps.length; i++) names.push(root.apps[i].name)
    return Fuzzy.letterIndex(names)
  }

  TextBox {
    id: search
    anchors { left: parent.left; right: parent.right; top: parent.top }
    theme: root.theme
    editor: root.services ? root.services.editor : null
    placeholder: "Search apps (optional)"
    onTextChanged: root.query = text
  }

  ListView {
    id: list
    anchors {
      top: search.bottom
      topMargin: root.theme.spacing.md
      left: parent.left
      right: rail.left
      rightMargin: root.theme.spacing.sm
      bottom: parent.bottom
    }
    clip: true
    spacing: root.theme.spacing.xs
    boundsBehavior: Flickable.StopAtBounds
    model: root.apps

    delegate: Item {
      id: appRow
      required property var modelData
      width: list.width
      height: root.theme.minTarget
      scale: rowTap.pressed ? 0.98 : 1

      DeckSurface {
        anchors.fill: parent
        theme: root.theme
        role: "control"
        pressed: rowTap.pressed
      }

      Image {
        id: rowIcon
        anchors { left: parent.left; verticalCenter: parent.verticalCenter; leftMargin: root.theme.spacing.lg }
        width: Math.round(root.theme.minTarget * 0.6)
        height: width
        source: root.services && appRow.modelData.icon !== "" ? root.services.apps.iconSource(appRow.modelData.icon) : ""
        sourceSize: Qt.size(width, height)
        asynchronous: true
        fillMode: Image.PreserveAspectFit
      }

      DeckText {
        anchors { left: rowIcon.right; right: generic.left; verticalCenter: parent.verticalCenter; leftMargin: root.theme.spacing.lg }
        theme: root.theme
        kind: "body"
        text: appRow.modelData.name
      }

      DeckText {
        id: generic
        anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: root.theme.spacing.lg }
        width: Math.min(implicitWidth, parent.width * 0.35)
        theme: root.theme
        kind: "caption"
        tone: "muted"
        text: appRow.modelData.generic
      }

      TapHandler {
        id: rowTap
        gesturePolicy: TapHandler.ReleaseWithinBounds
        longPressThreshold: root.theme.tapMaxSeconds
        dragThreshold: root.theme.tapSlop
        onTapped: root.picked(appRow.modelData.id)
      }
    }
  }

  DeckText {
    anchors.centerIn: list
    visible: root.apps.length === 0
    theme: root.theme
    kind: "body"
    tone: "muted"
    text: root.query === "" ? "Loading apps…" : "No apps match"
  }

  Item {
    id: rail
    visible: root.query === ""
    anchors { top: list.top; bottom: parent.bottom; right: parent.right }
    width: visible ? Math.round(root.theme.minTarget * 0.7) : 0
    property string current: ""

    function jump(y) {
      var slot = rail.height / Fuzzy.RAIL.length
      var i = Math.max(0, Math.min(Fuzzy.RAIL.length - 1, Math.floor(y / slot)))
      // No app under that letter: the next letter down that has one.
      for (var j = i; j < Fuzzy.RAIL.length; j++) {
        var letter = Fuzzy.RAIL[j]
        if (root.letters[letter] !== undefined) {
          rail.current = letter
          list.positionViewAtIndex(root.letters[letter], ListView.Beginning)
          return
        }
      }
    }

    DeckSurface {
      anchors.fill: parent
      theme: root.theme
      role: "control"
      pressed: railDrag.active
    }

    Column {
      anchors.fill: parent

      Repeater {
        model: Fuzzy.RAIL

        DeckText {
          required property string modelData
          width: rail.width
          height: rail.height / Fuzzy.RAIL.length
          horizontalAlignment: Text.AlignHCenter
          verticalAlignment: Text.AlignVCenter
          theme: root.theme
          kind: "caption"
          font.bold: rail.current === modelData
          tone: rail.current === modelData ? "accent" : (root.letters[modelData] !== undefined ? "normal" : "muted")
          text: modelData
        }
      }
    }

    DragHandler {
      id: railDrag
      target: null
      xAxis.enabled: false
      dragThreshold: 0
      onCentroidChanged: if (active) rail.jump(centroid.position.y)
      onActiveChanged: if (!active) rail.current = ""
    }

    TapHandler {
      onTapped: function (point) { rail.jump(point.position.y) }
    }
  }
}
