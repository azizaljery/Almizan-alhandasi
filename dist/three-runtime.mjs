// Shared pinned Three.js ESM runtime for the cinematic entrance and the real 3D viewer.
// r160 does not expose a global THREE via the obsolete build/three.min.js path.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let pending = null;

export async function loadThreeRuntime({ retry = false } = {}) {
  if (globalThis.THREE?.WebGLRenderer && globalThis.THREE?.Scene) return globalThis.THREE;
  if (retry) pending = null;
  if (!pending) {
    pending = import(THREE_URL).then(module => {
      if (!module?.WebGLRenderer || !module?.Scene || !module?.DirectionalLight) {
        throw Error('مكتبة العرض الثلاثي غير مكتملة.');
      }
      globalThis.THREE = module;
      return module;
    }).catch(error => {
      pending = null;
      throw Error('تعذّر تحميل مكتبة 3D. تأكد من الاتصال؛ مخطط 2D سيظل متاحًا.', { cause: error });
    });
  }
  return pending;
}

export const THREE_RUNTIME_VERSION = '0.160.0';
