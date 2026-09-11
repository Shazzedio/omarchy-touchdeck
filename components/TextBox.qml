// A one-line text field. While it has focus the deck takes the keyboard
// (EditorService.textInput); typing is always optional -- everything can be
// done by touch (DESIGN.md 17 Phase 4).
import QtQuick

Item {
  id: root

  required property var theme
  property var editor: null
  property alias text: input.text
  property string placeholder: ""

  signal accepted()
  signal editingFinished()

  implicitHeight: root.theme.minTarget

  function focusInput() { input.forceActiveFocus() }

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
    role: "control"
    selected: input.activeFocus
  }

  TextInput {
    id: input
    anchors {
      left: parent.left
      right: parent.right
      verticalCenter: parent.verticalCenter
      leftMargin: root.theme.spacing.xl
      rightMargin: root.theme.spacing.xl
    }
    clip: true
    font.family: root.theme.font.family
    font.pixelSize: root.theme.font.body
    color: root.theme.foreground
    selectionColor: root.theme.alpha(root.theme.accent, 0.4)
    selectedTextColor: root.theme.foreground
    onActiveFocusChanged: if (root.editor) root.editor.setTextFocus(root, activeFocus)
    onAccepted: {
      input.focus = false
      root.accepted()
    }
    onEditingFinished: root.editingFinished()
  }

  DeckText {
    anchors { left: input.left; right: input.right; verticalCenter: parent.verticalCenter }
    visible: input.text === "" && !input.activeFocus
    theme: root.theme
    kind: "body"
    tone: "muted"
    text: root.placeholder
  }

  TapHandler { onTapped: input.forceActiveFocus() }

  Component.onDestruction: if (root.editor) root.editor.setTextFocus(root, false)
}
