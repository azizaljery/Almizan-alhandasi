// Directional preference only: this is not a solar simulation or compliance check.
const MAP = {
  s: { front: 's', back: 'n', left: 'w', right: 'e' }, n: { front: 'n', back: 's', left: 'e', right: 'w' },
  e: { front: 'e', back: 'w', left: 's', right: 'n' }, w: { front: 'w', back: 'e', left: 'n', right: 's' },
};
const LABEL = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const PREFERENCE = {
  majlis: { n: 8, e: 9, s: 6, w: 3 }, living: { n: 9, e: 8, s: 6, w: 4 }, dining: { n: 7, e: 7, s: 6, w: 5 },
  bedroom: { n: 8, e: 7, s: 6, w: 3 }, kitchen: { n: 6, e: 6, s: 6, w: 7 }, bath: { n: 5, e: 5, s: 5, w: 5 },
  storage: { n: 5, e: 5, s: 5, w: 5 }, service: { n: 5, e: 5, s: 5, w: 5 }, corridor: { n: 5, e: 5, s: 5, w: 5 },
};

export function applySunOrientation(rooms, entry) {
  const directions = MAP[entry];
  if (!directions) throw Error('جهة مدخل غير معروفة.');
  return rooms.map(room => {
    const pref = PREFERENCE[room.type] || PREFERENCE.corridor;
    const choices = [
      ['front', 'any', pref[directions.front]], ['back', 'any', pref[directions.back]], ['middle', 'left', pref[directions.left]], ['middle', 'right', pref[directions.right]], ['middle', 'any', 5],
    ];
    const [position, side] = choices.reduce((best, next) => next[2] > best[2] ? next : best);
    return { ...room, position, side };
  });
}

export function describeSunOrientation(entry) {
  if (!MAP[entry]) throw Error('جهة مدخل غير معروفة.');
  return `ترجيح اتجاهي مبدئي نسبةً إلى المدخل: فضّلنا الشرق/الشمال للمعيشة والنوم وتخفيف الغرب قدر الإمكان. ليس محاكاة شمسية أو ضماناً للإضاءة الطبيعية.`;
}
