// هوية صاحب الأرشيف خارج ChatGPT Sites.
// المصدر الأول: رمز Cloudflare Access (Cf-Access-Jwt-Assertion) يُتحقق من توقيعه RS256 ومن iss وaud وexp.
// ترويسة oai-authenticated-user-id كانت تأتي من Sites فقط؛ على Cloudflare يستطيع أي عميل إرسالها،
// لذلك لا تُقبل إلا عند ضبط TRUST_SITES_HEADER=1 صراحةً (للاستضافة القديمة فقط).
const enc = new TextEncoder();
const b64urlBytes = value => {
  const s = value.replace(/-/g, '+').replace(/_/g, '/'), pad = s + '='.repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
};
const b64urlJson = value => JSON.parse(new TextDecoder().decode(b64urlBytes(value)));
const cleanIdentity = value => {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return !id || id.length > 255 || /[\u0000-\u001f\u007f]/.test(id) ? null : id;
};

const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map();

async function loadKeys(team, fetcher, now) {
  const hit = jwksCache.get(team);
  if (hit && now - hit.at < JWKS_TTL_MS) return hit.keys;
  const response = await fetcher(`https://${team}/cdn-cgi/access/certs`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('jwks_unavailable');
  const body = await response.json();
  if (!Array.isArray(body?.keys)) throw new Error('jwks_invalid');
  jwksCache.set(team, { at: now, keys: body.keys });
  return body.keys;
}

export function clearIdentityCache() { jwksCache.clear(); }

export async function verifyAccessJwt(token, env, { fetcher = fetch, now = Date.now } = {}) {
  const team = typeof env?.ACCESS_TEAM_DOMAIN === 'string' ? env.ACCESS_TEAM_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  const aud = typeof env?.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : '';
  if (!team || !aud || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8192) return null;
  try {
    const header = b64urlJson(parts[0]), claims = b64urlJson(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const jwk = (await loadKeys(team, fetcher, now())).find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const seconds = Math.floor(now() / 1000);
    if (claims.iss !== `https://${team}`) return null;
    if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(aud)) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= seconds) return null;
    if (Number.isFinite(claims.nbf) && claims.nbf > seconds + 60) return null;
    return cleanIdentity(claims.sub) || cleanIdentity(claims.email);
  } catch { return null; }
}

// يعيد معرّفًا ثابتًا لصاحب الطلب أو null (غير مسجّل).
export async function resolveOwner(request, env, options = {}) {
  const viaAccess = await verifyAccessJwt(request.headers.get('cf-access-jwt-assertion'), env, options);
  if (viaAccess) return `cfa:${viaAccess}`;
  if (env?.TRUST_SITES_HEADER === '1') return cleanIdentity(request.headers.get('oai-authenticated-user-id'));
  return null;
}
