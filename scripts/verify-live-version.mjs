// قراءة فقط: يقارن commit في /version.json الحي بما هو متوقع. للاستعمال بعد النشر أو بعد التراجع (D-02).
// الاستعمال:  node scripts/verify-live-version.mjs <commit-متوقع> [SITE_URL]
import { pathToFileURL } from 'node:url';
export function compareVersion(live, expected) {
  const commit = typeof live?.commit === 'string' ? live.commit : null;
  if (!commit) return { ok: false, reason: 'no-commit-in-version-json', live: commit, expected };
  if (!expected) return { ok: false, reason: 'no-expected-commit', live: commit, expected };
  const ok = commit === expected || (expected.length >= 7 && commit.startsWith(expected));
  return { ok, reason: ok ? 'match' : 'mismatch', live: commit, expected, builtAt: live.builtAt ?? null };
}
export async function readLive(base, fetchImpl = fetch) {
  const r = await fetchImpl(`${base.replace(/\/$/, '')}/version.json?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [expected, site = process.env.SITE_URL || 'https://almizan-handasi.aljeryabod.workers.dev'] = process.argv.slice(2);
  try { const res = compareVersion(await readLive(site), expected); console.log(JSON.stringify(res)); process.exit(res.ok ? 0 : 1); }
  catch (e) { console.log(JSON.stringify({ ok: false, reason: 'fetch-failed', error: String(e.message) })); process.exit(2); }
}
