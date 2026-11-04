// (طلب المالك 2026-11-02) مشهد ثلاثي الأبعاد للمبنى من طبقات النموذج نفسها: كل طبقة تُبنى بالبروفايل (ExtrudeGeometry) بثقوب الفتحات الحقيقية،
// ثم تُحوَّل إلى إحداثيات المسقط بدوران صِرف (sideTransform). الجهات الأربع كلها تُبنى؛ الجهة الأمامية بتفاصيل البديل، والبقية بخامة البديل.
// الإضاءة: شمس من الجنوب الغربي مع خرائط ظل. الزجاج شفاف، والفتحات الزجاجية تُظهر مجالًا داخليًا داكنًا.
import { sideTransform, SIDES_ALL } from './model.mjs';

/** مصفوفة التحويل لجهة معينة كما تُقرأ من sideTransform (صفوف). */
function matrixFor(THREE, side, off) {
  const R = sideTransform(side, off);
  return new THREE.Matrix4().set(R[0][0], R[0][1], R[0][2], R[0][3], R[1][0], R[1][1], R[1][2], R[1][3], R[2][0], R[2][1], R[2][2], R[2][3], 0, 0, 0, 1);
}

/**
 * يبني المشهد لبديل واحد على الجهات الأربع.
 * built: مخرجات buildAllSides(doc, id) — مفتاحها الجهة وقيمتها buildVariant.
 * lib: createRealismMaterials. grey: إن كان true تُستبدل كل الخامات بلون رمادي موحّد (للمقارنة الشكلية).
 */
export function buildBuildingScene(THREE, built, lib, { grey = null } = {}) {
  const group = new THREE.Group(); group.name = 'facade-realism-' + built.s.variant.id;
  const meshes = [];
  const mat = key => {
    if (!grey) return lib.get(key);
    return key === 'interior' ? grey.dark : key === 'ground' ? grey.ground : grey.body;
  };
  for (const side of SIDES_ALL) {
    const B = built[side], M = matrixFor(THREE, side, B.off);
    for (const L of B.layers) {
      const shape = new THREE.Shape(L.outer.map(([u, z]) => new THREE.Vector2(u, z)));
      for (const h of L.holes) shape.holes.push(new THREE.Path(h.map(([u, z]) => new THREE.Vector2(u, z))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: L.o1 - L.o0, bevelEnabled: false, curveSegments: 16 });
      geo.translate(0, 0, L.C + L.o0);
      geo.applyMatrix4(M);
      const mesh = new THREE.Mesh(geo, mat(L.mat));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = side + ':' + L.id;
      mesh.userData = { side, role: L.role, plan: L.plan, tag: L.tag, opening: L.opening || null, mat: L.mat };
      group.add(mesh); meshes.push(mesh);
      if (L.role === 'glazing') { // مجال داخلي داكن خلف الزجاج (8 سم داخل الجدار)
        const inner = { ...L, o0: L.o0 - .08, o1: L.o0 - .07, role: 'interior', mat: 'interior', plan: false };
        const sh2 = new THREE.Shape(L.outer.map(([u, z]) => new THREE.Vector2(u, z)));
        const g2 = new THREE.ExtrudeGeometry(sh2, { depth: .01, bevelEnabled: false });
        g2.translate(0, 0, L.C + inner.o0); g2.applyMatrix4(M);
        const pl = new THREE.Mesh(g2, mat('interior')); pl.name = side + ':interior-' + L.opening; group.add(pl); meshes.push(pl);
      }
    }
  }
  // قطعة الأرض: المسقط 20 × 30 م (صفر إلى 20 شرقًا، وصفر إلى 30 شمالًا؛ في المشهد Z = -ص)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), mat('ground'));
  ground.rotation.x = -Math.PI / 2; ground.position.set(10, -.001, -15); ground.receiveShadow = true; ground.name = 'ground'; group.add(ground); meshes.push(ground);
  return { group, meshes, tris: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0) };
}
/**
 * كاميرا لقطة مقرّبة من الجهة الأمامية (s) بمنطق ثابت لكل بديل: الهدف والإزاحة من هندسة المشهد نفسه، لا من إحداثيات يدوية.
 * shot: stone (جدار حجري أكبر)، window (أول زجاج)، slot (زاوية مائلة على فتحة لإظهار عمقها)، door (الباب إن وُجد).
 * يُعيد الكاميرا وإطارات الشاشة للقياس (roi) بالبكسل لحجم الصورة W×H.
 */
export function closeupCamera(THREE, S, shot, { W = 1280, H = 800, fov = 34, index = 0 } = {}) {
  const front = S.meshes.filter(m => m.userData.side === 's');
  const bbox = m => new THREE.Box3().setFromObject(m);
  const size = b => b.getSize(new THREE.Vector3());
  const glazing = front.filter(m => m.userData.role === 'glazing');
  const gl = glazing[index] || glazing[0];
  const gbox = bbox(gl), gc = gbox.getCenter(new THREE.Vector3());
  const frame = front.find(f => f.userData.role === 'frame' && f.userData.opening === gl.userData.opening) || null;
  const walls = front.filter(m => m.userData.role === 'wall' && /^limestone/.test(m.material.name));
  let target, cam;
  if (shot === 'stone') {
    if (!walls.length) throw new Error('لا جدار حجري في الجهة الأمامية');
    const wall = walls.slice().sort((a, b) => { const A = size(bbox(a)), B = size(bbox(b)); return B.x * B.y - A.x * A.y; })[0];
    const wb = bbox(wall);
    const px = wb.min.x + (wb.max.x - wb.min.x) * .30, py = wb.min.y + (wb.max.y - wb.min.y) * .55;
    const ray = new THREE.Raycaster(new THREE.Vector3(px, py, wb.max.z + 5), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObjects(front, false)[0];
    target = hit ? hit.point.clone() : new THREE.Vector3(px, py, wb.max.z);
    cam = target.clone().add(new THREE.Vector3(.45, .25, 2.0));
  } else if (shot === 'window') {
    target = gc.clone(); cam = target.clone().add(new THREE.Vector3(1.1, .35, 3.1));
  } else if (shot === 'slot') {
    target = gc.clone(); cam = target.clone().add(new THREE.Vector3(2.6, .8, 2.0));
  } else if (shot === 'door') {
    const door = front.find(m => m.userData.role === 'door') || gl;
    target = bbox(door).getCenter(new THREE.Vector3()); cam = target.clone().add(new THREE.Vector3(1.4, .3, 3.6));
  } else throw new Error('لقطة غير معروفة: ' + shot);
  const camera = new THREE.PerspectiveCamera(fov, W / H, .05, 400);
  camera.position.copy(cam); camera.lookAt(target); camera.updateMatrixWorld(true);
  const toScreen = box => {
    const pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(camera); pts.push([(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cl = (v, m) => Math.max(0, Math.min(m, v));
    return { x0: cl(Math.floor(Math.min(...xs)), W), y0: cl(Math.floor(Math.min(...ys)), H), x1: cl(Math.ceil(Math.max(...xs)), W), y1: cl(Math.ceil(Math.max(...ys)), H) };
  };
  return { camera, roi: { glass: toScreen(gbox), frame: frame ? toScreen(bbox(frame)) : null }, target: target.toArray(), cam: cam.toArray() };
}
export default { buildBuildingScene, closeupCamera };
