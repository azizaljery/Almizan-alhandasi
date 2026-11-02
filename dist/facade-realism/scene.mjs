// (طلب المالك 2026-11-02) مشهد ثلاثي الأبعاد للواجهة الأمامية من الطبقات نفسها: كل طبقة تُبنى بالبروفايل (ExtrudeGeometry) بثقوب الفتحات الحقيقية.
// الجوانب والظهر لم تُبنَ في هذه العينة؛ المنظور يعرض الواجهة الأمامية وعمق جدرانها وفتحاتها وبروزاتها فقط.
// الإضاءة: شمس من الجنوب الغربي (من -x، +z) مع خرائط ظل. الزجاج شفاف، والفتحات الزجاجية تُظهر مجالًا داخليًا داكنًا.

/** يبني المشهد: THREE من three-runtime، built من buildVariant، lib من createRealismMaterials. */
export function buildFrontScene(THREE, built, lib) {
  const group = new THREE.Group(); group.name = 'facade-realism-' + built.variant.id;
  const half = built.F.width / 2, meshes = [];
  for (const L of built.layers) {
    const shape = new THREE.Shape(L.outer.map(([u, z]) => new THREE.Vector2(u - half, z)));
    for (const h of L.holes) shape.holes.push(new THREE.Path(h.map(([u, z]) => new THREE.Vector2(u - half, z))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: L.o1 - L.o0, bevelEnabled: false, curveSegments: 16 });
    const mesh = new THREE.Mesh(geo, lib.get(L.mat));
    mesh.position.z = L.C + L.o0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = L.id;
    mesh.userData = { role: L.role, plan: L.plan, tag: L.tag, opening: L.opening || null, mat: L.mat };
    group.add(mesh); meshes.push(mesh);
    if (L.role === 'glazing') { // مجال داخلي داكن خلف الزجاج
      const u0 = Math.min(...L.outer.map(p => p[0])), u1 = Math.max(...L.outer.map(p => p[0])), z0 = Math.min(...L.outer.map(p => p[1])), z1 = Math.max(...L.outer.map(p => p[1]));
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, z1 - z0), lib.get('interior'));
      pl.position.set((u0 + u1) / 2 - half, (z0 + z1) / 2, L.C - .12); pl.name = 'interior-' + L.opening; group.add(pl); meshes.push(pl);
    }
  }
  const W = built.F.width, zFront = Math.max(...built.F.pieces.map(p => p.C));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 24, 20), lib.get('ground'));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.001, zFront - 8); ground.receiveShadow = true; ground.name = 'ground'; group.add(ground); meshes.push(ground);
  return { group, meshes, tris: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0) };
}
export default { buildFrontScene };
