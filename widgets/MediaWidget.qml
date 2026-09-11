// Now playing, for any MPRIS player (DESIGN.md 7.6): art, title, artist,
// progress with seeking, and transport controls. Which player: the one that's
// playing, else the most recently active; a preferred player wins while it
// plays; tapping the player chip moves to the next.
import QtQuick
import Quickshell.Widgets
import "../components"
import "../lib/media.mjs" as MediaLib
import "../lib/glyphs.mjs" as Glyphs

Item {
  id: root

  property var theme: null
  property var entry: null
  property var services: null
  property bool editing: false
  property real cellSize: 0

  readonly property var media: root.services ? root.services.media : null
  readonly property var apps: root.services ? root.services.apps : null
  readonly property var launcher: root.services ? root.services.launch : null
  readonly property var settings: root.entry && root.entry.settings ? root.entry.settings : ({})
  readonly property string preferred: root.settings.preferredPlayer ? String(root.settings.preferredPlayer) : ""

  // A player picked by tapping the chip stays picked while it exists.
  property string pinnedKey: ""
  readonly property string playerKey: root.media ? (root.media.choose(root.preferred, root.pinnedKey) || "") : ""
  readonly property var player: root.media && root.playerKey !== "" ? root.media.playerFor(root.playerKey) : null
  readonly property int playerCount: root.media ? root.media.snapshots.length : 0

  // Re-read once a second while playing (MediaService's tick).
  readonly property real position: root.player ? root.player.position : 0
  readonly property real length: root.player && root.player.lengthSupported ? root.player.length : 0
  readonly property var progress: MediaLib.progress(root.position, root.length)

  readonly property int rows: root.entry ? root.entry.h : 3
  readonly property int pad: root.theme.spacing.tilePadding
  readonly property int gap: root.theme.spacing.md
  readonly property bool roomy: root.rows >= 3

  // "Open Spotify" when nothing is playing and a preferred player is set and installed.
  readonly property var preferredApp: root.apps && root.preferred !== "" ? root.apps.lookup(root.preferred.toLowerCase()) : null

  DeckSurface {
    anchors.fill: parent
    theme: root.theme
  }

  // ------------------------------------------------------------ nothing playing

  Column {
    anchors.centerIn: parent
    visible: root.player === null
    spacing: root.theme.spacing.lg

    DeckText {
      anchors.horizontalCenter: parent.horizontalCenter
      theme: root.theme
      tone: "muted"
      font.pixelSize: Math.round(root.theme.font.displayLarge * 1.2)
      text: Glyphs.MUSIC
    }

    DeckText {
      anchors.horizontalCenter: parent.horizontalCenter
      theme: root.theme
      kind: "body"
      tone: "muted"
      text: "Nothing playing"
    }

    IconButton {
      anchors.horizontalCenter: parent.horizontalCenter
      visible: root.preferredApp !== null && root.roomy
      theme: root.theme
      width: root.theme.space(200)
      height: root.theme.minTarget
      label: root.preferredApp ? "Open " + root.preferredApp.name : ""
      onClicked: if (root.launcher) root.launcher.launch(root.entry.id + ":open-player", { desktopId: root.preferred.toLowerCase() })
    }
  }

  // ------------------------------------------------------------ now playing

  Item {
    id: content
    visible: root.player !== null
    anchors.fill: parent
    anchors.margins: root.pad

    // Album art, or a glyph when there is none. Capped to its displayed size
    // (DESIGN.md 15): a 3000px cover is decoded at tile size, not full size.
    ClippingRectangle {
      id: art
      width: Math.min(content.height, content.width * 0.45)
      height: width
      radius: root.theme.cornerRadius
      color: root.theme.alpha(root.theme.foreground, 0.06)

      Image {
        id: cover
        anchors.fill: parent
        source: root.player ? root.player.trackArtUrl : ""
        sourceSize: Qt.size(art.width, art.height)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        visible: status === Image.Ready
      }

      DeckText {
        anchors.centerIn: parent
        visible: !cover.visible
        theme: root.theme
        tone: "muted"
        font.pixelSize: Math.round(art.width * 0.35)
        text: Glyphs.MUSIC
      }
    }

    Item {
      id: details
      anchors { left: art.right; right: parent.right; top: parent.top; bottom: parent.bottom; leftMargin: root.pad }

      readonly property real button: Math.max(1, Math.min(root.theme.primaryTarget,
        (details.width - root.gap * 2) / 3, details.height * (root.roomy ? 0.4 : 0.5)))

      // The player chip: which app this is, and -- with more than one --
      // the way to move to the next.
      Item {
        id: chip
        width: chipText.implicitWidth + root.theme.spacing.lg * 2
        height: Math.max(chipText.implicitHeight + root.theme.spacing.sm * 2, root.playerCount > 1 ? root.theme.minTarget * 0.6 : 0)

        DeckSurface {
          anchors.fill: parent
          visible: root.playerCount > 1
          theme: root.theme
          role: "control"
          pressed: chipTap.pressed
        }
        DeckText {
          id: chipText
          anchors.centerIn: parent
          theme: root.theme
          kind: "caption"
          tone: "muted"
          text: (root.player ? (root.player.identity || root.player.desktopEntry || "") : "") + (root.playerCount > 1 ? "  ›" : "")
        }
        TapHandler {
          id: chipTap
          enabled: root.playerCount > 1
          gesturePolicy: TapHandler.ReleaseWithinBounds
          longPressThreshold: root.theme.tapMaxSeconds
          dragThreshold: root.theme.tapSlop
          onTapped: if (root.media) root.pinnedKey = root.media.nextKey(root.playerKey) || ""
        }
      }

      Column {
        id: textBlock
        anchors { left: parent.left; right: parent.right; top: chip.bottom; topMargin: root.theme.spacing.sm }
        spacing: root.theme.spacing.xs

        DeckText {
          width: parent.width
          theme: root.theme
          kind: "heading"
          tone: "surface"
          text: root.player ? (root.player.trackTitle || root.player.identity || "") : ""
        }
        DeckText {
          width: parent.width
          theme: root.theme
          kind: "body"
          tone: "muted"
          visible: text !== ""
          text: root.player ? (root.player.trackArtist || "") : ""
        }
        DeckText {
          width: parent.width
          theme: root.theme
          kind: "caption"
          tone: "muted"
          visible: root.roomy && text !== ""
          text: root.player ? (root.player.trackAlbum || "") : ""
        }
      }

      Item {
        id: progressRow
        visible: root.progress !== null
        anchors { left: parent.left; right: parent.right; bottom: transport.top; bottomMargin: root.theme.spacing.sm }
        height: seekBar.height + times.height

        SeekBar {
          id: seekBar
          anchors { left: parent.left; right: parent.right; top: parent.top }
          height: implicitHeight
          theme: root.theme
          fraction: root.progress === null ? 0 : root.progress
          seekable: root.player !== null && root.player.canSeek && root.length > 0
          onSeek: function (f) { if (root.media) root.media.seekTo(root.player, f * root.length) }
        }
        DeckText {
          id: times
          anchors { left: parent.left; top: seekBar.bottom }
          theme: root.theme
          kind: "caption"
          tone: "muted"
          font.features: ({ "tnum": 1 })
          text: MediaLib.formatTime(root.position)
        }
        DeckText {
          anchors { right: parent.right; top: seekBar.bottom }
          theme: root.theme
          kind: "caption"
          tone: "muted"
          font.features: ({ "tnum": 1 })
          text: MediaLib.formatTime(root.length)
        }
      }

      Row {
        id: transport
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom }
        spacing: root.gap

        IconButton {
          theme: root.theme
          width: details.button
          height: details.button
          glyph: Glyphs.PREVIOUS
          enabled: root.player !== null && root.player.canGoPrevious
          onClicked: if (root.media) root.media.previous(root.player)
        }
        IconButton {
          theme: root.theme
          width: details.button
          height: details.button
          glyph: root.player && root.player.isPlaying ? Glyphs.PAUSE : Glyphs.PLAY
          selected: root.player !== null && root.player.isPlaying
          enabled: root.player !== null && (root.player.canTogglePlaying || root.player.canPlay || root.player.canPause)
          onClicked: if (root.media) root.media.togglePlaying(root.player)
        }
        IconButton {
          theme: root.theme
          width: details.button
          height: details.button
          glyph: Glyphs.NEXT
          enabled: root.player !== null && root.player.canGoNext
          onClicked: if (root.media) root.media.next(root.player)
        }
      }
    }
  }
}
