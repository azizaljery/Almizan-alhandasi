// Browser E2E without test-framework dependencies: real app boot, real 2D generator,
// and a real WebGL canvas if the pinned Three.js CDN is reachable on the runner.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const chrome = process.env.CHROME || 'google-chrome';
const profile = mkdtempSync(join(tmpdir(), 'mizan-browser-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
let socket = null, counter = 0;
const pending = new Map();
try {
  let port;
  for (let i = 0; i < 80; i++) {
    const file = join(profile, 'DevToolsActivePort');
    if (existsSync(file)) { port = Number(readFileSync(file, 'utf8').split('\n')[0]); break; }
    if (child.exitCode !== null) throw Error('Chromium terminated before debugging port was ready.');
    await pause(125);
  }
  assert.ok(port, 'Chromium debugging port unavailable.');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl, 'No Chromium page target.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (!payload.id || !pending.has(payload.id)) return;
    const { resolve, reject } = pending.get(payload.id); pending.delete(payload.id);
    if (payload.error) reject(Error(payload.error.message));
    else resolve(payload.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.text || 'Browser JS exception');
    return response.result.value;
  };
  const waitFor = async (expression, timeout = 16000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await evaluate(expression)) return true; } catch { /* waiting for modules */ }
      await pause(250);
    }
    return false;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' });
  assert.ok(await waitFor('!!window.mizanStudioAPI && !!document.getElementById("cinematicSkip")'), 'Mizan Studio module did not boot.');
  await pause(350);
  const introScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync('/tmp/mizan-cinematic-live.png', Buffer.from(introScreenshot.data, 'base64'));
  await pause(3750);
  const revealScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync('/tmp/mizan-cinematic-reveal.png', Buffer.from(revealScreenshot.data, 'base64'));
  await evaluate('document.getElementById("cinematicSkip").click(); true');
  assert.ok(await waitFor('document.getElementById("app").classList.contains("show") && document.getElementById("panel-design").classList.contains("on")'), 'Cinematic skip did not enter the design page.');
  const initial = await evaluate('({simple:document.getElementById("app").classList.contains("studio-simple-mode"),legacy:!!document.getElementById("roomRows"),hasAI:!!window.mizanStudioAPI})');
  assert.ok(initial.simple && initial.legacy && initial.hasAI, 'Simple and legacy interfaces did not coexist.');
  await evaluate('window.mizanStudioAPI.setPlot({width:35,length:45,entry:"s",maxBuiltArea:null}); document.getElementById("gen").click(); true');
  assert.ok(await waitFor('!!document.querySelector("#plan svg") && !document.getElementById("gen").disabled', 22000), 'The existing real 2D generator did not produce a plan.');
  const plan = await evaluate('({rooms:document.querySelectorAll("#plan [data-room-id]").length,alternatives:document.querySelectorAll(".studio-alternative").length,errors:document.getElementById("generationError").textContent})');
  console.log('Browser plan metrics:', JSON.stringify(plan));
  assert.ok(plan.rooms >= 3, '2D plan lacks rooms.');
  assert.ok(plan.alternatives >= 2, 'The candidate comparison has fewer than two real plans.');
  assert.ok(!plan.errors, 'The planner reported a generation error: ' + plan.errors);
  const has3D = await waitFor('!!document.querySelector("#view canvas")', 16000);
  const threeStatus = await evaluate('({hasCanvas:!!document.querySelector("#view canvas"),error:document.getElementById("threeError").textContent})');
  if (!has3D) throw Error('3D canvas did not initialize: ' + threeStatus.error);
  await evaluate('document.getElementById("plan").scrollIntoView({behavior:"auto",block:"center"}); true');
  await pause(850);
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync('/tmp/mizan-generated-plan.png', Buffer.from(screenshot.data, 'base64'));
  console.log('E2E PASS: real planner produced ' + plan.rooms + ' room shapes, ' + plan.alternatives + ' distinct candidates, and a WebGL 3D canvas.');
} finally {
  try { socket?.close(); } catch {}
  child.kill('SIGTERM');
  await pause(200);
  rmSync(profile, { recursive: true, force: true });
}
