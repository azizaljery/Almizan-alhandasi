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
      let value = 230 + random() * 18;
      if (kind === 'wood') value = 211 + 18 * Math.sin(y * .17 + Math.sin(x * .035) * .7) + random() * 12;
      if (kind === 'fabric') value = 220 + (x % 3 === 0 || y % 3 === 0 ? -14 : 8) + random() * 14;
      if (kind === 'tile') value = x % 64 < 2 || y % 64 < 2 ? 178 : 239 + random() * 10;
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    if (kind === 'wood') texture.repeat.set(2, 3);
    if (kind === 'fabric') texture.repeat.set(3, 3);
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
