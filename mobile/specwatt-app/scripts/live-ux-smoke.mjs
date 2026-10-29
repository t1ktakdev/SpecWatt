// Real FastAPI + disposable SQLite + main-tab WEB regression. No physical devices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {demoState} from '../src/specwatt/model.ts';
import {BrainClient,createTokenVault} from '../src/specwatt/api.ts';
import {createLiveWorkspace} from '../src/specwatt/live-workspace.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const web=process.env.QA_BASE_URL||'http://127.0.0.1:8120';
const output=path.resolve('../../outputs/live-ux/server-after');fs.mkdirSync(output,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'specwatt-live-ux-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const base=`http://127.0.0.1:${port}`;
let server,browser,lastPage;
const manifest=[],checks=[];
const account=()=>`${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 server=spawn('python',['-m','uvicorn','specwatt_api.app:create_app','--factory','--host','127.0.0.1','--port',String(port),'--log-level','error'],{
  cwd:fileURLToPath(new URL('../../../backend',import.meta.url)),windowsHide:true,stdio:'ignore',env:{...process.env,SPECWATT_DB:path.join(tmp,'qa.sqlite3'),SPECWATT_CORS_ORIGINS:new URL(web).origin,SPECWATT_SCHEDULER_ENABLED:'0'},
 });
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await sleep(100);}
 throw Error('loopback FastAPI did not start');
}
async function stop(){if(server&&!server.killed){server.kill();await new Promise(r=>server.once('exit',r));}}
const makeClient=()=>{let token=null;return new BrainClient({baseUrl:base,development:true,vault:{get:async()=>token,set:async(_url,value)=>{token=value;},clear:async()=>{token=null;},clearMatching:async(_url,value)=>{if(token===value)token=null;}}});};
async function capture(page,name,locale,width,extra={}){
 await page.waitForTimeout(300);
 const file=`${locale}-${width}-${name}.png`;
 await page.screenshot({path:path.join(output,file)});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 manifest.push({file,name,locale,width,height:852,platform:'WEB Edge Chromium / Expo dev client',fontScale:'browser default',reducedMotion:true,source:'server-simulator',sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['diff','--stat'],{encoding:'utf8'}).trim(),sha256:createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex'),overflow,...extra});
 assert.equal(overflow,false,`${file} horizontal overflow`);
}
async function register(page,locale){
 const ky=locale==='ky';
 await page.goto(web+'/server');
 await page.getByRole('textbox',{name:ky?'Сервердин дареги':'Адрес сервера',exact:true}).waitFor({timeout:60000});
 await capture(page,'signin',locale,page.viewportSize().width);
 await page.getByRole('textbox',{name:ky?'Сервердин дареги':'Адрес сервера',exact:true}).fill(base);
 await page.getByRole('button',{name:ky?'Катталуу':'Регистрация',exact:true}).click();
 await page.getByRole('textbox',{name:'Email',exact:true}).fill(account());
 await page.getByLabel(ky?'Сырсөз':'Пароль',{exact:true}).fill(password);
 await page.getByRole('button',{name:ky?'Серверде аккаунт түзүү':'Создать серверный аккаунт',exact:true}).click();
 await page.getByText(ky?'Азырынча контроллер жок':'Контроллеров пока нет',{exact:true}).filter({visible:true}).waitFor();
}
async function create(page,locale){const ky=locale==='ky';await page.getByRole('textbox',{name:ky?'Симулятордун аты':'Название симулятора',exact:true}).fill('QA Energy Lab');await page.getByRole('button',{name:ky?'Сервердик симулятор түзүү':'Создать серверный симулятор',exact:true}).click();await page.getByText(ky?'Учурдагы кубат':'Мощность сейчас',{exact:true}).filter({visible:true}).waitFor();await page.getByText(ky?'Маалымат жаңы':'Данные свежие',{exact:true}).filter({visible:true}).waitFor();}
try{
 await start();
 // HTTP workspace integration: ownership, source, command lifecycle, journal and server restart.
 const a=makeClient(),b=makeClient();await a.authenticate('register',account(),password);await b.authenticate('register',account(),password);
 const row=await a.createSimulator('HTTP Energy Lab');
 for(const call of [()=>b.snapshot(row.id),()=>b.events(row.id),()=>b.measurements(row.id),()=>b.commands(row.id),()=>b.command(row.id,'CH1',false,randomUUID())])await assert.rejects(call,e=>['controller_not_found','http_403','http_404'].includes(e.code));
 checks.push('HTTP: two-owner snapshot/events/measurements/commands isolation');
 const vault=createTokenVault(false),connect=url=>new BrainClient({baseUrl:url,development:true,vault});
 const w=createLiveWorkspace({client:connect(base),connect,uuid:randomUUID});
 const email=account();await w.authenticate(base,'register',email,password);await w.create('Workspace Lab');
 assert.equal(w.getState().snapshot.total_watts,4.2);await w.command('CH3',false);assert.equal(w.getState().commands.length,0);await w.refresh();
 await w.command('CH1',false);assert.equal(w.getState().commands[0].status,'requested');assert.equal(w.getState().snapshot.total_watts,4.2);
 await w.step();assert.equal(w.getState().commands[0].status,'acknowledged');assert.equal(w.getState().snapshot.total_watts,2.4);assert.ok(w.getState().events.length>0);assert.ok(w.getState().measurements.length>=2);
 await stop();await start();await w.refresh();assert.equal(w.getState().snapshot.total_watts,2.4);checks.push('HTTP: workspace request → explicit simulator ACK, cursor history, restart persistence');
 await w.logout();assert.equal(w.getState().snapshot,null);assert.equal(w.getState().kind,'unconfigured');w.dispose();
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const locale of (process.env.QA_LOCALES?.split(',')||['ru','ky']))for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||[320,393,440])){
  // Each matrix case owns a fresh process/rate-limit window, with the same
  // disposable SQLite persisted. This is test isolation, not a failed-call retry.
  await stop();await start();
  const ky=locale==='ky',context=await browser.newContext({viewport:{width,height:852},deviceScaleFactor:1,reducedMotion:'reduce',timezoneId:'Asia/Bishkek'}),page=await context.newPage(),errors=[];
  lastPage=page;page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource.*(net::ERR|status of (401|409|429))/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(state=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('specwatt-mobile-v1',JSON.stringify(state));sessionStorage.setItem('seeded','1');}},demoState(locale));
  await register(page,locale);await capture(page,'controllers-empty',locale,width);
  await create(page,locale);await capture(page,'home',locale,width);
  const source=page.getByText('СЕРВЕР · СИМУЛЯЦИЯ',{exact:true}).filter({visible:true});await source.waitFor();
  const nav=async name=>{await page.getByRole('tab',{name,exact:true}).click();await source.waitFor();};
  await nav(ky?'Түзмөктөр':'Устройства');await page.getByText(ky?'CH3 корголгон · байкоо гана':'CH3 защищён · только наблюдение',{exact:true}).filter({visible:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/CH3.*(Запросить|суроо)/}).count(),0);
  await capture(page,'devices',locale,width);
  await page.getByRole('button',{name:/CH1.*(Подробнее|Кененирээк)/}).click();await capture(page,'detail',locale,width);
  await nav(ky?'Түзмөктөр':'Устройства');
  const off=page.getByRole('button',{name:ky?'CH1 · Өчүрүүнү суроо':'CH1 · Запросить выключение',exact:true});
  await off.click();await page.getByText(ky?'Суралды':'Запрошена',{exact:true}).filter({visible:true}).first().waitFor();
  assert.equal(await page.getByText(ky?'Симулятор ырастады':'Подтверждена симулятором',{exact:true}).filter({visible:true}).count(),0);
  await capture(page,'requested',locale,width);
  await page.getByRole('button',{name:ky?'Ырастоону симуляциялоо':'Симулировать подтверждение',exact:true}).click();await page.getByText(ky?'Симулятор ырастады':'Подтверждена симулятором',{exact:true}).filter({visible:true}).first().waitFor();
  await capture(page,'acknowledged',locale,width);
  await nav('Журнал');await page.getByText(ky?'Сервердин окуялары':'События сервера',{exact:true}).filter({visible:true}).waitFor();await capture(page,'journal',locale,width);
  for(const [tab,name]of [['autopilot','Автопилот'],['plan','План']]){await nav(name);await capture(page,tab,locale,width);}
  for(const scale of [1.3,1.5]){
   await page.evaluate(scale=>{
    const apply=()=>{const nodes=[...document.querySelectorAll('[dir="auto"]')];const sizes=nodes.map(n=>Number(n.dataset.qaFont)||parseFloat(getComputedStyle(n).fontSize));nodes.forEach((n,i)=>{n.dataset.qaFont=String(sizes[i]);n.style.setProperty('font-size',`${sizes[i]*scale}px`,'important');n.style.setProperty('line-height',`${sizes[i]*scale*1.4}px`,'important');});};
    window.qaTextObserver=new MutationObserver(apply);window.qaTextObserver.observe(document.body,{subtree:true,childList:true});apply();
   },scale);
   for(const [name,label]of [['home',ky?'Башкы':'Главная'],['devices',ky?'Түзмөктөр':'Устройства'],['autopilot','Автопилот'],['plan','План'],['journal','Журнал']]){await nav(label);await capture(page,`${name}-text-${scale}`,locale,width,{fontScale:`WEB text CSS ${scale*100}%; not native fontScale`});}
   await nav(ky?'Түзмөктөр':'Устройства');await page.getByRole('button',{name:/CH1.*(Подробнее|Кененирээк)/}).click();await capture(page,`detail-text-${scale}`,locale,width,{fontScale:`WEB text CSS ${scale*100}%; not native fontScale`});
   await page.evaluate(()=>{window.qaTextObserver.disconnect();for(const n of document.querySelectorAll('[data-qa-font]')){n.style.setProperty('font-size',`${n.dataset.qaFont}px`);n.style.setProperty('line-height',`${Number(n.dataset.qaFont)*1.4}px`);delete n.dataset.qaFont;}});
  }
  if(locale==='ru'&&width===393){
   await stop();await start(); // isolate fault/scheduler budget after visual matrix
   await nav('Устройства');await page.getByRole('button',{name:'Создать образец симулятора',exact:true}).click();
   await nav('Автопилот');await page.getByRole('button',{name:'Разрешить автоматизацию',exact:true}).nth(1).click();
   await page.getByRole('button',{name:'Запретить автоматизацию',exact:true}).waitFor();
   await nav('План');await page.getByRole('button',{name:'CH2',exact:true}).click();
   await page.getByRole('textbox',{name:'Начало расписания UTC',exact:true}).fill(new Date(Date.now()+300000).toISOString().replace(/\.\d{3}Z$/,'Z'));
   await page.getByRole('textbox',{name:'Длительность в минутах',exact:true}).fill('1');
   await page.getByRole('button',{name:'Проверить окно',exact:true}).click();
   await page.getByText('Окно допустимо сейчас. При исполнении условия проверяются снова.',{exact:true}).filter({visible:true}).waitFor();
   await capture(page,'plan-evaluated',locale,width);
   await page.getByRole('button',{name:'Подтвердить создание расписания',exact:true}).click();
   await page.getByRole('button',{name:'Отменить расписание',exact:true}).waitFor();await capture(page,'plan-created',locale,width);
   await page.getByRole('button',{name:'Отменить расписание',exact:true}).click();await page.getByRole('button',{name:'Подтвердить отмену',exact:true}).click();
   await page.getByRole('button',{name:'Отменить расписание',exact:true}).waitFor({state:'hidden'});await capture(page,'plan-cancelled',locale,width);
   checks.push('WEB: main Autopilot consent → Plan evaluate → explicit create → explicit cancel');
   await nav('Устройства');
   await page.getByRole('button',{name:'Создать образец симулятора',exact:true}).click();
   await stop();await page.getByRole('button',{name:'Обновить данные сервера',exact:true}).click();
   await page.getByText('network_error',{exact:true}).filter({visible:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'CH1 · Запросить включение',exact:true}).isDisabled(),true);
   await capture(page,'offline',locale,width);await start();
   await page.getByRole('button',{name:'Обновить данные сервера',exact:true}).click();await page.getByText('Данные свежие',{exact:true}).filter({visible:true}).waitFor();
   checks.push('WEB: stop server → unknown readings/control disabled → restart/reconnect');
   // Lost POST reply after actual server commit: one request, no optimistic ACK, GET reconciliation.
   let posts=0;
   await page.route('**/commands',async route=>{if(route.request().method()==='POST'){posts++;await route.fetch();await route.abort('failed');}else await route.continue();});
   await page.getByRole('button',{name:'CH1 · Запросить включение',exact:true}).click();await page.getByText('Результат запроса неизвестен',{exact:true}).filter({visible:true}).waitFor();assert.equal(posts,1);await capture(page,'uncertain',locale,width);
   await page.unroute('**/commands');await page.getByRole('button',{name:'Обновить данные сервера',exact:true}).click();await page.getByText('Запрошена',{exact:true}).filter({visible:true}).first().waitFor();
   await page.getByRole('button',{name:'Симулировать подтверждение',exact:true}).click();await page.getByText('Подтверждена симулятором',{exact:true}).filter({visible:true}).first().waitFor();checks.push('WEB: lost mutation response sends once; GET reconciles requested before explicit ACK');
   // Native fontScale needs emulator; enlarge WEB text explicitly and label evidence honestly.
   await page.addStyleTag({content:'[dir="auto"] {font-size:150% !important; line-height:1.4 !important;}'});await capture(page,'devices-large-text',locale,width,{fontScale:'WEB text CSS 150%; not native fontScale'});
   // Ownership/session revocation: a real logout from this request bearer, then normal GET 401.
   let revoked=false;
   await page.route('**/snapshot',async route=>{if(!revoked){revoked=true;const token=route.request().headers().authorization;await fetch(base+'/v1/auth/logout',{method:'POST',headers:{Authorization:token}});}await route.continue();});
   await page.getByRole('button',{name:'Обновить данные сервера',exact:true}).click();await page.getByText('Нужен вход на сервер',{exact:true}).filter({visible:true}).waitFor();await capture(page,'expired-session',locale,width);assert.equal(await page.getByText('QA Energy Lab',{exact:true}).filter({visible:true}).count(),0);checks.push('WEB: real token revocation clears owner data on 401');
  }
  assert.equal((await page.evaluate(()=>localStorage.getItem('specwatt-mobile-v1'))).includes('QA Energy Lab'),false,'server state never persisted into DEMO');
  await page.getByRole('button',{name:ky?'DEMO режимине өтүү':'Перейти в DEMO',exact:true}).click();
  assert.equal(await page.getByText('СЕРВЕР · СИМУЛЯЦИЯ',{exact:true}).filter({visible:true}).count(),0);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('specwatt-mobile-v1'))).source,'demo');
  assert.deepEqual(errors,[]);checks.push(`WEB ${locale} ${width}: register/create/main tabs/CH3/request/explicit ACK/journal/source switch`);
  await context.close();
 }
 console.log(JSON.stringify({checks,captures:manifest.length},null,2));
} catch(error) {
 if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:path.join(output,'failure.png')});console.log('Failure UI:',await lastPage.locator('body').innerText());}
 throw error;
} finally {
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(checks,null,2));
 await browser?.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});
}
