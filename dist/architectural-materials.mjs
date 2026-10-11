// Small deterministic surface maps; every material stays local to the 3D viewer.
export function architecturalTextures(T) {
  if (!T.CanvasTexture || !globalThis.document?.createElement) return {};
  const textures = {};
  let seed = 31;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const kind of ['stone', 'wood', 'fabric', 'tile']) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); if (!ctx) continue;
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 256, 256);
    const pixels = ctx.getImageData(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      let value = 245 + random() * 4;
      if (kind === 'wood') value = 246 + 2 * Math.sin(y * .32 + Math.sin(x * .025) * .45) + random() * 2;
      if (kind === 'fabric') value = 243 + (x % 3 === 0 || y % 3 === 0 ? -3 : 2) + random() * 2;
      if (kind === 'tile') value = x % 64 < 1 || y % 64 < 1 ? 235 : 247 + random() * 3;
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.repeat.set(1, 1);
    texture.anisotropy = 4;
    textures[kind] = texture;
  }
  return textures;
}

export function beveledBox(T, w, h, d, radius = .035) {
  const r = Math.min(radius, w / 5, h / 5, d / 5);
  if (!T.Shape || !T.ExtrudeGeometry) return new T.BoxGeometry(w, h, d);
  const shape = new T.Shape();
  shape.moveTo(r, r); shape.lineTo(w - r, r); shape.lineTo(w - r, h - r); shape.lineTo(r, h - r); shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: r, bevelThickness: r });
  geometry.translate(-w / 2, -h / 2, -d / 2 + r);
  return geometry;
}

// Box UVs use metres instead of stretching the same grain across every room.
// One 2.4m tile texture contains four 0.6m tiles per axis; this is a finish preview.
export function applyMeterTextureScale(geometry, metresPerRepeat = 2.4) {
  const { position, normal, uv } = geometry.attributes || {};
  if (!position || !normal || !uv || !(metresPerRepeat > 0)) return geometry;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const pair = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uv.setXY(i, pair[0] / metresPerRepeat, pair[1] / metresPerRepeat);
  }
  uv.needsUpdate = true; return geometry;
}
