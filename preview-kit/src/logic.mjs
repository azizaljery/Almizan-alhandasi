export const DEFAULT_ISSUES = Object.freeze([
  { id: 'H3', title: 'H3: لا يوجد مخطط صالح يحقق جميع المتطلبات', state: 'open' },
  { id: 'PENDING_4', title: 'أربعة اختبارات قبول معلّقة (الدوران H4، التنوع C10، مسار الضيف، وصول السيارة)', state: 'open' },
  { id: 'DIMENSIONS', title: 'الأبعاد الصافية: إصلاح جزئي يحتاج تحققًا', state: 'unverified' },
  { id: 'PRIVACY_C9', title: 'الخصوصية وتغيّر حكم C9: المراجعة لم تُحسم', state: 'unverified' },
  { id: 'C6_REGULATIONS', title: 'ستارة الخصوصية C6: المطابقة النظامية غير متحققة', state: 'unverified' },
  { id: 'INDEPENDENT_TESTS', title: 'نتيجة الاختبارات المستقلة: تُحدّث فقط عند وصول رمز خروج موثّق', state: 'pending' }
]);
export const STATES = new Set(['open', 'unverified', 'pending', 'resolved']);
export function validateStatus(config) {
  if (!config || typeof config !== 'object') throw new Error('Missing preview status configuration');
  if (config.preview !== true || config.releaseApproved !== false) throw new Error('Preview must be enabled and final release unapproved');
  if (!Array.isArray(config.allowedHosts) || !config.allowedHosts.length || config.allowedHosts.some(h => typeof h !== 'string' || !h.trim())) throw new Error('allowedHosts required');
  if (!Array.isArray(config.issues) || config.issues.length === 0) throw new Error('issues required');
  for (const i of config.issues) {
    if (!i || typeof i.id !== 'string' || typeof i.title !== 'string' || !STATES.has(i.state)) throw new Error('Invalid issue');
  }
  if (config.independentTests?.state === 'passed') {
    if (!Number.isInteger(config.independentTests.exitCode) || config.independentTests.exitCode !== 0 || !config.independentTests.evidence) {
      throw new Error('Independent tests cannot pass without exit code 0 and evidence');
    }
  }
  return config;
}
export function isAllowedHost(config, hostname) {
  return config.allowedHosts.some(h => h.toLowerCase() === String(hostname).toLowerCase());
}
export function issueCounts(config) {
  return config.issues.reduce((acc, item) => { acc[item.state] = (acc[item.state] || 0) + 1; return acc; }, {});
}
