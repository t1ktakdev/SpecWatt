import test from 'node:test';
import assert from 'node:assert/strict';
import {BrainClient} from '../src/specwatt/api.ts';
const response=()=>new Response(JSON.stringify({access_token:'fixture-session',token_type:'bearer',expires_at:Date.now()/1000+600,user_id:'fixture-user'}));
test('cancelled auth response must not write a token even if transport ignores abort',async()=>{
 let resolve;const tokenWrites=[];
 const abort=new AbortController();
 const client=new BrainClient({baseUrl:'http://localhost:8000',development:true,
  vault:{get:async()=>null,set:async(_base,t)=>tokenWrites.push(t),clear:async()=>{}},
  fetcher:async()=>new Promise(r=>{resolve=r;})});
 const pending=client.authenticate('login','fixture@example.test','x'.repeat(12),{signal:abort.signal});
 abort.abort();resolve(response());
 await assert.rejects(pending,e=>e.code==='request_cancelled');
 assert.deepEqual(tokenWrites,[]);
});
test('email and password boundaries reject before network, including 8 and 129 characters',async()=>{
 let requests=0;
 const client=new BrainClient({baseUrl:'http://localhost:8000',development:true,
  vault:{get:async()=>null,set:async()=>{},clear:async()=>{}},fetcher:async()=>{requests++;return response();}});
 for(const size of [0,8,11,129])await assert.rejects(client.authenticate('login','fixture@example.test','x'.repeat(size)),e=>e.code==='invalid_credentials_format');
 await assert.rejects(client.authenticate('register','invalid-email','x'.repeat(12)),e=>e.code==='invalid_credentials_format');
 assert.equal(requests,0);
 for(const size of [12,128])await client.authenticate('login','fixture@example.test','x'.repeat(size));
 assert.equal(requests,2);
});

test('abort during asynchronous secure-store write clears only the cancelled token',async()=>{
 let finishWrite,writing;
 const began=new Promise(r=>{writing=r;});
 let token=null;
 const abort=new AbortController();
 const vault={get:async()=>token,clear:async()=>{token=null;},
  set:async(_base,value)=>{token=value;writing();await new Promise(r=>{finishWrite=r;});},
  clearMatching:async(_base,value)=>{if(token===value)token=null;}};
 const client=new BrainClient({baseUrl:'http://localhost:8000',development:true,vault,fetcher:async()=>response()});
 const pending=client.authenticate('login','fixture@example.test','x'.repeat(12),{signal:abort.signal});
 await began;abort.abort();finishWrite();
 await assert.rejects(pending,e=>e.code==='request_cancelled');
 assert.equal(token,null);
});
