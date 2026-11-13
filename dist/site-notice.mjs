// رسالة الصيانة الاختيارية من لوحة الإدارة: نص قصير يظهر أعلى الصفحة. textContent فقط (لا HTML)، وأي فشل يُتجاهل بصمت.
(async () => {
  try {
    if (location.protocol === 'file:') return;
    const res = await fetch('/api/site/notice', { credentials: 'omit' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return;
    const msg = String((await res.json()).message || '').trim().slice(0, 200);
    if (!msg) return;
    const bar = document.createElement('div'); bar.setAttribute('role', 'status'); bar.id = 'siteNotice'; bar.textContent = msg;
    Object.assign(bar.style, { position: 'sticky', top: '0', zIndex: '2147483000', background: '#fff3cd', color: '#4a3500', borderBottom: '1px solid #e0c36a', padding: '8px 16px', textAlign: 'center', font: '600 14px/1.6 system-ui,Tahoma,sans-serif' });
    document.body.prepend(bar);
  } catch { /* لا تعطّل الصفحة */ }
})();
