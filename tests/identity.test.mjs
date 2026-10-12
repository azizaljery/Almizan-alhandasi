import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwner, verifyAccessJwt, clearIdentityCache } from '../worker/identity.mjs';

const TEAM = 'mizan.cloudflareaccess.com', AUD = 'aud-tag-123';
const b64u = bytes => Buffer.from(bytes).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const fetcher = async url => { assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`); return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }); };
const NOW = 1_800_000_000_000;
async function sign(claims, { kid = 'k1', key = pair.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid })), p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}
const good = { iss: `https://${TEAM}`, aud: [AUD], sub: 'user-1', email: 'a@b.test', exp: NOW / 1000 + 600 };
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const opts = { fetcher, now: () => NOW };
beforeEach(() => clearIdentityCache());

test('رمز Access صحيح يعطي هوية ثابتة', async () => {
  assert.equal(await verifyAccessJwt(await sign(good), env, opts), 'user-1');
  const req = new Request('https://x.test/api/archive/session', { headers: { 'cf-access-jwt-assertion': await sign(good) } });
  assert.equal(await resolveOwner(req, env, opts), 'cfa:user-1');
});
test('يرفض aud خاطئًا وiss خاطئًا ومنتهيًا وتوقيعًا مزوّرًا', async () => {
  assert.equal(await verifyAccessJwt(await sign({ ...good, aud: ['other'] }), env, opts), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, iss: 'https://evil.test' }), env, opts), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, exp: NOW / 1000 - 5 }), env, opts), null);
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  assert.equal(await verifyAccessJwt(await sign(good, { key: other.privateKey }), env, opts), null);
  const [h, p, s] = (await sign(good)).split('.');
  assert.equal(await verifyAccessJwt(`${h}.${b64u(JSON.stringify({ ...good, sub: 'admin' }))}.${s}`, env, opts), null);
  assert.equal(await verifyAccessJwt(await sign(good, { kid: 'unknown' }), env, opts), null);
});
test('بلا إعداد Access لا هوية، وترويسة oai لا تُقبل إلا بالعلم الصريح', async () => {
  const spoof = new Request('https://x.test/', { headers: { 'oai-authenticated-user-id': 'victim' } });
  assert.equal(await resolveOwner(spoof, {}, opts), null);
  assert.equal(await resolveOwner(spoof, env, opts), null);
  assert.equal(await resolveOwner(spoof, { TRUST_SITES_HEADER: '1' }, opts), 'victim');
  assert.equal(await verifyAccessJwt('a.b.c', {}, opts), null);
  assert.equal(await verifyAccessJwt('garbage', env, opts), null);
});
