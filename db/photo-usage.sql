-- عدّاد استعمال «الصورة المعمارية الاحترافية» لليوم (UTC): صف للإجمالي وصف لكل عميل (بصمة عنوانه لذلك اليوم، لا العنوان نفسه).
-- يستعمله أيضًا /api/shara بمفاتيح تبدأ بـ shara: (shara:total، shara:ip:<بصمة>، shara:tok_in، shara:tok_out، shara:search): عدّاد أسئلة وتوكنات فقط بلا نصوص ولا هويات.
-- لا تُخزَّن فيه صور ولا أوصاف. يُنشأ مرة واحدة:
--   npx wrangler d1 execute almizan-archive --remote --file db/photo-usage.sql
-- وإن لم يُنشأ يعمل /api/photo بعدّاد في الذاكرة (تقريبي).
CREATE TABLE IF NOT EXISTS photo_usage (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
