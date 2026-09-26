#!/usr/bin/env node
// ast-equal.mjs -- proves two JS files have identical executable structure.
// Ignores: comments / JSDoc (types live there) and ParenthesizedExpression wrappers
// (a JSDoc cast needs `/** @type {T} */ (expr)`; tree nesting still encodes precedence).
// Usage: node tools/ast-equal.mjs <before.mjs> <after.mjs>   -> exit 0 if equal, 1 if not.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
/** @type {typeof import('typescript')} */
let ts;
try { ts = require('typescript'); } catch { ts = require(execSync('npm root -g').toString().trim() + '/typescript'); }

/** @param {string} file @returns {string[]} */
function signature(file) {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {string[]} */
  const out = [];
  /** @param {import('typescript').Node} node @returns {void} */
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.ParenthesizedExpression) return visit(/** @type {import('typescript').ParenthesizedExpression} */ (node).expression);
    const leaf = ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node) || node.kind === ts.SyntaxKind.BigIntLiteral
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    out.push('(' + ts.SyntaxKind[node.kind] + (leaf ? ':' + /** @type {import('typescript').Identifier | import('typescript').LiteralLikeNode} */ (node).text : ''));
    if (ts.isBinaryExpression(node)) out.push('op:' + ts.SyntaxKind[node.operatorToken.kind]);
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) out.push('op:' + ts.SyntaxKind[node.operator]);
    ts.forEachChild(node, visit);
    out.push(')');
  };
  visit(src);
  return out;
}

const [a, b] = process.argv.slice(2);
const sa = signature(a), sb = signature(b);
const n = Math.min(sa.length, sb.length);
let i = 0;
while (i < n && sa[i] === sb[i]) i++;
if (i === n && sa.length === sb.length) { console.log(`AST-EQUAL ${a} == ${b} (${sa.length} nodes)`); process.exit(0); }
console.error(`AST-DIFF at token ${i}:\n  before: ${sa.slice(i, i + 6).join(' ')}\n  after:  ${sb.slice(i, i + 6).join(' ')}`);
process.exit(1);
