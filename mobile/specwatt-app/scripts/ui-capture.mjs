const qaBaseUrl = process.env.QA_BASE_URL || 'http://localhost:8097';
// Optional QA tooling. Uses an externally supplied existing Playwright install;
// no runtime dependency or test bypass is added to the app.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {demoState, emptyState} from '../src/specwatt/model.ts';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'before';
const routeFilter=process.env.QA_ROUTES?.split(',');
const output = path.resolve('outputs/ui-qa', phase);
fs.mkdirSync(output, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'msedge'});
const fixedNow = Date.parse('2026-10-28T08:12:00Z');
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest = [];
const previous=routeFilter&&fs.existsSync(path.join(output,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8')):[];
try {
  for (const locale of ['ru','ky']) {
    for (const [width,height] of [[393,852], [320,700], [360,800], [440,952]]) {
      const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1, reducedMotion:'reduce',timezoneId:'Asia/Bishkek'});
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.clock.install({time:fixedNow});
      const fixture=demoState(locale);
      fixture.events=[{id:'ui-fixture-start',at:fixedNow,kind:'system',code:'demo-start',source:'demo'}];
      await page.addInitScript(({fixture})=>{
        if (!sessionStorage.getItem('qa-initialized')) {
          localStorage.setItem('specwatt-mobile-v1',JSON.stringify(fixture));
          sessionStorage.setItem('qa-initialized','1');
        }
      },{fixture});
      async function capture(name,route) {
        await page.waitForTimeout(400);
        await page.evaluate(()=>document.fonts.ready);
        const file=`${locale}-${width}-${name}.png`;
        await page.screenshot({path:path.join(output,file),fullPage:false});
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        const source=await page.evaluate(()=>JSON.parse(localStorage.getItem('specwatt-mobile-v1'))?.source);
        manifest.push({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex'),commit:sha,phase,platform:'WEB Chromium',route,locale,viewport:{width,height},density:1,fontScale:'browser default; not Android fontScale',source:`isolated ${source} fixture`,fixtureTime:new Date(fixedNow).toISOString(),overflow,errors:[...errors]});
      }
      for (const route of ['/home','/devices','/autopilot','/plan','/journal','/device?id=CH2','/catalog','/setup','/settings','/server']) {
        if(routeFilter&&!routeFilter.includes(route))continue;
        await page.goto(`${qaBaseUrl}${route}`);
        await page.waitForFunction(()=>document.querySelector('[role="tab"], [role="button"]'),{timeout:60000});
        await capture(route.slice(1).replace('?id=','-'),route);
        if(phase==='after'&&(width===320||width===440)) {
          await page.evaluate(()=>{
            const scrollables=[...document.querySelectorAll('div')].filter(n=>['scroll','auto'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1);
            for(const node of scrollables)node.scrollTop=node.scrollHeight;
          });
          if(route==='/catalog')for(let i=0;i<20;i++){
            await page.evaluate(()=>{for(const n of document.querySelectorAll('div'))if(['auto','scroll'].includes(getComputedStyle(n).overflowY))n.scrollTop=n.scrollHeight;});
            await page.waitForTimeout(100);
          }
          await capture(route.slice(1).replace('?id=','-')+'-bottom',route+' (scrolled to bottom)');
        }
      }
      if(!routeFilter&&phase==='after'&&width===320) {
        const edge=demoState(locale);
        edge.channels[0].watts=null;edge.channels[0].freshness='missing';
        edge.channels[0].assigned.name=locale==='ru'?'Светильник с очень длинным пользовательским названием':'Колдонуучунун узун аталышы бар бөлмөдөгү чырак';
        edge.channels[1].watts=4.2;edge.channels[1].freshness='stale';
        await page.evaluate(fixture=>localStorage.setItem('specwatt-mobile-v1',JSON.stringify(fixture)),edge);
        await page.goto(qaBaseUrl+'/home');
        await capture('home-missing-stale','/home (missing/stale + long-name fixture)');
        if(await page.getByRole('switch',{disabled:true}).count()!==2)throw Error('unknown/stale channels must not be controllable');
        await page.goto(qaBaseUrl+'/device?id=CH2');
        await capture('detail-stale','/device?id=CH2 (stale fixture; historical value labelled)');
        await page.goto(qaBaseUrl+'/journal');
        await page.getByRole('button',{name:locale==='ru'?'Ошибки':'Каталар',exact:true}).click();
        await capture('journal-filter-empty','/journal (error filter; no matching events)');
      }
      if (!routeFilter&&width===393) {
        await page.evaluate(fixture=>localStorage.setItem('specwatt-mobile-v1',JSON.stringify(fixture)),{...emptyState(),locale});
        await page.goto(qaBaseUrl+'/');
        await capture('welcome','/');
        await page.getByRole('button',{name:locale==='ru'?'Пропустить знакомство':'Таанышууну өткөрүү',exact:true}).click();
        await capture('language','/ (locale)');
        await page.getByRole('button',{name:locale==='ru'?'Продолжить':'Улантуу',exact:true}).click();
        await capture('mode','/ (mode)');
      }
      await context.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify([...previous.filter(x=>!manifest.some(y=>y.file===x.file)),...manifest],null,2));
  await browser.close();
}
console.log(`${phase}: ${manifest.length} screenshots; overflows=${manifest.filter(x=>x.overflow).length}; page errors=${manifest.filter(x=>x.errors.length).length}`);
assertClean();
function assertClean(){if(manifest.some(x=>x.overflow||x.errors.length))throw new Error('Visual capture contains overflow or browser errors; inspect manifest');}
