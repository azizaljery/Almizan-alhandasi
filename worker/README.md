# مساعد الميزان الهندسي — طبقة الخادم

هذه طبقة خادم Cloudflare Worker لخدمة فهم متطلبات «الميزان الهندسي».

الخدمة المحددة لهذا المشروع هي `gentle-sun-5ef5` على حساب `aljeryabod.workers.dev`، وهو الاسم نفسه في `wrangler.toml` وعنوان العميل في `dist/assistant.mjs`. لا تنشر هذا الخادم إلى `al-mizan-api` المرتبط بمشروع الأسهم.

فحص الإعداد: `GET https://gentle-sun-5ef5.aljeryabod.workers.dev/api/assistant/status`. عند استخدام اختبار HTTP داخل Cloudflare، اضبط الترويسة `Origin` على `https://al-mizan-al-handasi.aljeryabod.chatgpt.site`. الرابط الأساسي `/` يعيد 404 لأنه ليس صفحة للموقع. يلزم طلب تحليل ناجح من الواجهة برمز الموقع لإثبات الاتصال الحي.

## ما ينفذه هذا الملف

- يحوّل وصفاً عربياً إلى متطلبات مساحية عبر Responses API مع Structured Outputs، عند إعداد المفتاح.
- يقبل `plot.width` و`plot.length` بين 8 و100 متر، و`floors` من 1 إلى 3، وشوارع اختيارية `{n,s,e,w}` بقيم boolean.
- يقبل `counts` الاختياري للتوافق مع الربط السابق: `bedrooms` من 1 إلى 8 و`majlis` من 0 إلى 3.
- يتحقق من 30 فراغاً كحد أقصى، ومساحات بين 4 و120 م²، ومن نوع `corridor` للممر المطلوب.
- يسمح بقائمة غرف فارغة فقط مع سؤال أو تنبيه بمتطلبات غير ممثلة، حتى لا يخترع غرفة عند طلب التوضيح.
- يعيد `scope: requirements_only` و`requiresReview: true`. حالة الإعداد `verified: false` ليست اختبار اتصال حي.
- يعيد `limitations` مستقلة عند تعدد الأدوار؛ لا يحذف أي بند من `brief.unhandled` لإدراجها.

## حدود الأمان والتوافق

`createWorker(assets, providerFetch)` لبّ قابل للاختبار، و`export default.fetch` هو مدخل Cloudflare Workers. تبقى واجهة Sites منشورة من `dist/` بشكل مستقل.

`handleRequest(request, env)` يقبل Web Request ويعيد Web Response. ليس بديلاً مباشراً لدالة Node `createServer(req, res)` أو لمعالج Vercel؛ تلك البيئات تحتاج محولات ومصادقة منفصلة. لم يتم إنشاء هذه المحولات أو اختبارها هنا.

لا يوجد CORS مفتوح. لا يقبل الخادم إلا أصل Sites المحدد في `ALLOWED_ORIGIN`، ويتطلب رمزًا مطابقًا للسر `MIZAN_ACCESS_CODE` في ترويسة `X-Mizan-Access-Code`. هذا الرمز ليس مفتاح OpenAI، ولا يُحفظ في ملفات المشروع. حد الجسم 24000 بايت، وحد الوصف 4000 حرف.

تحديد المعدل خمسة طلبات في الدقيقة لكل عنوان عميل داخل نسخة Worker واحدة فقط. لا يُعد سقف إنفاق أو حداً موزعاً.

المفتاح في `OPENAI_API_KEY` ببيئة الخادم فقط. لا توضع الأسرار في الواجهة أو المستودع. النموذج الافتراضي `gpt-4.1-mini`، وقابل للتحديد عبر `OPENAI_MODEL`.

## حالة الواجهة والتفعيل

- `dist/planner.mjs`: محرك محلي لكتلة مستطيلة أرضية، يحفظ المساحات ويضيف الجدران والممرات والأبواب، مع تحقق هندسي آلي.
- `dist/app.mjs` و`dist/plan-view.mjs` و`dist/viewer3d.mjs`: جدول متطلبات قابل للتعديل، ورسم 2D وعرض غرف 3D وكميات من النموذج نفسه.
- `dist/assistant.mjs`: عقد اقتراح للمراجعة؛ يتصل بعنوان Worker المحدد ويطلب رمز الموقع. لا يُدخل المستخدم مفتاح OpenAI في المتصفح.
- يلزم إعداد `OPENAI_API_KEY` و`MIZAN_ACCESS_CODE` في أسرار Worker، ثم نشر الخادم والواجهة واختبار طلب حي.
- لا تكفي اختبارات المحاكاة لإثبات اتصال المزود أو جودة الفهم اللغوي، ولا يجوز وصف الإصدار الثابت بأنه ذكاء اصطناعي متصل.

اختبارات `tests/server.test.mjs` محلية بالكامل وتستخدم استجابات مزود محاكاة، دون شبكة أو استهلاك API.

المخطط الناتج من هذه الخدمة متطلبات أولية، وليس مخططاً تنفيذياً أو اعتماداً لكود البناء أو تقديراً إنشائياً.

مراجع: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)، [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
