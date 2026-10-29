"""Fail-closed, local-only ESP32 Stage 0 USB diagnostic bridge.

This transport NEVER executes switching, GPIO, scheduling, simulator steps, or
physical measurements. Only PING, INFO, STATUS are sent to verified CH340 USB.
No credentials or board MAC are collected, stored, or logged.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time


class ProtocolError(Exception):
    pass


class Timeout(ProtocolError):
    pass


class OversizedLine(ProtocolError):
    pass


class IncompatibleFirmware(ProtocolError):
    pass


def detect_port(ports):
    """Only trust the CH340 VID/PID; never open an arbitrary COM8."""
    found = [p.device for p in ports if p.vid == 0x1A86 and p.pid == 0x7523]
    if len(found) > 1:
        raise ProtocolError("multiple CH340 adapters; explicit selection required")
    return found[0] if found else None


def native_list_ports():
    from serial.tools import list_ports
    return list_ports.comports()


def native_open_serial(port):
    import serial
    conn = serial.Serial()
    conn.port = port
    conn.baudrate = 115200
    conn.timeout = 0.25
    conn.write_timeout = 1
    conn.dtr = False
    conn.rts = False
    conn.open()
    return conn


class SerialProtocol:
    ALLOWED_COMMANDS = ("PING", "INFO", "STATUS")
    MAX_LINE = 1024
    IGNORE_TYPES = {"heartbeat", "help", "sample", "ack"}

    def __init__(self, port, timeout=2.5):
        self.port = port
        self.timeout = timeout

    def request(self, command):
        if command not in self.ALLOWED_COMMANDS:
            raise ValueError("Stage1 only permits PING, INFO and STATUS")
        expected = {"PING": "pong", "INFO": "board_info", "STATUS": "status"}[command]
        self.port.write((command + "\n").encode("ascii"))
        self.port.flush()
        end = time.monotonic() + self.timeout
        ignored = 0
        while time.monotonic() < end:
            wire = self.port.read_until(b"\n", self.MAX_LINE + 1)
            if not wire:
                time.sleep(0.01)
                continue
            if len(wire) > self.MAX_LINE:
                raise OversizedLine("serial line larger than allowed maximum")
            if not wire.endswith(b"\n"):
                raise OversizedLine("unterminated serial line")
            try:
                value = json.loads(wire.decode("utf-8", errors="strict"))
            except (UnicodeDecodeError, ValueError) as exc:
                raise ProtocolError("malformed JSON from serial device") from exc
            if not isinstance(value, dict) or not isinstance(value.get("type"), str):
                raise ProtocolError("invalid JSON message envelope")
            msg_type = value["type"]
            if msg_type == "boot":
                raise ProtocolError("board rebooted during handshake")
            if msg_type == "error":
                raise ProtocolError("board reported an error")
            if msg_type != expected:
                ignored += 1
                if msg_type not in self.IGNORE_TYPES or ignored > 8:
                    raise ProtocolError("unknown or excessive unsolicited message")
                continue
            self._verify(command, value)
            return value
        raise Timeout("serial response deadline exceeded")

    @staticmethod
    def _verify(command, item):
        # exact types and booleans matter; Python bool is also subclass of int.
        if command == "PING":
            good = item.get("firmware") == "specwatt-stage0"
        elif command == "INFO":
            good = (
                isinstance(item.get("chip"), str)
                and item["chip"].upper().startswith("ESP32")
                and type(item.get("cores")) is int and item["cores"] == 2
                and type(item.get("flash_bytes")) is int and item["flash_bytes"] == 4194304
                and type(item.get("revision")) is int and item["revision"] >= 0
            )
        else:
            good = (
                item.get("firmware") == "specwatt-stage0"
                and type(item.get("schema")) is int and item["schema"] == 1
                and item.get("source") == "diagnostic"
                and item.get("measured") is False
                and item.get("sensor_connected") is False
                and item.get("hardware_actuation") is False
                and item.get("protected_channel") == "CH3"
                and item.get("demo_enabled") is False
                and type(item.get("uptime_ms")) is int and item["uptime_ms"] >= 0
            )
        if not good:
            raise IncompatibleFirmware("Stage0 identity or safety contract mismatch")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Bridge:
    """Single serial owner with polling and exponential reconnect backoff."""
    def __init__(self, status_file, *, list_ports=native_list_ports,
                 open_serial=native_open_serial, interval=2.0):
        self.status_file = Path(status_file)
        self.list_ports = list_ports
        self.open_serial = open_serial
        self.interval = max(0.02, interval)
        self.conn = None
        self.protocol = None
        self.state = "disconnected"
        self.port_name = None
        self.chip = None
        self.last_seen_utc = None
        self.next_retry = 0.0
        self.failures = 0
        self.last_reason = "initial"
        self.publish()

    def status(self):
        return {
            "schema": 1,
            "state": self.state,
            "updated_at_epoch": time.time(),
            "updated_at_utc": utc_now(),
            "last_seen_utc": self.last_seen_utc if self.state == "connected" else None,
            "source": "diagnostic", "measured": False,
            "hardware_actuation": False, "sensor_connected": False,
            "protected_channel": "CH3", "paired": False,
            "port": self.port_name if self.state == "connected" else None,
            "firmware": "specwatt-stage0" if self.state == "connected" else None,
            "chip": self.chip if self.state == "connected" else None,
            "reason": self.last_reason,
        }

    def publish(self):
        self.status_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.status_file.with_name(self.status_file.name + ".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(self.status(), f, sort_keys=True, separators=(",", ":"))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.status_file)

    def log(self, event):
        print(json.dumps({"utc": utc_now(), "event": event, "state": self.state},
                         separators=(",", ":")), flush=True)

    def close(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except OSError:
                pass
        self.conn = None
        self.protocol = None

    def down(self, reason, *, incompatible=False):
        changed = (self.state != ("incompatible_firmware" if incompatible else "disconnected"))
        self.close()
        self.state = "incompatible_firmware" if incompatible else "disconnected"
        self.port_name = None
        self.chip = None
        self.last_seen_utc = None
        self.failures = min(self.failures + 1, 6)
        self.next_retry = time.monotonic() + min(8.0, self.interval * (2 ** (self.failures - 1)))
        self.last_reason = reason
        self.publish()
        if changed:
            self.log(reason)

    def step(self):
        try:
            port = detect_port(self.list_ports())
        except ProtocolError:
            self.down("ambiguous_usb")
            return
        if port is None or (self.conn is not None and port != self.port_name):
            self.down("usb_absent")
            return
        if self.conn is None:
            if time.monotonic() < self.next_retry:
                self.publish()
                return
            self.state = "reconnecting"
            self.last_reason = "handshake"
            self.publish()
            try:
                self.conn = self.open_serial(port)
                # Stage0 sends boot/info/status after reset; don't treat these
                # stale startup events as replies to our new requests.
                time.sleep(0.75)
                if hasattr(self.conn, "reset_input_buffer"):
                    self.conn.reset_input_buffer()
                self.protocol = SerialProtocol(self.conn)
                self.protocol.request("PING")
                info = self.protocol.request("INFO")
                self.protocol.request("STATUS")
                self.chip = info["chip"]
                self.port_name = port
                self.state = "connected"
                self.last_seen_utc = utc_now()
                self.failures = 0
                self.next_retry = 0.0
                self.last_reason = "handshake_verified"
                self.publish()
                self.log("handshake_verified")
            except IncompatibleFirmware:
                self.down("incompatible_firmware", incompatible=True)
            except (ProtocolError, OSError, ValueError) as exc:
                self.down("connect_failed")
            return
        try:
            self.protocol.request("PING")
            self.protocol.request("STATUS")
            self.last_seen_utc = utc_now()
            self.last_reason = "heartbeat_verified"
            self.publish()
        except IncompatibleFirmware:
            self.down("incompatible_firmware", incompatible=True)
        except (ProtocolError, OSError, ValueError):
            self.down("link_lost")

    def stop(self):
        self.close()
        self.state = "disconnected"
        self.port_name = None
        self.chip = None
        self.last_seen_utc = None
        self.last_reason = "bridge_stopped"
        self.publish()
        self.log("bridge_stopped")

    def run(self, duration=0):
        end = time.monotonic() + duration if duration > 0 else None
        try:
            while end is None or time.monotonic() < end:
                self.step()
                time.sleep(self.interval)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()


def main(argv=None):
    parser = argparse.ArgumentParser(description="SpecWATT local-only Stage0 USB bridge")
    parser.add_argument("--status-file", type=Path, required=True)
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("--duration", type=float, default=0.0)
    args = parser.parse_args(argv)
    if not (0.05 <= args.interval <= 30) or not (0 <= args.duration <= 86400):
        parser.error("invalid interval or duration")
    bridge = Bridge(args.status_file, interval=args.interval)
    bridge.run(args.duration)
    return 0


if __name__ == "__main__":
    sys.exit(main())
