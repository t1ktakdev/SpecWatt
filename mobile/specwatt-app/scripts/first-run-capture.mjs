// WEB evidence only. Uses an external Playwright installation, no app dependency.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {emptyState} from '../src/specwatt/model.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase=process.argv[2] || 'before';
const base=process.env.QA_BASE_URL || 'http://localhost:8098';
const output=path.resolve('../../outputs/first-run',phase);
fs.mkdirSync(output,{recursive:true});
const manifest=[];
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 for(const locale of ['ru','ky']) for(const width of [320,393,440]) {
  const context=await browser.newContext({viewport:{width,height:852},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(state=>{
   if(!sessionStorage.getItem('seeded')){
    localStorage.setItem('specwatt-mobile-v1',JSON.stringify(state));
    sessionStorage.setItem('seeded','1');
   }
  },{...emptyState(),locale});
  await page.goto(base);
  await page.getByRole('button',{name:locale==='ru'?'Продолжить':'Улантуу',exact:true}).waitFor({timeout:60000});
  async function capture(step){
   await page.waitForTimeout(400);
   const file=`${locale}-${width}-${step}.png`;
   await page.screenshot({path:path.join(output,file)});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   manifest.push({file,phase,locale,width,height:852,step,platform:'WEB Edge Chromium',reducedMotion:true,fontScale:'browser default; not native',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['diff','--stat'],{encoding:'utf8'}).trim(),sha256:createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex'),overflow,errors:[...errors]});
   if(overflow||errors.length)throw Error('Capture failed: '+JSON.stringify(manifest.at(-1)));
  }
  await capture('welcome');
  if(phase==='after'){
   await page.getByRole('button',{name:locale==='ru'?'Пропустить знакомство':'Таанышууну өткөрүү',exact:true}).click();
  }else{
   await page.getByRole('button',{name:locale==='ru'?'Продолжить':'Улантуу',exact:true}).click();
  }
  await capture('locale');
  await page.getByRole('button',{name:locale==='ru'?'Продолжить':'Улантуу',exact:true}).click();
  await capture('mode');
  await context.close();
 }
} finally {
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 await browser.close();
}
console.log(`${phase}: ${manifest.length} WEB captures, no page errors or horizontal overflow`);
