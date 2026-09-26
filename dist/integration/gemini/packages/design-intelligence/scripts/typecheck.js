import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  DesignIntelligenceEngine,
  MACRO_PATTERNS,
  MICRO_PATTERNS,
  PatternCompatibilityEvaluator,
  ConceptDiversityEvaluator,
  KnowledgeQualityEvaluator,
  ProductionKnowledgeGate,
  ConfigurationRegistry,
  DEFAULT_CONFIG
} from '../index.js';

console.log('>>> [typecheck:design-intelligence] Verifying ESM syntax and contracts...');

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
if (typeof DesignIntelligenceEngine !== 'function') throw new Error('Missing DesignIntelligenceEngine');
if (!Array.isArray(MACRO_PATTERNS) || MACRO_PATTERNS.length !== 14) throw new Error('Macro patterns must be 14');
if (!Array.isArray(MICRO_PATTERNS) || MICRO_PATTERNS.length < 7) throw new Error('Micro patterns must be >= 7');
if (typeof PatternCompatibilityEvaluator.evaluate !== 'function') throw new Error('Missing compatibility evaluator');
if (typeof ConceptDiversityEvaluator.evaluate !== 'function') throw new Error('Missing diversity evaluator');
if (typeof KnowledgeQualityEvaluator.evaluateLibrary !== 'function') throw new Error('Missing quality evaluator');
if (typeof ProductionKnowledgeGate.verifyForProduction !== 'function') throw new Error('Missing production gate');
if (!(DEFAULT_CONFIG instanceof ConfigurationRegistry)) throw new Error('Invalid default config instance');

console.log('>>> [typecheck:design-intelligence] SUCCESS: ' + checkedFiles + ' files checked, 0 errors.');
process.exit(0);
