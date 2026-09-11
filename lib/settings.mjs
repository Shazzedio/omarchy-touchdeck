// Widget settings sheets, generated from each widget's settingsSchema
// (lib/widgets.mjs, DESIGN.md 7). Pure: SettingsSheet.qml draws one row per
// field and calls these to read, step and describe values.
// ES2015 only: this also runs in Qt's QML engine.
import * as Widgets from "./widgets.mjs"

export function fields(type) {
  return Widgets.specFor(type).settingsSchema
}

function isSet(v) { return v !== undefined && v !== null && v !== "" }

// A field's current value: the item's setting, else the widget's default, else
// a sensible value for the field's type.
export function valueOf(type, settings, field) {
  const s = settings || {}
  if (isSet(s[field.key])) return s[field.key]
  const defaults = Widgets.specFor(type).defaultSettings
  if (isSet(defaults[field.key])) return defaults[field.key]
  if (field.type === "bool") return false
  if (field.type === "number") return field.min !== undefined ? field.min : 0
  if (field.type === "enum") return field.options && field.options.length ? field.options[0] : ""
  if (field.type === "gpu") return "auto"
  return ""
}

function decimals(step) {
  const s = String(step)
  const dot = s.indexOf(".")
  return dot === -1 ? 0 : s.length - dot - 1
}

// One step up (direction 1) or down (-1), clamped, and rounded to the step so
// 0.1 + 0.2 never shows as 0.30000000000000004.
export function stepNumber(value, field, direction) {
  const step = field.step || 1
  const places = decimals(step)
  let n = Number(value)
  if (!isFinite(n)) n = field.min !== undefined ? field.min : 0
  n = n + step * (direction < 0 ? -1 : 1)
  if (field.min !== undefined) n = Math.max(field.min, n)
  if (field.max !== undefined) n = Math.min(field.max, n)
  return Number(n.toFixed(places))
}

export function numberText(value, field) {
  const n = Number(value)
  return isFinite(n) ? n.toFixed(decimals(field.step || 1)) : "—"
}

// Enum options as { value, label } for a segmented control.
export function enumOptions(field) {
  const labels = field.labels || {}
  const out = []
  const list = field.options || []
  for (let i = 0; i < list.length; i++) out.push({ value: list[i], label: labels[list[i]] || list[i] })
  return out
}

// GPU choices for a `gpu` field: automatic, each GPU the machine has (by PCI
// address, never cardN), and "none" where the field allows it.
export function gpuChoices(gpus, allowNone) {
  const out = [{ value: "auto", label: "First discrete GPU" }]
  const list = gpus || []
  for (let i = 0; i < list.length; i++) {
    out.push({ value: list[i].pci, label: list[i].name + "  " + String(list[i].pci).replace(/^0000:/, "") })
  }
  if (allowNone) out.push({ value: "none", label: "None" })
  return out
}

// The short text a row shows for its current value.
export function summary(field, value, ctx) {
  const c = ctx || {}
  if (field.type === "bool") return value ? "On" : "Off"
  if (field.type === "number") return numberText(value, field)
  if (field.type === "enum") {
    const opts = enumOptions(field)
    for (let i = 0; i < opts.length; i++) if (opts[i].value === value) return opts[i].label
    return String(value)
  }
  if (field.type === "gpu") {
    const choices = gpuChoices(c.gpus, field.allowNone)
    for (let i = 0; i < choices.length; i++) if (choices[i].value === value) return choices[i].label
    return String(value) + " (not present)"
  }
  if (field.type === "app") return c.appName ? c.appName : (isSet(value) ? String(value) : "None")
  return isSet(value) ? String(value) : "Not set"
}
