// المنظور الداخلي في المتصفح: يؤثث الغرفة من مستند التصميم (staging) ثم يصيّرها بنفس محرك المجسم (DrawViewer/three) بكاميرا مستوى العين
// وزاوية واسعة، ويعيد اللقطة ومعالمها (الفتحات والقطع الرئيسية في الصورة) ووصفًا مغلقًا للخدمة. مثيل عارض خاص خارج الشاشة؛ لا يمس عارض الصفحة.
import { parseDoc } from '../draw/doc.mjs';
import { stageRoom, STYLE_PALETTES } from './staging.mjs';
import { planInteriorCamera, pinhole, projectLandmarks, describeLandmarks, INTERIOR_CAMERA } from './camera.mjs';

export const INTERIOR_SHOT = Object.freeze({ width: 1536, height: 1024, ss: 1.5, shadowSize: 2048 });
/** الشمس لكل إضاءة (اتجاه من الشمال مع عقارب الساعة وارتفاع)؛ الليل نمط dusk. قيم تصويرية لا فلكية. */
export const INTERIOR_SUN = Object.freeze({ day: { style: 'day', azimuthDeg: 200, altitudeDeg: 55 }, golden: { style: 'day', azimuthDeg: 250, altitudeDeg: 22 }, night: { style: 'dusk', azimuthDeg: 250, altitudeDeg: 6 } });

/** طراز التأثيث الغني (interior-furniture) لكل طراز تصوير: نجدي/حجازي/سلماني/كلاسيكي/معاصر/حجري. */
export const FURNITURE_OF_STYLE = Object.freeze({ N: 'najdi', H: 'classic', S: 'contemporary', C: 'classic', M: 'contemporary', J: 'contemporary' });
/** أسماء مواد الأثاث الغني ← أسماء لوحة الطراز الموجودة (لا تغيير في STYLE_PALETTES نفسها). */
const RICH_ALIAS = Object.freeze({ upholstery: 'majlisFabric', upholsteryAlt: 'majlisCream', cushionA: 'pillowB', cushionB: 'duvetAccent', cushionC: 'pillowA', throwFab: 'duvetAccent', bedHead: 'fabric', curtainFab: 'fabric' });
function applyPalette(built, styleId) {
  const base = STYLE_PALETTES[styleId]; if (!base || !built?.lib?.fixtures) return 0; let n = 0;
  const pal = { ...base }; for (const [rich, from] of Object.entries(RICH_ALIAS)) if (base[from]) pal[rich] = base[from];
  for (const [k, c] of Object.entries(pal)) { const m = built.lib.fixtures[k]; if (m?.color) { m.color.set(c); m.needsUpdate = true; n++; } }
  return n;
}
/**
 * يلتقط منظورًا داخليًا لغرفة (majlis|living|master). docInput: نص JSON أو كائن مستند.
 * يعيد { blob, width, height, staged, camera, landmarks, description } أو يرمي خطأ بالعربية.
 */
export async function captureInterior({ doc: docInput, type, style = 'M', lighting = 'golden', shot = INTERIOR_SHOT, cameraOptions = {}, onProgress = null } = {}) {
  const doc = typeof docInput === 'string' ? parseDoc(docInput) : docInput;
  const staged = stageRoom(doc, type, style); if (!staged) throw new Error('لا توجد غرفة من هذا النوع في تصميمك.');
  const cam = planInteriorCamera(staged, { aspect: shot.width / shot.height, ...cameraOptions }); if (!cam) throw new Error('تعذّر إيجاد زاوية تصوير مناسبة لهذه الغرفة.');
  const [{ loadThreeRuntime }, { DrawViewer }] = await Promise.all([import('../three-runtime.mjs'), import('../draw/viewer-draw.mjs')]);
  const THREE = await loadThreeRuntime();
  const host = document.createElement('div'); host.setAttribute('aria-hidden', 'true'); host.style.cssText = `position:fixed;left:-20000px;top:0;width:${shot.width}px;height:${shot.height}px;pointer-events:none`;
  document.body.append(host); let viewer = null;
  try {
    viewer = new DrawViewer(host, { THREE, shadowSize: shot.shadowSize, maxPixelRatio: 1, autoSelect: false, interior: false, richFurniture: true, detail: 'full', adaptive: false, furnitureStyle: FURNITURE_OF_STYLE[style] || 'contemporary' }); // الصورة الداخلية المهنية: أثاثها وألوانها من staging والوصف المغلق، فلا تُضاف قطع تزيينية خارجه
    viewer.setDoc(staged.doc); viewer.resize(); applyPalette(viewer.built, style);
    const S = INTERIOR_SUN[lighting] || INTERIOR_SUN.golden; viewer.setStyle(S.style); viewer.setSun({ azimuthDeg: S.azimuthDeg, altitudeDeg: S.altitudeDeg, north: doc.north || 0 });
    const li = Math.max(0, viewer.built.levels.findIndex(l => l.id === staged.levelId));
    viewer.walk.eye = cam.eye; viewer.setMode('walk', { animate: false });
    viewer.walkTo(cam.x, cam.y, { level: li, headingDeg: cam.headingDeg, pitchDeg: 0 });
    viewer.walk.x = cam.x; viewer.walk.y = cam.y; viewer.walk.yaw = cam.headingDeg * Math.PI / 180; viewer.walk.pitch = 0;
    const pose = viewer.walkPose(); viewer.applyPose({ ...pose, fov: cam.vfov }); viewer.camera.near = .06; viewer.camera.aspect = shot.width / shot.height; viewer.camera.updateProjectionMatrix();
    viewer.markShadowDirty?.(); viewer.requestRender();
    onProgress?.(.3);
    const r = await viewer.captureHQ({ scale: 1, ss: shot.ss, shadowSize: shot.shadowSize }); onProgress?.(1);
    const landmarks = projectLandmarks(pinhole(cam), staged, { levelE: staged.level.E });
    return { blob: r.blob, width: r.width, height: r.height, renderMs: r.renderMs, staged: { type, style, counts: staged.counts, notes: staged.notes, room: { key: staged.room.key, area: staged.room.area } }, camera: cam, landmarks, description: describeLandmarks(landmarks), cameraDefaults: INTERIOR_CAMERA };
  } finally { try { viewer?.dispose?.(); } catch { /* تنظيف */ } host.remove(); }
}
