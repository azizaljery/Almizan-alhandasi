// Shared contract between the browser client (assistant-client.mjs) and the Worker (worker/server.mjs)
// for POST /api/assistant/drawing. Pure, strict, no I/O.
//   * input  : { question, digest, reviewIssues? }  -> validateDrawingInput
//   * output : the forced tool call `submit_drawing_answer` { answer, suggestions[], commands[] } -> validateDrawingAnswer
// Commands are restricted to a SAFE whitelist (nothing that deletes, moves, rotates or batches).
import { ROOM_TYPES, OPENING_KINDS, FIXTURES } from './catalog.mjs';

export const ANSWER_TOOL = 'submit_drawing_answer';
export const SAFE_COMMAND_TYPES = Object.freeze(['add-opening', 'add-fixture', 'update', 'flip-opening', 'add-label', 'add-level', 'close-gap']);
export const LIMITS = Object.freeze({ question: 800, answer: 1500, suggestions: 6, suggestion: 200, commands: 12, digestBytes: 24000, issues: 40, issueMessage: 400, levels: 8, roomsPerLevel: 80, name: 60 });

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const idOk = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(v);
const ROOM_KEYS = Object.keys(ROOM_TYPES), OPENING_KEYS = Object.keys(OPENING_KINDS), FIXTURE_KEYS = Object.keys(FIXTURES);
const COORD = 2000;

const num = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const point = { type: 'object', additionalProperties: false, properties: { x: num(-COORD, COORD), y: num(-COORD, COORD) }, required: ['x', 'y'] };
const PATCH_PROPS = {
  name: { type: 'string', maxLength: LIMITS.name }, type: { type: 'string', enum: ROOM_KEYS }, t: num(0.05, 1),
  kind: { type: 'string', enum: [...OPENING_KEYS, ...FIXTURE_KEYS] }, at: num(0, 400), w: num(0.3, 8),
  swing: { type: 'string', enum: ['in', 'out'] }, hinge: { type: 'string', enum: ['left', 'right'] }, entry: { type: 'boolean' },
  x: num(-COORD, COORD), y: num(-COORD, COORD), rot: num(-7, 7),
};
export const COMMAND_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    type: { type: 'string', enum: SAFE_COMMAND_TYPES },
    wall: { type: 'string', maxLength: 16 }, id: { type: 'string', maxLength: 16 }, level: { type: 'string', maxLength: 16 }, copyFrom: { type: 'string', maxLength: 16 },
    kind: { type: 'string', enum: [...OPENING_KEYS, ...FIXTURE_KEYS] }, roomType: { type: 'string', enum: ROOM_KEYS },
    at: num(0, 400), w: num(0.3, 8), swing: { type: 'string', enum: ['in', 'out'] }, hinge: { type: 'string', enum: ['left', 'right'] }, entry: { type: 'boolean' },
    x: num(-COORD, COORD), y: num(-COORD, COORD), rot: num(-7, 7), height: num(2, 8),
    name: { type: 'string', maxLength: LIMITS.name }, what: { type: 'string', enum: ['swing', 'hinge'] },
    seed: point, from: point, to: point,
    patch: { type: 'object', additionalProperties: false, properties: PATCH_PROPS },
  },
  required: ['type'],
};
export const ANSWER_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    answer: { type: 'string', maxLength: LIMITS.answer },
    suggestions: { type: 'array', maxItems: LIMITS.suggestions, items: { type: 'string', maxLength: LIMITS.suggestion } },
    commands: { type: 'array', maxItems: LIMITS.commands, items: COMMAND_SCHEMA },
  },
  required: ['answer', 'suggestions', 'commands'],
};

const bad = () => { throw new Error('invalid_answer'); };
const exact = (obj, allowed, required) => {
  if (!record(obj)) bad();
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) bad();
  for (const k of required) if (obj[k] === undefined) bad();
};
const pt = p => { exact(p, ['x', 'y'], ['x', 'y']); if (!finite(p.x, -COORD, COORD) || !finite(p.y, -COORD, COORD)) bad(); return { x: p.x, y: p.y }; };
const PATCH_CHECK = {
  name: v => typeof v === 'string' && v.trim() && v.length <= LIMITS.name, type: v => ROOM_KEYS.includes(v), t: v => finite(v, 0.05, 1),
  kind: v => OPENING_KEYS.includes(v) || FIXTURE_KEYS.includes(v), at: v => finite(v, 0, 400), w: v => finite(v, 0.3, 8),
  swing: v => v === 'in' || v === 'out', hinge: v => v === 'left' || v === 'right', entry: v => typeof v === 'boolean',
  x: v => finite(v, -COORD, COORD), y: v => finite(v, -COORD, COORD), rot: v => finite(v, -7, 7),
};

