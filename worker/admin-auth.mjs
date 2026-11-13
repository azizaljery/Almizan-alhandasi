// أدوات مصادقة الإدارة (WebCrypto فقط): تجزئة كلمة السر، قوتها، رموز الجلسة، مقارنة ثابتة الزمن.
// لا تُخزَّن كلمة السر ولا تُسجَّل أبدًا؛ المخزَّن مشتقّ مُجزّأ + ملح عشوائي لكل كلمة + معاملات الاشتقاق.
//
// الاشتقاق: PBKDF2-SHA256 مسلسلًا في rounds جولات، كل جولة per تكرار (المجموع = rounds × per ≥ 210,000).
// لماذا مسلسل؟ وركرز كلودفلير يحدّ تكرارات PBKDF2 الأصلية بنحو 100,000 للطلب الواحد (من الذاكرة، غير متحقق من الوثائق الحالية)،
// فنقسم العمل إلى جولات ≤ 100,000 يغذّي خرجُ كل جولة الجولةَ التالية، فيبقى الكلفة الكلية ≥ 210,000 دون اعتماد على ذلك الحد.
export const KDF = Object.freeze({ algo: 'pbkdf2-sha256-chain', per: 100_000, rounds: 3, saltBytes: 16, outBytes: 32 });
export const MIN_PASSWORD = 12;
const enc = new TextEncoder();

export const b64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = s => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0)); };
export const randomToken = (bytes = 32) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** مقارنة ثابتة الزمن لسلسلتين (بعد تجزئتهما إلى طول ثابت لإخفاء الطول). */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256Hex('cmp|' + a), sha256Hex('cmp|' + b)]);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && a.length === b.length;
}
const bytesEqual = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

async function derive(password, salt, params) {
  let material = enc.encode(password.normalize('NFKC')), out = null;
  for (let r = 0; r < params.rounds; r++) {
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    const roundSalt = new Uint8Array(salt.length + 1); roundSalt.set(salt); roundSalt[salt.length] = r;
    out = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: roundSalt, iterations: params.per }, key, params.outBytes * 8));
    material = out;
  }
  return out;
}
/** يعيد { hash, salt, params } جاهزة للتخزين (كلها نصوص/JSON). */
export async function hashPassword(password, params = KDF) {
  const salt = crypto.getRandomValues(new Uint8Array(params.saltBytes));
  const p = { algo: params.algo, per: params.per, rounds: params.rounds, saltBytes: params.saltBytes, outBytes: params.outBytes };
  return { hash: b64u(await derive(password, salt, p)), salt: b64u(salt), params: JSON.stringify(p) };
}
export async function verifyPassword(password, record) {
  try {
    const p = JSON.parse(record.params);
    if (p.algo !== KDF.algo || !(p.per >= 1 && p.per <= 100_000) || !(p.rounds >= 1 && p.rounds <= 20)) return false;
    const got = await derive(String(password), unb64u(record.salt), p);
    return bytesEqual(got, unb64u(record.hash));
  } catch { return false; }
}
/** حساب وهمي لتساوي زمن الرد عند غياب الحساب/خطأ الكلمة (لا تسرّب وجودًا). */
export async function burnTime(password) { try { await derive(String(password), new Uint8Array(16), KDF); } catch { /* لا يهم */ } }

const COMMON = ['password', 'passw0rd', '123456789012', 'qwertyuiop12', 'administrator', 'welcome12345', 'letmein12345', 'iloveyou1234', 'changeme1234', 'مرحبا123456', 'password1234', 'password12345', '1234567890123', 'qwerty123456', 'admin1234567', 'abc123456789', 'almizan12345', 'mizan1234567', 'الميزان123456'];
/** قوة الكلمة: { ok, score 0..4, label, problems[] }. ≥12 حرفًا، تمنع الشائع جدًا والتكرار والتسلسل البسيط. */
export function passwordStrength(pw) {
  const s = String(pw ?? ''), problems = [], chars = [...s];
  if (chars.length < MIN_PASSWORD) problems.push(`قصيرة: الحد الأدنى ${MIN_PASSWORD} حرفًا.`);
  if (chars.length > 200) problems.push('طويلة جدًا (الحد 200 حرف).');
  const low = s.toLowerCase().normalize('NFKC');
  if (COMMON.some(c => low.includes(c.toLowerCase())) ) problems.push('تحتوي نمطًا شائعًا جدًا.');
  if (new Set(chars).size < 6) problems.push('أحرفها متكررة كثيرًا.');
  if (/^(.)\1+$/.test(s) || /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(s) && new Set(chars).size < 9) problems.push('تسلسل بسيط يسهل تخمينه.');
  let classes = 0; if (/[a-z]/.test(s)) classes++; if (/[A-Z]/.test(s)) classes++; if (/[0-9]/.test(s)) classes++; if (/[^A-Za-z0-9]/.test(s)) classes++;
  const uniq = new Set(chars).size;
  let score = 0;
  if (!problems.length) { score = 1; if (chars.length >= 14 && classes >= 2) score = 2; if (chars.length >= 16 && classes >= 3 && uniq >= 10) score = 3; if (chars.length >= 20 && classes >= 3 && uniq >= 12) score = 4; }
  return { ok: problems.length === 0, score, label: ['ضعيفة', 'مقبولة', 'جيدة', 'قوية', 'قوية جدًا'][score], problems };
}
export const SESSION_TTL_MS = 8 * 3600_000, SESSION_ABS_MS = 24 * 3600_000;
