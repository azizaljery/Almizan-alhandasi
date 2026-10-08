// Local parcel survey helpers. Coordinates use GeoJSON WGS84 [longitude, latitude].
export const EARTH_RADIUS_METERS = 6371008.8;
// Product comparison policy only: compare at 0.20 m or 0.5% of the longer input, not as survey accuracy.
export const REFERENCE_COMPARISON_ABSOLUTE_THRESHOLD_M = 0.2;
export const REFERENCE_COMPARISON_RELATIVE_THRESHOLD = 0.005;
const comparisonThresholdM = (a, b) => Math.max(REFERENCE_COMPARISON_ABSOLUTE_THRESHOLD_M, Math.max(a, b) * REFERENCE_COMPARISON_RELATIVE_THRESHOLD);
export const DEFAULT_MAP_VIEW = Object.freeze({ center: [24.7136, 46.6753], zoom: 16, provider: 'local' });
const DEG = Math.PI / 180;
const ENGINE_LINKS = new Set(['unlinked', 'survey-rectangle', 'separate-rectangle']);

const finitePair = pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite);
const distance = (a, b) => {
  const [lon1, lat1] = a.map(v => v * DEG), [lon2, lat2] = b.map(v => v * DEG);
  const dLat = lat2 - lat1, dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

function pointOnSegment(a, b, p, eps = 1e-7) {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > eps) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  return dot >= -eps && dot <= (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + eps;
}
function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : 2;
}
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointOnSegment(a, b, c)) || (o2 === 0 && pointOnSegment(a, b, d)) || (o3 === 0 && pointOnSegment(c, d, a)) || (o4 === 0 && pointOnSegment(c, d, b));
}
function localPoints(vertices) {
  const lat0 = vertices.reduce((s, p) => s + p[1], 0) / vertices.length * DEG;
  const lon0 = vertices[0][0];
  return vertices.map(([lon, lat]) => ({ x: EARTH_RADIUS_METERS * (lon - lon0) * DEG * Math.cos(lat0), y: EARTH_RADIUS_METERS * (lat - vertices[0][1]) * DEG }));
}
function signedAreaSquareMeters(vertices) {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [lon1, lat1] = vertices[i].map(v => v * DEG);
    const [lon2, lat2] = vertices[(i + 1) % vertices.length].map(v => v * DEG);
    let deltaLon = lon2 - lon1;
    if (deltaLon > Math.PI) deltaLon -= 2 * Math.PI;
    if (deltaLon < -Math.PI) deltaLon += 2 * Math.PI;
    sum += deltaLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return sum * EARTH_RADIUS_METERS ** 2 / 2;
}

export function normalizeSurveyVertices(rawVertices) {
  if (!Array.isArray(rawVertices) || rawVertices.length < 3 || rawVertices.length > 128) throw Error('أضف ثلاث زوايا مختلفة على الأقل.');
  const vertices = rawVertices.map((point, i) => {
    if (!finitePair(point) || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) throw Error(`إحداثيات الزاوية ${i + 1} يجب أن تكون [خط طول، خط عرض] ضمن WGS84.`);
    return [point[0], point[1]];
  });
  for (let i = 0; i < vertices.length; i++) {
    if (distance(vertices[i], vertices[(i + 1) % vertices.length]) < 0.01) throw Error('توجد زاويتان متكررتان أو متقاربتان جدًا؛ حرّر الحدود قبل المتابعة.');
    for (let j = 0; j < i; j++) if (distance(vertices[i], vertices[j]) < 0.01) throw Error('كل زاوية في المضلع يجب أن تكون مختلفة.');
  }
  const xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
  if (Math.max(...xs) - Math.min(...xs) > 0.2 || Math.max(...ys) - Math.min(...ys) > 0.2) throw Error('هذه أبعاد أكبر من قطعة أرض محلية واحدة؛ قسّم الموقع أو أدخل حدوده المحلية فقط.');
  const points = localPoints(vertices), n = points.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) throw Error('الحدود تتقاطع أو تلامس نفسها؛ صحّح ترتيب الزوايا.');
  }
  const area = Math.abs(signedAreaSquareMeters(vertices));
  if (!Number.isFinite(area) || area < 0.01) throw Error('مساحة المضلع صفرية أو غير صالحة؛ حرّك الزوايا.');
  return vertices;
}

export function geoJSONFromVertices(rawVertices) {
  const vertices = normalizeSurveyVertices(rawVertices);
  const ring = [...vertices.map(point => [...point]), [...vertices[0]]];
  return { type: 'Polygon', coordinates: [ring] };
}

