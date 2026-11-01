import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const lines = (await readFile(resolve(root, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
let checked = 0;
for (const line of lines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line); if (!match) throw new Error('INVALID_MANIFEST_LINE');
  const path = resolve(root, match[2]), rel = relative(root, path);
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('UNSAFE_MANIFEST_PATH');
  if ((await stat(path)).size > 50000000) throw new Error('FILE_TOO_LARGE');
  const actual = createHash('sha256').update(await readFile(path)).digest('hex');
  if (actual !== match[1]) throw new Error('HASH_MISMATCH: ' + match[2]); checked++;
}
console.log(JSON.stringify({ status: 'PASS', filesVerified: checked }));
