#!/usr/bin/env bash
# The single quality gate (DESIGN.md 16). Must pass before any phase is marked
# done. Run from anywhere; it works on the repo it lives in.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
REPO="$PWD"
OMARCHY_PATH="${OMARCHY_PATH:-/usr/share/omarchy}"

FAILED=()
SKIPPED=()

bold=$'\e[1m'; red=$'\e[31m'; green=$'\e[32m'; yellow=$'\e[33m'; dim=$'\e[2m'; off=$'\e[0m'
[[ -t 1 ]] || { bold=""; red=""; green=""; yellow=""; dim=""; off=""; }

step() { printf '%s==>%s %s\n' "$bold" "$off" "$1"; }
ok()   { printf '    %sok%s %s\n' "$green" "$off" "$1"; }
bad()  { printf '    %sFAIL%s %s\n' "$red" "$off" "$1"; FAILED+=("$1"); }
skip() { printf '    %sskip%s %s\n' "$yellow" "$off" "$1"; SKIPPED+=("$1"); }

# qmllint is shipped in Qt's libexec dir and is often not on PATH.
find_qmllint() {
  if command -v qmllint >/dev/null 2>&1; then command -v qmllint; return; fi
  local candidate
  for candidate in /usr/lib/qt6/bin/qmllint /usr/lib/qt6/libexec/qmllint /usr/lib/qt/bin/qmllint; do
    [[ -x "$candidate" ]] && { echo "$candidate"; return; }
  done
}

qml_files() {
  find "$REPO" -name '*.qml' -not -path '*/.git/*' | sort
}

# ---------------------------------------------------------------- 1. manifest

step "omarchy plugin validate"
if command -v omarchy >/dev/null 2>&1; then
  if omarchy plugin validate "$REPO" >/dev/null 2>&1; then
    ok "manifest.json"
  else
    omarchy plugin validate "$REPO" 2>&1 | sed 's/^/    /'
    bad "manifest is not valid"
  fi
else
  skip "omarchy not on PATH"
fi

