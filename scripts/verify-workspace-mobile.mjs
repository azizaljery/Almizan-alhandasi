import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.MIZAN_PLAYWRIGHT_PATH||'playwright');
const evidence=resolve('evidence/workspace-redesign'); await mkdir(evidence,{recursive:true});
const root=resolve('dist'),types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),path=resolve(root,pathname==='/'?'index.html':'.'+pathname);if(!path.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await context.tracing.start({screenshots:true,snapshots:true});
const three=await readFile('/tmp/mizan-three-0.160.0.min.js');
await context.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',r=>r.fulfill({contentType:'text/javascript',body:three}));
await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
// The external paid service is deliberately not exercised by local UI verification.
await context.route('https://*.workers.dev/**',r=>r.abort());
const page=await context.newPage(),errors=[],steps=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const step=async(name,fn)=>{await fn();steps.push({name,status:'PASS'});console.log('PASS:',name);};
const tab=async(name)=>{await page.locator(`[data-tab="${name}"]`).click();await page.locator(`#panel-${name}.on`).waitFor();};
const save=async(name)=>{const pending=page.waitForEvent('download');await page.locator('#saveProject').click();const download=await pending;const path=resolve(evidence,name);await download.saveAs(path);return JSON.parse(await readFile(path,'utf8'));};
const generate=async()=>{await tab('design');await page.locator('#gen').click();await page.waitForFunction(()=>!document.getElementById('gen').disabled);assert.equal(await page.locator('#generationError').textContent(),'');await page.locator('#panel-result.on #plan svg').waitFor();};
const checkOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No viewport horizontal overflow');
try {
 await page.setViewportSize({width:390,height:844});
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
 await step('Fresh phone entry exposes the request action within the first viewport',async()=>{const box=await page.locator('#askLocal').boundingBox();assert.ok(box&&box.y+box.height<=844,`Primary action bottom: ${box?.y+box?.height}`);await checkOverflow();await page.screenshot({path:resolve(evidence,'workspace-phone.png')});});
 await step('All six redesigned sections remain reachable at phone, tablet and desktop sizes',async()=>{for(const v of[{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}]){await page.setViewportSize(v);for(const name of['brief','rating','design','result','review','boq']){await tab(name);await checkOverflow();}await tab('brief');if(v.width===1440)await page.screenshot({path:resolve(evidence,'workspace-desktop.png')});}});
 await step('Enlarged phone text stays inside the viewport and navigation remains usable',async()=>{await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');for(const name of['brief','rating','design','result','review','boq']){await tab(name);await checkOverflow();}await page.evaluate(()=>document.documentElement.style.fontSize='');});
 assert.deepEqual(errors,[]);await writeFile(resolve(evidence,'mobile-report.json'),JSON.stringify({status:'PASS',steps,pageErrors:errors,primaryActionVisibleInitially:true},null,2)+'\n');
} catch(error){await writeFile(resolve(evidence,'mobile-report.json'),JSON.stringify({status:'FAIL',steps,pageErrors:errors,error:error.stack},null,2)+'\n');await page.screenshot({path:resolve(evidence,'mobile-failure.png'),fullPage:true});throw error;}
finally{await context.tracing.stop({path:resolve(evidence,'mobile-trace.zip')});await browser.close();await new Promise(r=>server.close(r));}
