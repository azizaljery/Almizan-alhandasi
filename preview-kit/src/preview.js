import { validateStatus, isAllowedHost } from './logic.mjs';

async function mountPreview() {
  let status;
  try {
    // تعديل للميزان: مسار نسبي إلى مكان هذا الملف (يعمل تحت أي جذر، ومنه صفحات المعاينة المنشورة بمسارات نسبية)
    const response = await fetch(new URL('status.json', import.meta.url), { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) return;
    status = validateStatus(await response.json());
  } catch (err) {
    console.warn('[MIZAN PREVIEW] Unable to verify preview status; no readiness claim is made.', err);
    return;
  }
  if (!isAllowedHost(status, window.location.hostname)) return;
  if (document.getElementById('mizan-preview-banner')) return;
  const root = document.createElement('aside');
  root.id = 'mizan-preview-banner';
  root.setAttribute('dir', 'rtl');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'حالة النسخة التجريبية');
  root.className = 'mizan-preview';
  const header = document.createElement('div');
  header.className = 'mizan-preview__header';
  const heading = document.createElement('strong');
  heading.textContent = 'نسخة تجريبية — القبول الهندسي غير مكتمل';
  const sub = document.createElement('span');
  sub.textContent = 'هذه معاينة للاختبار وليست اعتمادًا معماريًا أو نظاميًا أو إذنًا بالنشر النهائي.';
  header.append(heading, sub);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'عرض العيوب والحالات غير المتحققة';
  const ul = document.createElement('ul');
  for (const issue of status.issues) {
    const li = document.createElement('li');
    li.textContent = `${issue.title} — ${({ open: 'مفتوح', unverified: 'غير متحقق', pending: 'قيد التحقق', resolved: 'مغلق بدليل' })[issue.state]}`;
    ul.append(li);
  }
  details.append(summary, ul);
  root.append(header, details);
  document.body.prepend(root);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPreview, { once: true });
else void mountPreview();
