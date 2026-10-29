"""Strict, unpaired host USB bridge status read by authenticated Brain API.

Never treats USB Stage 0 as a hardware controller. Never imports serial,
accepts arbitrary paths from HTTP clients, or reports sensor measurement.
"""
from __future__ import annotations
import json
from pathlib import Path
import time


def read_host_bridge_status(file_path, *, now=None):
    offline = {
        "state": "disconnected", "source": "diagnostic", "measured": False,
        "hardware_actuation": False, "protected_channel": "CH3",
        "port": None, "firmware": None, "chip": None,
        "paired": False, "reason": "unavailable_or_stale",
    }
    if not file_path:
        return offline
    try:
        path = Path(file_path)
        if not path.is_file() or path.stat().st_size > 4096:
            return offline
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return offline
        ts = data.get("updated_at_epoch")
        epoch = time.time() if now is None else now
        if (type(ts) not in (float, int) or
                not 0 <= epoch - ts <= 12 or
                data.get("schema") != 1 or
                data.get("source") != "diagnostic" or
                data.get("measured") is not False or
                data.get("hardware_actuation") is not False or
                data.get("sensor_connected") is not False or
                data.get("protected_channel") != "CH3" or
                data.get("paired") is not False):
            return offline
        state = data.get("state")
        if state not in ("connected", "disconnected", "reconnecting", "incompatible_firmware"):
            return offline
        result = dict(offline)
        result["state"] = state
        result["reason"] = "bridge_status"
        if state == "connected":
            port = data.get("port")
            fw = data.get("firmware")
            chip = data.get("chip")
            if (not isinstance(port, str) or not port.startswith("COM") or len(port) > 12
                    or fw != "specwatt-stage0" or not isinstance(chip, str)
                    or not chip.startswith("ESP32") or len(chip) > 40):
                return offline
            result.update({"port": port, "firmware": fw, "chip": chip})
        return result
    except (OSError, ValueError, UnicodeError, TypeError, OverflowError):
        return offline
