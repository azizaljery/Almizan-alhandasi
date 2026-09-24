import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  GeometricEquations,
  AcousticComfort,
  MaintenancePrediction,
  SmartStorage,
  CustomerBenefits
} from '../src/index.js';

console.log('>>> [typecheck:engineering-math] Verifying ESM syntax and contracts...');

function checkDir(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      count += checkDir(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      execSync('node --check "' + full + '"');
      count++;
    }
  }
  return count;
}

const checkedFiles = checkDir(path.resolve('.'));
if (typeof GeometricEquations.areaRectangle !== 'function') throw new Error('Missing areaRectangle');
if (typeof GeometricEquations.slabThickness !== 'function') throw new Error('Missing slabThickness');
if (typeof GeometricEquations.coolingCapacityBTU !== 'function') throw new Error('Missing coolingCapacityBTU');
if (typeof AcousticComfort.calculateSRI !== 'function') throw new Error('Missing calculateSRI');
if (typeof CustomerBenefits.generateBillOfQuantities !== 'function') throw new Error('Missing generateBillOfQuantities');

console.log('>>> [typecheck:engineering-math] SUCCESS: ' + checkedFiles + ' files checked, 0 errors.');
process.exit(0);
