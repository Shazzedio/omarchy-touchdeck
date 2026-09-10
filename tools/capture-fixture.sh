#!/usr/bin/env bash
# Capture the files bin/touchdeck-collect reads on this machine into a fixture
# sysroot, so the collector and parsers can be tested against real hardware
# without that hardware present:
#
#   tools/capture-fixture.sh intel-nvidia
#
# Writes tests/fixtures/sysroots/<name>/. sysfs symlinks become plain
# directories (the plugin folder must contain no symlinks), only the attributes
# the collector reads are copied, and every directory gets at least one file so
# git keeps it. Run it again when the hardware changes -- e.g. when a Radeon is
# added -- to get a real fixture for it.
set -euo pipefail
shopt -s nullglob

name="${1:?usage: tools/capture-fixture.sh <name>}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$repo/tests/fixtures/sysroots/$name"

rm -rf "$dest"
mkdir -p "$dest/proc"

copy() { # copy <src> <dst>: one readable procfs/sysfs attribute, as a plain file
  [[ -r $1 ]] || return 0
  mkdir -p "$(dirname "$2")"
  cat "$1" > "$2" 2>/dev/null || rm -f "$2"
}

chip_files() { # the attributes the collector reads from one hwmon chip
  local dir=$1 f
  for f in "$dir"/name "$dir"/temp*_label "$dir"/temp*_input \
           "$dir"/power1_average "$dir"/power1_input "$dir"/fan1_input; do
    [[ -e $f ]] && printf '%s\n' "$f"
  done
  return 0
}

copy /proc/stat "$dest/proc/stat"
copy /proc/meminfo "$dest/proc/meminfo"

for f in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq; do
  copy "$f" "$dest$f"
done

for dir in /sys/class/hwmon/hwmon*; do
  while IFS= read -r f; do
    copy "$f" "$dest/sys/class/hwmon/${dir##*/}/${f##*/}"
  done < <(chip_files "$dir")
done

for card in /sys/class/drm/card[0-9]*; do
  base=${card##*/}
  if [[ $base == *-* ]]; then
    # A connector. The collector only needs to see it exists (and skip it).
    copy "$card/status" "$dest/sys/class/drm/$base/status"
    continue
  fi
  for f in vendor device uevent gpu_busy_percent mem_info_vram_used mem_info_vram_total; do
    copy "$card/device/$f" "$dest/sys/class/drm/$base/device/$f"
  done
  for h in "$card"/device/hwmon/hwmon*; do
    while IFS= read -r f; do
      copy "$f" "$dest/sys/class/drm/$base/device/hwmon/${h##*/}/${f##*/}"
    done < <(chip_files "$h")
  done
done

# A second /proc/stat a second later, so parsers can be tested on real deltas.
sleep 1
copy /proc/stat "$dest/proc/stat.next"

if command -v nvidia-smi >/dev/null 2>&1; then
  for _ in 1 2 3; do
    nvidia-smi --query-gpu=index,pci.bus_id,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed \
      --format=csv,noheader,nounits 2>/dev/null || true
    sleep 0.5
  done > "$dest/nvidia-smi.csv"
  [[ -s $dest/nvidia-smi.csv ]] || rm -f "$dest/nvidia-smi.csv"
fi

printf 'captured %s: %d files\n' "$name" "$(find "$dest" -type f | wc -l)"
