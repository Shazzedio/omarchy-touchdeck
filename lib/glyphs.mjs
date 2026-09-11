// Icon glyphs: the same Nerd Font codepoints Omarchy's OSD uses
// (shell/plugins/osd/OsdModel.js), so the deck's icons match the rest of the
// desktop. Written as escapes -- several are above U+FFFF, so surrogate pairs,
// which every JavaScript engine reads the same. tests/glyphs.test.mjs checks
// them against Omarchy's file.

export const VOLUME_MUTED = "\uEEE8"   // U+EEE8  osd "volume-muted"
export const VOLUME_LOW = "\uF026"   // U+F026  osd "volume-low"
export const VOLUME_MEDIUM = "\uF027"   // U+F027  osd "volume-medium"
export const VOLUME_HIGH = "\uF028"   // U+F028  osd "volume-high"
export const MIC = "\uDB80\uDF6C"   // U+F036C  osd "microphone"
export const MIC_OFF = "\uDB80\uDF6D"   // U+F036D  osd "microphone-muted"
export const MUSIC = "\uDB81\uDF5A"   // U+F075A  osd "media"
export const PLAY = "\uDB81\uDC0A"   // U+F040A  osd "media-play"
export const PAUSE = "\uDB80\uDFE4"   // U+F03E4  osd "media-pause"
export const NEXT = "\uDB81\uDCAD"   // U+F04AD  osd "media-next"
export const PREVIOUS = "\uDB81\uDCAE"   // U+F04AE  osd "media-previous"

// The OSD name each glyph mirrors, for the test.
export const OMARCHY_NAMES = {
  VOLUME_MUTED: "volume-muted",
  VOLUME_LOW: "volume-low",
  VOLUME_MEDIUM: "volume-medium",
  VOLUME_HIGH: "volume-high",
  MIC: "microphone",
  MIC_OFF: "microphone-muted",
  MUSIC: "media",
  PLAY: "media-play",
  PAUSE: "media-pause",
  NEXT: "media-next",
  PREVIOUS: "media-previous",
}

// level is what lib/audio.mjs volumeLevel() returns.
export function volume(level) {
  if (level === "muted") return VOLUME_MUTED
  if (level === "low") return VOLUME_LOW
  if (level === "medium") return VOLUME_MEDIUM
  return VOLUME_HIGH
}
