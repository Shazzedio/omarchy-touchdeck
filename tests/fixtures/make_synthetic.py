#!/usr/bin/env python3
"""Build the synthetic fixture sysroots.

`intel-nvidia` is captured from real hardware by tools/capture-fixture.sh. The
two built here stand in for hardware this machine does not have yet, following
the kernel's documented sysfs layout:

  amd-radeon  Ryzen (k10temp) + one Radeon (amdgpu), 32 threads
  dual-gpu    Intel (coretemp) + NVIDIA + Radeon -- the planned setup

amdgpu attributes follow https://docs.kernel.org/gpu/amdgpu/thermal.html and
https://docs.kernel.org/gpu/amdgpu/driver-misc.html: gpu_busy_percent (%),
mem_info_vram_used/total (bytes), hwmon temps in millidegrees C with labels
edge/junction/mem, power in microwatts, fan1_input in RPM.

Values are chosen so tests can assert exact results: between proc/stat and
proc/stat.next every CPU advances exactly 100 jiffies, of which a known number
are busy. Regenerate with: python3 tests/fixtures/make_synthetic.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "sysroots"


def write(base, rel, value):
    path = base / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    text = str(value)
    path.write_text(text if text.endswith("\n") else text + "\n")


def stat_pair(threads, busy_of):
    """Two /proc/stat snapshots; CPU i spends busy_of(i) of the next 100 jiffies busy."""
    first, second = [], []
    for i in range(threads):
        # user nice system idle iowait irq softirq steal guest guest_nice
        a = [1000 + i * 10, 5, 400 + i, 90000 + i * 100, 50, 20, 10, 0, 0, 0]
        b = list(a)
        busy = busy_of(i)
        b[0] += busy
        b[3] += 100 - busy
        first.append(a)
        second.append(b)

    def render(rows):
        total = [sum(col) for col in zip(*rows)]
        lines = ["cpu  " + " ".join(map(str, total))]
        lines += ["cpu%d %s" % (i, " ".join(map(str, r))) for i, r in enumerate(rows)]
        # The real file carries these after the cpu lines; `intr` is enormous,
        # which is why the collector stops reading at the first non-cpu line.
        lines += ["intr 123456 " + " ".join(["0"] * 400), "ctxt 987654",
                  "btime 1789000000", "processes 4242", "procs_running 2",
                  "procs_blocked 0", "softirq 1 2 3 4 5 6 7 8 9 10 11"]
        return "\n".join(lines)

    return render(first), render(second)


def meminfo(total_kb, avail_kb, swap_total_kb, swap_free_kb):
    return "\n".join([
        f"MemTotal:       {total_kb} kB",
        f"MemFree:        {avail_kb // 2} kB",
        f"MemAvailable:   {avail_kb} kB",
        "Buffers:          123456 kB",
        "Cached:          4567890 kB",
        "SwapCached:            0 kB",
        "Active:          9876543 kB",
        f"SwapTotal:      {swap_total_kb} kB",
        f"SwapFree:       {swap_free_kb} kB",
        "Dirty:              100 kB",
    ])


def cpu_basics(base, threads, busy_of, khz_of, mem):
    stat, nxt = stat_pair(threads, busy_of)
    write(base, "proc/stat", stat)
    write(base, "proc/stat.next", nxt)
    write(base, "proc/meminfo", meminfo(*mem))
    for i in range(threads):
        write(base, f"sys/devices/system/cpu/cpu{i}/cpufreq/scaling_cur_freq", khz_of(i))


def hwmon(base, hid, name, attrs):
    write(base, f"sys/class/hwmon/{hid}/name", name)
    for key, value in attrs.items():
        write(base, f"sys/class/hwmon/{hid}/{key}", value)


def connector(base, name):
    write(base, f"sys/class/drm/{name}/status", "connected")


def amd_card(base, card, pci, device_id, busy, vram_used, vram_total,
             hwmon_id, power_attr, power_uw):
    dev = f"sys/class/drm/{card}/device"
    write(base, f"{dev}/vendor", "0x1002")
    write(base, f"{dev}/device", device_id)
    write(base, f"{dev}/uevent", "\n".join([
        "DRIVER=amdgpu", "PCI_CLASS=30000",
        f"PCI_ID=1002:{device_id[2:].upper()}", "PCI_SUBSYS_ID=1DA2:E471",
        f"PCI_SLOT_NAME={pci}",
        f"MODALIAS=pci:v00001002d0000{device_id[2:].upper()}sv00001DA2sd0000E471bc03sc00i00",
    ]))
    write(base, f"{dev}/gpu_busy_percent", busy)
    write(base, f"{dev}/mem_info_vram_used", vram_used)
    write(base, f"{dev}/mem_info_vram_total", vram_total)
    chip = {
        "name": "amdgpu",
        "temp1_label": "edge", "temp1_input": 51000,
        "temp2_label": "junction", "temp2_input": 58000,
        "temp3_label": "mem", "temp3_input": 62000,
        power_attr: power_uw,
        "fan1_input": 1200,
    }
    for key, value in chip.items():
        write(base, f"{dev}/hwmon/{hwmon_id}/{key}", value)
        # The kernel exposes the same chip under /sys/class/hwmon too. The
        # collector must not mistake it for a CPU temperature chip.
        write(base, f"sys/class/hwmon/{hwmon_id}/{key}", value)


def nvidia_card(base, card, pci):
    dev = f"sys/class/drm/{card}/device"
    write(base, f"{dev}/vendor", "0x10de")
    write(base, f"{dev}/device", "0x2786")
    write(base, f"{dev}/uevent", "\n".join([
        "DRIVER=nvidia", "PCI_CLASS=30000", "PCI_ID=10DE:2786",
        "PCI_SUBSYS_ID=196E:13CD", f"PCI_SLOT_NAME={pci}",
    ]))


def amd_radeon():
    base = ROOT / "amd-radeon"
    cpu_basics(base, 32,
               busy_of=lambda i: 50 if i % 2 == 0 else 25,          # total 37.5 %
               khz_of=lambda i: 5200000 if i % 2 == 0 else 4000000,  # mean 4600 MHz
               mem=(65536000, 49152000, 8388604, 8388604))           # 16 GiB used of 64
    hwmon(base, "hwmon0", "nvme", {"temp1_label": "Composite", "temp1_input": 41850})
    hwmon(base, "hwmon1", "k10temp", {
        "temp1_label": "Tctl", "temp1_input": 67500,
        "temp3_label": "Tccd1", "temp3_input": 60250,
        "temp4_label": "Tccd2", "temp4_input": 58000,
    })
    amd_card(base, "card0", "0000:03:00.0", "0x744c", busy=13,
             vram_used=2147483648, vram_total=25753026560,
             hwmon_id="hwmon2", power_attr="power1_average", power_uw=45000000)
    connector(base, "card0-DP-1")
    connector(base, "card0-HDMI-A-1")


def dual_gpu():
    base = ROOT / "dual-gpu"
    cpu_basics(base, 12,
               busy_of=lambda i: 10 * (i % 5),                       # 0,10,20,30,40,...
               khz_of=lambda i: 4400000,
               mem=(32665976, 27812792, 65331580, 65000000))
    hwmon(base, "hwmon0", "acpitz", {"temp1_input": 27800})
    hwmon(base, "hwmon3", "coretemp", dict(
        [("temp1_label", "Package id 0"), ("temp1_input", 54000)]
        + [(f"temp{n + 2}_label", f"Core {n}") for n in range(6)]
        + [(f"temp{n + 2}_input", 50000 + n * 1000) for n in range(6)]))
    # card0 is the Radeon and card1 the NVIDIA even though the Radeon's PCI
    # address is later: card numbering follows probe order, not the bus, and
    # changes between boots. Which is why GPUs are keyed by PCI address.
    amd_card(base, "card0", "0000:05:00.0", "0x7480", busy=87,
             vram_used=12884901888, vram_total=17163091968,
             hwmon_id="hwmon5", power_attr="power1_input", power_uw=212000000)
    nvidia_card(base, "card1", "0000:01:00.0")
    connector(base, "card1-HDMI-A-1")
    write(base, "nvidia-smi.csv", "\n".join([
        "0, 00000000:01:00.0, NVIDIA GeForce RTX 4070, 45, 6751, 12282, 66, 120.50, 41",
        "0, 00000000:01:00.0, NVIDIA GeForce RTX 4070, 47, 6760, 12282, 66, 121.05, 41",
        "0, 00000000:01:00.0, NVIDIA GeForce RTX 4070, 44, 6748, 12282, 67, 119.80, 42",
    ]))


if __name__ == "__main__":
    for name, build in (("amd-radeon", amd_radeon), ("dual-gpu", dual_gpu)):
        shutil.rmtree(ROOT / name, ignore_errors=True)
        build()
        count = sum(1 for p in (ROOT / name).rglob("*") if p.is_file())
        print(f"built {name}: {count} files")
