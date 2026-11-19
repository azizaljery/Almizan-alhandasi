// Read-only verification: changes the clock only in this isolated browser context.
import { chromium } from 'playwright';
const base=(process.env.SITE_URL||'https://almizan-handasi.aljeryabod.workers.dev').replace(/\/$/,'');
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
const check=(name,ok)=>{console.log((ok?'PASS ':'FAIL ')+name);if(!ok)throw Error(name)};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/home.html',{waitUntil:'load'});
 await page.locator('#scene canvas').waitFor({timeout:45000});
 await page.locator('.ambient-motion').click();
 check('legacy angle and time buttons removed',await page.locator('[data-hero-view],[data-hero-light],#heroControls').count()===0);
 for(const [phase,name]of[[0,'الفجر'],[.14,'شروق الشمس'],[.38,'النهار'],[.64,'غروب الشمس'],[.79,'الليل']]){
  await page.evaluate(p=>import('./ambient-cycle.mjs').then(m=>m.ambientCycle().seek(p)),phase);
  check(name,await page.locator('[data-ambient-label]').innerText()===name);
 }
 await page.locator('.ambient-motion').click();
 const before=await page.evaluate(()=>import('./ambient-cycle.mjs').then(m=>m.ambientCycle().state.phase));
 await page.waitForTimeout(500);
 check('cycle resumes',await page.evaluate(()=>import('./ambient-cycle.mjs').then(m=>m.ambientCycle().state.phase))!==before);
 await page.locator('.ambient-motion').click();
 await page.evaluate(()=>import('./ambient-cycle.mjs').then(m=>m.ambientCycle().seek(.79)));
 await page.reload({waitUntil:'load'});
 check('clock survives navigation',await page.getAttribute('body','data-ambient-phase')==='الليل');
 await page.setViewportSize({width:390,height:844});
 check('mobile has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});
 const rp=await reduced.newPage();await rp.goto(base+'/home.html',{waitUntil:'load'});
 await rp.locator('.ambient-motion').waitFor();
 const state=await rp.evaluate(()=>import('./ambient-cycle.mjs').then(m=>({paused:m.ambientCycle().paused,phase:m.ambientCycle().state.phase})));
 check('reduced motion is static daylight',state.paused&&state.phase===.38);
 await reduced.close();check('no unhandled page errors',errors.length===0);
}finally{await browser.close()}
