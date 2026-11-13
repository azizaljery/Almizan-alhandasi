-- جداول الإدارة وأرشيف تصاميم العملاء (بموافقتهم) ومفاتيح التحكم. كلها IF NOT EXISTS؛ تُنشأ مرة واحدة:
--   npx wrangler d1 execute almizan-archive --remote --file db/admin.sql
-- لا يمسّ هذا الملف جداول الأرشيف الحالية ولا photo_usage. بدونه تعمل صفحة /admin بوضع «الإعداد المطلوب» فقط.

-- حساب الإدارة: صف واحد. disabled=1 يعني أن المالك حذف كلمة السر (الإدارة مغلقة ولا إعداد أول لأحد).
CREATE TABLE IF NOT EXISTS admin_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hash TEXT, salt TEXT, params TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  epoch INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- جلسات الدخول: يُخزَّن تجزئة الرمز لا الرمز نفسه.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, epoch INTEGER NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
-- محاولات الدخول الفاشلة: مفتاح = تجزئة (عميل أو 'global') ونافذة 15 دقيقة.
CREATE TABLE IF NOT EXISTS admin_attempts (
  key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0
);
-- مفاتيح التحكم بالموقع.
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- سجل التدقيق: كل كتابة إدارية، بلا أسرار.
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
);
-- تصاميم العملاء المحفوظة بموافقتهم الصريحة. AUTOINCREMENT: الأرقام تصاعدية ولا تُعاد بعد الحذف. لا IP ولا اسم.
CREATE TABLE IF NOT EXISTS client_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT '', floors INTEGER NOT NULL DEFAULT 1,
  plot_width REAL, plot_length REAL, plot_area REAL,
  bedrooms INTEGER,
  geo_lat REAL, geo_lng REAL,
  bytes INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_designs_created ON client_designs (created_at);
CREATE INDEX IF NOT EXISTS idx_client_designs_style ON client_designs (style);
