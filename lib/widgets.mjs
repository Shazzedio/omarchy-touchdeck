// The widget registry: every widget type the deck knows, with its sizes,
// defaults and the settings schema its settings sheet is generated from
// (DESIGN.md 7). Pure data plus a few helpers, so the edit mode's size rules
// are unit-testable. Sizes are in grid cells.
//
// DESIGN.md puts this in widgets/WidgetRegistry.qml; it lives here instead so
// Node can test it (DECISIONS.md D-19).

const PLACEHOLDER = "components/PlaceholderTile.qml"

export const REGISTRY = {
  cpu: {
    type: "cpu",
    displayName: "CPU",
    source: "widgets/CpuWidget.qml",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 6 },
    defaultSettings: { tempWarn: 80, tempCrit: 95 },
    settingsSchema: [
      // The i5-12400F's maximum junction temperature is 100 °C (DESIGN.md 7.2).
      { key: "tempWarn", type: "number", label: "Warn at (°C)", min: 40, max: 110 },
      { key: "tempCrit", type: "number", label: "Critical at (°C)", min: 40, max: 115 },
    ],
  },
  gpu: {
    type: "gpu",
    displayName: "GPU",
    source: "widgets/GpuWidget.qml",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 6 },
    defaultSettings: { gpu: "auto", tempWarn: 80, tempCrit: 90 },
    settingsSchema: [
      { key: "gpu", type: "gpu", label: "GPU" },
      { key: "tempWarn", type: "number", label: "Warn at (°C)", min: 40, max: 110 },
      { key: "tempCrit", type: "number", label: "Critical at (°C)", min: 40, max: 115 },
    ],
  },
  memory: {
    type: "memory",
    displayName: "Memory",
    source: "widgets/MemoryWidget.qml",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 4, h: 3 },
    maxSize: { w: 8, h: 6 },
    defaultSettings: { showSwap: false, vramGpu: "auto" },
    settingsSchema: [
      { key: "showSwap", type: "bool", label: "Show swap" },
      { key: "vramGpu", type: "gpu", label: "VRAM from", allowNone: true },
    ],
  },
  // Phase 3 widgets. Registered now so sizes and defaults are in one place;
  // they draw as placeholders until they are built.
  volume: {
    type: "volume",
    displayName: "Volume",
    source: PLACEHOLDER,
    minSize: { w: 2, h: 3 },
    defaultSize: { w: 4, h: 6 },
    maxSize: { w: 6, h: 9 },
    defaultSettings: { maxVolume: 1.0, showMic: true, step: 0.05 },
    settingsSchema: [
      { key: "maxVolume", type: "number", label: "Maximum volume", min: 1.0, max: 1.5, step: 0.05 },
      { key: "showMic", type: "bool", label: "Show mic mute" },
      { key: "step", type: "number", label: "Wheel step", min: 0.01, max: 0.1, step: 0.01 },
    ],
  },
  media: {
    type: "media",
    displayName: "Media",
    source: PLACEHOLDER,
    minSize: { w: 3, h: 2 },
    defaultSize: { w: 6, h: 3 },
    maxSize: { w: 10, h: 6 },
    defaultSettings: { preferredPlayer: "" },
    settingsSchema: [
      { key: "preferredPlayer", type: "string", label: "Preferred player" },
    ],
  },
  app: {
    type: "app",
    displayName: "App",
    source: PLACEHOLDER,
    minSize: { w: 1, h: 1 },
    defaultSize: { w: 2, h: 2 },
    maxSize: { w: 3, h: 3 },
    defaultSettings: { target: "auto", confirm: false },
    settingsSchema: [
      { key: "desktopId", type: "app", label: "App" },
      { key: "command", type: "string", label: "Custom command" },
      { key: "label", type: "string", label: "Label" },
      { key: "icon", type: "string", label: "Icon" },
      { key: "target", type: "enum", label: "Open on", options: ["auto", "touch"] },
      { key: "confirm", type: "bool", label: "Ask before launching" },
    ],
  },
}

// What an unknown type (say, from a newer Touchdeck's config) draws as.
export const UNKNOWN = {
  type: "",
  displayName: "Unknown widget",
  source: PLACEHOLDER,
  minSize: { w: 1, h: 1 },
  defaultSize: { w: 2, h: 2 },
  maxSize: { w: 64, h: 64 },
  defaultSettings: {},
  settingsSchema: [],
}

export const ERROR_SOURCE = "components/ErrorTile.qml"

export function specFor(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type) ? REGISTRY[type] : UNKNOWN
}

export function types() {
  return Object.keys(REGISTRY)
}

// Clamp a requested size to the widget's limits and the grid.
export function clampSize(type, w, h, cols, rows) {
  const spec = specFor(type)
  const limit = function (v, lo, hi) { return Math.min(Math.max(Math.round(Number(v) || lo), lo), hi) }
  return {
    w: limit(w, spec.minSize.w, Math.min(spec.maxSize.w, cols > 0 ? cols : spec.maxSize.w)),
    h: limit(h, spec.minSize.h, Math.min(spec.maxSize.h, rows > 0 ? rows : spec.maxSize.h)),
  }
}

// A widget's settings with its defaults filled in; keys the widget doesn't
// know are kept, as everywhere else in the config (DESIGN.md 12).
export function settingsFor(type, settings) {
  return Object.assign({}, specFor(type).defaultSettings, settings || {})
}
