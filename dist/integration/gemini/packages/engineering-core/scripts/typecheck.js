import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { ClashDetectionEngine } from '../clash-detection/clash-detector.js';
import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';

console.log('>>> [typecheck:engineering-core] Verifying ESM syntax and contracts...');

function checkDir(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'fixtures') {
      count += checkDir(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      execSync('node --check "' + full + '"');
      count++;
    }
  }
  return count;
}

const checkedFiles = checkDir(path.resolve('.'));
if (typeof CoordinationOrchestrator.coordinate !== 'function') throw new Error('Missing coordinate');
if (typeof ClashDetectionEngine.detectClashes !== 'function') throw new Error('Missing detectClashes');
if (typeof EngineeringRulesRegistry.getAllRules !== 'function') throw new Error('Missing getAllRules');
if (typeof ClaudeGeometryAdapter.adapt !== 'function') throw new Error('Missing adapt');

console.log('>>> [typecheck:engineering-core] SUCCESS: ' + checkedFiles + ' files checked, 0 errors.');
process.exit(0);