export function verticesFromGeoJSON(geometry) {
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1) throw Error('يجب حفظ الحد كمضلع GeoJSON واحد بلا ثقوب.');
  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || !finitePair(ring[0]) || !finitePair(ring.at(-1)) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw Error('حلقة GeoJSON يجب أن تكون مغلقة من آخر زاوية إلى أولها.');
  return normalizeSurveyVertices(ring.slice(0, -1));
}

export function analyzeSurveyGeometry(geometry, references = []) {
  const vertices = verticesFromGeoJSON(geometry), edges = vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const [lon1, lat1] = start.map(v => v * DEG), [lon2, lat2] = end.map(v => v * DEG);
    const deltaLon = lon2 - lon1;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    const bearingDeg = (Math.atan2(y, x) / DEG + 360) % 360;
    const lengthM = distance(start, end), referenceLengthM = references[index] ?? null;
    const conflictToleranceM = referenceLengthM === null ? REFERENCE_COMPARISON_ABSOLUTE_THRESHOLD_M : comparisonThresholdM(lengthM, referenceLengthM);
    return { index, start, end, lengthM, bearingDeg, direction: bearingLabel(bearingDeg), referenceLengthM, differenceM: referenceLengthM === null ? null : referenceLengthM - lengthM,
      referenceConflict: referenceLengthM !== null && Math.abs(referenceLengthM - lengthM) > conflictToleranceM };
  });
  return { vertices, areaM2: Math.abs(signedAreaSquareMeters(vertices)), perimeterM: edges.reduce((s, edge) => s + edge.lengthM, 0), edges };
}

