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
export default { buildBuildingScene };
