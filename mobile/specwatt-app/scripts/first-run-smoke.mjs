// First-run WEB parcours and text enlargement. This does not emulate native fontScale.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {emptyState} from '../src/specwatt/model.ts';
import {t} from '../src/specwatt/i18n.ts';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE_URL||'http://localhost:8099';
const output=path.resolve('../../outputs/first-run/parcours');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const locale of ['ru','ky'])for(const width of [320,393,440])for(const scale of [1,1.3,1.5]){
  const context=await browser.newContext({viewport:{width,height:852},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],apiRequests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/\/v1\//.test(r.url()))apiRequests.push(r.url());});
  await page.addInitScript(({fixture,scale})=>{
   if(!sessionStorage.getItem('first-run-seed')){localStorage.setItem('specwatt-mobile-v1',JSON.stringify(fixture));sessionStorage.setItem('first-run-seed','1');}
   if(scale===1)return;
   function enlarge(){
    for(const node of [...document.querySelectorAll('div,span,input')].reverse()){
     if(node.dataset.qaEnlarged||![...node.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))continue;
     const style=getComputedStyle(node),size=parseFloat(style.fontSize),line=parseFloat(style.lineHeight);
     node.dataset.qaEnlarged='1';node.style.fontSize=size*scale+'px';if(Number.isFinite(line))node.style.lineHeight=line*scale+'px';
    }
   }
   document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(enlarge).observe(document.body,{childList:true,subtree:true});enlarge();});
  },{fixture:{...emptyState(),locale},scale});
  const click=key=>page.getByRole('button',{name:t(locale,key),exact:true}).click();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('specwatt-mobile-v1')));
  async function capture(step){
   await page.waitForTimeout(60);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${locale}/${width}/${scale}/${step} viewport overflow`);
   const targets=await page.getByRole('button').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.height>0&&r.height<47.5;}).map(n=>n.textContent));
   assert.deepEqual(targets,[],`48px targets ${step}`);
   const file=`${locale}-${width}-text${scale}-${step}.png`;
   await page.screenshot({path:path.join(output,file)});
  }
  await page.goto(base);await page.getByRole('progressbar').waitFor({timeout:60000});
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>document.activeElement?.getAttribute('role')==='button'),'keyboard focuses a control');
  await capture('welcome');
  await click('next');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('specwatt-mobile-v1')).firstRunStep==='insight');
  await page.reload();await page.getByText(t(locale,'introPeak'),{exact:true}).waitFor();
  await click('next');await page.getByText(t(locale,'introSafe'),{exact:true}).waitFor();await capture('safety');
  await click('back');await page.getByText(t(locale,'introPeak'),{exact:true}).waitFor();
  await click('introSkip');await page.getByText(t(locale,'language'),{exact:true}).waitFor();await capture('locale');
  await click('next');await page.getByText(t(locale,'mode'),{exact:true}).waitFor();await capture('mode');
  await click('real');await page.getByText(t(locale,'controllerUnavailable'),{exact:true}).waitFor();await capture('controller');
  assert.equal((await saved()).onboarded,false);
  await click('back');await click('authEntry');await page.waitForURL('**/server');
  await page.getByRole('textbox',{name:locale==='ru'?'Адрес сервера':'Сервердин дареги',exact:true}).waitFor();
  await page.getByRole('button',{name:locale==='ru'?'‹ Назад':'‹ Артка',exact:true}).click();
  await page.getByText(t(locale,'mode'),{exact:true}).waitFor();
  await context.setOffline(true);await click('demo');await page.getByRole('tab').first().waitFor();
  assert.equal((await saved()).source,'demo');assert.equal((await saved()).locale,locale);
  assert.equal((await saved()).channels[2].protected,true);assert.equal((await saved()).channels[2].assigned.allowAuto,false);
  assert.equal(await page.getByRole('switch').count(),2,'CH3 has no toggle');
  await context.setOffline(false);await page.goto(base);await page.waitForURL('**/home');
  assert.deepEqual(apiRequests,[],'DEMO and unfinished server entry make no API requests');assert.deepEqual(errors,[]);
  results.push({locale,width,height:852,platform:'WEB Edge Chromium',textEnlargement:scale,nativeFontScale:false,reducedMotion:true,passed:['3 cards','progress','back','skip','reload resumes insight','language','controller truthful','auth /server/back','offline demo','CH3','completed launch /home','keyboard focus','48px targets','no horizontal overflow'],errors});
  await context.close();
 }
 // Changing language in the middle of a card survives a full reload.
 const context=await browser.newContext({viewport:{width:320,height:700},reducedMotion:'no-preference'}),page=await context.newPage();
 await page.goto(base);await page.getByRole('button',{name:t('ru','next'),exact:true}).click();
 await page.getByRole('button',{name:'Кыргызча',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('specwatt-mobile-v1')).locale==='ky');
 await page.reload();await page.getByText(t('ky','introPeak'),{exact:true}).waitFor();
 await page.getByRole('button',{name:'Русский',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('specwatt-mobile-v1')).locale==='ru');
 await page.reload();await page.getByText(t('ru','introPeak'),{exact:true}).waitFor();
 await context.close();
 console.log(`PASS: ${results.length} WEB parcours at RU/KY × 320/393/440 × 1/1.3/1.5 text; language reload; motion enabled and reduced.`);
}finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
