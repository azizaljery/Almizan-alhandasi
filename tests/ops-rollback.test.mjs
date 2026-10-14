// D-02 — the rollback runbook exists, states its limits, and its read-only verification helper behaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { compareVersion, readLive } from '../scripts/verify-live-version.mjs';

const doc = readFileSync(new URL('../docs/ops/ROLLBACK-RUNBOOK.md', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-site.yml', import.meta.url), 'utf8');

test('runbook is tied to the real worker/workflow and states the key limits honestly', () => {
  const name = wrangler.match(/^name\s*=\s*"([^"]+)"/m)[1];
  assert.ok(doc.includes('npx wrangler rollback') && doc.includes(name));
  assert.match(workflow, /wrangler@4 deploy/, 'the documented deploy flow is the real one');
  for (const must of ['لم يُنفَّذ أي rollback حقيقي', 'D1', '100', 'git revert', 'verify-live-version', 'غير متحقق', 'الأسرار: غير متحقق', 'غير مبيَّن في المستودع']) assert.ok(doc.includes(must), must);
  assert.ok(!/CLOUDFLARE_API_TOKEN\s*=\s*\S+/.test(doc), 'no secret values in the runbook');
});

test('compareVersion: match, prefix match, mismatch, and missing data never pass', () => {
  const live = { commit: '6af0b04570f2f3460b4591ca464dcff18a23ccb3', builtAt: 't' };
  assert.equal(compareVersion(live, live.commit).ok, true);
  assert.equal(compareVersion(live, '6af0b04').ok, true);
  assert.equal(compareVersion(live, '1b4f143').ok, false);
  assert.equal(compareVersion({}, 'abc1234').ok, false);
  assert.equal(compareVersion(live, '').ok, false);
  assert.equal(compareVersion(live, 'abc').ok, false, 'a 3-char prefix is not accepted');
  assert.equal(compareVersion({ commit: 'unknown' }, 'unknown').ok, false, "build.mjs writes 'unknown' without git: never a match");
});

// async spawn: a sync spawn would block the in-process server and deadlock
const root = new URL('..', import.meta.url).pathname;
const run = (...a) => new Promise((ok) => execFile(process.execPath, ['scripts/verify-live-version.mjs', ...a], { cwd: root }, (err) => ok({ status: err ? err.code : 0 })));

test('CLI is read-only and exits 0/1/2 against a local server (no production traffic)', async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/version.json')) { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ commit: 'abcdef1234567890', builtAt: 'x' })); } else { r.statusCode = 404; r.end(); } });
  await new Promise((ok) => srv.listen(0, ok)); const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await readLive(url)).commit, 'abcdef1234567890');
    assert.equal((await run('abcdef1', url)).status, 0);
    assert.equal((await run('0000000', url)).status, 1);
  } finally { srv.close(); }
  assert.equal((await run('abcdef1', 'http://127.0.0.1:1')).status, 2);
});