# DESIGN.md 14: the plugin folder must contain no symlinks -- the installer's
# validator rejects them, and a symlink is an easy way to smuggle a path out of
# the plugin directory.
step "no symlinks in the plugin folder"
mapfile -t LINKS < <(find "$REPO" -type l -not -path '*/.git/*')
if ((${#LINKS[@]} == 0)); then
  ok "none"
else
  printf '    %s\n' "${LINKS[@]}"
  bad "symlinks are not allowed inside a plugin folder"
fi

# ---------------------------------------------------------------- 2. qmllint

step "qmllint"
QMLLINT="$(find_qmllint)"
if [[ -z "$QMLLINT" ]]; then
  skip "qmllint not found (Qt 6 dev tools)"
elif [[ ! -d "$OMARCHY_PATH/shell" ]]; then
  skip "\$OMARCHY_PATH/shell not found, cannot resolve qs.Commons"
else
  # Quickshell maps its config root to the `qs` module prefix at runtime, so
  # qs.Commons lives at $OMARCHY_PATH/shell/Commons. qmllint needs an import
  # path where that resolves as `qs/Commons` -- hence a shim directory holding
  # one symlink. It is built outside the repo so the no-symlinks rule above
  # still holds (DECISIONS.md D-9).
  SHIM="$(mktemp -d)"
  trap 'rm -rf "$SHIM"' EXIT
  ln -sfn "$OMARCHY_PATH/shell" "$SHIM/qs"

  # Known-benign warnings, filtered so a real one is not lost in the noise:
  #   - Style.font.family / Color.popups.border: qmllint cannot see through a
  #     grouped QtObject property. Omarchy's own shell trips these too.
  #   - PanelWindow / singleton types: created by Quickshell, not by QML.
  #   - Unqualified access to the Commons singletons, which is how they are
  #     designed to be used.
  QMLLINT_NOISE='Member "[a-zA-Z]+" not found on type "QObject"|is not creatable|Unqualified access|ComponentBehavior: Bound|^\s*$|^pragma|^//|^\^|^\s+\^|Did you mean|Warnings occurred while importing'

  LINT_OUT="$(mktemp)"
  LINT_STATUS=0
  while IFS= read -r file; do
    "$QMLLINT" -I "$SHIM" -I /usr/lib/qt6/qml "$file" 2>&1 |
      grep -vE "$QMLLINT_NOISE" |
      grep -E '^(Warning|Error):' >> "$LINT_OUT" || true
  done < <(qml_files)

  # lib/ is shared between Node (tests) and the QML engine (the running deck),
  # and they accept different JavaScript: Node takes object spread, QML's engine
  # refuses to load the module at all -- which takes the whole deck down while
  # every Node test still passes. Lint lib/ under the QML parser so that
  # mismatch fails here instead of on the touch display.
  while IFS= read -r file; do
    "$QMLLINT" "$file" 2>&1 | grep -E '^(Warning|Error):' >> "$LINT_OUT" || true
  done < <(find "$REPO/lib" "$REPO/tests/qml" -name '*.mjs' 2>/dev/null | sort)

  if [[ -s "$LINT_OUT" ]]; then
    sed 's/^/    /' "$LINT_OUT"
    bad "qmllint reported $(wc -l < "$LINT_OUT") issue(s)"
  else
    ok "$(qml_files | wc -l) QML file(s) and $(find "$REPO/lib" -name '*.mjs' | wc -l) lib module(s) clean"
  fi
  rm -f "$LINT_OUT"
fi

# ---------------------------------------------------------------- 3. unit tests

step "node --test"
if command -v node >/dev/null 2>&1; then
  if node --test 'tests/**/*.test.mjs' > /tmp/touchdeck-tests.$$ 2>&1; then
    ok "$(grep -oP '^# pass \K\d+|^ℹ pass \K\d+' /tmp/touchdeck-tests.$$ | tail -1) test(s) passed"
  else
    tail -40 /tmp/touchdeck-tests.$$ | sed 's/^/    /'
    bad "unit tests failed"
  fi
  rm -f /tmp/touchdeck-tests.$$
else
  skip "node not on PATH (development-only dependency)"
fi

# ---------------------------------------------------------------- 4. collector

step "collector against fixtures"
if [[ ! -x "$REPO/bin/touchdeck-collect" && ! -f "$REPO/bin/touchdeck-collect" ]]; then
  skip "bin/touchdeck-collect does not exist yet (Phase 2)"
elif [[ ! -d "$REPO/tests/fixtures" ]] || [[ -z "$(ls -A "$REPO/tests/fixtures" 2>/dev/null)" ]]; then
  skip "no fixtures yet (Phase 2)"
else
  # The real assertions live in the Node suite, which runs the collector
  # against each fixture sysroot; this only checks it is runnable at all.
  if bash "$REPO/bin/touchdeck-collect" --selftest >/dev/null 2>&1; then
    ok "collector runs"
  else
    bad "collector selftest failed"
  fi
fi

# ---------------------------------------------------------------- 5. shellcheck

step "shellcheck"
if command -v shellcheck >/dev/null 2>&1; then
  mapfile -t SH_FILES < <(find "$REPO/bin" "$REPO/tools" -type f 2>/dev/null | sort)
  if ((${#SH_FILES[@]} == 0)); then
    skip "no shell scripts yet"
  elif shellcheck "${SH_FILES[@]}"; then
    ok "${#SH_FILES[@]} script(s) clean"
  else
    bad "shellcheck reported issues"
  fi
else
  # Not fatal: the bash collector's real coverage is the fixture-driven test
  # above, and blocking every phase on a missing dev tool helps nobody
  # (DECISIONS.md D-8).
  skip "shellcheck not installed -- 'sudo pacman -S shellcheck' for full coverage"
fi

# ---------------------------------------------------------------- 6. guards

step "theme adapter boundary (D7)"
# Only DeckTheme.qml and DeckSurface.qml may reach for Omarchy's singletons.
# Everything else goes through a DeckTheme instance, which is what keeps the
# blast radius of an upstream token change to two files.
LEAKS="$(qml_files |
  grep -vE '(services/DeckTheme|components/DeckSurface)\.qml$' |
  xargs grep -ln '^import qs\.\(Commons\|Ui\)' 2>/dev/null || true)"
if [[ -z "$LEAKS" ]]; then
  ok "qs.Commons / qs.Ui confined to the two adapters"
else
  printf '    %s\n' $LEAKS
  bad "qs.* imported outside the adapter files"
fi

step "no colour literals in QML"
# Colours must come from the theme. "transparent" is allowed: it is an absence
# of colour, not a choice of one.
COLOUR_HITS="$(qml_files | while IFS= read -r f; do
  grep -nE '(#[0-9a-fA-F]{3,8}"|Qt\.rgba\(|"(white|black|red|green|blue|yellow|orange|purple|grey|gray)")' "$f" |
    sed "s|^|${f#$REPO/}:|"
done)"
if [[ -z "$COLOUR_HITS" ]]; then
  ok "none"
else
  printf '    %s\n' "$COLOUR_HITS"
  bad "colour literals found in QML"
fi

step "no synchronous I/O in QML"
# The deck runs inside the desktop shell process: a blocking read here freezes
# Shannon's bar, notifications and lock screen (DESIGN.md 15).
SYNC_HITS="$(qml_files | xargs grep -nE 'blockLoading:\s*true|blockAllReads:\s*true|waitForEnd:\s*true' 2>/dev/null || true)"
if [[ -z "$SYNC_HITS" ]]; then
  ok "none"
else
  printf '    %s\n' "$SYNC_HITS"
  bad "synchronous I/O in QML"
fi

# ---------------------------------------------------------------- summary

echo
if ((${#SKIPPED[@]} > 0)); then
  printf '%sskipped:%s %s\n' "$yellow" "$off" "$(IFS=';'; echo "${SKIPPED[*]}")"
fi
if ((${#FAILED[@]} > 0)); then
  printf '%sFAILED%s (%d): %s\n' "$red" "$off" "${#FAILED[@]}" "$(IFS='; '; echo "${FAILED[*]}")"
  exit 1
fi
printf '%sAll checks passed.%s\n' "$green" "$off"
