// مستندات صغيرة مصنوعة يدويًا لاختبارات المراجعة الإنشائية المبدئية ومسارات الحركة والتطابق 2D/3D (ليست ملف اختبار).
import { createDoc } from '../dist/draw/doc.mjs';
import { readFileSync } from 'node:fs';

/** levels: [{ walls: [[x0,y0,x1,y1,t?]], openings: [[wallIndex, kind, at, w, extra?]], labels: [[name,type,x,y]], fixtures: [{...}] }] */
export function miniDoc(spec) {
  const doc = createDoc({ title: 'اختبار' });
  doc.levels = spec.levels.map((l, i) => ({ id: 'L' + (i + 1), name: i ? 'الدور الأول' : 'الدور الأرضي', elevation: 3.2 * i, height: 3.2 }));
  let wn = 0, on = 0, ln = 0, fn = 0;
  spec.levels.forEach((l, i) => {
    const lid = 'L' + (i + 1);
    const ids = l.walls.map(([x0, y0, x1, y1, t = 0.2]) => { const id = 'w' + (++wn); doc.walls.push({ id, level: lid, a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, t, h: null, kind: 'wall' }); return id; });
    for (const [wi, kind, at, w, extra = {}] of l.openings || []) {
      const win = kind.startsWith('window');
      doc.openings.push({ id: 'o' + (++on), level: lid, wall: ids[wi], kind, at, w, h: win ? 1.2 : 2.1, sill: win ? 1 : 0, swing: 'in', hinge: 'left', entry: false, ...extra });
    }
    for (const [name, type, x, y] of l.labels || []) doc.labels.push({ id: 'r' + (++ln), level: lid, name, type, seed: { x, y } });
    for (const f of l.fixtures || []) doc.fixtures.push({ id: 'f' + (++fn), level: lid, rot: 0, h: 0.8, ...f });
  });
  doc.stairs = spec.stairs || [];
  return doc;
}

/** مستطيل جدران (4 جدران) يبدأ من (x0,y0). */
export const rect = (x0, y0, x1, y1, t = 0.2) => [[x0, y0, x1, y0, t], [x1, y0, x1, y1, t], [x0, y1, x1, y1, t], [x0, y0, x0, y1, t]];

const ROOT = new URL('../', import.meta.url).pathname;
export const loadDoc = rel => { const j = JSON.parse(readFileSync(ROOT + rel, 'utf8')); return j.doc || j; };
export const FORBIDDEN_CLAIMS = /آمن|آمنة|سليم إنشائي|سلامة إنشائية|جاهز للتنفيذ|صالح للتنفيذ|\bsafe\b|ready for construction/i;
