"""Real Stage 1 acceptance: the physical COM8 bridge and throwaway Brain HTTP."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
STATUS = Path(r"D:\SpecWATT-ESP32-Stage1\bridge-status.json")
SERIAL_PY = Path(r"D:\SpecWATT-ESP32-Stage0\venv\Scripts\python.exe")
BRIDGE = ROOT / "tools" / "esp32_bridge" / "bridge.py"
SMOKE = ROOT / "tools" / "esp32_bridge" / "brain_http_smoke.py"

def read_status():
    try:
        return json.loads(STATUS.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}

def main():
    env = os.environ.copy()
    env["SPECWATT_USB_BRIDGE_STATUS"] = str(STATUS)
    args = [str(SERIAL_PY), "-B", str(BRIDGE), "--status-file", str(STATUS),
            "--interval", "1", "--duration", "20"]
    print("START_REAL_BRIDGE=COM8,115200; NO_FLASH=true", flush=True)
    proc = subprocess.Popen(args, cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    smoke_exit = None
    live = {}
    try:
        for _ in range(80):
            live = read_status()
            age = time.time() - live.get("updated_at_epoch", 0)
            if live.get("state") == "connected" and 0 <= age < 2:
                break
            if proc.poll() is not None:
                raise RuntimeError("bridge exited before handshake")
            time.sleep(0.1)
        else:
            raise RuntimeError("live handshake not verified")
        assert live["port"] == "COM8"
        assert live["source"] == "diagnostic" and live["measured"] is False
        assert live["paired"] is False and live["protected_channel"] == "CH3"
        print("REAL_BRIDGE_CONNECTED=PASS,PORT=COM8,CH3=PROTECTED,MEASURED=false", flush=True)
        smoke = subprocess.run([sys.executable, "-B", str(SMOKE)], cwd=ROOT,
                               env=env, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=25)
        smoke_exit = smoke.returncode
        print(smoke.stdout, end="", flush=True)
        if smoke.stderr:
            print("HTTP_STDERR=" + smoke.stderr[-1000:], flush=True)
        print("BRAIN_HTTP_SMOKE_EXIT=" + str(smoke_exit), flush=True)
    finally:
        try:
            output, _ = proc.communicate(timeout=26)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                output, _ = proc.communicate(timeout=4)
            except subprocess.TimeoutExpired:
                proc.kill()
                output, _ = proc.communicate()
        print("BRIDGE_PROCESS_EXIT=" + str(proc.returncode), flush=True)
        print("BRIDGE_EVENT_LOG=" + output[-1800:], flush=True)
    after = read_status()
    print("AFTER_EXIT_STATE=" + str(after.get("state")), flush=True)
    assert proc.returncode == 0
    assert after.get("state") == "disconnected" and after.get("reason") == "bridge_stopped"
    assert smoke_exit == 0
    print("LIVE_ACCEPTANCE_EXIT=0", flush=True)
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("LIVE_ACCEPTANCE_ERROR=" + repr(exc), flush=True)
        sys.exit(1)
