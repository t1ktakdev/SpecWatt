import json
import tempfile
import unittest
from pathlib import Path
from tools.esp32_bridge.bridge import Bridge, SerialProtocol, detect_port, ProtocolError, IncompatibleFirmware, Timeout, OversizedLine

def packet(cmd):
    if cmd == "PING": return {"type":"pong","firmware":"specwatt-stage0"}
    if cmd == "INFO": return {"type":"board_info","chip":"ESP32-D0WDQ5","revision":3,"cores":2,"flash_bytes":4194304,"heap_free":123456}
    if cmd == "STATUS": return {"type":"status","firmware":"specwatt-stage0","schema":1,"source":"diagnostic","sensor_connected":False,"measured":False,"hardware_actuation":False,"demo_enabled":False,"protected_channel":"CH3","uptime_ms":1000}
    raise AssertionError(cmd)

class FakeSerial:
    def __init__(self, responses=None):
        self.responses=responses or {}; self.queue=[]; self.commands=[]; self.closed=False; self.broken=False
    def write(self, data):
        if self.broken: raise OSError("USB lost")
        cmd=data.decode().strip(); self.commands.append(cmd)
        v=self.responses.get(cmd,packet(cmd))
        if isinstance(v,list): self.queue.extend(v)
        elif v is not None: self.queue.append(v)
        return len(data)
    def flush(self): pass
    def read_until(self,sep=b"\n",size=1025):
        if self.broken: raise OSError("USB lost")
        if not self.queue: return b""
        v=self.queue.pop(0); data=v if isinstance(v,bytes) else json.dumps(v).encode()+b"\n"
        if len(data)>size: self.queue.insert(0,data[size:])
        return data[:size]
    def close(self): self.closed=True

class Port:
    def __init__(self,device="COM8",vid=0x1A86,pid=0x7523,description="USB-SERIAL CH340"):
        self.device,self.vid,self.pid,self.description=device,vid,pid,description

class BridgeTests(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(detect_port([Port(),Port("COM9",1,2)]),"COM8")
        self.assertIsNone(detect_port([]))
        self.assertIsNone(detect_port([Port(vid=1,pid=2)]))
        with self.assertRaises(ProtocolError): detect_port([Port(),Port("COM9")])
    def test_success_commands(self):
        p=FakeSerial(); q=SerialProtocol(p)
        self.assertEqual(q.request("PING")["type"],"pong")
        self.assertEqual(q.request("INFO")["flash_bytes"],4194304)
        self.assertEqual(q.request("STATUS")["protected_channel"],"CH3")
        self.assertEqual(p.commands,["PING","INFO","STATUS"])
    def test_invalid_json(self):
        with self.assertRaises(ProtocolError): SerialProtocol(FakeSerial({"PING":b"{bad\n"})).request("PING")
    def test_timeout(self):
        with self.assertRaises(Timeout): SerialProtocol(FakeSerial({"PING":None}),timeout=0.02).request("PING")
    def test_oversized(self):
        with self.assertRaises(OversizedLine): SerialProtocol(FakeSerial({"PING":b"x"*2048+b"\n"})).request("PING")
    def test_incompatible(self):
        with self.assertRaises(IncompatibleFirmware): SerialProtocol(FakeSerial({"PING":{"type":"pong","firmware":"other"}})).request("PING")
        bad=packet("STATUS");bad["measured"]=True
        with self.assertRaises(IncompatibleFirmware): SerialProtocol(FakeSerial({"STATUS":bad})).request("STATUS")
    def test_reset(self):
        with self.assertRaises(ProtocolError):
            SerialProtocol(FakeSerial({"PING":[{"type":"boot","firmware":"specwatt-stage0"}]}),timeout=0.02).request("PING")
    def test_unsolicited_and_duplicate(self):
        status=packet("STATUS")
        p=FakeSerial({"STATUS":[{"type":"heartbeat","uptime_ms":5,"source":"diagnostic"},status,status]})
        self.assertEqual(SerialProtocol(p).request("STATUS")["type"],"status")
    def test_disconnect_reconnect_close(self):
        with tempfile.TemporaryDirectory() as t:
            first=FakeSerial(); made=[]; ports=[Port()]
            def opener(port):
                p=first if not made else FakeSerial()
                made.append(p);return p
            b=Bridge(Path(t)/"state.json",list_ports=lambda:ports[:],open_serial=opener,interval=0.02)
            b.step();self.assertEqual(b.state,"connected");self.assertFalse(b.status()["measured"])
            ports.clear();b.step();self.assertEqual(b.state,"disconnected");self.assertTrue(first.closed)
            ports.append(Port());b.next_retry=0;b.step();self.assertEqual(b.state,"connected")
            b.stop();self.assertTrue(made[-1].closed)
    def test_link_loss_during_poll_and_repeated_reconnect(self):
        with tempfile.TemporaryDirectory() as t:
            ports=[Port()]
            connections=[]
            def opener(port):
                device=FakeSerial()
                connections.append(device)
                return device
            b=Bridge(Path(t)/"status.json",list_ports=lambda:ports[:],
                     open_serial=opener,interval=0.02)
            b.step()
            self.assertEqual(b.state,"connected")
            for _ in range(3):
                connections[-1].broken=True
                b.step()
                self.assertEqual(b.state,"disconnected")
                self.assertTrue(connections[-1].closed)
                b.next_retry=0
                b.step()
                self.assertEqual(b.state,"connected")
            self.assertEqual(len(connections),4)
            b.stop()
            self.assertTrue(connections[-1].closed)

    def test_incompatible_then_recovery_without_command_retry(self):
        with tempfile.TemporaryDirectory() as t:
            ports=[Port()]
            bad=packet("STATUS");bad["hardware_actuation"]=True
            opened=[]
            def opener(port):
                value=FakeSerial({"STATUS":bad}) if not opened else FakeSerial()
                opened.append(value)
                return value
            b=Bridge(Path(t)/"status.json",list_ports=lambda:ports[:],
                     open_serial=opener,interval=0.02)
            b.step()
            self.assertEqual(b.state,"incompatible_firmware")
            self.assertEqual(opened[0].commands,["PING","INFO","STATUS"])
            self.assertTrue(opened[0].closed)
            b.next_retry=0
            b.step()
            self.assertEqual(b.state,"connected")
            b.stop()

    def test_safe_allowlist(self):
        self.assertEqual(set(SerialProtocol.ALLOWED_COMMANDS),{"PING","INFO","STATUS"})
        with self.assertRaises(ValueError): SerialProtocol(FakeSerial()).request("CH3 ON")
        with self.assertRaises(ValueError): SerialProtocol(FakeSerial()).request("DEMO_START")

if __name__ == "__main__":unittest.main()
