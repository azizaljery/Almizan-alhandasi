import { quantities } from './planner.mjs';
/**
 * @typedef {import('./PlannerOutputContract.mjs').ValidatedDesignGeometry} ValidatedDesignGeometry
 * @typedef {import('./PlannerOutputContract.mjs').QuantityRow} QuantityRow
 * @typedef {import('./PlannerOutputContract.mjs').Rates} Rates
 * @typedef {import('./PlannerOutputContract.mjs').EstimateResult} EstimateResult
 */
/** @param {ValidatedDesignGeometry} model @returns {QuantityRow[]} */
export function quantityRows(model) {
  const q = quantities(model);
  return [
    { key: 'walls', name: 'مبانٍ — صافي مساحة الجدران بعد الفتحات', unit: 'م²', quantity: q.wallArea },
    { key: 'plaster', name: 'لياسة — وجها الجدران', unit: 'م²', quantity: q.finishArea },
    { key: 'paint', name: 'دهان — وجها الجدران', unit: 'م²', quantity: q.finishArea },
    { key: 'floor', name: 'أرضيات الفراغات والممرات والمساحة غير الموزعة', unit: 'م²', quantity: q.rooms + q.circulation + q.reserve },
    { key: 'doors', name: 'أبواب — فتحات النموذج', unit: 'باب', quantity: q.doors },
    { key: 'windows', name: 'نوافذ — مجموع مساحات الفتحات', unit: 'م²', quantity: model.openings.filter(o => o.type === 'window').reduce((a, o) => a + o.w * o.h, 0) },
  ];
}
/**
 * @param {QuantityRow[]} rows @param {Rates} rates  '' or undefined = unpriced (reported, not treated as 0)
 * @param {number} reserve  contingency %, 0..50 @param {number} vat  %, 0..30 @returns {EstimateResult}
 */
export function estimate(rows, rates, reserve, vat) {
  if (![reserve, vat].every(Number.isFinite) || reserve < 0 || reserve > 50 || vat < 0 || vat > 30) throw Error('راجع نسبة الاحتياط (0–50) والضريبة (0–30).');
  let subtotal = 0, priced = 0;
  rows.forEach(row => {
    const rate = rates[row.key];
    if (rate === '' || rate === undefined) return;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100000000) throw Error('سعر الوحدة يجب أن يكون رقمًا موجبًا أو صفرًا.');
    subtotal += row.quantity * rate; priced++;
  });
  const contingency = subtotal * reserve / 100, tax = (subtotal + contingency) * vat / 100;
  return { subtotal, contingency, tax, grand: subtotal + contingency + tax, priced, unpriced: rows.length - priced };
}
