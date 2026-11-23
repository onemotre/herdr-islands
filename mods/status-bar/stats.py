# Prints system load as JSON: {"cpu", "mem", "battery", "charging", "load"} (percentages).
import glob, json, os, re, subprocess, sys, time

def run(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return ""

if sys.platform.startswith("linux"):
    def read_cpu():
        with open("/proc/stat") as f:
            parts = [int(x) for x in f.readline().split()[1:8]]
        idle = parts[3] + parts[4]
        return sum(parts), idle

    try:
        t1, i1 = read_cpu()
        time.sleep(0.12)
        t2, i2 = read_cpu()
        dt = max(1, t2 - t1)
        cpu = 100.0 * (dt - (i2 - i1)) / dt
    except Exception:
        cpu = 0.0

    mem_pct = 0.0
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                info[k] = int(v.strip().split()[0])
        total = info.get("MemTotal", 1)
        avail = info.get("MemAvailable", info.get("MemFree", 0))
        mem_pct = 100.0 * max(0, total - avail) / max(1, total)
    except Exception:
        pass

    battery, charging = None, False
    for bat in sorted(glob.glob("/sys/class/power_supply/BAT*")):
        try:
            with open(os.path.join(bat, "capacity")) as f:
                battery = int(f.read().strip())
            with open(os.path.join(bat, "status")) as f:
                charging = f.read().strip().lower() in ("charging", "full")
            break
        except Exception:
            pass

    print(json.dumps({
        "cpu": round(min(100.0, max(0.0, cpu)), 1),
        "mem": round(min(100.0, max(0.0, mem_pct)), 1),
        "battery": battery,
        "charging": charging,
        "load": round(os.getloadavg()[0], 2),
    }))
else:
    ncpu = os.cpu_count() or 1
    cpu = sum(float(x) for x in run("ps", "-A", "-o", "%cpu=").split() if x.replace(".", "", 1).isdigit()) / ncpu
    vm = run("vm_stat")
    page = int(re.search(r"page size of (\d+)", vm).group(1)) if "page size" in vm else 16384
    def pages(label):
        m = re.search(label + r":\s+(\d+)", vm)
        return int(m.group(1)) if m else 0
    used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * page
    total = int(run("sysctl", "-n", "hw.memsize").strip() or 1)
    batt = run("pmset", "-g", "batt")
    m = re.search(r"(\d+)%;\s*([a-z ]+);", batt)
    print(json.dumps({
        "cpu": round(min(100, cpu), 1),
        "mem": round(100 * used / total, 1),
        "battery": int(m.group(1)) if m else None,
        "charging": bool(m and ("charging" in m.group(2) and "discharging" not in m.group(2)) or "AC Power" in batt),
        "load": round(os.getloadavg()[0], 2),
    }))
