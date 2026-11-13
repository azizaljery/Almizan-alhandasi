// يُستورد أولًا في الصفحة الرئيسية: قبل أن تقرأ أي وحدة حالة المشروع من التخزين يكون الدخول الجديد قد بدأ مشروعًا نظيفًا.
import { beginVisit } from './project-lifecycle.mjs';
export const visit = (() => { try { return beginVisit(localStorage, sessionStorage); } catch { return { fresh: false }; } })();
