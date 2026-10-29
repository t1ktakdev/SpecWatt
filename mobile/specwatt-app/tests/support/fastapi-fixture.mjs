/** Disposable real FastAPI process. Own the socket in Python; never probe/reuse a port. */
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function startFastApi({python = process.env.PYTHON || 'python', timeoutMs = 30000} = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'specwatt-http-'));
  const bootstrap = path.join(tmp, 'server.py');
  await fs.writeFile(bootstrap, `import asyncio, socket, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(repo)})
import uvicorn
from backend.specwatt_api.app import create_app
from backend.specwatt_api.clock import SystemClock
app = create_app(Path(${JSON.stringify(path.join(tmp,'test.sqlite3'))}), SystemClock(), scheduler_enabled=False)
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('127.0.0.1', 0))
sock.listen(2048)
print('PORT=%d' % sock.getsockname()[1], flush=True)
# The serving coroutine owns the main process lifetime. No daemon thread/join.
asyncio.run(uvicorn.Server(uvicorn.Config(app, log_level='warning')).serve(sockets=[sock]))
`);
  const child = spawn(python, ['-u', bootstrap], {cwd:repo, windowsHide:true, stdio:['ignore','pipe','pipe']});
  let tail = '', ended = false, closing = false, exit = null;
  const append = data => { tail = (tail + String(data)).slice(-6000); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  const closed = new Promise(resolve => {
    child.on('error', error => { ended=true; exit=String(error); });
    child.once('close', (code,signal) => { ended=true; exit=exit ?? {code,signal}; resolve(); });
  });
  const diagnostics = () => JSON.stringify({pid:child.pid,exit,output:tail});
  const assertAlive = () => { if(ended && !closing) throw Error('FastAPI fixture exited: '+diagnostics()); };
  async function close() {
    closing=true;
    if(!ended) child.kill();
    await closed;
    await fs.rm(tmp,{recursive:true,force:true});
  }
  try {
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline) {
      assertAlive();
      const port=tail.match(/PORT=(\d+)/)?.[1];
      if(port) {
        const baseUrl=`http://127.0.0.1:${port}`;
        try {
          const response=await fetch(baseUrl+'/health',{signal:AbortSignal.timeout(500)});
          if(response.ok && (await response.json()).hardware_transport===false)
            return {baseUrl,assertAlive,diagnostics,close};
        } catch { assertAlive(); }
      }
      await wait(50);
    }
    throw Error('FastAPI fixture readiness timeout: '+diagnostics());
  } catch(error) { await close(); throw error; }
}
