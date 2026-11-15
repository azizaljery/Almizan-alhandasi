// الصفحات الداخلية (التصميم، المرسم، العرض، المخرجات): تضع علامة «جلسة العمل النشطة» وآخر نشاط فقط ولا تمسح شيئًا.
import { touchVisit } from './project-lifecycle.mjs';
import { keepAlive } from './visit-keepalive.mjs';
try { touchVisit(sessionStorage); keepAlive(); } catch { /* التخزين غير متاح */ }
