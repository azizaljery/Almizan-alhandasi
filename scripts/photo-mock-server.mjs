// خادم محلي للتجربة بلا Workers AI: ملفات dist/client + معالج /api/photo الحقيقي (worker/photo.mjs) مع مزوّد صور وهمي.
// المزوّد الوهمي لا يولّد شيئًا:  echo يعيد اللقطة المرسلة نفسها، fixed يعيد صورة ثابتة (tests/fixtures/photo-sample.jpg)، off بلا ربط AI.
// الاستعمال: node scripts/build.mjs && node scripts/photo-mock-server.mjs [port] [echo|fixed|off]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPhotoHandler, PHOTO_LIMITS, bytesToB64 } from '../worker/photo.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.webp': 'image/webp' };

/** يعيد { base, state, close }؛ state = { mode, calls[], delay } يُعدَّل أثناء التشغيل. */
export async function startMockServer({ port = 8886, mode = 'echo', delay = 1800 } = {}) {
  const SITE = path.join(ROOT, 'dist/client'), SAMPLE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/photo-sample.jpg')), base = `http://127.0.0.1:${port}`;
  const state = { mode, calls: [], delay };
  const AI = { async run(model, input) {
    const form = await new Response(input.multipart.body, { headers: { 'content-type': input.multipart.contentType } }).formData();
    const sent = new Uint8Array(await form.get('input_image_0').arrayBuffer());
    state.calls.push({ model, prompt: form.get('prompt'), width: form.get('width'), height: form.get('height'), seed: form.get('seed'), bytes: sent.length });
    await new Promise(r => setTimeout(r, state.delay));
    return { image: bytesToB64(state.mode === 'fixed' ? new Uint8Array(SAMPLE) : sent) };
  } };
  const photo = createPhotoHandler({ limits: { ...PHOTO_LIMITS, perMinute: 100 } });
  const server = http.createServer(async (q, r) => {
    const url = new URL(q.url, base);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of q) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(q.headers)) if (typeof v === 'string') headers.set(k, v); headers.set('CF-Connecting-IP', '127.0.0.1');
      const res = await photo.fetch(new Request(url, { method: q.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }), { ALLOWED_ORIGIN: base, ...(state.mode === 'off' ? {} : { AI }) });
      r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer())); return;
    }
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/home.html'; else if (p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(res => server.listen(port, '127.0.0.1', res));
  return { base, state, close: () => server.close() };
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) { const s = await startMockServer({ port: +process.argv[2] || 8886, mode: process.argv[3] || 'echo' }); console.log('خادم وهمي للصورة الاحترافية على', s.base, '— الوضع', s.state.mode); }
