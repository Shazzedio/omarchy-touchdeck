#!/usr/bin/env python3
"""Measure the running deck against DESIGN.md 15's CPU budget.

    tools/measure-budget.py [seconds]      # default 60; the deck must be visible

Sampling omarchy-shell's CPU as a whole doesn't work: the deck shares the
shell's one GUI thread (the shell uses Qt's basic render loop) with the bar and
every other plugin, and identical 30 s rounds differ by more than the whole
budget (DECISIONS.md D-28). So each part is measured where it happens:

  render   frames the deck's own window drew, and the time spent drawing them
           (Deck.qml counts beforeSynchronizing -> frameSwapped on its window)
  JS       SensorsService's rolling cost per frame, divided by the interval
  helpers  CPU time of bin/touchdeck-collect and nvidia-smi from /proc

Not covered: polish (text layout) and Wayland event handling for the window,
both small; see D-28.
"""
import json
import os
import subprocess
import sys
import time

BUDGET = 1.0
HZ = os.sysconf("SC_CLK_TCK")


def status():
    out = subprocess.check_output(["omarchy-shell", "shell", "call", "shannon.touchdeck", "status", ""])
    return json.loads(out)


def cpu_ticks(pid):
    try:
        fields = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()
        return int(fields[11]) + int(fields[12])
    except (OSError, IndexError):
        return 0


def helper_pids():
    pids = []
    # Split so this script's own command line can never match.
    for pattern in ("bin/touchdeck-coll" + "ect --interval", "query-gpu=ind" + "ex,pci"):
        found = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True).stdout
        pids += found.split()
    return pids


def interval_ms():
    path = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")),
                        "touchdeck", "config.json")
    try:
        return int(json.load(open(path))["sensors"]["intervalMs"])
    except (OSError, ValueError, KeyError, TypeError):
        return 1000


def main():
    seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    first = status()
    if not first.get("active"):
        sys.exit("The deck isn't visible; summon it first.")
    pids = helper_pids()
    h0 = sum(cpu_ticks(p) for p in pids)
    time.sleep(seconds)
    last = status()
    h1 = sum(cpu_ticks(p) for p in pids)

    # A shell restart in between resets the deck's counters and replaces the
    # helpers, and the differences come out negative. Say so rather than print
    # nonsense.
    gone = [p for p in pids if not os.path.exists(f"/proc/{p}")]
    if last["render"]["frames"] < first["render"]["frames"] or gone:
        sys.exit("The shell restarted (or the helpers did) during the measurement; run it again.")

    wall = (last["render"]["at"] - first["render"]["at"]) / 1000
    frames = last["render"]["frames"] - first["render"]["frames"]
    busy_ms = last["render"]["busyMs"] - first["render"]["busyMs"]
    render = busy_ms / wall / 1000 * 100
    js = last["sensors"]["frameCostMs"] / interval_ms() * 100
    helpers = (h1 - h0) / HZ / seconds * 100
    total = render + js + helpers

    print(f"redraws     {frames / wall:6.2f} /s at {busy_ms / max(1, frames):.2f} ms each")
    print(f"render      {render:6.2f} % of one core")
    print(f"JS          {js:6.2f} %  ({last['sensors']['frameCostMs']:.2f} ms per frame)")
    print(f"helpers     {helpers:6.2f} %  (collector + nvidia-smi)")
    print(f"total       {total:6.2f} %  budget {BUDGET:.0f} %  -> {'within' if total < BUDGET else 'OVER'}")
    if len(pids) < 2:
        print("note: fewer than two helpers were running (no NVIDIA card, or none needed)")


if __name__ == "__main__":
    main()
