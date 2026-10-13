// DOM/SVG adapter only: authoritative model changes belong to the edit session.
import { eligibleRoomEdits, eligibleCorridors } from './geometry-editor.mjs';
import { TYPES } from './planner.mjs';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HIT = '[data-ge-wall],[data-ge-opening],[data-ge-room],[data-ge-resize],[data-ge-corridor]';
const fixed = value => Number(value).toFixed(2);
const lineLength = wall => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
const CORNER_SIDES = { tl: { x: 'left', y: 'top' }, tr: { x: 'right', y: 'top' }, bl: { x: 'left', y: 'bottom' }, br: { x: 'right', y: 'bottom' } };
const CORNER_LABELS = { tl: 'الزاوية العلوية اليسرى', tr: 'الزاوية العلوية اليمنى', bl: 'الزاوية السفلية اليسرى', br: 'الزاوية السفلية اليمنى' };
export function initGeometryEditor({ host, getSvg, getModel, getPartitions = () => [], getRoomMoves = () => [], getRoomResizes = () => [], getRoomEdits = null, getCorridors = null, getHistory = () => ({}), onPreview, onCommit, onCancel, onUndo, onRedo }) {
  if (!host || typeof getModel !== 'function' || typeof getSvg !== 'function') throw Error('Geometry editor requires a host, model and SVG.');
  host.classList.add('geometry-editor');
  host.dir = 'rtl';
  host.innerHTML = `<div class="geometry-editor-heading"><strong>تعديل الهندسة</strong><label><input data-ge="layer" type="checkbox" checked> إظهار طبقة التعديل</label></div>
    <p class="geometry-editor-help">اختر جدارًا أو فتحة أو غرفة أو ممرًا من المخطط، أو زاوية غرفة لتغيير أبعادها بالسحب. لإضافة غرفة قسّم غرفة قائمة، ولحذفها ادمجها في جارتها. السحب يعرض معاينة فقط؛ لا يتغير المخطط قبل التأكيد.</p>
    <div class="geometry-editor-fields"><label>العنصر<select data-ge="target" aria-label="عنصر التعديل"></select></label>
      <label data-ge="wall-field">إزاحة الجدار (م)<input data-ge="delta" aria-label="إزاحة الجدار بالمتر" type="number" step="0.05" value="0"></label>
      <label data-ge="opening-field">الموضع من بداية الجدار (م)<input data-ge="position" aria-label="موضع الفتحة بالمتر" type="number" min="0" step="0.05"></label>
      <label data-ge="opening-field">عرض الفتحة (م)<input data-ge="width" aria-label="عرض الفتحة بالمتر" type="number" min="0.05" step="0.05"></label>
      <label data-ge="opening-field">ارتفاع الفتحة (م)<input data-ge="height" aria-label="ارتفاع الفتحة بالمتر" type="number" min="0.05" step="0.05"></label>
      <label data-ge="room-mode-field">نوع تعديل الغرفة<select data-ge="mode" aria-label="نوع تعديل الغرفة"><option value="move">نقل الغرفة</option><option value="split">إضافة غرفة بتقسيم هذه الغرفة</option><option value="delete">حذف الغرفة ودمج مساحتها في جارة</option></select></label>
      <label data-ge="room-field">إزاحة الغرفة أفقيًا (م)<input data-ge="dx" aria-label="إزاحة الغرفة أفقيًا بالمتر" type="number" step="0.05" value="0"></label>
      <label data-ge="room-field">إزاحة الغرفة رأسيًا (م)<input data-ge="dy" aria-label="إزاحة الغرفة رأسيًا بالمتر" type="number" step="0.05" value="0"></label>
      <label data-ge="split-field">اتجاه خط التقسيم<select data-ge="axis" aria-label="اتجاه خط التقسيم"><option value="x">رأسي (يقسم العرض)</option><option value="y">أفقي (يقسم الارتفاع)</option></select></label>
      <label data-ge="split-field">موضع الخط من بداية الغرفة (م)<input data-ge="at" aria-label="موضع خط التقسيم بالمتر" type="number" min="0.05" step="0.05" value="0"></label>
      <label data-ge="split-field">نوع الغرفة الجديدة<select data-ge="newType" aria-label="نوع الغرفة الجديدة">${Object.entries(TYPES).map(([value, type]) => `<option value="${value}">${type.name}</option>`).join('')}</select></label>
      <label data-ge="split-field">اسم الغرفة الجديدة (اختياري)<input data-ge="newName" aria-label="اسم الغرفة الجديدة" type="text" maxlength="70"></label>
      <label data-ge="delete-field">تُدمج مساحتها في<select data-ge="mergeInto" aria-label="الغرفة التي تستوعب المساحة"></select></label>
      <label data-ge="resize-field">تمديد الحافة الأفقية للزاوية (م)<input data-ge="growx" aria-label="تمديد حافة الغرفة الأفقية بالمتر" type="number" step="0.05" value="0"></label>
      <label data-ge="resize-field">تمديد الحافة الرأسية للزاوية (م)<input data-ge="growy" aria-label="تمديد حافة الغرفة الرأسية بالمتر" type="number" step="0.05" value="0"></label></div>
    <div class="geometry-editor-actions"><button type="button" data-ge="preview">معاينة التعديل</button><button type="button" data-ge="confirm" disabled>تأكيد التعديل والمساحات</button><button type="button" data-ge="cancel" disabled>إلغاء المعاينة</button><button type="button" data-ge="undo">تراجع</button><button type="button" data-ge="redo">إعادة</button></div>
    <div data-ge="impact" class="geometry-editor-impact" aria-live="polite" role="status">لم تُجرَ معاينة بعد.</div>`;
  const el = name => host.querySelector(`[data-ge="${name}"]`);
  const unsupportedContext = () => (getPartitions() || []).some(info => /^(?:MODEL_|SURVEY_)/.test(info.reason || ''));
  const roomEdits = () => { const model = getModel(); if (typeof getRoomEdits === 'function') return getRoomEdits() || []; return model && !unsupportedContext() ? eligibleRoomEdits(model) : []; };
  const corridorList = () => { const model = getModel(); if (typeof getCorridors === 'function') return getCorridors() || []; return model && !unsupportedContext() ? eligibleCorridors(model) : []; };
  const editInfo = id => roomEdits().find(info => info.roomId === id);
  const moveInfo = id => (getRoomMoves() || []).find(info => info.roomId === id);
  const roomActive = id => !!(moveInfo(id)?.eligible || editInfo(id)?.eligible);
  const lifetime = new AbortController();
  let svg = null, svgEvents = null, overlay = null, selected = null, pending = null, drag = null, enabled = true, destroyed = false;
  const consumed = new Set(), touches = new Set();
  const listen = (node, name, fn, signal = lifetime.signal) => node.addEventListener(name, fn, { signal });
  function setMessage(message, error = false) { el('impact').textContent = message; el('impact').classList.toggle('error', error); }
  function actionState() {
    el('confirm').disabled = !pending || !enabled;
    el('cancel').disabled = !pending && !drag;
    el('preview').disabled = !selected || !enabled;
    const history = getHistory() || {};
    el('undo').disabled = !enabled || history.canUndo === false;
    el('redo').disabled = !enabled || history.canRedo === false;
  }
  function cancel(message = 'أُلغيت المعاينة؛ بقي المخطط كما هو.') {
    drag = null; pending = null;
    onCancel?.(); drawOverlay(); actionState(); setMessage(message);
  }
  function currentTarget() {
    const model = getModel();
    if (selected?.kind === 'wall') return model?.walls?.find(w => w.id === selected.id);
    if (selected?.kind === 'room') return model?.rooms?.find(r => r.id === selected.id);
    if (selected?.kind === 'corridor') return model?.corridors?.find(c => c.id === selected.id);
    if (selected?.kind === 'resize') return model?.rooms?.find(r => r.id === selected.id.split('|')[0]);
    return model?.openings?.find(o => o.id === selected?.id);
  }
  function roomMode() { return el('mode').value; }
  function syncRoomFields() {
    const room = selected?.kind === 'room', mode = roomMode();
    host.querySelectorAll('[data-ge="room-mode-field"]').forEach(node => { node.hidden = !room; });
    host.querySelectorAll('[data-ge="room-field"]').forEach(node => { node.hidden = !(room && mode === 'move'); });
    host.querySelectorAll('[data-ge="split-field"]').forEach(node => { node.hidden = !(room && mode === 'split'); });
    host.querySelectorAll('[data-ge="delete-field"]').forEach(node => { node.hidden = !(room && mode === 'delete'); });
    if (!room) { el('dx').disabled = false; el('dy').disabled = false; return; }
    const edits = editInfo(selected.id), moves = moveInfo(selected.id);
    for (const option of el('mode').options) option.disabled = option.value === 'move' ? !moves?.eligible : option.value === 'split' ? !(edits?.split?.x || edits?.split?.y) : !(edits?.mergeWith?.length);
    if (el('mode').selectedOptions[0]?.disabled) { const fallback = [...el('mode').options].find(option => !option.disabled); if (fallback) el('mode').value = fallback.value; }
    const current = roomMode();
    if (current === 'move') { el('dx').disabled = !moves?.axes?.x; el('dy').disabled = !moves?.axes?.y; }
    if (current === 'split') {
      for (const option of el('axis').options) option.disabled = !edits?.split?.[option.value];
      if (el('axis').selectedOptions[0]?.disabled) { const fallback = [...el('axis').options].find(option => !option.disabled); if (fallback) el('axis').value = fallback.value; }
      const room2 = getModel()?.rooms?.find(r => r.id === selected.id);
      if (room2 && Number(el('at').value) <= 0) el('at').value = fixed((el('axis').value === 'x' ? room2.w : room2.h) / 2);
    }
    if (current === 'delete') {
      const model = getModel(), previous = el('mergeInto').value;
      el('mergeInto').replaceChildren();
      for (const id of edits?.mergeWith || []) { const option = document.createElement('option'); option.value = id; option.textContent = model?.rooms?.find(r => r.id === id)?.name || id; el('mergeInto').append(option); }
      if ([...el('mergeInto').options].some(option => option.value === previous)) el('mergeInto').value = previous;
    }
  }
  function selectTarget(kind, id) {
    if (pending || drag) cancel();
    selected = { kind, id };
    el('target').value = `${kind}:${id}`;
    const model = getModel(), target = currentTarget();
    el('wall-field').hidden = kind !== 'wall';
    host.querySelectorAll('[data-ge="opening-field"]').forEach(node => { node.hidden = kind !== 'opening'; });
    host.querySelectorAll('[data-ge="resize-field"]').forEach(node => { node.hidden = kind !== 'resize'; });
    el('delta').value = '0';
    el('dx').value = '0'; el('dy').value = '0';
    el('growx').value = '0'; el('growy').value = '0'; el('at').value = '0'; el('newName').value = '';
    if (kind === 'opening' && target) {
      const wall = model.walls.find(w => w.id === target.wallId);
      el('position').value = fixed(target.pos * lineLength(wall));
      el('width').value = fixed(target.w); el('height').value = fixed(target.h);
    }
    syncRoomFields();
    if (kind === 'resize') {
      const [roomId, corner] = id.split('|'), sides = CORNER_SIDES[corner];
      const info = (getRoomResizes() || []).find(item => item.roomId === roomId);
      el('growx').disabled = !info?.edges?.[sides.x]; el('growy').disabled = !info?.edges?.[sides.y];
    } else { el('growx').disabled = false; el('growy').disabled = false; }
    actionState(); drawOverlay();
  }
  function numeric(name) {
    const input = el(name), value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value)) throw Error('أدخل قياسًا رقميًا صالحًا.');
    return value;
  }
  function operation() {
    if (!selected) throw Error('اختر عنصرًا قابلًا للتعديل أولًا.');
    if (selected.kind === 'wall') return { type: 'move-partition', wallId: selected.id, deltaM: numeric('delta') };
    if (selected.kind === 'corridor') return { type: 'delete-corridor', corridorId: selected.id };
    if (selected.kind === 'room') {
      const mode = roomMode();
      if (mode === 'split') return { type: 'split-room', roomId: selected.id, axis: el('axis').value, atM: numeric('at'), newType: el('newType').value, newName: el('newName').value };
      if (mode === 'delete') { if (!el('mergeInto').value) throw Error('اختر الغرفة المجاورة التي تستوعب المساحة.'); return { type: 'delete-room', roomId: selected.id, mergeIntoRoomId: el('mergeInto').value }; }
      return { type: 'move-room', roomId: selected.id, dxM: numeric('dx'), dyM: numeric('dy') };
    }
    if (selected.kind === 'resize') {
      const [roomId, corner] = selected.id.split('|'), sides = CORNER_SIDES[corner];
      const command = { type: 'resize-room', roomId };
      const growx = numeric('growx'), growy = numeric('growy');
      if (!el('growx').disabled) command[sides.x === 'right' ? 'growRightM' : 'growLeftM'] = growx;
      if (!el('growy').disabled) command[sides.y === 'top' ? 'growTopM' : 'growBottomM'] = growy;
      return command;
    }
    const model=getModel(), opening=currentTarget(), wall=model.walls.find(w=>w.id===opening.wallId);
    if(!opening||!wall)throw Error('تعذّر ربط الفتحة المحددة بجدارها.');
    const command={type:'edit-opening',openingId:selected.id};
    const original={positionM:opening.pos*lineLength(wall),widthM:opening.w,heightM:opening.h};
    for(const [field,key]of [['position','positionM'],['width','widthM'],['height','heightM']]){
      const value=numeric(field);
      // Initial form values are rounded for display. Keep untouched geometry exact;
      // submit only fields the user actually changed by at least one supported step.
      if(Math.abs(value-original[key])>=.025)command[key]=value;
    }
    return command;
  }
  function preview(command) {
    if (!enabled) return;
    try {
      const result = onPreview(command ?? operation());
      if (!result || result.pass === false || result.valid === false) throw Error(result?.errors?.join('؛ ') || 'تعذّر اعتماد هذه المعاينة.');
      pending = result;
      const rooms = result.impact?.rooms || [];
      const model = getModel();
      const nameOf = id => model.rooms?.find(room => room.id === id)?.name || result.model?.rooms?.find(room => room.id === id)?.name || id;
      const changes = rooms.map(change => change.beforeArea ? `${nameOf(change.id)}: ${fixed(change.beforeArea)} ← ${fixed(change.afterArea)} م²` : `غرفة جديدة «${nameOf(change.id)}»: ${fixed(change.afterArea)} م²`);
      if (result.impact?.removedRoomId) changes.push(`ستُحذف الغرفة «${nameOf(result.impact.removedRoomId)}» (${fixed(result.impact.removedRoomArea)} م²) وتُدمج مساحتها في «${nameOf(result.command?.mergeIntoRoomId)}».`);
      if (result.impact?.corridorId) changes.push(`سيُحذف الممر ${result.impact.corridorId} (${fixed(result.impact.corridorArea)} م²) وأبوابه، ويبقى مكانه فراغًا غير مسمّى.`);
      setMessage(['معاينة غير محفوظة. راجع التغيير ثم أكد.', ...changes, result.impact?.alternativesNote, result.impact?.requiresConfirmation ? 'تأكيدك يعتمد المساحات الجديدة في البرنامج.' : ''].filter(Boolean).join('\n'));
    } catch (error) {
      pending = null; onCancel?.(); setMessage(error.message || String(error), true);
    }
    actionState(); drawOverlay();
  }
  function element(tag, attrs, parent = overlay) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node); return node;
  }
  function drawOverlay() {
    overlay?.remove(); overlay = null;
    if (!svg || !el('layer').checked || !enabled) return;
    const model = getModel(); if (!model) return;
    overlay = element('g', { 'data-geometry-editor-overlay': '', class: 'geometry-editor-overlay' }, svg);
    const partitions = getPartitions() || [];
    const unsupported = partitions.some(info => /^(?:MODEL_|SURVEY_)/.test(info.reason || ''));
    if (unsupported) return;
    for (const info of partitions.filter(item => item.eligible)) {
      const wall = model.walls.find(w => w.id === info.wallId); if (!wall) continue;
      const active = selected?.kind === 'wall' && selected.id === wall.id;
      const hit = element('line', { x1: wall.x1, y1: -wall.y1, x2: wall.x2, y2: -wall.y2, stroke: active ? '#c36b25' : '#208a79', 'stroke-width': 44, 'stroke-opacity': '.13', 'vector-effect': 'non-scaling-stroke', 'data-ge-wall': wall.id, tabindex: 0, role: 'button', 'aria-label': `تعديل الجدار ${wall.id}` });
      element('title', {}, hit).textContent = `جدار قابل للتحريك ${wall.id}`;
      element('line', { x1: wall.x1, y1: -wall.y1, x2: wall.x2, y2: -wall.y2, stroke: active ? '#c36b25' : '#208a79', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
    }
    for (const opening of model.openings || []) {
      const wall = model.walls.find(w => w.id === opening.wallId); if (!wall) continue;
      const x = wall.x1 + (wall.x2 - wall.x1) * opening.pos, y = wall.y1 + (wall.y2 - wall.y1) * opening.pos;
      const point = element('line', { x1: x - .001, y1: -y, x2: x + .001, y2: -y, stroke: selected?.id === opening.id ? '#c36b25' : '#277cbb', 'stroke-opacity': '.35', 'stroke-width': 44, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'data-ge-opening': opening.id, tabindex: 0, role: 'button', 'aria-label': `تعديل ${opening.type === 'door' ? 'الباب' : 'النافذة'} ${opening.id}` });
      element('title', {}, point).textContent = `${opening.type === 'door' ? 'باب' : 'نافذة'} ${opening.id}`;
    }
    for (const room of model.rooms || []) {
      if (!roomActive(room.id)) continue;
      const active = selected?.kind === 'room' && selected.id === room.id;
      const hit = element('rect', { x: room.x, y: -room.y - room.h, width: room.w, height: room.h, fill: 'none', stroke: active ? '#c36b25' : '#6a4fab', 'stroke-width': 26, 'stroke-opacity': '.14', 'pointer-events': 'stroke', 'vector-effect': 'non-scaling-stroke', 'data-ge-room': room.id, tabindex: 0, role: 'button', 'aria-label': `تعديل غرفة ${room.name || room.id}` });
      element('title', {}, hit).textContent = `غرفة قابلة للتعديل ${room.name || room.id}`;
      element('rect', { x: room.x, y: -room.y - room.h, width: room.w, height: room.h, fill: 'none', stroke: active ? '#c36b25' : '#6a4fab', 'stroke-width': 3, 'stroke-dasharray': active ? '0' : '2 3', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
    }
    for (const info of corridorList().filter(item => item.eligible)) {
      const corridor = model.corridors.find(c => c.id === info.corridorId); if (!corridor) continue;
      const active = selected?.kind === 'corridor' && selected.id === corridor.id;
      const hit = element('rect', { x: corridor.x, y: -corridor.y - corridor.h, width: corridor.w, height: corridor.h, fill: 'none', stroke: active ? '#c36b25' : '#b0894a', 'stroke-width': 22, 'stroke-opacity': '.14', 'pointer-events': 'stroke', 'vector-effect': 'non-scaling-stroke', 'data-ge-corridor': corridor.id, tabindex: 0, role: 'button', 'aria-label': `تعديل الممر ${corridor.id}` });
      element('title', {}, hit).textContent = `ممر قابل للحذف إن لم تعتمد عليه غرفة ${corridor.id}`;
    }
    for (const info of (getRoomResizes() || []).filter(item => item.eligible)) {
      const room = model.rooms.find(r => r.id === info.roomId); if (!room) continue;
      for (const corner of ['tl', 'tr', 'bl', 'br']) {
        const sides = CORNER_SIDES[corner];
        if (!info.edges?.[sides.x] && !info.edges?.[sides.y]) continue;
        const cx = sides.x === 'right' ? room.x + room.w : room.x;
        const cy = sides.y === 'top' ? room.y + room.h : room.y;
        const id = `${room.id}|${corner}`;
        const active = selected?.kind === 'resize' && selected.id === id;
        const color = active ? '#c36b25' : '#1f7a4d';
        const hit = element('line', { x1: cx - .001, y1: -cy, x2: cx + .001, y2: -cy, stroke: color, 'stroke-opacity': '.35', 'stroke-width': 40, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'data-ge-resize': id, tabindex: 0, role: 'button', 'aria-label': `تغيير أبعاد غرفة ${room.name || room.id} من ${CORNER_LABELS[corner]}` });
        element('title', {}, hit).textContent = `زاوية قابلة للسحب لتغيير أبعاد ${room.name || room.id}`;
        element('line', { x1: cx - .001, y1: -cy, x2: cx + .001, y2: -cy, stroke: color, 'stroke-width': 12, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
      }
    }
    if (pending?.model) {
      const ghost = element('g', { 'pointer-events': 'none', 'data-ge-preview': '' });
      for (const id of pending.impact?.wallIds || []) {
        const wall = pending.model.walls.find(w => w.id === id); if (!wall) continue;
        element('line', { x1: wall.x1, y1: -wall.y1, x2: wall.x2, y2: -wall.y2, stroke: '#c63a58', 'stroke-dasharray': '8 5', 'stroke-width': 4, 'vector-effect': 'non-scaling-stroke' }, ghost);
      }
      for (const id of pending.impact?.openingIds || []) {
        const opening = pending.model.openings.find(o => o.id === id); if (!opening) continue;
        const wall = pending.model.walls.find(w => w.id === opening.wallId); if (!wall) continue;
        const length = lineLength(wall), center = opening.pos * length;
        const at = distance => ({ x: wall.x1 + (wall.x2 - wall.x1) * distance / length, y: wall.y1 + (wall.y2 - wall.y1) * distance / length });
        const a = at(center - opening.w / 2), b = at(center + opening.w / 2);
        element('line', { x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, stroke: '#c63a58', 'stroke-width': 7, 'vector-effect': 'non-scaling-stroke' }, ghost);
      }
      for (const change of pending.impact?.rooms || []) {
        const room = pending.model.rooms.find(r => r.id === change.id); if (!room) continue;
        element('rect', { x: room.x, y: -room.y - room.h, width: room.w, height: room.h, fill: 'none', stroke: '#c63a58', 'stroke-dasharray': '8 5', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }, ghost);
      }
    }
  }
  function coordinates(event) {
    const matrix = svg?.getScreenCTM(); if (!matrix) throw Error('تعذّر قراءة موضع المؤشر.');
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const converted = point.matrixTransform(matrix.inverse()); return { x: converted.x, y: -converted.y };
  }
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function parseHit(hit) {
    if (hit.hasAttribute('data-ge-wall')) return { kind: 'wall', id: hit.getAttribute('data-ge-wall') };
    if (hit.hasAttribute('data-ge-opening')) return { kind: 'opening', id: hit.getAttribute('data-ge-opening') };
    if (hit.hasAttribute('data-ge-resize')) return { kind: 'resize', id: hit.getAttribute('data-ge-resize') };
    if (hit.hasAttribute('data-ge-corridor')) return { kind: 'corridor', id: hit.getAttribute('data-ge-corridor') };
    return { kind: 'room', id: hit.getAttribute('data-ge-room') };
  }
  function pointerDown(event) {
    if (!enabled || !host.getClientRects().length || event.button !== 0 || !el('layer').checked) return;
    const hit = event.target.closest(HIT); if (!hit) return;
    stop(event);
    const { kind, id } = parseHit(hit);
    selectTarget(kind, id);
    const target = currentTarget();
    const wall = kind === 'wall' ? target : kind === 'opening' ? getModel().walls.find(w => w.id === target.wallId) : null;
    const axes = kind === 'room' ? (roomMode() === 'move' ? moveInfo(id)?.axes || { x: false, y: false } : { x: false, y: false }) : null;
    let resizeAxes = null, corner = null;
    if (kind === 'resize') {
      const [roomId, c] = id.split('|'); corner = c; const sides = CORNER_SIDES[corner];
      const info = (getRoomResizes() || []).find(item => item.roomId === roomId);
      resizeAxes = { x: !!info?.edges?.[sides.x], y: !!info?.edges?.[sides.y] };
    }
    const matrix = svg.getScreenCTM();
    // Deltas come from client pixels and the scale at pointer-down, so a layout shift while dragging (e.g. the impact text growing) cannot corrupt them.
    drag = { pointerId: event.pointerId, kind, wall, axes, corner, resizeAxes, origin: coordinates(event), client: { x: event.clientX, y: event.clientY }, scale: { x: matrix.a, y: matrix.d }, startPosition: kind === 'opening' ? target.pos * lineLength(wall) : 0, moved: false };
    consumed.add(event.pointerId); svg.setPointerCapture?.(event.pointerId); actionState();
  }
  function pointerMove(event) {
    if (!consumed.has(event.pointerId)) return;
    stop(event);
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.client.x) / drag.scale.x, dy = -(event.clientY - drag.client.y) / drag.scale.y;
    if (Math.hypot(dx, dy) < .025 && !drag.moved) return;
    drag.moved = true;
    if (drag.kind === 'wall') el('delta').value = fixed(Math.abs(drag.wall.x2 - drag.wall.x1) < 1e-5 ? dx : dy);
    else if (drag.kind === 'corridor') return;
    else if (drag.kind === 'room') { if (roomMode() !== 'move') return; el('dx').value = fixed(drag.axes?.x ? dx : 0); el('dy').value = fixed(drag.axes?.y ? dy : 0); }
    else if (drag.kind === 'resize') {
      const sides = CORNER_SIDES[drag.corner];
      const growx = sides.x === 'right' ? dx : -dx, growy = sides.y === 'top' ? dy : -dy;
      el('growx').value = fixed(drag.resizeAxes?.x ? growx : 0); el('growy').value = fixed(drag.resizeAxes?.y ? growy : 0);
    } else {
      const length = lineLength(drag.wall);
      el('position').value = fixed(drag.startPosition + (dx * (drag.wall.x2 - drag.wall.x1) + dy * (drag.wall.y2 - drag.wall.y1)) / length);
    }
    preview();
  }
  function pointerFinish(event) {
    touches.delete(event.pointerId);
    if (!consumed.has(event.pointerId)) return;
    stop(event); consumed.delete(event.pointerId);
    if (event.type === 'pointercancel' && drag?.pointerId === event.pointerId) cancel('أُلغي السحب؛ لم يتغير المخطط.');
    else if (drag?.pointerId === event.pointerId) { drag = null; actionState(); }
    if (svg?.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }
  // A second touch cancels the edit before the existing viewport can pan/zoom.
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') touches.add(event.pointerId);
    if ((drag && event.pointerId !== drag.pointerId) || (touches.size > 1 && event.target.closest?.(HIT))) {
      consumed.add(event.pointerId); stop(event); cancel('أُلغيت المعاينة عند اللمس الثاني؛ لم يتغير المخطط.');
    }
  }, { capture: true, signal: lifetime.signal });
  window.addEventListener('pointermove', pointerMove, { capture: true, signal: lifetime.signal });
  window.addEventListener('pointerup', pointerFinish, { capture: true, signal: lifetime.signal });
  window.addEventListener('pointercancel', pointerFinish, { capture: true, signal: lifetime.signal });
  function connectSvg() {
    const next = getSvg(); if (next === svg) return;
    svgEvents?.abort(); overlay?.remove(); svg = next; svgEvents = new AbortController();
    if (!svg) return;
    svg.addEventListener('wheel', () => { if (drag || pending) cancel('أُلغيت المعاينة عند تغيير التكبير؛ أعد تحديد القياس.'); }, { capture: true, signal: svgEvents.signal });
    svg.addEventListener('pointerdown', pointerDown, { capture: true, signal: svgEvents.signal });
    svg.addEventListener('keydown', event => {
      const hit = event.target.closest(HIT);
      if (hit && ['Enter', ' '].includes(event.key)) {
        stop(event);
        const { kind, id } = parseHit(hit);
        selectTarget(kind, id);
      }
    }, { capture: true, signal: svgEvents.signal });
  }
  function refresh() {
    if (destroyed) return;
    connectSvg();
    const model = getModel(), options = el('target'); options.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'اختر جدارًا أو فتحة أو غرفة'; options.append(placeholder);
    for (const info of getPartitions() || []) {
      const option = document.createElement('option'); option.value = `wall:${info.wallId}`; option.disabled = !info.eligible;
      option.textContent = `جدار ${info.wallId}${info.eligible ? '' : ` — ${info.reason || 'غير قابل للتحريك'}`}`; options.append(option);
    }
    for (const room of model?.rooms || []) {
      const option = document.createElement('option'); option.value = `room:${room.id}`;
      const active = roomActive(room.id); option.disabled = !active;
      option.textContent = `غرفة ${room.name || room.id}${active ? '' : ` — ${editInfo(room.id)?.reason || moveInfo(room.id)?.reason || 'غير قابلة للتعديل'}`}`; options.append(option);
    }
    for (const info of corridorList()) {
      const option = document.createElement('option'); option.value = `corridor:${info.corridorId}`; option.disabled = !info.eligible;
      option.textContent = `ممر ${info.corridorId}${info.eligible ? ' (حذف)' : ` — ${info.reason || 'غير قابل للحذف'}`}`; options.append(option);
    }
    for (const info of getRoomResizes() || []) {
      const name = model?.rooms?.find(r => r.id === info.roomId)?.name || info.roomId;
      if (!info.eligible) {
        const option = document.createElement('option'); option.value = `resize:${info.roomId}|tl`; option.disabled = true;
        option.textContent = `تغيير أبعاد غرفة ${name} — ${info.reason || 'غير قابلة لتغيير الأبعاد'}`; options.append(option);
        continue;
      }
      for (const corner of ['tl', 'tr', 'bl', 'br']) {
        const sides = CORNER_SIDES[corner];
        if (!info.edges?.[sides.x] && !info.edges?.[sides.y]) continue;
        const option = document.createElement('option'); option.value = `resize:${info.roomId}|${corner}`;
        option.textContent = `تغيير أبعاد غرفة ${name} (${CORNER_LABELS[corner]})`; options.append(option);
      }
    }
    const unsupportedReason = (getPartitions() || []).find(info => /^(?:MODEL_|SURVEY_)/.test(info.reason || ''))?.reason;
    for (const opening of model?.openings || []) {
      const option = document.createElement('option'); option.value = `opening:${opening.id}`; option.textContent = `${opening.type === 'door' ? 'باب' : 'نافذة'} ${opening.id}${unsupportedReason ? ' — ' + unsupportedReason : ''}`; option.disabled = !!unsupportedReason; options.append(option);
    }
    const previous = selected && `${selected.kind}:${selected.id}`;
    if (previous && [...options.options].some(option => option.value === previous && !option.disabled)) { options.value = previous; selectTarget(selected.kind, selected.id); }
    else selected = null;
    actionState(); drawOverlay();
  }
  listen(el('target'), 'change', () => { const split = el('target').value.indexOf(':'); if (split >= 0) selectTarget(el('target').value.slice(0, split), el('target').value.slice(split + 1)); else { cancel(); selected = null; actionState(); } });
  for (const name of ['delta', 'position', 'width', 'height', 'dx', 'dy', 'growx', 'growy', 'at', 'newName']) listen(el(name), 'input', () => { if (pending) cancel('تغيرت القياسات؛ أعد المعاينة قبل التأكيد.'); });
  for (const name of ['mode', 'axis', 'newType', 'mergeInto']) listen(el(name), 'change', () => { if (pending || drag) cancel('تغيّر نوع التعديل؛ أعد المعاينة قبل التأكيد.'); if (name === 'mode' || name === 'axis') el('at').value = '0'; syncRoomFields(); actionState(); });
  listen(el('preview'), 'click', () => { try { preview(); } catch (error) { setMessage(error.message, true); } });
  listen(el('confirm'), 'click', () => {
    if (!pending) return;
    try { onCommit?.(); pending = null; drag = null; refresh(); setMessage('اعتُمد التعديل. يمكنك التراجع عنه.'); } catch (error) { cancel(); setMessage(error.message, true); }
  });
  listen(el('cancel'), 'click', () => cancel());
  listen(el('layer'), 'change', drawOverlay);
  for (const [name, callback] of [['undo', onUndo], ['redo', onRedo]]) listen(el(name), 'click', () => {
    try { cancel(); callback?.(); refresh(); setMessage(name === 'undo' ? 'تم التراجع.' : 'أُعيد التعديل.'); } catch (error) { setMessage(error.message, true); }
  });
  listen(host, 'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } });
  refresh();
  return { refresh, cancel, setEnabled(value) { enabled = !!value; if (!enabled) cancel(); refresh(); }, destroy() { destroyed = true; lifetime.abort(); svgEvents?.abort(); overlay?.remove(); onCancel?.(); host.replaceChildren(); } };
}
