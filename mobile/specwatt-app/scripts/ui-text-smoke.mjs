// WEB text-enlargement regression. This does not emulate Android fontScale.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {demoState,emptyState} from '../src/specwatt/model.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE_URL||'http://localhost:8097';
const output=process.env.QA_TEXT_OUTPUT||'outputs/ui-qa/text';
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const [locale,route,word,fixture] of [
  ['ru','/autopilot','Выключен',demoState('ru')],
  ['ky','/','түшүнүңүз',{...emptyState(),locale:'ky'}],
 ]) {
  const context=await browser.newContext({viewport:{width:320,height:852},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(f=>localStorage.setItem('specwatt-mobile-v1',JSON.stringify(f)),fixture);
  await page.goto(base+route);await page.getByRole('button').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
   for(const n of [...document.querySelectorAll('div,span')].reverse()) {
    if([...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())) {
     const s=getComputedStyle(n),f=parseFloat(s.fontSize),h=parseFloat(s.lineHeight);
     n.style.fontSize=f*1.5+'px';if(Number.isFinite(h))n.style.lineHeight=h*1.5+'px';
    }
   }
  });
  const lines=await page.evaluate(word=>{
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let n;while((n=walker.nextNode())) {
    const index=n.textContent.indexOf(word);if(index<0)continue;
    const range=document.createRange();range.setStart(n,index);range.setEnd(n,index+word.length);
    return new Set([...range.getClientRects()].map(r=>Math.round(r.y))).size;
   }
   return 0;
  },word);
  await page.screenshot({path:`${output}/${locale}-320-text150.png`});
  results.push({locale,route,word,lines,platform:'WEB Edge',textEnlargement:1.5,nativeFontScale:false});
  await context.close();
 }
} finally {await browser.close();fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
for(const result of results)assert.equal(result.lines,1,`${result.locale}: ${result.word} must remain a whole word`);
