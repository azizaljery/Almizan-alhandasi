// مدخل واحد على Cloudflare: الموقع الثابت + وكيل Claude + أرشيف الحسابات (D1) + الإدارة من أصل واحد.
// /api/archive/* → site-archive، /api/archive-consent/* → أرشيف تصاميم العملاء بموافقتهم، /admin و/api/admin/* → الإدارة،
// /api/geo/* → تحديد موقع الأرض، /api/photo* → الصورة المعمارية الاحترافية (Workers AI)، /api/site/notice → رسالة الصيانة،
// وبقية /api/* → وكيل التحليل، وما سواها → ملفات الموقع (ASSETS).
// مفاتيح التحكم من الإدارة (site_settings) تُطبَّق على photo/geo عبر env فعّال: الإعداد أو المتغير أيهما يوقف يوقف.
import assistant from './server.mjs';
import archive from './site-archive.mjs';
import photo from './photo.mjs';
import geo from './geo.mjs';
import admin from './admin.mjs';
import clientArchive from './client-archive.mjs';
import { readSettings, effectiveEnv } from './site-settings.mjs';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html' || pathname === '/api/admin' || pathname.startsWith('/api/admin/')) return admin.fetch(request, env);
    if (pathname === '/api/archive-consent' || pathname.startsWith('/api/archive-consent/')) return clientArchive.fetch(request, env);
    if (pathname === '/api/site/notice' && request.method === 'GET') {
      const { values } = await readSettings(env);
      return new Response(JSON.stringify({ message: values.maintenance_message || '' }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', 'x-content-type-options': 'nosniff' } });
    }
    if (pathname === '/api/archive' || pathname.startsWith('/api/archive/')) return archive.fetch(request, env, ctx);
    if (pathname === '/api/photo' || pathname.startsWith('/api/photo/')) return photo.fetch(request, effectiveEnv(env, (await readSettings(env)).values));
    if (pathname === '/api/geo' || pathname.startsWith('/api/geo/')) return geo.fetch(request, effectiveEnv(env, (await readSettings(env)).values));
    if (pathname.startsWith('/api/')) return assistant.fetch(request, env);
    if (pathname === '/' && !new URL(request.url).searchParams.has('legacy') && env?.ASSETS?.fetch && ['GET', 'HEAD'].includes(request.method)) {
      const u = new URL(request.url); u.pathname = '/home.html';
      return env.ASSETS.fetch(new Request(u, request));
    }
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
