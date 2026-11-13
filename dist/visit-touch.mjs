// الصفحات الداخلية (التصميم، المرسم، العرض، المخرجات): تضع علامة «جلسة العمل النشطة» فقط ولا تمسح شيئًا.
import { touchVisit } from './project-lifecycle.mjs';
try { touchVisit(sessionStorage); } catch { /* التخزين غير متاح */ }
