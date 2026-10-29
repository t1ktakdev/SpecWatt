import test from 'node:test';
import assert from 'node:assert/strict';
import {BrainClient} from '../src/specwatt/api.ts';

test('default transport preserves the browser global fetch receiver',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',function () {
  // Chromium throws Illegal invocation before any network request if fetch
  // receives a BrainClient as its receiver. Node fetch does not expose this.
  assert.equal(this,globalThis);
  calls++;
  return Promise.resolve(new Response('[]',{status:200}));
 });
 const client=new BrainClient({baseUrl:'http://localhost:8000',development:true,vault:{get:async()=> 'synthetic-test-session',set:async()=>{},clear:async()=>{}}});
 assert.deepEqual(await client.controllers(),[]);
 assert.equal(calls,1);
});
