// @mizan/facade-engine — نسخة مدمجة في الفرع الجانبي (side/apply-facade-styles).
// المصدر: المرفق mizan-facade-engine.zip. الأرقام منقولة كما وردت (قرار المالك)، وأُصلح فقط الخطأ النحوي (facadeId).
// لا يستورد three.js؛ العرض الثلاثي الحي عند الدمج يكون عبر scene3d.mjs الموجود.

export const FACADE_STYLES = Object.freeze({
  MODERN_TRAVERTINE_MASHRABIYA: Object.freeze({
    id: 'STYLE_MODERN_MASHRABIYA',
    name: 'مودرن معاصر بترافنتين ومشربية هندسية',
    palette: Object.freeze({
      wall: '#F6F6F4', frame: '#D5C4B0', screen: '#EAE8E3', joinery: '#1F2326', glass: '#25353D',
    }),
    screenPerforation: 0.45,
    screenDepthMm: 50,
    frameProjectionMm: 500,
    frameBorderWidthMm: 350,
    cantileverCanopyMm: 1200,
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
    frameProjectionMm: 450,
    frameBorderWidthMm: 300,
    cantileverCanopyMm: 1500,
    lightingK: 3200,
  }),
});

const LIGHTING = Object.freeze({ colorTemperature: '3000K Warm White', lumensPerMeter: 900 });

/**
 * يبني مواصفات الواجهة من عرض المبنى.
 * options.floors: 2 أو 3 (الافتراضي 2). options.projectionMm: يتجاوز بروز الطراز إن أُعطي.
 */
export function generateFacade(model, styleKey = 'MODERN_TRAVERTINE_MASHRABIYA', options = {}) {
  const style = FACADE_STYLES[styleKey] || FACADE_STYLES.MODERN_TRAVERTINE_MASHRABIYA;
  const facadeWidthM = Number(model?.building?.w);
  if (!Number.isFinite(facadeWidthM) || facadeWidthM <= 0) throw new Error('invalid_facade_width');
  const floors = Math.min(3, Math.max(2, Number(options.floors ?? 2)));

  const groundHeightM = 3.6;
  const firstHeightM = 3.4;
  const frameWidthM = Math.min(facadeWidthM * 0.65, 11.0);
  const frameHeightM = firstHeightM + 0.6;
  const projectionMm = options.projectionMm ?? style.frameProjectionMm;
  const screenWidthM = frameWidthM - 0.9;
  const screenHeightM = frameHeightM - 0.9;

  return {
    styleApplied: { id: style.id, name: style.name },
    floors,
    metrics: {
      facadeWidthM,
      totalHeightM: groundHeightM + firstHeightM + 1.8,
      shadingEfficiencyPercent: 78,
    },
    protrudingFrame: {
      type: 'BEIGE_TRAVERTINE_FRAME',
      dimensions: { widthM: frameWidthM, heightM: frameHeightM, projectionDepthM: projectionMm / 1000 },
      material: { colorHex: style.palette.frame },
    },
    privacyMashrabiya: style.screenPerforation === null ? null : {
      pattern: 'DIAGONAL_ISLAMIC_DIAMOND',
      dimensions: { widthM: screenWidthM, heightM: screenHeightM, thicknessMm: style.screenDepthMm },
      perforationRatio: style.screenPerforation,
      material: { colorHex: style.palette.screen },
    },
    entranceCanopy: {
      dimensions: { widthM: 3.5, projectionM: style.cantileverCanopyMm / 1000, thicknessM: 0.25 },
      material: { colorHex: style.palette.joinery },
      spotsCount: 4,
    },
    linearLighting: {
      colorTemperature: `${style.lightingK}K Warm White`,
      lumensPerMeter: LIGHTING.lumensPerMeter,
      placement: 'التجويف الداخلي للإطار الحجري البارز',
    },
    parapetSkyline: { leftSectionHeightM: 1.8, rightSectionHeightM: 1.2 },
  };
}

/** رسم واجهة أمامية SVG مبسّط من المواصفات (للمعاينة). */
export function facadeSvg(spec) {
  const W = 640, H = 420, pad = 40;
  const scale = (W - pad * 2) / Math.max(spec.metrics.facadeWidthM, 1);
  const wallH = spec.metrics.totalHeightM * scale;
  const baseY = H - pad;
  const x0 = pad, wallW = spec.metrics.facadeWidthM * scale;
  const f = spec.protrudingFrame.dimensions;
  const fx = x0 + (wallW - f.widthM * scale) / 2, fw = f.widthM * scale, fh = f.heightM * scale;
  const frameTop = baseY - 3.6 * scale - (fh - 3.6 * scale);
  const parts = [];
  parts.push(`<rect x="${x0}" y="${baseY - wallH}" width="${wallW}" height="${wallH}" fill="${spec.styleApplied.id.includes('LINEAR') ? '#FFFFFF' : '#F6F6F4'}" stroke="#777"/>`);
  parts.push(`<rect x="${fx}" y="${frameTop}" width="${fw}" height="${fh}" fill="${spec.protrudingFrame.material.colorHex}"/>`);
  if (spec.privacyMashrabiya) {
    const s = spec.privacyMashrabiya.dimensions;
    parts.push(`<rect x="${fx + 0.45 * scale}" y="${frameTop + 0.45 * scale}" width="${s.widthM * scale}" height="${s.heightM * scale}" fill="${spec.privacyMashrabiya.material.colorHex}" fill-opacity="0.85" stroke="#999" stroke-dasharray="4 4"/>`);
  }
  const c = spec.entranceCanopy.dimensions;
  parts.push(`<rect x="${x0 + wallW / 2 - c.widthM * scale / 2}" y="${baseY - 2.6 * scale}" width="${c.widthM * scale}" height="${0.25 * scale}" fill="${spec.entranceCanopy.material.colorHex}"/>`);
  parts.push(`<line x1="${x0}" y1="${baseY}" x2="${x0 + wallW}" y2="${baseY}" stroke="#333"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fafaf7"/>${parts.join('')}<text x="${pad}" y="${H - 10}" font-size="14" fill="#333">${spec.styleApplied.name} — بروز الإطار ${Math.round(f.projectionDepthM * 1000)} مم</text></svg>`;
}

export default { FACADE_STYLES, generateFacade, facadeSvg };