/** Strictly validate ONE model-proposed command; returns a clean copy or throws Error('invalid_answer'). */
export function validateCommand(c) {
  if (!record(c) || !SAFE_COMMAND_TYPES.includes(c.type)) bad();
  switch (c.type) {
    case 'add-opening': {
      exact(c, ['type', 'wall', 'kind', 'at', 'w', 'swing', 'hinge', 'entry'], ['wall', 'kind']);
      if (!idOk(c.wall) || !OPENING_KEYS.includes(c.kind)) bad();
      const out = { type: c.type, wall: c.wall, kind: c.kind };
      if (c.at !== undefined) { if (!finite(c.at, 0, 400)) bad(); out.at = c.at; }
      if (c.w !== undefined) { if (!finite(c.w, 0.3, 8)) bad(); out.w = c.w; }
      if (c.swing !== undefined) { if (!PATCH_CHECK.swing(c.swing)) bad(); out.swing = c.swing; }
      if (c.hinge !== undefined) { if (!PATCH_CHECK.hinge(c.hinge)) bad(); out.hinge = c.hinge; }
      if (c.entry !== undefined) { if (typeof c.entry !== 'boolean') bad(); out.entry = c.entry; }
      return out;
    }
    case 'add-fixture': {
      exact(c, ['type', 'level', 'kind', 'x', 'y', 'rot'], ['level', 'kind', 'x', 'y']);
      if (!idOk(c.level) || !FIXTURE_KEYS.includes(c.kind) || !finite(c.x, -COORD, COORD) || !finite(c.y, -COORD, COORD)) bad();
      if (c.rot !== undefined && !finite(c.rot, -7, 7)) bad();
      return { type: c.type, level: c.level, kind: c.kind, x: c.x, y: c.y, ...(c.rot !== undefined ? { rot: c.rot } : {}) };
    }
    case 'update': {
      exact(c, ['type', 'id', 'patch'], ['id', 'patch']);
      if (!idOk(c.id) || !record(c.patch)) bad();
      const keys = Object.keys(c.patch);
      if (!keys.length || keys.length > 6) bad();
      const patch = {};
      for (const k of keys) { if (!Object.hasOwn(PATCH_CHECK, k) || !PATCH_CHECK[k](c.patch[k])) bad(); patch[k] = typeof c.patch[k] === 'string' ? c.patch[k].trim() : c.patch[k]; }
      return { type: c.type, id: c.id, patch };
    }
    case 'flip-opening': {
      exact(c, ['type', 'id', 'what'], ['id']);
      if (!idOk(c.id) || (c.what !== undefined && c.what !== 'swing' && c.what !== 'hinge')) bad();
      return { type: c.type, id: c.id, ...(c.what ? { what: c.what } : {}) };
    }
    case 'add-label': {
      exact(c, ['type', 'level', 'name', 'roomType', 'seed'], ['level', 'roomType', 'seed']);
      if (!idOk(c.level) || !ROOM_KEYS.includes(c.roomType)) bad();
      if (c.name !== undefined && (typeof c.name !== 'string' || !c.name.trim() || c.name.length > LIMITS.name)) bad();
      return { type: c.type, level: c.level, roomType: c.roomType, seed: pt(c.seed), ...(c.name !== undefined ? { name: c.name.trim() } : {}) };
    }
    case 'add-level': {
      exact(c, ['type', 'name', 'height', 'copyFrom'], []);
      if (c.name !== undefined && (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40)) bad();
      if (c.height !== undefined && !finite(c.height, 2, 8)) bad();
      if (c.copyFrom !== undefined && !idOk(c.copyFrom)) bad();
      return { type: c.type, ...(c.name !== undefined ? { name: c.name.trim() } : {}), ...(c.height !== undefined ? { height: c.height } : {}), ...(c.copyFrom !== undefined ? { copyFrom: c.copyFrom } : {}) };
    }
    case 'close-gap': {
      exact(c, ['type', 'level', 'from', 'to'], ['level', 'from', 'to']);
      if (!idOk(c.level)) bad();
      return { type: c.type, level: c.level, from: pt(c.from), to: pt(c.to) };
    }
  }
  return bad();
}

