import assert from 'node:assert/strict';
import test from 'node:test';
import {startFastApi} from './support/fastapi-fixture.mjs';
test('missing Python fails the HTTP fixture explicitly; it never skips coverage',async()=>{
 await assert.rejects(startFastApi({python:'specwatt-nonexistent-python-binary',timeoutMs:1000}),/FastAPI fixture exited.*ENOENT/);
});
