import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSurveyGeometry, deriveRectangularGeneratorPlot, geoJSONFromVertices, validateLandSurvey, verticesFromGeoJSON,
} from '../dist/land-survey.mjs';

const square = geoJSONFromVertices([[0, 0], [.001, 0], [.001, .001], [0, .001]]);
const makeSurvey = (geometry, references = [], extra = {}) => validateLandSurvey({ version: 1, geometry, references, mapView: { center: [0, 0], zoom: 16, provider: 'local' }, ...extra });

test('GeoJSON stores longitude before latitude and closes the polygon ring', () => {
  assert.deepEqual(square.coordinates[0][0], [0, 0]);
  assert.deepEqual(square.coordinates[0].at(-1), square.coordinates[0][0]);
  assert.equal(verticesFromGeoJSON(square).length, 4);
});

test('geodesic length, area and bearings use north-clockwise degrees, not screen pixels', () => {
  const measured = analyzeSurveyGeometry(square);
  assert.ok(Math.abs(measured.edges[0].lengthM - 111.195) < 0.02);
  assert.ok(Math.abs(measured.edges[1].lengthM - 111.195) < 0.02);
  assert.ok(Math.abs(measured.areaM2 - 12364.35) < 1);
  assert.deepEqual(measured.edges.map(edge => Math.round(edge.bearingDeg)), [90, 0, 270, 180]);
  assert.deepEqual(measured.edges.map(edge => edge.direction), ['شرق', 'شمال', 'غرب', 'جنوب']);
});

test('a cardinal rectangle can bind dimensions to the generator only by an explicit compatible mode', () => {
  const geometry = geoJSONFromVertices([[46.6753, 24.7136], [46.6755, 24.7136], [46.6755, 24.7139], [46.6753, 24.7139]]);
  const estimated = makeSurvey(geometry);
  assert.throws(() => deriveRectangularGeneratorPlot(estimated), /اختر صراحةً/);
  const result = deriveRectangularGeneratorPlot(estimated, { mode: 'estimated' });
  assert.ok(result.width > 19 && result.width < 22);
  assert.ok(result.length > 32 && result.length < 35);
  assert.equal(result.source, 'map-estimate');
  const confirmed = makeSurvey(geometry, [20.1, 33.3, 20.1, 33.3]);
  const exact = deriveRectangularGeneratorPlot(confirmed, { mode: 'confirmed' });
  assert.equal(exact.width, 20.1);
  assert.equal(exact.length, 33.3);
  assert.equal(exact.source, 'confirmed-edge-references');
});

test('free-form nonrectangular sites remain measurable and are rejected by the rectangular generator', () => {
  const lShape = geoJSONFromVertices([[0, 0], [.003, 0], [.003, .001], [.001, .001], [.001, .003], [0, .003]]);
  const measured = analyzeSurveyGeometry(lShape);
  assert.equal(measured.edges.length, 6);
  assert.ok(measured.areaM2 > 60000);
  assert.throws(() => deriveRectangularGeneratorPlot(makeSurvey(lShape), { mode: 'estimated' }), /أربع زوايا|مستطيلة/);
});

test('confirmed free-form edge lengths stay references and inconsistent rectangular lengths cannot be applied', () => {
  const rectangle = geoJSONFromVertices([[46.6753, 24.7136], [46.6755, 24.7136], [46.6755, 24.7139], [46.6753, 24.7139]]);
  const conflict = analyzeSurveyGeometry(rectangle, [30, null, null, null]);
  assert.equal(conflict.edges[0].referenceLengthM, 30);
  assert.equal(conflict.edges[0].referenceConflict, true);
  const oneReference = makeSurvey(rectangle, [20, null, null, null]);
  assert.throws(() => deriveRectangularGeneratorPlot(oneReference, { mode: 'estimated' }), /توجد أطوال مرجعية/);
  assert.throws(() => deriveRectangularGeneratorPlot(makeSurvey(rectangle, [20, 33, 21, 33]), { mode: 'confirmed' }), /فرق الأطوال المرجعية للضلعين المتقابلين/);
  assert.throws(() => deriveRectangularGeneratorPlot(makeSurvey(rectangle, [30, 33.3, 30, 33.3]), { mode: 'confirmed' }), /تجاوز فرق أحد الأطوال حد المقارنة التقديري/);
});

test('opposite reference lengths use the same comparison threshold as map-to-reference checks', () => {
  const rectangle = geoJSONFromVertices([[46.6753, 24.7136], [46.6755, 24.7136], [46.6755, 24.7139], [46.6753, 24.7139]]);
  const compatible = deriveRectangularGeneratorPlot(makeSurvey(rectangle, [20.15, 33.3, 20.05, 33.3]), { mode: 'confirmed' });
  assert.equal(compatible.width, 20.1);
  assert.throws(() => deriveRectangularGeneratorPlot(makeSurvey(rectangle, [20.35, 33.3, 20.05, 33.3]), { mode: 'confirmed' }), /فرق الأطوال المرجعية للضلعين المتقابلين/);
});

test('the reference comparison threshold is an explicit product warning policy, not a survey accuracy claim', () => {
  const measured = analyzeSurveyGeometry(square), edgeLength = measured.edges[0].lengthM;
  const threshold = Math.max(0.2, edgeLength * 0.005);
  const withinPolicy = analyzeSurveyGeometry(square, [edgeLength + threshold * 0.99, null, null, null]);
  const beyondPolicy = analyzeSurveyGeometry(square, [edgeLength + threshold * 1.01, null, null, null]);
  assert.equal(withinPolicy.edges[0].referenceConflict, false);
  assert.equal(beyondPolicy.edges[0].referenceConflict, true);
});

test('invalid, repeated, unclosed and self-crossing polygons are rejected', () => {
  assert.throws(() => geoJSONFromVertices([[0, 0], [1, 1]]), /ثلاث زوايا/);
  assert.throws(() => geoJSONFromVertices([[0, 0], [1, 0], [1, 0], [0, 1]]), /متكررة|متقاربتان/);
  assert.throws(() => geoJSONFromVertices([[0, 0], [.001, .001], [0, .001], [.001, 0]]), /تتقاطع/);
  assert.throws(() => verticesFromGeoJSON({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1]]] }), /مغلقة/);
  assert.throws(() => geoJSONFromVertices([[181, 0], [0, 1], [1, 0]]), /WGS84/);
});

test('survey schema rejects invalid references, engine links and map state', () => {
  assert.throws(() => makeSurvey(square, [-1, null, null, null]), /الطول المرجعي/);
  assert.throws(() => makeSurvey(square, [], { engineLink: 'bounding-box' }), /رابط المسح/);
  assert.throws(() => makeSurvey(square, [], { mapView: { center: [0, 0], zoom: 20, provider: 'osm' } }), /إعدادات عرض الخريطة/);
});
