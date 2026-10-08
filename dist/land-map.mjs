import {
  DEFAULT_MAP_VIEW, analyzeSurveyGeometry, geoJSONFromVertices, validateLandSurvey, verticesFromGeoJSON,
} from './land-survey.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TILE_SIZE = 256;
const MAX_MERCATOR_LAT = 85.05112878;
const $ = (root, id) => root.querySelector('#' + id);
const clone = value => value ? structuredClone(value) : null;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wrapLongitude = value => ((value + 180) % 360 + 360) % 360 - 180;
const project = (lat, lon, zoom) => {
  const size = TILE_SIZE * 2 ** zoom, clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const sin = Math.sin(clamped * Math.PI / 180);
  return { x: (lon + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
};
const unproject = (x, y, zoom) => {
  const size = TILE_SIZE * 2 ** zoom;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI, wrapLongitude(x / size * 360 - 180)];
};

export function initLandSurveyEditor({ root = document, getSurvey, onApply }) {
  const editor = $(root, 'landSurveyEditor'), map = $(root, 'parcelMap'), tiles = $(root, 'surveyTiles'), overlay = $(root, 'surveyOverlay');
  let active = false, draft = null, original = null, vertices = [], references = [], view = { ...DEFAULT_MAP_VIEW, center: [...DEFAULT_MAP_VIEW.center] };
  let addMode = false, pointer = null, tileErrors = 0, tileCount = 0, consentNeeded = false;
  const status = text => { $(root, 'surveyMapStatus').textContent = text; };
  const analysis = () => {
    try { return vertices.length >= 3 ? analyzeSurveyGeometry(geoJSONFromVertices(vertices), references) : null; }
    catch { return null; }
  };
  const geoPointAt = (clientX, clientY) => {
    const rect = map.getBoundingClientRect(), center = project(view.center[0], view.center[1], view.zoom);
    return unproject(center.x + clientX - rect.left - rect.width / 2, center.y + clientY - rect.top - rect.height / 2, view.zoom);
  };
  const screenPoint = ([lon, lat]) => {
    const rect = map.getBoundingClientRect(), center = project(view.center[0], view.center[1], view.zoom), point = project(lat, lon, view.zoom);
    return [point.x - center.x + rect.width / 2, point.y - center.y + rect.height / 2];
  };
  const renderTiles = () => {
    if (!active) return;
    const { width, height } = map.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    tiles.replaceChildren(); tileErrors = 0; tileCount = 0;
    map.classList.toggle('local-map', view.provider === 'local');
    if (view.provider === 'osm') {
      const center = project(view.center[0], view.center[1], view.zoom);
      const startX = Math.floor((center.x - width / 2) / TILE_SIZE), endX = Math.floor((center.x + width / 2) / TILE_SIZE);
      const startY = Math.max(0, Math.floor((center.y - height / 2) / TILE_SIZE)), endY = Math.min(2 ** view.zoom - 1, Math.floor((center.y + height / 2) / TILE_SIZE));
      for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
        const image = document.createElement('img'), tileX = (x % 2 ** view.zoom + 2 ** view.zoom) % 2 ** view.zoom;
        image.alt = ''; image.draggable = false; image.className = 'survey-tile'; image.width = TILE_SIZE; image.height = TILE_SIZE;
        image.style.left = `${x * TILE_SIZE - center.x + width / 2}px`; image.style.top = `${y * TILE_SIZE - center.y + height / 2}px`;
        image.addEventListener('load', () => { if (++tileCount === tiles.childElementCount && tileErrors === 0) status('الخريطة متاحة. يرسل OSM مربعات العرض المفتوحة فقط؛ لا تُرسل إليه زوايا الحدود ولا ملف المشروع.'); }, { once: true });
        image.addEventListener('error', () => { tileErrors++; image.remove(); status('تعذّر تحميل بعض بلاطات الخريطة. يمكنك متابعة تحرير الإحداثيات والرسم على الخلفية المحلية.'); }, { once: true });
        image.src = `https://tile.openstreetmap.org/${view.zoom}/${tileX}/${y}.png`;
        tiles.append(image);
      }
      if (!tiles.childElementCount) status('تعذّر عرض البلاطات عند هذا النطاق؛ الإحداثيات والتحرير ما زالا متاحين.');
    } else {
      status(consentNeeded ? 'فعّل إقرار مشاركة منطقة العرض قبل طلب بلاطات OSM.' : 'الخلفية محلية؛ لا تُرسل منطقة العرض أو الحدود إلى مزوّد خرائط.');
    }
    renderOverlay();
  };
  const renderOverlay = () => {
    if (!active) return;
    const { width, height } = map.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
    overlay.replaceChildren();
    const points = vertices.map(screenPoint);
    if (points.length > 1) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') + (points.length >= 3 ? ' Z' : ''));
      path.setAttribute('class', points.length >= 3 ? 'survey-line survey-filled' : 'survey-line'); overlay.append(path);
    }
    points.forEach(([x, y], index) => {
      const group = document.createElementNS(SVG_NS, 'g'); group.setAttribute('class', 'survey-point'); group.setAttribute('data-vertex-index', String(index)); group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.setAttribute('aria-label', `الزاوية ${index + 1}؛ اسحب لتصحيحها`);
      const circle = document.createElementNS(SVG_NS, 'circle'); circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y)); circle.setAttribute('r', '9'); circle.setAttribute('class', 'survey-vertex');
      const label = document.createElementNS(SVG_NS, 'text'); label.setAttribute('x', String(x)); label.setAttribute('y', String(y - 14)); label.setAttribute('class', 'survey-point-label'); label.textContent = String(index + 1);
      group.append(circle, label); overlay.append(group);
    });
  };
  const invalidateLink = () => {
    if (!draft) return;
    const changed = !original || !equal(vertices, verticesFromGeoJSON(original.geometry)) || !equal(references, original.references);
    if (changed && draft.engineLink === 'survey-rectangle') { draft.engineLink = 'unlinked'; draft.binding = null; }
  };
  const renderReadouts = () => {
    const table = $(root, 'surveyCorners'), report = analysis();
    vertices.forEach((_, index) => {
      const next = report?.edges[index], readout = table.querySelector(`[data-readout="${index}"]`);
      if (!readout) return;
      if (next) {
        const difference = next.referenceLengthM === null ? '' : ` · فرق المرجع ${next.differenceM > 0 ? '+' : ''}${next.differenceM.toFixed(2)} م${next.referenceConflict ? ' — تعارض يحتاج مراجعة' : ''}`;
        readout.textContent = `الضلع إلى الزاوية ${(index + 1) % vertices.length + 1}: ${next.lengthM.toFixed(2)} م · ${next.bearingDeg.toFixed(1)}° من الشمال الحقيقي، باتجاه عقارب الساعة (${next.direction})${difference}`;
        readout.classList.toggle('survey-conflict', next.referenceConflict);
      } else readout.textContent = vertices.length < 3 ? 'تظهر بيانات الضلع بعد إضافة ثلاث زوايا.' : 'صحّح الزوايا لإظهار القياس.';
    });
    const summary = $(root, 'surveyMeasurementSummary');
    if (!vertices.length) summary.textContent = 'لا توجد زوايا محفوظة. أضف زوايا بالخريطة أو أدخل الإحداثيات يدويًا.';
    else if (!report) summary.textContent = `${vertices.length} زاوية — يحتاج المضلع إلى ثلاث زوايا صالحة على الأقل.`;
    else summary.textContent = `${vertices.length} أضلاع · مساحة تقديرية ${report.areaM2.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} م² · محيط مقدّر ${report.perimeterM.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} م. الإحداثيات المرسومة تقديرية.`;
    $(root, 'surveyApply').disabled = vertices.length > 0 && !report;
    $(root, 'surveyAreaBadge').textContent = report ? `${report.areaM2.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} م²` : '—';
    renderOverlay();
  };
  const renderCorners = () => {
    const table = $(root, 'surveyCorners'); table.replaceChildren();
    vertices.forEach((point, index) => {
      const row = document.createElement('div'); row.className = 'survey-corner-row'; row.dataset.edge = String(index);
      row.innerHTML = `<div class="survey-corner-title"><b>الزاوية ${index + 1}</b><button class="small-button survey-remove" type="button" data-remove="${index}" aria-label="حذف الزاوية ${index + 1}">حذف</button></div>
        <label>خط العرض<input class="survey-coordinate" data-coordinate="lat" data-point="${index}" type="number" min="-90" max="90" step="0.0000001" aria-label="خط عرض الزاوية ${index + 1}"></label>
        <label>خط الطول<input class="survey-coordinate" data-coordinate="lon" data-point="${index}" type="number" min="-180" max="180" step="0.0000001" aria-label="خط طول الزاوية ${index + 1}"></label>
        <div class="survey-edge-readout" data-readout="${index}"></div>
        ${vertices.length >= 3 ? `<label>طول مرجعي يدويًا (م)<input class="survey-reference" data-reference="${index}" type="number" min="0.01" max="100000" step="0.01" aria-label="الطول المرجعي المدخل للضلع من الزاوية ${index + 1}"></label>` : ''}`;
      row.querySelector('[data-coordinate="lat"]').value = point[1]; row.querySelector('[data-coordinate="lon"]').value = point[0];
      const referenceInput = row.querySelector('[data-reference]'); if (referenceInput) referenceInput.value = references[index] ?? '';
      table.append(row);
    });
    renderReadouts();
  };
  const changedGeometry = () => { invalidateLink(); renderCorners(); };
  const close = () => {
    active = false; editor.hidden = true; draft = null; original = null; vertices = []; references = []; addMode = false;
    $(root, 'surveyAddCorner').setAttribute('aria-pressed', 'false'); $(root, 'surveyAddCorner').textContent = '＋ أضف زاوية من الخريطة'; map.dataset.adding = 'false';
  };
  const open = () => {
    original = validateLandSurvey(getSurvey()); draft = clone(original) || { version: 1, geometry: null, references: [], engineLink: 'unlinked', binding: null, mapView: { ...DEFAULT_MAP_VIEW, center: [...DEFAULT_MAP_VIEW.center] } };
    vertices = original ? verticesFromGeoJSON(original.geometry).map(point => [...point]) : [];
    references = original ? [...original.references] : [];
    view = { center: [...(original?.mapView.center || DEFAULT_MAP_VIEW.center)], zoom: original?.mapView.zoom || DEFAULT_MAP_VIEW.zoom, provider: 'local' };
    $(root, 'surveyMapProvider').value = 'local'; $(root, 'surveyOsmConsent').checked = false; consentNeeded = false;
    $(root, 'surveyCenterLat').value = view.center[0]; $(root, 'surveyCenterLon').value = view.center[1];
    editor.hidden = false; active = true; addMode = false; $(root, 'surveyAddCorner').setAttribute('aria-pressed', 'false');
    map.dataset.adding = 'false';
    renderCorners(); requestAnimationFrame(renderTiles);
  };
  const makeSurvey = () => {
    const geometry = geoJSONFromVertices(vertices);
    const sameBoundary = original && equal(vertices, verticesFromGeoJSON(original.geometry)) && equal(references, original.references);
    const survey = validateLandSurvey({ version: 1, geometry, references, engineLink: sameBoundary ? original.engineLink : 'unlinked', binding: sameBoundary ? original.binding : null,
      mapView: { center: [...view.center], zoom: view.zoom, provider: view.provider } });
    return survey;
  };
  $(root, 'editLandSurvey').addEventListener('click', open);
  $(root, 'surveyCancel').addEventListener('click', close);
  $(root, 'surveyClear').addEventListener('click', () => { vertices = []; references = []; if (draft) { draft.engineLink = 'unlinked'; draft.binding = null; } renderCorners(); });
  $(root, 'surveyApply').addEventListener('click', () => {
    try { onApply(vertices.length ? makeSurvey() : null); close(); }
    catch (error) { status(error.message); }
  });
  $(root, 'surveyAddCorner').addEventListener('click', event => {
    addMode = !addMode; map.dataset.adding = String(addMode); event.currentTarget.setAttribute('aria-pressed', String(addMode));
    event.currentTarget.textContent = addMode ? 'اضغط على الخريطة لإضافة زاوية' : '＋ أضف زاوية من الخريطة';
  });
  $(root, 'surveyMapProvider').addEventListener('change', event => {
    if (event.target.value === 'osm' && !$(root, 'surveyOsmConsent').checked) { event.target.value = 'local'; view.provider = 'local'; consentNeeded = true; renderTiles(); return; }
    consentNeeded = false;
    view.provider = event.target.value; renderTiles();
  });
  $(root, 'surveyOsmConsent').addEventListener('change', () => {
    if (!$(root, 'surveyOsmConsent').checked && $(root, 'surveyMapProvider').value === 'osm') { $(root, 'surveyMapProvider').value = 'local'; view.provider = 'local'; consentNeeded = false; renderTiles(); }
  });
  $(root, 'surveyMapCenter').addEventListener('click', () => {
    const lat = Number($(root, 'surveyCenterLat').value), lon = Number($(root, 'surveyCenterLon').value);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return status('أدخل خط عرض بين ‎−90 و90 وخط طول بين ‎−180 و180.');
    view.center = [lat, lon]; renderTiles();
  });
  $(root, 'surveyZoomIn').addEventListener('click', () => { view.zoom = Math.min(19, view.zoom + 1); renderTiles(); });
  $(root, 'surveyZoomOut').addEventListener('click', () => { view.zoom = Math.max(5, view.zoom - 1); renderTiles(); });
  $(root, 'surveyCorners').addEventListener('change', event => {
    const coordinate = event.target.closest('[data-coordinate]');
    if (coordinate) {
      const index = Number(coordinate.dataset.point), axis = coordinate.dataset.coordinate, value = Number(coordinate.value);
      if (!Number.isFinite(value) || value < (axis === 'lat' ? -90 : -180) || value > (axis === 'lat' ? 90 : 180)) { renderCorners(); status('إحداثيات الزاوية خارج نطاق WGS84.'); return; }
      vertices[index][axis === 'lat' ? 1 : 0] = value; invalidateLink(); renderReadouts(); return;
    }
    const input = event.target.closest('[data-reference]');
    if (input) { const index = Number(input.dataset.reference), value = input.value === '' ? null : Number(input.value); references[index] = value; invalidateLink(); renderReadouts(); }
  });
  $(root, 'surveyCorners').addEventListener('click', event => {
    const button = event.target.closest('[data-remove]'); if (!button) return;
    const index = Number(button.dataset.remove); vertices.splice(index, 1); references = Array.from({ length: vertices.length }, () => null); changedGeometry();
    status('حُذفت الزاوية؛ أزيلت الأطوال المرجعية لأن ترتيب أضلاع الحد تغيّر.');
  });

  overlay.addEventListener('pointerdown', event => {
    const group = event.target.closest('[data-vertex-index]'); if (!group) return;
    event.preventDefault(); event.stopPropagation();
    pointer = { mode: 'vertex', id: event.pointerId, index: Number(group.dataset.vertexIndex), x: event.clientX, y: event.clientY, moved: false };
    overlay.setPointerCapture(event.pointerId);
  });
  overlay.addEventListener('pointermove', event => {
    if (!pointer || pointer.mode !== 'vertex' || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 2) pointer.moved = true;
    if (!pointer.moved) return;
    const [lat, lon] = geoPointAt(event.clientX, event.clientY); vertices[pointer.index] = [lon, lat]; invalidateLink(); renderOverlay();
  });
  overlay.addEventListener('pointerup', event => {
    if (!pointer || pointer.mode !== 'vertex') return;
    if (pointer.moved) changedGeometry();
    pointer = null; if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
  });
  overlay.addEventListener('keydown', event => {
    const group = event.target.closest('[data-vertex-index]'); if (!group || !['Delete', 'Backspace'].includes(event.key)) return;
    event.preventDefault(); vertices.splice(Number(group.dataset.vertexIndex), 1); references = Array.from({ length: vertices.length }, () => null); changedGeometry(); status('حُذفت الزاوية؛ أزيلت الأطوال المرجعية لأن ترتيب أضلاع الحد تغيّر.');
  });

  map.addEventListener('pointerdown', event => {
    if (event.target.closest('button,select,input,a,label')) return;
    pointer = { mode: 'map', id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
    map.setPointerCapture(event.pointerId); event.preventDefault();
  });
  map.addEventListener('pointermove', event => {
    if (!pointer || pointer.mode !== 'map' || pointer.id !== event.pointerId) return;
    pointer.dx = event.clientX - pointer.x; pointer.dy = event.clientY - pointer.y;
    if (Math.hypot(pointer.dx, pointer.dy) > 5) pointer.moved = true;
    if (pointer.moved) { tiles.style.transform = `translate(${pointer.dx}px,${pointer.dy}px)`; overlay.style.transform = `translate(${pointer.dx}px,${pointer.dy}px)`; }
  });
  map.addEventListener('pointerup', event => {
    if (!pointer || pointer.mode !== 'map') return;
    const current = pointer; pointer = null;
    tiles.style.transform = ''; overlay.style.transform = '';
    if (current.moved) {
      const center = project(view.center[0], view.center[1], view.zoom); view.center = unproject(center.x - current.dx, center.y - current.dy, view.zoom);
      $(root, 'surveyCenterLat').value = view.center[0]; $(root, 'surveyCenterLon').value = view.center[1]; renderTiles();
    } else if (addMode && vertices.length < 128) {
      const [lat, lon] = geoPointAt(event.clientX, event.clientY); vertices.push([lon, lat]); references.push(null); changedGeometry();
    }
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
  });
  map.addEventListener('wheel', event => {
    event.preventDefault(); view.zoom = Math.max(5, Math.min(19, view.zoom + (event.deltaY < 0 ? 1 : -1))); renderTiles();
  }, { passive: false });
  const observer = new ResizeObserver(() => { if (active) renderTiles(); }); observer.observe(map);
  return { open, close, isOpen: () => active };
}
