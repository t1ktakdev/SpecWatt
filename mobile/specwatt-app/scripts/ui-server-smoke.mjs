const qaBaseUrl = process.env.QA_BASE_URL || 'http://localhost:8097';
// Real UI + real disposable loopback backend. No production credentials/storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {demoState} from '../src/specwatt/model.ts';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'specwatt-ui-'));
const port=await new Promise(resolve=>{const probe=net.createServer();probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
const base=`http://127.0.0.1:${port}`;
const server=spawn('python',['-m','uvicorn','specwatt_api.app:create_app','--factory','--host','127.0.0.1','--port',String(port),'--log-level','error'],{
 cwd:fileURLToPath(new URL('../../../backend',import.meta.url)),windowsHide:true,stdio:'ignore',
 env:{...process.env,SPECWATT_DB:path.join(temp,'ui.sqlite3'),SPECWATT_CORS_ORIGINS:new URL(qaBaseUrl).origin,SPECWATT_SCHEDULER_ENABLED:'0'},
});
let browser,page;
const evidence='outputs/ui-qa/server';fs.mkdirSync(evidence,{recursive:true});
const manifest=[];
try {
 let ready=false;
 for(let i=0;i<100;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'isolated backend readiness');
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce'});page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 page.on('requestfailed',r=>console.log('Failed transport:',r.url(),r.failure()?.errorText));
 page.on('console',m=>{if(m.type()==='error')console.log('Browser error:',m.text());});
 await page.addInitScript(fixture=>{if(!sessionStorage.getItem('qa')){localStorage.setItem('specwatt-mobile-v1',JSON.stringify(fixture));sessionStorage.setItem('qa','1');}},demoState());
 await page.goto(qaBaseUrl+'/server');
 console.log('Browser fetch diagnostic:',await page.evaluate(async base=>{
  let detached;
  try{await window.fetch.call({},base+'/health');detached='accepted';}catch(error){detached=String(error);}
  return {detached,globalCall:(await window.fetch(base+'/health')).status};
 },base));
 const before=await page.evaluate(()=>localStorage.getItem('specwatt-mobile-v1'));
 await page.getByRole('textbox',{name:'Адрес сервера',exact:true}).fill(base);
 await page.getByRole('button',{name:'Регистрация',exact:true}).click();
 const email=randomBytes(8).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill(email);
 await page.getByLabel('Пароль',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Создать серверный аккаунт',exact:true}).click();
 await page.waitForTimeout(700);
 assert.deepEqual(await page.getByRole('alert').allTextContents(),[],'registration error');
 await page.getByRole('textbox',{name:'Название симулятора',exact:true}).fill('UI QA simulator');
 await page.getByRole('button',{name:'Создать серверный симулятор',exact:true}).click();
 await page.getByText('Телеметрия симулятора · свежая',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Запросить выключение',exact:true}).count(),1,'only CH1 controllable and on; CH3 has no mutation');
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 async function capture(file,focus) {
  await focus.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,file)});
  manifest.push({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(evidence,file))).digest('hex'),commit:revision,platform:'WEB Chromium',viewport:{width:393,height:852},locale:'ru',route:'/server',source:'disposable loopback FastAPI/SQLite; hardware_transport=false',focus:'real simulator UI',fontScale:'browser default; not native'});
 }
 await capture('snapshot.png',page.getByText('Телеметрия симулятора · свежая',{exact:true}));
 await page.getByRole('button',{name:'Запросить выключение',exact:true}).click();
 await page.getByText('Запрошена',{exact:true}).first().waitFor();
 assert.equal(await page.getByText('Подтверждена симулятором',{exact:true}).count(),0);
 await capture('requested.png',page.getByText('Команды сервера',{exact:true}));
 await page.getByRole('button',{name:'Отправить и подтвердить · шаг симулятора',exact:true}).click();
 await page.getByText('Подтверждена симулятором',{exact:true}).first().waitFor();
 await capture('acknowledged.png',page.getByText('Команды сервера',{exact:true}));
 await capture('schedules.png',page.getByText('Расписания на сервере',{exact:true}));
 assert.equal(await page.getByRole('button',{name:'CH3',exact:true}).count(),0,'scheduler cannot target CH3');
 assert.equal(await page.evaluate(()=>localStorage.getItem('specwatt-mobile-v1')),before,'server must not mutate demo');
 const logoutResponse=page.waitForResponse(r=>r.url()===base+'/v1/auth/logout');
 await page.getByRole('button',{name:'Выйти и удалить локальный токен',exact:true}).click();
 assert.equal((await logoutResponse).status(),204);
 await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Выйти и удалить локальный токен',exact:true}).count(),0);
 // Real login after logout, including an explicit invalid-credential error.
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.getByRole('textbox',{name:'Email',exact:true}).fill(email);
 await page.getByLabel('Пароль',{exact:true}).fill('x'.repeat(12));
 await page.getByRole('button',{name:'Войти на сервер',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Email или пароль неверен.'}).waitFor();
 await page.getByLabel('Пароль',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Показать пароль',exact:true}).click();
 assert.equal(await page.getByLabel('Пароль',{exact:true}).evaluate(n=>n.type),'text');
 await page.getByRole('button',{name:'Скрыть пароль',exact:true}).click();
 assert.equal(await page.getByLabel('Пароль',{exact:true}).evaluate(n=>n.type),'password');
 // No screenshots while credentials are present, even in a failure handler.
 await page.getByRole('button',{name:'Войти на сервер',exact:true}).click();
 await page.getByText('Мои симуляторы',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('specwatt-mobile-v1')),before);
 await page.getByRole('button',{name:'Выйти и удалить локальный токен',exact:true}).click();
 await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: real login after logout, invalid credentials, show/hide, no demo mutation.');
 console.log('PASS: real server registration, simulator snapshot, requested without ACK, explicit simulator ACK, scheduler CH1/CH2 only, logout, demo unchanged. Disposable loopback backend only.');
} catch(error) {
 if(page){console.log('UI alerts:',await page.getByRole('alert').allTextContents());await page.locator('input').fill('').catch(()=>{});await page.screenshot({path:path.join(evidence,'failure.png'),mask:[page.locator('input')]});}
 throw error;
} finally {
 fs.writeFileSync(path.join(evidence,'manifest.json'),JSON.stringify(manifest,null,2));
 if(browser)await browser.close();
 server.kill();
 await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));
 const resolved=path.resolve(temp),tmpRoot=path.resolve(os.tmpdir())+path.sep;
 if(resolved.startsWith(tmpRoot)&&path.basename(resolved).startsWith('specwatt-ui-'))fs.rmSync(resolved,{recursive:true,force:true});
}
