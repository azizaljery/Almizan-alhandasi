// DOM/SVG adapter only: authoritative model changes belong to the edit session.
const SVG_NS = 'http://www.w3.org/2000/svg';
const fixed = value => Number(value).toFixed(2);
const lineLength = wall => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
export function initGeometryEditor({ host, getSvg, getModel, getPartitions = () => [], getHistory = () => ({}), onPreview, onCommit, onCancel, onUndo, onRedo }) {
  if (!host || typeof getModel !== 'function' || typeof getSvg !== 'function') throw Error('Geometry editor requires a host, model and SVG.');
  host.classList.add('geometry-editor');
  host.dir = 'rtl';
  host.innerHTML = `<div class="geometry-editor-heading"><strong>تعديل الهندسة</strong><label><input data-ge="layer" type="checkbox" checked> إظهار طبقة التعديل</label></div>
    <p class="geometry-editor-help">اختر جدارًا أو فتحة من المخطط. السحب يعرض معاينة فقط؛ لا يتغير المخطط قبل التأكيد.</p>
    <div class="geometry-editor-fields"><label>العنصر<select data-ge="target" aria-label="عنصر التعديل"></select></label>
      <label data-ge="wall-field">إزاحة الجدار (م)<input data-ge="delta" aria-label="إزاحة الجدار بالمتر" type="number" step="0.05" value="0"></label>
      <label data-ge="opening-field">الموضع من بداية الجدار (م)<input data-ge="position" aria-label="موضع الفتحة بالمتر" type="number" min="0" step="0.05"></label>
      <label data-ge="opening-field">عرض الفتحة (م)<input data-ge="width" aria-label="عرض الفتحة بالمتر" type="number" min="0.05" step="0.05"></label>
      <label data-ge="opening-field">ارتفاع الفتحة (م)<input data-ge="height" aria-label="ارتفاع الفتحة بالمتر" type="number" min="0.05" step="0.05"></label></div>
    <div class="geometry-editor-actions"><button type="button" data-ge="preview">معاينة التعديل</button><button type="button" data-ge="confirm" disabled>تأكيد التعديل والمساحات</button><button type="button" data-ge="cancel" disabled>إلغاء المعاينة</button><button type="button" data-ge="undo">تراجع</button><button type="button" data-ge="redo">إعادة</button></div>
    <div data-ge="impact" class="geometry-editor-impact" aria-live="polite" role="status">لم تُجرَ معاينة بعد.</div>`;
  const el = name => host.querySelector(`[data-ge="${name}"]`);
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
    return selected?.kind === 'wall' ? model?.walls?.find(w => w.id === selected.id) : model?.openings?.find(o => o.id === selected?.id);
  }
  function selectTarget(kind, id) {
    if (pending || drag) cancel();
    selected = { kind, id };
    el('target').value = `${kind}:${id}`;
    const model = getModel(), target = currentTarget();
    el('wall-field').hidden = kind !== 'wall';
    host.querySelectorAll('[data-ge="opening-field"]').forEach(node => { node.hidden = kind !== 'opening'; });
    el('delta').value = '0';
    if (kind === 'opening' && target) {
      const wall = model.walls.find(w => w.id === target.wallId);
      el('position').value = fixed(target.pos * lineLength(wall));
      el('width').value = fixed(target.w); el('height').value = fixed(target.h);
    }
    actionState(); drawOverlay();
  }
  function numeric(name) {
    const input = el(name), value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value)) throw Error('أدخل قياسًا رقميًا صالحًا.');
    return value;
  }
  function operation() {
    if (!selected) throw Error('اختر عنصرًا قابلًا للتعديل أولًا.');
    return selected.kind === 'wall'
      ? { type: 'move-partition', wallId: selected.id, deltaM: numeric('delta') }
      : { type: 'edit-opening', openingId: selected.id, positionM: numeric('position'), widthM: numeric('width'), heightM: numeric('height') };
  }
  function preview(command) {
    if (!enabled) return;
    try {
      const result = onPreview(command ?? operation());
      if (!result || result.pass === false || result.valid === false) throw Error(result?.errors?.join('؛ ') || 'تعذّر اعتماد هذه المعاينة.');
      pending = result;
      const rooms = result.impact?.rooms || [];
      const model = getModel();
      const changes = rooms.map(change => `${model.rooms?.find(room => room.id === change.id)?.name || change.id}: ${fixed(change.beforeArea)} ← ${fixed(change.afterArea)} م²`);
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
    }
  }
  function coordinates(event) {
    const matrix = svg?.getScreenCTM(); if (!matrix) throw Error('تعذّر قراءة موضع المؤشر.');
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const converted = point.matrixTransform(matrix.inverse()); return { x: converted.x, y: -converted.y };
  }
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function pointerDown(event) {
    if (!enabled || !host.getClientRects().length || event.button !== 0 || !el('layer').checked) return;
    const hit = event.target.closest('[data-ge-wall],[data-ge-opening]'); if (!hit) return;
    stop(event);
    const kind = hit.hasAttribute('data-ge-wall') ? 'wall' : 'opening';
    const id = hit.getAttribute(kind === 'wall' ? 'data-ge-wall' : 'data-ge-opening');
    selectTarget(kind, id);
    const target = currentTarget();
    const wall = kind === 'wall' ? target : getModel().walls.find(w => w.id === target.wallId);
    drag = { pointerId: event.pointerId, kind, wall, origin: coordinates(event), startPosition: kind === 'opening' ? target.pos * lineLength(wall) : 0, moved: false };
    consumed.add(event.pointerId); svg.setPointerCapture?.(event.pointerId); actionState();
  }
  function pointerMove(event) {
    if (!consumed.has(event.pointerId)) return;
    stop(event);
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = coordinates(event), dx = point.x - drag.origin.x, dy = point.y - drag.origin.y;
    if (Math.hypot(dx, dy) < .025 && !drag.moved) return;
    drag.moved = true;
    if (drag.kind === 'wall') el('delta').value = fixed(Math.abs(drag.wall.x2 - drag.wall.x1) < 1e-5 ? dx : dy);
    else {
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
    if ((drag && event.pointerId !== drag.pointerId) || (touches.size > 1 && event.target.closest?.('[data-ge-wall],[data-ge-opening]'))) {
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
      const hit = event.target.closest('[data-ge-wall],[data-ge-opening]');
      if (hit && ['Enter', ' '].includes(event.key)) { stop(event); selectTarget(hit.hasAttribute('data-ge-wall') ? 'wall' : 'opening', hit.getAttribute('data-ge-wall') || hit.getAttribute('data-ge-opening')); }
    }, { capture: true, signal: svgEvents.signal });
  }
  function refresh() {
    if (destroyed) return;
    connectSvg();
    const model = getModel(), options = el('target'); options.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'اختر جدارًا أو فتحة'; options.append(placeholder);
    for (const info of getPartitions() || []) {
      const option = document.createElement('option'); option.value = `wall:${info.wallId}`; option.disabled = !info.eligible;
      option.textContent = `جدار ${info.wallId}${info.eligible ? '' : ` — ${info.reason || 'غير قابل للتحريك'}`}`; options.append(option);
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
  for (const name of ['delta', 'position', 'width', 'height']) listen(el(name), 'input', () => { if (pending) cancel('تغيرت القياسات؛ أعد المعاينة قبل التأكيد.'); });
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
