// SHARAA V3 — سياسة اختيار الأسئلة (عمق المقابلة). دالة نقية.
// الأعماق: core (الأساسي دائمًا)، standard (الافتراضي: ما يغيّر التصميم في الغالب)، full (كل ما ينطبق)، optional (لا يُسأل إلا في full).
// التصنيف تقديري ويحتاج مراجعة معماريين؛ ليس اشتراطًا نظاميًا.
const DETAIL = new Set(['daily.exercise','daily.hobbies','daily.tv','daily.storage','daily.shoes','daily.officeGuests','daily.breakfast',
 'future.accessibility','future.annex','future.convert','future.phasing','future.upperSeparate','household.householdChange','household.familyTogether',
 'living.furniture','living.height','living.garden','privacy.night','privacy.garden','privacy.bathSight','site.view','site.noise','site.parkingShade',
 'services.drying','services.waste','services.vent','services.pantry','services.laundry','services.heavyCooking','garden.maintenance','garden.planting','garden.seating',
 'sleep.morning','sleep.dressing','sleep.guestBath','children.supervision','children.gardenPlay','children.flex','children.sharedBath','children.sharedRooms',
 'parents.garden','parents.bath','parents.quiet','hospitality.frequency','hospitality.serviceRoute','site.city','site.irregularUse']);
const STANDARD_T4 = new Set(['architecture.concept','budget.count','budget.priority','budget.amount','environment.climate']);
export function depthOf(q) {
  if (q.tier === 1) return 'core';
  if (q.tier === 4 && !STANDARD_T4.has(q.id)) return 'optional';
  if (DETAIL.has(q.id)) return 'detail';
  return 'standard';
}
const ALLOWED = { core: ['core'], standard: ['core', 'standard'], full: ['core', 'standard', 'detail', 'optional'] };
export function askable(q, depth = 'standard') {
  if (!ALLOWED[depth]) throw Error('Invalid depth');
  return ALLOWED[depth].includes(depthOf(q));
}
