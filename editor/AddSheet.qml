// What tapping an empty cell in edit mode opens (DESIGN.md 6.1): add a widget,
// an app key, or a key for a custom command, at that cell -- or as near to it
// as it fits.
import QtQuick
import "../components"
import "../lib/widgets.mjs" as Widgets

Item {
  id: root

  required property var theme
  property var services: null
  property var at: null
  property var host: null

  property string tab: root.at && root.at.tab ? root.at.tab : "widgets"
  readonly property var editor: root.services ? root.services.editor : null
  readonly property var widgetTypes: Widgets.types().filter(function (t) { return t !== "app" })

  implicitHeight: root.theme.space(620)

  function add(type, settings) {
    var created = root.editor ? root.editor.add(type, settings, root.at) : null
    if (created && root.host) root.host.close()
  }

  Row {
    id: tabs
    spacing: root.theme.spacing.md

    Repeater {
      model: [
        { key: "widgets", label: "Widgets" },
        { key: "apps", label: "Apps" },
        { key: "custom", label: "Custom command" },
      ]

      TextButton {
        required property var modelData
        theme: root.theme
        text: modelData.label
        selected: root.tab === modelData.key
        onClicked: root.tab = modelData.key
      }
    }
  }

  Item {
    anchors { left: parent.left; right: parent.right; top: tabs.bottom; bottom: parent.bottom; topMargin: root.theme.spacing.xl }

    Flow {
      anchors.fill: parent
      visible: root.tab === "widgets"
      spacing: root.theme.spacing.md

      Repeater {
        model: root.widgetTypes

        Item {
          id: card
          required property string modelData
          readonly property var spec: Widgets.specFor(modelData)
          width: root.theme.space(200)
          height: root.theme.space(110)
          scale: cardTap.pressed ? 0.97 : 1

          DeckSurface {
            anchors.fill: parent
            theme: root.theme
            role: "control"
            pressed: cardTap.pressed
          }
          Column {
            anchors.centerIn: parent
            spacing: root.theme.spacing.xs
            DeckText {
              anchors.horizontalCenter: parent.horizontalCenter
              theme: root.theme
              kind: "heading"
              text: card.spec.displayName
            }
            DeckText {
              anchors.horizontalCenter: parent.horizontalCenter
              theme: root.theme
              kind: "caption"
              tone: "muted"
              text: card.spec.defaultSize.w + "×" + card.spec.defaultSize.h
            }
          }
          TapHandler {
            id: cardTap
            gesturePolicy: TapHandler.ReleaseWithinBounds
            longPressThreshold: root.theme.tapMaxSeconds
            dragThreshold: root.theme.tapSlop
            onTapped: root.add(card.modelData, {})
          }
        }
      }
    }

    AppPicker {
      anchors.fill: parent
      visible: root.tab === "apps"
      theme: root.theme
      services: root.services
      onPicked: function (id) { root.add("app", { desktopId: id + ".desktop" }) }
    }

    Column {
      anchors { left: parent.left; right: parent.right; top: parent.top }
      visible: root.tab === "custom"
      spacing: root.theme.spacing.lg

      TextBox {
        id: command
        width: parent.width
        theme: root.theme
        editor: root.editor
        placeholder: "Command, e.g. xdg-terminal-exec btop"
      }
      TextBox {
        id: keyLabel
        width: parent.width
        theme: root.theme
        editor: root.editor
        placeholder: "Label (optional)"
      }
      TextButton {
        theme: root.theme
        text: "Add key"
        enabled: command.text.trim() !== ""
        onClicked: {
          var settings = { command: command.text.trim() }
          if (keyLabel.text.trim() !== "") settings.label = keyLabel.text.trim()
          root.add("app", settings)
        }
      }
    }
  }
}
