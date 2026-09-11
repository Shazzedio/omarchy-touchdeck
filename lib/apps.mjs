// App keys -> what they show and what launching them runs. Pure.
// AppsService.qml owns desktop entries; LaunchService.qml runs
// bin/touchdeck-launch with the arguments built here. ES2015 only: this also
// runs in Qt's QML engine.

// Quickshell's DesktopEntries.byId wants the bare id -- "brave-browser", not
// "brave-browser.desktop" (checked on this machine, DECISIONS.md G-13). Config
// and xdg tools use either, so everything goes through here.
export function normalizeDesktopId(id) {
  let s = String(id || "").trim()
  const colon = s.indexOf(":")
  if (colon > 0) s = s.slice(0, colon)   // xdg-terminal-exec --print-id can append ":<action>"
  if (s.slice(-8) === ".desktop") s = s.slice(0, -8)
  return s
}

export function parseTarget(value) {
  const s = String(value || "auto").trim()
  const m = /^workspace:(\S+)$/.exec(s)
  if (m) return { kind: "workspace", workspace: m[1] }
  if (s === "touch") return { kind: "touch" }
  return { kind: "auto" }
}

function text(v) { return typeof v === "string" ? v.trim() : "" }

// What a key is and shows:
//   app      a desktop entry that exists
//   command  a custom command
//   missing  a desktop entry that has gone (the app was uninstalled)
//   loading  a desktop entry, but entries haven't been read yet: don't claim
//            "Not installed" for the half-second after the shell starts
//   unset    nothing configured yet
// lookup(id) returns { name, icon } or null.
export function describeKey(settings, lookup, loaded) {
  const s = settings || {}
  const id = normalizeDesktopId(s.desktopId)
  const command = text(s.command)
  const label = text(s.label)
  const icon = text(s.icon)
  if (id) {
    if (!loaded) return { state: "loading", title: label || id, icon: icon, desktopId: id, command: "" }
    const entry = lookup ? lookup(id) : null
    if (!entry) return { state: "missing", title: label || id, icon: icon, desktopId: id, command: "" }
    return { state: "app", title: label || entry.name || id, icon: icon || entry.icon || "", desktopId: id, command: "" }
  }
  if (command) return { state: "command", title: label || command, icon: icon || "utilities-terminal", desktopId: "", command: command }
  return { state: "unset", title: label, icon: icon, desktopId: "", command: "" }
}

// Arguments for bin/touchdeck-launch, or null if there's nothing to launch.
//   ctx.lastMonitor  the last focused monitor that isn't the deck's
//   ctx.deckMonitor  the deck's own output
export function launchArgs(settings, ctx) {
  const s = settings || {}
  const c = ctx || {}
  const id = normalizeDesktopId(s.desktopId)
  const command = text(s.command)
  if (!id && !command) return null
  // The deck's own output, so the launcher knows when the pointer is sitting
  // on the deck and must leave with focus (DECISIONS.md D-43).
  const args = c.deckMonitor ? ["--deck", c.deckMonitor] : []
  const target = parseTarget(s.target)
  if (target.kind === "workspace") args.push("--workspace", target.workspace)
  else if (target.kind === "touch" && c.deckMonitor) args.push("--monitor", c.deckMonitor)
  else if (target.kind === "auto" && c.lastMonitor) args.push("--monitor", c.lastMonitor)
  if (id) args.push("--desktop", id)
  else args.push("--command", command)
  return args
}

// bin/touchdeck-defaults prints browser=, files= and terminal= lines.
export function parseDefaults(raw) {
  const out = { browser: "", files: "", terminal: "" }
  const lines = String(raw || "").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = /^(browser|files|terminal)=(.*)$/.exec(lines[i].trim())
    if (m) out[m[1]] = normalizeDesktopId(m[2])
  }
  return out
}

// Resolve the one-shot `defaultRole` hints the first-run layout carries
// (DECISIONS.md D-16). A role whose app is found gets its desktop id; one that
// isn't found is simply cleared, so it isn't retried on every start.
// exists(id) says whether a desktop entry is installed.
export function applyDefaultRoles(items, defaults, exists) {
  let changed = false
  const out = []
  const list = items || []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const settings = item && item.settings ? item.settings : null
    if (!item || item.type !== "app" || !settings || !settings.defaultRole) {
      out.push(item)
      continue
    }
    const next = Object.assign({}, settings)
    const id = defaults ? defaults[settings.defaultRole] : ""
    delete next.defaultRole
    if (id && exists(id) && !normalizeDesktopId(next.desktopId) && !text(next.command)) next.desktopId = id + ".desktop"
    out.push(Object.assign({}, item, { settings: next }))
    changed = true
  }
  return { items: out, changed: changed }
}

export function needsDefaultRoles(items) {
  const list = items || []
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].type === "app" && list[i].settings && list[i].settings.defaultRole) return true
  }
  return false
}
