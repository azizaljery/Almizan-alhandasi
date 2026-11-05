// @mizan/facade-engine — نسخة مدمجة في الفرع الجانبي (side/apply-facade-styles).
// المصدر: المرفق mizan-facade-engine.zip، بعد إصلاح خطأ النحو (facadeId) وإزالة أرقام بلا مصدر.
// ما يبقى «قيمة تصميمية للميزان» لا «اشتراط»: الإطار 0.5م أُزيل من الافتراضي؛ البروز يُختار من {15، 20، 25} سم.
// لا يستورد three.js: العرض الثلاثي الحي عند الدمج يكون عبر scene3d.mjs الموجود.

export const PROJECTION_OPTIONS_CM = Object.freeze([15, 20, 25]);

export const FACADE_STYLES = Object.freeze({
  MODERN_TRAVERTINE_MASHRABIYA: Object.freeze({
    id: 'STYLE_MODERN_MASHRABIYA',
    name: 'مودرن معاصر بترافنتين ومشربية هندسية',
    palette: Object.freeze({
      wall: '#F6F6F4', frame: '#D5C4B0', screen: '#EAE8E3', joinery: '#1F2326', glass: '#25353D',
    }),
    screenPerforation: 0.45,
    screenDepthMm: 50,
    lightingK: 3000,
  }),
  MODERN_LINEAR_LIGHTING: Object.freeze({
    id: 'STYLE_MODERN_LINEAR_LIGHTING',
    name: 'مودرن فاخر بإضاءات خطية مدمجة',
    palette: Object.freeze({
      wall: '#FFFFFF', frame: '#D9CDBF', screen: null, joinery: '#121214', glass: '#25353D',
    }),
    screenPerforation: null,
    screenDepthMm: null,
    lightingK: 3200,
  }),
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * يبني مواصفات الواجهة من عرض المبنى وعدد الأدوار.
 * options.projectionCm: واحد من 15/20/25 (يُحدد حسب الواجهة والموقع، لا ثابت).
 */
export function generateFacade(model, styleKey = 'MODERN_TRAVERTINE_MASHRABIYA', options = {}) {
  const style = FACADE_STYLES[styleKey] || FACADE_STYLES.MODERN_TRAVERTINE_MASHRABIYA;
  const facadeWidthM = Number(model?.building?.w);
  const floors = clamp(Number(options.floors ?? 2), 2, 3);
  if (!Number.isFinite(facadeWidthM) || facadeWidthM <= 0) throw new Error('invalid_facade_width');
  const projectionCm = options.projectionCm ?? 20;
  if (!PROJECTION_OPTIONS_CM.includes(projectionCm)) throw new Error('invalid_projection_cm');

  const groundHeightM = 3.6;
  const floorHeightM = 3.4;
  const totalHeightM = groundHeightM + floorHeightM * (floors - 1) + 0.6;
  const frameWidthM = Math.min(facadeWidthM * 0.65, 11.0);
  const frameHeightM = floorHeightM + 0.6;

  return {
    styleApplied: { id: style.id, name: style.name },
    floors,
    metrics: { facadeWidthM, totalHeightM },
    protrudingFrame: {
      dimensions: { widthM: frameWidthM, heightM: frameHeightM, projectionM: projectionCm / 100 },
      colorHex: style.palette.frame,
    },
    privacyScreen: style.screenPerforation === null ? null : {
      dimensions: { widthM: frameWidthM - 0.9, heightM: frameHeightM - 0.9, depthMm: style.screenDepthMm },
      perforation: style.screenPerforation,
      colorHex: style.palette.screen,
    },
    entranceCanopy: {
      dimensions: { widthM: 3.5, projectionM: 1.2 },
      colorHex: style.palette.joinery,
    },
    lighting: { colorTempK: style.lightingK },
    parapet: { highSideM: 1.8, lowSideM: 1.2 },
  };
}

/** رسم واجهة أمامية SVG مبسّط من المواصفات (للمعاينة والصور المقارنة). */
export function facadeSvg(spec) {
  const W = 640, H = 420, pad = 40;
  const scale = (W - pad * 2) / Math.max(spec.metrics.facadeWidthM, 1);
  const wallH = spec.metrics.totalHeightM * scale;
  const baseY = H - pad;
  const x0 = pad, wallW = spec.metrics.facadeWidthM * scale;
  const f = spec.protrudingFrame.dimensions;
  const fx = x0 + (wallW - f.widthM * scale) / 2, fw = f.widthM * scale;
  const fh = f.heightM * scale, fy = baseY - (3.6 + f.heightM - 3.6) * scale;
  const parts = [];
  parts.push(`<rect x="${x0}" y="${baseY - wallH}" width="${wallW}" height="${wallH}" fill="${spec.styleApplied.id.includes('LINEAR') ? '#FFFFFF' : '#F6F6F4'}" stroke="#777"/>`);
  parts.push(`<rect x="${fx}" y="${baseY - 3.6 * scale - fh + 3.6 * scale}" width="${fw}" height="${fh}" fill="${spec.protrudingFrame.colorHex}"/>`);
  if (spec.privacyScreen) {
    const s = spec.privacyScreen.dimensions;
    parts.push(`<rect x="${fx + 0.45 * scale}" y="${fy + 0.45 * scale}" width="${s.widthM * scale}" height="${s.heightM * scale}" fill="${spec.privacyScreen.colorHex}" fill-opacity="0.85" stroke="#999" stroke-dasharray="4 4"/>`);
  }
  const c = spec.entranceCanopy.dimensions;
  parts.push(`<rect x="${x0 + wallW / 2 - c.widthM * scale / 2}" y="${baseY - 2.6 * scale}" width="${c.widthM * scale}" height="${0.25 * scale}" fill="${spec.entranceCanopy.colorHex}"/>`);
  parts.push(`<line x1="${x0}" y1="${baseY}" x2="${x0 + wallW}" y2="${baseY}" stroke="#333"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fafaf7"/>${parts.join('')}<text x="${pad}" y="${H - 10}" font-size="14" fill="#333">${spec.styleApplied.name} — بروز الإطار ${(spec.protrudingFrame.dimensions.projectionM * 100).toFixed(0)} سم</text></svg>`;
}

export default { PROJECTION_OPTIONS_CM, FACADE_STYLES, generateFacade, facadeSvg };