/** Strictly validate the tool output. Unknown / extra fields, bad numbers, too many items -> Error('invalid_answer'). */
export function validateDrawingAnswer(raw) {
  exact(raw, ['answer', 'suggestions', 'commands'], ['answer', 'suggestions', 'commands']);
  if (typeof raw.answer !== 'string' || !raw.answer.trim() || raw.answer.length > LIMITS.answer) bad();
  if (!Array.isArray(raw.suggestions) || raw.suggestions.length > LIMITS.suggestions || raw.suggestions.some(s => typeof s !== 'string' || !s.trim() || s.length > LIMITS.suggestion)) bad();
  if (!Array.isArray(raw.commands) || raw.commands.length > LIMITS.commands) bad();
  return { answer: raw.answer.trim(), suggestions: raw.suggestions.map(s => s.trim()), commands: raw.commands.map(validateCommand) };
}

// ------------------------------------------------------------------ request side
const badInput = () => { throw new Error('invalid_input'); };
function sanitize(v, state, depth = 0) {
  if (++state.nodes > 5000 || depth > 7) badInput();
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) badInput(); return v; }
  if (typeof v === 'string') { if (v.length > 200) badInput(); return v; }
  if (Array.isArray(v)) { if (v.length > 400) badInput(); return v.map(x => sanitize(x, state, depth + 1)); }
  if (record(v)) {
    const keys = Object.keys(v);
    if (keys.length > 120) badInput();
    const out = {};
    for (const k of keys) { if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k.length > 40) badInput(); out[k] = sanitize(v[k], state, depth + 1); }
    return out;
  }
  return badInput();
}

/** Shape-check and copy a Digest (see dist/draw/digest.mjs). Throws Error('invalid_input'). */
export function validateDigest(d) {
  if (!record(d) || d.schema !== 'mizan-digest/1') badInput();
  let size; try { size = new TextEncoder().encode(JSON.stringify(d)).length; } catch { badInput(); }
  if (size > LIMITS.digestBytes) { const e = new Error('digest_too_large'); throw e; }
  if (!Array.isArray(d.levels) || d.levels.length < 1 || d.levels.length > LIMITS.levels) badInput();
  for (const lv of d.levels) {
    if (!record(lv) || !idOk(lv.id) || typeof lv.name !== 'string' || lv.name.length > 80 || !Array.isArray(lv.rooms) || lv.rooms.length > LIMITS.roomsPerLevel) badInput();
    for (const r of lv.rooms) if (!record(r) || typeof r.id !== 'string' || r.id.length > 24 || typeof r.name !== 'string' || r.name.length > 80 || !ROOM_KEYS.includes(r.type) || !finite(r.area, 0, 100000)) badInput();
  }
  if (!record(d.totals) || !record(d.counts) || !record(d.drawingState)) badInput();
  return sanitize(d, { nodes: 0 });
}

/** { question, digest, reviewIssues? } -> clean copy; Error('invalid_input' | 'digest_too_large'). */
export function validateDrawingInput(body) {
  if (!record(body)) badInput();
  if (typeof body.question !== 'string') badInput();
  const question = body.question.trim();
  if (question.length < 2 || body.question.length > LIMITS.question) badInput();
  const digest = validateDigest(body.digest);
  let reviewIssues = [];
  if (body.reviewIssues !== undefined) {
    if (!Array.isArray(body.reviewIssues) || body.reviewIssues.length > LIMITS.issues) badInput();
    reviewIssues = body.reviewIssues.map(i => {
      if (!record(i) || typeof i.code !== 'string' || i.code.length > 40 || !['error', 'warning', 'info'].includes(i.severity) || typeof i.message !== 'string' || i.message.length > LIMITS.issueMessage) badInput();
      const ids = Array.isArray(i.targetIds) ? i.targetIds : [];
      if (ids.length > 10 || ids.some(x => typeof x !== 'string' || x.length > 24)) badInput();
      return { code: i.code, severity: i.severity, message: i.message, targetIds: [...ids] };
    });
  }
  return { question, digest, reviewIssues };
}

export default { ANSWER_TOOL, SAFE_COMMAND_TYPES, LIMITS, ANSWER_SCHEMA, COMMAND_SCHEMA, validateCommand, validateDrawingAnswer, validateDigest, validateDrawingInput };
