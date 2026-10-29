"""Real HTTP smoke on 127.0.0.1 using temporary DB; never uses live credentials."""
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
BRIDGE_FILE = Path(os.environ.get("SPECWATT_USB_BRIDGE_STATUS",
                                 r"D:\SpecWATT-ESP32-Stage1\bridge-status.json"))
def main():
    with tempfile.TemporaryDirectory(prefix="specwatt-stage1-http-") as tmp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        env=os.environ.copy()
        env["SPECWATT_DB"]=str(Path(tmp)/"smoke.sqlite3")
        env["SPECWATT_USB_BRIDGE_STATUS"]=str(BRIDGE_FILE)
        env["SPECWATT_SCHEDULER_ENABLED"]="0"
        proc=subprocess.Popen([sys.executable,"-m","uvicorn","specwatt_api.app:create_app",
                               "--factory","--host","127.0.0.1","--port",str(port),
                               "--log-level","error"],
                              cwd=BACKEND,env=env,stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL)
        try:
            def request(method, path, payload=None, token=None):
                data=None if payload is None else json.dumps(payload).encode("utf-8")
                headers={"Content-Type":"application/json"}
                if token: headers["Authorization"]="Bearer "+token
                conn=http.client.HTTPConnection("127.0.0.1",port,timeout=5)
                try:
                    conn.request(method,path,body=data,headers=headers)
                    response=conn.getresponse()
                    raw=response.read(65536)
                    return response.status,json.loads(raw) if raw else {}
                finally:
                    conn.close()
            for _ in range(40):
                if proc.poll() is not None:
                    raise AssertionError("uvicorn exited before healthcheck")
                try:
                    code,health=request("GET","/health")
                    if code==200:
                        break
                except OSError:
                    time.sleep(0.15)
            else: raise AssertionError("loopback uvicorn startup timed out")
            assert health["hardware_transport"] is False
            print("HTTP_HEALTH=200 HARDWARE_TRANSPORT=false",flush=True)
            prefix=secrets.token_hex(4)
            def register(label):
                code,body=request("POST","/v1/auth/register",
                                  {"email":f"{label}-{prefix}@example.test",
                                   "password":secrets.token_urlsafe(22)})
                assert code==201,("registration",code)
                return body["access_token"]
            owner=register("owner")
            other=register("other")
            code,controller=request("POST","/v1/controllers/simulator",
                                    {"name":"Stage1 temporary simulator"},owner)
            assert code==201
            cid=controller["id"]
            endpoint=f"/v1/controllers/{cid}/diagnostics/usb-bridge"
            code,_=request("GET",endpoint)
            assert code==401
            print("HTTP_UNAUTHORIZED=401",flush=True)
            code,_=request("GET",endpoint,token=other)
            assert code==404
            print("HTTP_OTHER_OWNER=404",flush=True)
            code,status=request("GET",endpoint,token=owner)
            assert code==200
            host=status["host_bridge"]
            assert status["hardware_transport"] is False and status["paired"] is False
            assert status["measured"] is False and status["source"] == "diagnostic"
            assert host["state"] == "connected",("host status",host["state"])
            assert host["port"]=="COM8" and host["protected_channel"]=="CH3"
            print("HTTP_OWNER_DIAGNOSTIC=200 STATE=connected PORT=COM8 UNPAIRED=true MEASURED=false",flush=True)
            code,snapshot=request("GET",f"/v1/controllers/{cid}/snapshot",token=owner)
            assert code==200 and snapshot["source"]=="simulator"
            assert next(x for x in snapshot["channels"] if x["id"]=="CH3")["protected"] is True
            before=snapshot["total_watts"]
            code,_=request("POST",f"/v1/controllers/{cid}/commands",
                            {"channel_id":"CH3","on":False,
                             "idempotency_key":"protected-stage1-key"},owner)
            assert code==409
            print("HTTP_CH3_COMMAND_REJECTED=409",flush=True)
            payload={"channel_id":"CH1","on":False,
                     "idempotency_key":"stage1-repeat-key-1","origin":"manual"}
            code,c1=request("POST",f"/v1/controllers/{cid}/commands",payload,owner)
            assert code==200 and c1["status"]=="requested",("command",code,c1.get("status"))
            code,c2=request("POST",f"/v1/controllers/{cid}/commands",payload,owner)
            assert code==200 and c2["id"]==c1["id"]
            code,after=request("GET",f"/v1/controllers/{cid}/snapshot",token=owner)
            assert code==200 and after["total_watts"]==before
            print("HTTP_SIMULATOR_REQUEST_ONLY=PASS IDEMPOTENT=PASS NO_AUTO_RETRY=PASS",flush=True)
            print("HTTP_SMOKE_EXIT=0",flush=True)
            return 0
        finally:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)

if __name__=="__main__":
    try: sys.exit(main())
    except Exception as exc:
        print("HTTP_SMOKE_ERROR="+repr(exc),flush=True)
        sys.exit(1)
