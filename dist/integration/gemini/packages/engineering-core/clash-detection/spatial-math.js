export function getPolygonAABB2D(points) {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }

  return { minX, minY, maxX, maxY };
}

export function aabbIntersects2D(boxA, boxB, tolerance = 0) {
  return (
    boxA.minX - tolerance < boxB.maxX &&
    boxA.maxX + tolerance > boxB.minX &&
    boxA.minY - tolerance < boxB.maxY &&
    boxA.maxY + tolerance > boxB.minY
  );
}

export function aabbIntersects3D(a, b) {
  const xOverlap = a.minX < b.maxX && a.maxX > b.minX;
  const yOverlap = a.minY < b.maxY && a.maxY > b.minY;
  const zOverlap = a.minZ < b.maxZ && a.maxZ > b.minZ;
  return xOverlap && yOverlap && zOverlap;
}

export function getPolygonCentroid2D(points) {
  if (!points || points.length === 0) return [0, 0];
  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt[0];
    sumY += pt[1];
  }
  return [sumX / points.length, sumY / points.length];
}

export function distance2D(p1, p2) {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}
