// Reusable "full algorithm transparency" disclosure panel.
//
// Every computed indicator or score the app shows a user must be able to
// describe itself with six fields: (1) its name, (2) its inputs with units,
// (3) its formula and the formula's version, (4) the result and what it
// actually changes in the design, (5) its assumptions and any missing data
// it had to guess around, and (6) its known limits and the cases it has
// actually been tested against. This module holds no scoring logic of its
// own — it only renders that disclosure, honestly, as an expandable HTML
// block the producing module's caller can drop under any indicator card.
//
// It never prints a confidence/accuracy number: a producer that cannot
// calibrate confidence should omit it or say so in `limits`, not invent a
// number here. Styled with the app's existing .review-notes/.review-list/
// .help/.subhead classes (see dist/planner.css), so this needs no new CSS.

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const asList = value => Array.isArray(value) ? value.filter(part => part !== null && part !== undefined && part !== '') : (value ? [value] : []);

// Accepts either a plain string or { label, value, unit } for an input row.
function normalizeInput(item) {
  if (item && typeof item === 'object') return { label: String(item.label ?? ''), value: item.value, unit: item.unit };
  return { label: String(item ?? ''), value: undefined, unit: undefined };
}

export function normalizeTransparency(spec = {}) {
  return {
    name: String(spec.name || 'مؤشر غير مُسمّى'),
    inputs: asList(spec.inputs).map(normalizeInput),
    formula: String(spec.formula || ''),
    formulaVersion: String(spec.formulaVersion || 'غير مُسجَّلة'),
    hasResult: spec.result !== undefined && spec.result !== null,
    result: spec.result,
    effect: String(spec.effect || ''),
    assumptions: asList(spec.assumptions),
    missingData: asList(spec.missingData),
    limits: asList(spec.limits),
    testedCases: asList(spec.testedCases),
  };
}

function renderList(items, emptyText) {
  if (!items.length) return `<p class="help">${escapeHTML(emptyText)}</p>`;
  return `<ul class="review-list">${items.map(text => `<li>${escapeHTML(text)}</li>`).join('')}</ul>`;
}

function renderInputs(inputs) {
  if (!inputs.length) return `<p class="help">لا تتوفر مدخلات رقمية مباشرة مسجّلة لهذا المؤشر.</p>`;
  return `<ul class="review-list">${inputs.map(({ label, value, unit }) =>
    `<li><b>${escapeHTML(label)}</b>${value !== undefined ? `: ${escapeHTML(value)}${unit ? ' ' + escapeHTML(unit) : ''}` : ''}</li>`
  ).join('')}</ul>`;
}

// Builds the full six-field disclosure as one <details> block.
export function renderTransparencyPanel(spec) {
  const t = normalizeTransparency(spec);
  const assumptionsAndMissing = [
    ...t.assumptions.map(value => `افتراض: ${value}`),
    ...t.missingData.map(value => `بيانات ناقصة قُدِّر حولها: ${value}`),
  ];
  const limitsAndTests = [
    ...t.limits.map(value => `حد معروف: ${value}`),
    ...t.testedCases.map(value => `اختُبر مقابل: ${value}`),
  ];
  return [
    `<details class="review-notes transparency-panel">`,
    `<summary>كيف حُسب «${escapeHTML(t.name)}»؟</summary>`,
    `<h3 class="subhead">المدخلات (مع الوحدات)</h3>`,
    renderInputs(t.inputs),
    `<h3 class="subhead">المعادلة ونسختها</h3>`,
    `<p class="help">${escapeHTML(t.formula || 'لم تُسجَّل صيغة نصية لهذا المؤشر.')}</p>`,
    `<p class="help">نسخة المعادلة: ${escapeHTML(t.formulaVersion)}</p>`,
    `<h3 class="subhead">النتيجة وأثرها على التصميم</h3>`,
    t.hasResult ? `<p class="help">النتيجة: ${escapeHTML(t.result)}</p>` : '',
    `<p class="help">${escapeHTML(t.effect || 'لم يُسجَّل أثر محدد لهذا المؤشر على القرار.')}</p>`,
    `<h3 class="subhead">الافتراضات والبيانات الناقصة</h3>`,
    renderList(assumptionsAndMissing, 'لا افتراضات أو بيانات ناقصة مسجّلة لهذا الفحص.'),
    `<h3 class="subhead">الحدود وحالات الاختبار</h3>`,
    renderList(limitsAndTests, 'لم تُسجَّل حدود أو حالات اختبار صريحة لهذا المؤشر بعد.'),
    `</details>`,
  ].join('');
}

export { escapeHTML };
