// Fit shadows to the actual building and its ground projection. Unlike a fixed
// 30 m frustum this covers both small villas and wide, multi-floor compositions.
export function shadowFrame(bounds, direction) {
  const pts = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    pts.push({ x, y, z });
    const t = Math.max(0, y - Math.min(0, bounds.min.y)) / Math.max(.15, direction.y);
    pts.push({ x: x - direction.x * t, y: Math.min(0, bounds.min.y), z: z - direction.z * t });
  }
  const lo = Object.fromEntries(['x', 'y', 'z'].map(k => [k, Math.min(...pts.map(p => p[k]))]));
  const hi = Object.fromEntries(['x', 'y', 'z'].map(k => [k, Math.max(...pts.map(p => p[k]))]));
  const center = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (lo[k] + hi[k]) / 2]));
  const radius = Math.max(3, Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2 + 1.5);
  return { center, min: lo, max: hi, extent: radius, distance: radius * 2 + 10, far: radius * 4 + 20 };
}

// Only optional context trees outside the property are filtered. The customer's
// own garden/trees and every building element stay untouched.
export function keepContextPlant(plant, camera, box) {
  if (!plant.outside || !['palm', 'olive', 'cypress'].includes(plant.kind)) return true;
  const target = { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
  const dx = target.x - camera.x, dz = target.z - camera.z, distance = Math.hypot(dx, dz);
  if (distance < 1) return true;
  const ux = dx / distance, uz = dz / distance, px = plant.x - camera.x, pz = -plant.y - camera.z;
  const depth = px * ux + pz * uz, lateral = Math.abs(px * uz - pz * ux);
  const halfWidth = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const crown = plant.kind === 'palm' ? 4 : (plant.r || 2);
  return !(depth > -crown && depth < distance && lateral < halfWidth * Math.max(0, depth) / distance + crown);
}

export function fitPresentationCamera(THREE, camera, bounds, margin = .12) {
  const target = bounds.getCenter(new THREE.Vector3()), direction = camera.position.clone().sub(target).normalize();
  // The opening image is a presentation view. Keep it above optional neighbour
  // context; eye-level walking remains an explicit navigation mode.
  direction.y = Math.max(.18, direction.y); direction.normalize();
  let distance = Math.max(3, camera.position.distanceTo(target));
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  for (let step = 0; step < 12; step++) {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.position.y = Math.max(1.6, camera.position.y);
    camera.far = Math.max(camera.far, distance + bounds.getSize(new THREE.Vector3()).length() * 2);
    camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const projected = corners.map(p => p.clone().project(camera));
    const overflow = Math.max(...projected.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
    if (overflow <= 1 - margin && projected.every(p => p.z >= -1 && p.z <= 1)) break;
    distance *= Math.max(1.08, Math.min(2, overflow / (1 - margin)));
  }
  return { target, distance };
}

export function hqCapture({ renderer, refiner, canvas, maxPixels = 6000000 } = {}) {
  let pending = null;
  return (options = {}) => {
    if (pending) return pending;
    pending = (async () => {
      const pr = renderer.getPixelRatio(), sz = renderer.getSize({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } });
      const scale = Number.isFinite(options.scale) ? Math.max(1, Math.min(4, options.scale)) : 2;
      const samples = Number.isFinite(options.samples) ? Math.max(8, Math.min(128, Math.round(options.samples))) : 64;
      const k = Math.max(.25, Math.min(scale, 3840 / Math.max(1, sz.x * pr), 2400 / Math.max(1, sz.y * pr), Math.sqrt(maxPixels / Math.max(1, sz.x * sz.y * pr * pr))));
      const start = performance.now();
      try {
        refiner.cancel(); renderer.setPixelRatio(pr * k); renderer.setSize(sz.x, sz.y, false);
        const n = await refiner.settle(samples, async (i, m) => { options.onProgress?.(i / m); await new Promise(r => setTimeout(r, 0)); });
        const blob = await new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(Error('تعذر ترميز الصورة؛ حاول دقة أقل.')), 'image/png'); } catch (e) { reject(e); } });
        return { blob, width: canvas.width, height: canvas.height, samples: n, renderMs: Math.round(performance.now() - start) };
      } finally {
        renderer.setPixelRatio(pr); renderer.setSize(sz.x, sz.y, false); refiner.render(); refiner.start();
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}