export function bearingLabel(degrees) {
  const directions = ['شمال', 'شمال شرقي', 'شرق', 'جنوب شرقي', 'جنوب', 'جنوب غربي', 'غرب', 'شمال غربي'];
  return directions[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}

function nearCardinal(degrees, tolerance = 5) {
  const cardinal = [0, 90, 180, 270];
  const target = cardinal.reduce((best, value) => Math.abs(((degrees - value + 540) % 360) - 180) < Math.abs(((degrees - best + 540) % 360) - 180) ? value : best, 0);
  const difference = Math.abs(((degrees - target + 540) % 360) - 180);
  return difference <= tolerance ? target : null;
}

export function deriveRectangularGeneratorPlot(survey, { mode } = {}) {
  if (!['estimated', 'confirmed'].includes(mode)) throw Error('اختر صراحةً هل تستخدم أبعاد الخريطة التقديرية أم أطوال الأضلاع المؤكدة.');
  const analysis = analyzeSurveyGeometry(survey.geometry, survey.references);
  if (analysis.edges.length !== 4) throw Error('محرك المخططات الحالي يقبل حدودًا مستطيلة من أربع زوايا فقط. لم يُحوّل المضلع إلى صندوق إحاطة.');
  const axes = analysis.edges.map(edge => nearCardinal(edge.bearingDeg));
  if (axes.some(axis => axis === null) || axes[0] === axes[1] || axes[1] === axes[2] || axes[2] === axes[3] || axes[3] === axes[0]) throw Error('المولد الحالي يربط المستطيلات الموازيـة للشمال والشرق فقط؛ هذه الحدود مائلة أو غير مستطيلة.');
  if ((axes[0] - axes[2] + 360) % 360 !== 180 || (axes[1] - axes[3] + 360) % 360 !== 180) throw Error('اتجاهات أضلاع المستطيل غير متقابلة؛ صحّح الزوايا.');
  const estimatedLengths = analysis.edges.map(edge => edge.lengthM);
  const mapOppositeTolerance = Math.max(1, Math.max(...estimatedLengths) * 0.03);
  if (Math.abs(estimatedLengths[0] - estimatedLengths[2]) > mapOppositeTolerance || Math.abs(estimatedLengths[1] - estimatedLengths[3]) > mapOppositeTolerance) throw Error('الحدود المرسومة لا تغلق كمستطيل متقارب؛ أبقها مسحًا مستقلًا أو صحّح الزوايا.');
  let lengths = estimatedLengths, source = 'map-estimate';
  const hasReferences = survey.references.some(value => value !== null);
  if (mode === 'confirmed') {
    if (survey.references.some(value => value === null)) throw Error('أدخل طولًا مرجعيًا لكل ضلع قبل ربط المستطيل المؤكد.');
    if (Math.abs(survey.references[0] - survey.references[2]) > comparisonThresholdM(survey.references[0], survey.references[2]) || Math.abs(survey.references[1] - survey.references[3]) > comparisonThresholdM(survey.references[1], survey.references[3])) throw Error('فرق الأطوال المرجعية للضلعين المتقابلين تجاوز حد المقارنة التقديري المختار (0.20 م أو 0.5٪ من الأطول، أيهما أكبر)؛ بقيت القياسات مراجع منفصلة.');
    if (analysis.edges.some(edge => edge.referenceConflict)) throw Error('تجاوز فرق أحد الأطوال حد المقارنة التقديري المختار في التطبيق (0.20 م أو 0.5٪ من الطول الأطول، أيهما أكبر)؛ صحّح النقاط أو المراجع قبل الربط. هذا الحد ليس معيار رفع أو سماحية مساحية.');
    lengths = survey.references; source = 'confirmed-edge-references';
  } else if (hasReferences) throw Error('توجد أطوال مرجعية مدخلة؛ اختر ربطها بعد المقارنة أو أزلها بدل تجاهلها.');
  const ns = lengths.reduce((sum, length, i) => sum + ([0, 180].includes(axes[i]) ? length : 0), 0) / 2;
  const ew = lengths.reduce((sum, length, i) => sum + ([90, 270].includes(axes[i]) ? length : 0), 0) / 2;
  if (ns < 8 || ns > 100 || ew < 8 || ew > 100) throw Error('أبعاد المستطيل المرتبط يجب أن تكون بين 8 و100 متر لتناسب محرك المخططات.');
  return { width: ew, length: ns, source, northSouthAxisBearing: 0, areaFromEdgeReferencesM2: source === 'confirmed-edge-references' ? ew * ns : null };
}

export function validateLandSurvey(raw) {
  if (raw === null || raw === undefined) return null;
  if (!raw || raw.version !== 1) throw Error('إصدار مسح الأرض غير معروف.');
  const vertices = verticesFromGeoJSON(raw.geometry), geometry = geoJSONFromVertices(vertices);
  const references = Array.from({ length: vertices.length }, (_, i) => {
    const value = raw.references?.[i];
    if (value === null || value === undefined || value === '') return null;
    if (!Number.isFinite(value) || value < 0.01 || value > 100000) throw Error(`الطول المرجعي للضلع ${i + 1} يجب أن يكون بين 0.01 و100000 متر.`);
    return value;
  });
  if (raw.references !== undefined && (!Array.isArray(raw.references) || raw.references.length > vertices.length)) throw Error('قائمة أطوال المراجع لا تطابق زوايا الحد.');
  const engineLink = raw.engineLink ?? 'unlinked';
  if (!ENGINE_LINKS.has(engineLink)) throw Error('رابط المسح بمحرك المخططات غير معروف.');
  const binding = raw.binding === null || raw.binding === undefined ? null : {
    width: raw.binding.width, length: raw.binding.length, source: raw.binding.source,
  };
  if (binding && (!Number.isFinite(binding.width) || binding.width < 8 || binding.width > 100 || !Number.isFinite(binding.length) || binding.length < 8 || binding.length > 100 || !['map-estimate', 'confirmed-edge-references'].includes(binding.source))) throw Error('أبعاد ربط المسح بالمولد غير صالحة.');
  if (engineLink === 'survey-rectangle' && !binding) throw Error('رابط المستطيل يحتاج أبعادًا ومصدر قياس محفوظًا.');
  if (engineLink !== 'survey-rectangle' && binding) throw Error('لا تحفظ أبعاد ربط بالمولد عندما يكون المسح منفصلًا أو غير مرتبط.');
  const rawView = raw.mapView ?? DEFAULT_MAP_VIEW;
  if (!rawView || !finitePair(rawView.center) || rawView.center[0] < -90 || rawView.center[0] > 90 || rawView.center[1] < -180 || rawView.center[1] > 180 || !Number.isInteger(rawView.zoom) || rawView.zoom < 5 || rawView.zoom > 19 || !['local', 'osm'].includes(rawView.provider)) throw Error('إعدادات عرض الخريطة غير صالحة.');
  return { version: 1, geometry, references, engineLink, binding, mapView: { center: [...rawView.center], zoom: rawView.zoom, provider: rawView.provider } };
}

export function surveyFingerprint(raw) {
  const survey = validateLandSurvey(raw);
  if (!survey) return null;
  return JSON.stringify({ geometry: survey.geometry, references: survey.references, engineLink: survey.engineLink, binding: survey.binding });
}
