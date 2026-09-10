# Fixtures

`sysroots/<name>/` are miniature `/proc` + `/sys` trees. `bin/touchdeck-collect`
reads them when run with `TOUCHDECK_SYSROOT=tests/fixtures/sysroots/<name>`, so the
collector and every parser can be tested against hardware that isn't present.

| Sysroot | Source | Hardware |
|---|---|---|
| `intel-nvidia` | **captured** from Shannon's machine by `tools/capture-fixture.sh` | i5-12400F (coretemp) + RTX 4070 |
| `amd-radeon` | synthetic, `make_synthetic.py` | Ryzen (k10temp) + Radeon (amdgpu), 32 threads |
| `dual-gpu` | synthetic, `make_synthetic.py` | Intel + RTX 4070 + Radeon, card numbers deliberately not in PCI order |

Each sysroot also has `proc/stat.next` (a second snapshot, so CPU usage can be
tested on real deltas) and, where there is an NVIDIA card, `nvidia-smi.csv` —
lines in exactly the format the deck's `nvidia-smi` stream produces.

When a Radeon is actually installed, capture a real fixture for it:
`tools/capture-fixture.sh intel-nvidia-radeon`.
