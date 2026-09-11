// A widget's settings, generated from its settingsSchema (DESIGN.md 7): one
// row per field, drawn for its type -- a switch, a stepper, choices, a text
// field, an app or GPU picker. Changes apply at once and save on their own.
import QtQuick
import "../components"
import "../lib/settings.mjs" as SettingsLib
import "../lib/widgets.mjs" as Widgets

Item {
  id: root

  required property var theme
  property var services: null
  property string itemId: ""
  property var host: null

  readonly property var editor: root.services ? root.services.editor : null
  readonly property var item: root.editor ? root.editor.item(root.itemId) : null
  readonly property var fields: root.item ? SettingsLib.fields(root.item.type) : []
  // The key of an `app` field being picked, or "" when showing the fields.
  property string pickingKey: ""

  implicitHeight: root.pickingKey !== "" ? root.theme.space(620) : column.implicitHeight

  function valueOf(field) {
    return root.item ? SettingsLib.valueOf(root.item.type, root.item.settings, field) : ""
  }

  function set(field, value) {
    if (!root.editor) return
    var patch = {}
    patch[field.key] = value
    root.editor.updateSettings(root.itemId, patch)
  }

  function gpus() {
    return root.services && root.services.sensors ? root.services.sensors.gpus : []
  }

  function summaryOf(field, value) {
    var ctx = { gpus: root.gpus() }
    if (field.type === "app" && root.services && root.services.apps) {
      var entry = root.services.apps.lookup(value)
      ctx.appName = entry ? entry.name : ""
    }
    return SettingsLib.summary(field, value, ctx)
  }

  function choices(field) {
    return field.type === "gpu" ? SettingsLib.gpuChoices(root.gpus(), field.allowNone) : SettingsLib.enumOptions(field)
  }

  Flickable {
    anchors.fill: parent
    visible: root.pickingKey === ""
    contentHeight: column.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: column
      width: parent.width
      spacing: root.theme.spacing.lg

      DeckText {
        visible: root.item !== null && root.fields.length === 0
        theme: root.theme
        kind: "body"
        tone: "muted"
        text: "This widget has no settings."
      }

      Repeater {
        model: root.fields.length

        Item {
          id: row
          required property int index
          readonly property var field: root.fields[row.index]
          readonly property var value: root.valueOf(row.field)
          readonly property bool isChoice: row.field.type === "enum" || row.field.type === "gpu"
          width: column.width
          height: row.isChoice ? Math.max(root.theme.minTarget, choiceFlow.implicitHeight) : root.theme.minTarget

          DeckText {
            id: fieldLabel
            anchors { left: parent.left; top: parent.top; topMargin: (root.theme.minTarget - height) / 2 }
            width: parent.width * 0.32
            theme: root.theme
            kind: "body"
            tone: "surface"
            text: row.field.label
          }

          Item {
            id: controls
            anchors {
              left: fieldLabel.right
              right: parent.right
              top: parent.top
              bottom: parent.bottom
              leftMargin: root.theme.spacing.md
            }

            TextButton {
              visible: row.field.type === "bool"
              theme: root.theme
              width: root.theme.space(150)
              height: root.theme.minTarget
              text: row.value === true ? "On" : "Off"
              selected: row.value === true
              onClicked: root.set(row.field, row.value !== true)
            }

            Row {
              visible: row.field.type === "number"
              spacing: root.theme.spacing.md

              TextButton {
                theme: root.theme
                width: root.theme.minTarget
                height: root.theme.minTarget
                kind: "heading"
                text: "−"
                onClicked: root.set(row.field, SettingsLib.stepNumber(row.value, row.field, -1))
              }
              DeckText {
                width: root.theme.space(110)
                height: root.theme.minTarget
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                theme: root.theme
                kind: "body"
                font.features: ({ "tnum": 1 })
                text: SettingsLib.numberText(row.value, row.field)
              }
              TextButton {
                theme: root.theme
                width: root.theme.minTarget
                height: root.theme.minTarget
                kind: "heading"
                text: "+"
                onClicked: root.set(row.field, SettingsLib.stepNumber(row.value, row.field, 1))
              }
            }

            Flow {
              id: choiceFlow
              visible: row.isChoice
              width: controls.width
              spacing: root.theme.spacing.sm

              Repeater {
                model: row.isChoice ? root.choices(row.field) : []

                TextButton {
                  required property var modelData
                  theme: root.theme
                  height: root.theme.minTarget
                  text: modelData.label
                  selected: row.value === modelData.value
                  onClicked: root.set(row.field, modelData.value)
                }
              }
            }

            TextBox {
              visible: row.field.type === "string"
              width: controls.width
              theme: root.theme
              editor: root.editor
              text: String(row.value || "")
              placeholder: "Not set"
              onEditingFinished: root.set(row.field, text.trim() === "" ? null : text.trim())
            }

            TextButton {
              visible: row.field.type === "app"
              width: controls.width
              height: root.theme.minTarget
              theme: root.theme
              text: root.summaryOf(row.field, row.value) + "   ›"
              onClicked: root.pickingKey = row.field.key
            }
          }
        }
      }

      TextButton {
        visible: root.item !== null
        theme: root.theme
        danger: true
        text: "Remove from the deck"
        onClicked: {
          if (root.editor) root.editor.remove(root.itemId)
          if (root.host) root.host.close()
        }
      }
    }
  }

  AppPicker {
    anchors.fill: parent
    visible: root.pickingKey !== ""
    theme: root.theme
    services: root.services
    onPicked: function (id) {
      var patch = {}
      patch[root.pickingKey] = id + ".desktop"
      if (root.editor) root.editor.updateSettings(root.itemId, patch)
      root.pickingKey = ""
    }
  }
}
