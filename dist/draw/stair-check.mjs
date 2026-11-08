// فحص أبعاد الدرج مقابل الأحكام العامة لكود البناء السعودي العام SBC 201 (إصدار 2018)، الفصل 10، القسم 1011.
// المصدر: نص SBC 201-AR-18 (نسخة PDF منشورة غير صادرة من sbc.gov.sa، اطُّلع عليها 2026-11-08):
//   https://docs.wixstatic.com/ugd/4069ce_8f1b651816d640579f55c6c64a0ded03.pdf
//   1011.2  العرض: لا يقل العرض الصافي عن 1.1 م (مع استثناءات مذكورة بالإحالة).
//   1011.3  ارتفاع سقف السلم الصافي لا يقل عن 2.0 م.
//   1011.5.2 القائمة بين 100 و175 مم، وعمق النائمة لا يقل عن 275 مم (مع استثناءات مذكورة بالإحالة).
//   1011.8  الارتفاع الرأسي للقلبة الواحدة لا يزيد عن 3.6 م.
// الاستثناءات (ومنها ما يخص الوحدات السكنية في الأصل الدولي IBC) لم تُقرأ نصًا من مصدر سعودي: «غير متحقق».
// لذا النتيجة «لا يحقق الحكم العام» لا «مخالف»: قد يُعفى المسكن باستثناء لم نتحقق منه.
import { stairLayout } from './stairs3d.mjs';

export const SBC201_STAIR = Object.freeze({
  source: 'SBC 201-AR-18، القسم 1011 (الأحكام العامة؛ الاستثناءات غير متحقق منها)',
  riserMaxM: { value: .175, clause: '1011.5.2' }, riserMinM: { value: .1, clause: '1011.5.2' },
  treadMinM: { value: .275, clause: '1011.5.2' }, widthMinM: { value: 1.1, clause: '1011.2' },
  headroomMinM: { value: 2.0, clause: '1011.3' }, flightRiseMaxM: { value: 3.6, clause: '1011.8' },
  exceptions: 'غير متحقق',
});

const mmTxt = v => Math.round(v * 1000) + ' مم';
/**
 * @returns {{ stairs: {id, level, kind, N, riserM, treadM, widthM, flightRiseM, checks: {id,label,value,limit,clause,status}[] }[], source, ok: boolean|null }}
 * status: 'ok' يحقق الحكم العام، 'fail' لا يحققه، 'unverified' لم يُقيَّم.
 */
export function checkStairs(doc) {
  const R = SBC201_STAIR, out = [];
  doc.levels.forEach((L, i) => {
    const next = doc.levels[i + 1], rise = next ? (next.elevation ?? 0) - (L.elevation ?? 0) || L.height : L.height;
    for (const s of doc.stairs.filter(x => x.level === L.id)) {
      const lay = stairLayout(s, rise), riser = lay.riser, tread = lay.treadDepth;
      // أطول قلبة بين بسطتين: عدد القوائم المتتالية حتى بسطة
      let run = 0, best = 0; for (const st of lay.steps) { if (st.type === 'landing') { best = Math.max(best, run + 1); run = 0; } else run++; } best = Math.max(best, run + 1);
      const flightRise = best * riser;
      const checks = [
        { id: 'riser-max', label: 'ارتفاع القائمة (الأقصى)', value: riser, valueAr: mmTxt(riser), limit: R.riserMaxM.value, limitAr: '≤ ' + mmTxt(R.riserMaxM.value), clause: R.riserMaxM.clause, status: riser <= R.riserMaxM.value + 1e-9 ? 'ok' : 'fail' },
        { id: 'riser-min', label: 'ارتفاع القائمة (الأدنى)', value: riser, valueAr: mmTxt(riser), limit: R.riserMinM.value, limitAr: '≥ ' + mmTxt(R.riserMinM.value), clause: R.riserMinM.clause, status: riser >= R.riserMinM.value - 1e-9 ? 'ok' : 'fail' },
        { id: 'tread', label: 'عمق النائمة', value: tread, valueAr: mmTxt(tread), limit: R.treadMinM.value, limitAr: '≥ ' + mmTxt(R.treadMinM.value), clause: R.treadMinM.clause, status: tread >= R.treadMinM.value - 1e-9 ? 'ok' : 'fail' },
        { id: 'width', label: 'العرض الصافي', value: s.w ?? 1.1, valueAr: (s.w ?? 1.1).toFixed(2) + ' م', limit: R.widthMinM.value, limitAr: '≥ ' + R.widthMinM.value.toFixed(2) + ' م', clause: R.widthMinM.clause, status: (s.w ?? 1.1) >= R.widthMinM.value - 1e-9 ? 'ok' : 'fail' },
        { id: 'flight-rise', label: 'ارتفاع القلبة الواحدة', value: flightRise, valueAr: flightRise.toFixed(2) + ' م', limit: R.flightRiseMaxM.value, limitAr: '≤ ' + R.flightRiseMaxM.value.toFixed(2) + ' م', clause: R.flightRiseMaxM.clause, status: flightRise <= R.flightRiseMaxM.value + 1e-9 ? 'ok' : 'fail' },
        { id: 'headroom', label: 'ارتفاع السقف الصافي فوق الدرج', value: null, valueAr: 'لم يُقس', limit: R.headroomMinM.value, limitAr: '≥ ' + R.headroomMinM.value.toFixed(2) + ' م', clause: R.headroomMinM.clause, status: 'unverified' },
      ];
      out.push({ id: s.id, level: L.id, levelName: L.name, kind: s.kind || 'straight', N: lay.N, riserM: riser, treadM: tread, widthM: s.w ?? 1.1, flightRiseM: flightRise, checks });
    }
  });
  const decided = out.flatMap(s => s.checks).filter(c => c.status !== 'unverified');
  return { stairs: out, source: R.source, exceptions: R.exceptions, ok: decided.length ? decided.every(c => c.status === 'ok') : null };
}

/** أسطر عربية موجزة للوحة أو الكتاب. */
export function stairCheckLines(result) {
  return result.stairs.flatMap(s => s.checks.filter(c => c.status !== 'ok').map(c => `درج ${s.levelName}: ${c.label} ${c.valueAr} — ${c.status === 'fail' ? 'لا يحقق الحكم العام' : 'غير متحقق'} (${c.limitAr}، SBC 201 §${c.clause}).`));
}

export default { SBC201_STAIR, checkStairs, stairCheckLines };
