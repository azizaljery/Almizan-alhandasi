// Measured design preferences. They rank valid geometry; they are not code limits.
export function architecturalQuality(model) {
  let cost = 0; const defects = [], axes = { daylight: 0, habitable: 0, directPrivacy: 0, narrowRooms: 0 };
  const habitable = new Set(['bedroom', 'master', 'living', 'majlis', 'office']);
  for (const lv of model.levels) {
    for (const r of lv.rooms.filter(r => habitable.has(r.type))) {
      axes.habitable++;
      const windows = lv.openings.filter(o => /^window/.test(o.kind) && (o.left?.id === r.id || o.right?.id === r.id) && (!o.left || !o.right));
      const glass = windows.reduce((n, o) => n + o.o.w * o.o.h, 0), ratio = glass / Math.max(r.area, 1);
      axes.daylight += Math.min(1, ratio / .10);
      if (ratio < .08) { cost += 22 * (1 - Math.min(1, ratio / .08)); defects.push(`«${r.name}»: فتحات الإضاءة الخارجية ${Math.round(ratio * 100)}٪ من المساحة؛ يُفضَّل بديل بإنارة طبيعية أوسع.`); }
      const short = Math.min(r.rect.w, r.rect.l), long = Math.max(r.rect.w, r.rect.l);
      if (long / Math.max(short, .01) > 1.8) { axes.narrowRooms++; cost += 9 * (long / short - 1.8); }
    }
    for (const o of lv.openings.filter(o => /^door/.test(o.kind) && o.left && o.right)) {
      const types = [o.left.type, o.right.type];
      if (types.includes('majlis') && types.some(t => t === 'bedroom' || t === 'master')) {
        axes.directPrivacy++; cost += 35; defects.push('باب مباشر بين مجلس الضيوف وغرفة نوم؛ يُفضَّل فصل مسار الضيافة عن الجناح الخاص.');
      }
    }
  }
  axes.daylight = axes.habitable ? axes.daylight / axes.habitable : null;
  return { cost, defects, axes };
}
