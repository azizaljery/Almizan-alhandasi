// Side-by-side 3D comparison of two generated alternatives with one shared camera.
// Pure orchestration: both panes are ordinary RoomViewer instances; nothing here
// changes the model, the selected alternative, or the quantities.

/** Option labels and the pair that is shown first. Pure, so it is unit-tested. */
export function comparePlan(alternatives, current, describe) {
  const list = Array.isArray(alternatives) ? alternatives : [];
  const options = list.map((model, index) => ({ index, ...describe(model, index) }));
  if (list.length < 2) return { ready: false, options, a: null, b: null, reason: 'تحتاج المقارنة بديلين على الأقل؛ ولّد البدائل أولًا.' };
  const a = Math.max(0, list.indexOf(current)), b = list.findIndex((_, i) => i !== a);
  return { ready: true, options, a, b };
}

export function resolveSelection(alternatives, prev, plan) {
  const list = Array.isArray(alternatives) ? alternatives : [];
  const keep = model => list.indexOf(model);
  let a = prev?.a ? keep(prev.a) : -1, b = prev?.b ? keep(prev.b) : -1;
  if (a < 0) a = plan.a;
  if (b < 0 || b === a) b = list.findIndex((_, i) => i !== a);
  return { a, b };
}

export function initCompare3D({ root, ViewerClass, getAlternatives, getCurrent, getPalette, describe, ensureThree, onNotice }) {
  const q = sel => root.querySelector(sel);
  const selA = q('#compareSelectA'), selB = q('#compareSelectB'), paneA = q('#comparePaneA'), paneB = q('#comparePaneB'),
    capA = q('#compareCaptionA'), capB = q('#compareCaptionB'), note = q('#compareNote'), grid = q('#compareGrid');
  let viewers = null, picked = null, frame = 0, source = null, abort = null;

  const options = () => comparePlan(getAlternatives(), getCurrent(), describe);
  function fillSelects(plan) {
    const html = plan.options.map(o => `<option value="${o.index}">${o.title}</option>`).join('');
    selA.innerHTML = html; selB.innerHTML = html;
    selA.value = String(picked.a); selB.value = String(picked.b);
  }
  function caption(el, model, index) {
    const d = describe(model, index);
    el.textContent = `${d.title} — ${d.summary}`;
  }
  function show() {
    const list = getAlternatives();
    if (!viewers || !picked || picked.a < 0 || picked.b < 0) return;
    const a = list[picked.a], b = list[picked.b];
    if (!a || !b) return;
    viewers.a.setModel(a, getPalette()); viewers.b.setModel(b, getPalette());
    for (const v of [viewers.a, viewers.b]) { v.setRoof(true); v.setVisible(true); v.resize(); }
    viewers.b.applyOrbit(viewers.a.orbitPose()); viewers.b.render();
    caption(capA, a, picked.a); caption(capB, b, picked.b);
    root.dataset.compareA = String(picked.a); root.dataset.compareB = String(picked.b);
  }
  function syncFrom(from) {
    source = from;
    if (frame) return;
    frame = globalThis.requestAnimationFrame(() => {
      frame = 0;
      const [f, t] = source === viewers?.a ? [viewers.a, viewers.b] : [viewers?.b, viewers?.a];
      if (!f || !t) return;
      t.applyOrbit(f.orbitPose()); t.render();
    });
  }
  async function open() {
    const plan = options();
    note.textContent = plan.reason || '';
    grid.hidden = !plan.ready;
    if (!plan.ready) return;
    try { await ensureThree(); } catch (error) { note.textContent = error.message; grid.hidden = true; return; }
    if (viewers) return;
    const list = getAlternatives();
    picked = { a: plan.a, b: plan.b, ...{ } };
    picked.aModel = list[picked.a]; picked.bModel = list[picked.b];
    fillSelects(plan);
    try {
      viewers = { a: new ViewerClass(paneA, () => {}, { onState: () => {}, transitionMs: 0 }), b: new ViewerClass(paneB, () => {}, { onState: () => {}, transitionMs: 0 }) };
    } catch (error) { note.textContent = error.message; grid.hidden = true; viewers = null; return; }
    abort = new AbortController();
    for (const [pane, v] of [[paneA, 'a'], [paneB, 'b']]) {
      for (const type of ['pointermove', 'pointerup', 'wheel', 'keydown']) pane.addEventListener(type, () => syncFrom(viewers?.[v]), { signal: abort.signal, passive: true });
    }
    show();
  }
  function close() {
    abort?.abort(); abort = null;
    if (frame) { globalThis.cancelAnimationFrame?.(frame); frame = 0; }
    if (viewers) { viewers.a.destroy(); viewers.b.destroy(); viewers = null; }
    picked = null;
  }
  const choose = () => {
    const list = getAlternatives(), a = Number(selA.value), b = Number(selB.value);
    if (a === b) { note.textContent = 'اختر بديلين مختلفين.'; selB.value = String(picked.b); selA.value = String(picked.a); return; }
    note.textContent = ''; picked = { a, b, aModel: list[a], bModel: list[b] }; show();
  };
  selA.addEventListener('change', choose); selB.addEventListener('change', choose);
  root.addEventListener('toggle', () => { if (root.open) open(); else close(); });
  return {
    refresh() {
      if (!root.open) return;
      if (!viewers) { open(); return; }
      const plan = options();
      if (!plan.ready) { close(); grid.hidden = true; note.textContent = plan.reason; return; }
      const list = getAlternatives(), next = resolveSelection(list, { a: picked?.aModel, b: picked?.bModel }, plan);
      picked = { ...next, aModel: list[next.a], bModel: list[next.b] };
      fillSelects(plan); show();
    },
    destroy: close,
    get open() { return !!viewers; },
    get viewers() { return viewers; },
  };
}

export default { comparePlan, resolveSelection, initCompare3D };
