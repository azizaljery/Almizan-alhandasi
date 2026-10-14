// مدخل واحد على Cloudflare: الموقع الثابت + وكيل Claude + أرشيف الحسابات (D1) من أصل واحد.
// /api/archive/* → site-archive، وبقية /api/* → وكيل التحليل، وما سواها → ملفات الموقع (ASSETS).
import assistant from './server.mjs';
import archive from './site-archive.mjs';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/archive' || pathname.startsWith('/api/archive/')) return archive.fetch(request, env, ctx);
    if (pathname.startsWith('/api/')) return assistant.fetch(request, env);
    if (pathname === '/' && !new URL(request.url).searchParams.has('legacy') && env?.ASSETS?.fetch && ['GET', 'HEAD'].includes(request.method)) {
      const u = new URL(request.url); u.pathname = '/studio.html';
      return env.ASSETS.fetch(new Request(u, request));
    }
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
