// migrations.mjs -- import-layer upgrades for models read from storage or exports.
// Rule: migration only fills a field whose value is provable from the stored data; it never
// guesses, never touches geometry or areas, never mutates its input, and never replaces
// validateModel(). importModel() = migrateModel() + validateModel(); it is the only supported
// way for an import layer to accept a stored model.
import { validateModel } from './planner.mjs';

/**
 * @typedef {import('./PlannerOutputContract.mjs').ValidatedDesignGeometry} ValidatedDesignGeometry
 * @typedef {import('./PlannerOutputContract.mjs').Rect} Rect
 * @typedef {import('./PlannerOutputContract.mjs').RoofPolicy} RoofPolicy
 * @typedef {Rect & { name: string, roofable?: boolean, roofPolicy?: RoofPolicy }} StoredCourtyard
 * @typedef {Omit<ValidatedDesignGeometry, 'courtyards'> & { courtyards?: StoredCourtyard[] }} StoredModel
 *   A model as it may exist in storage: v2.1.x U models have courtyards with roofable but no roofPolicy.
 */

/**
 * Upgrade a stored model to the current contract without validating it.
 * v2.1.x courtyard { roofable: false, no roofPolicy }  ->  roofPolicy 'OPEN_TO_SKY' (provable: v2.1 only built open courts).
 * A courtyard with no roofPolicy and roofable !== false cannot be upgraded without guessing -> throws.
 * @param {StoredModel} stored
 * @returns {{ model: ValidatedDesignGeometry, applied: string[] }} a new object; `applied` lists every change made
 * @throws {Error} Arabic message when the input is not an object, not version 2, or not upgradable without guessing
 */
export function migrateModel(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw Error('النموذج المستورد ليس كائناً صالحاً.');
  if (stored.version !== 2) throw Error('إصدار النموذج المستورد غير مدعوم: ' + String(stored.version) + '.');
  // JSON round-trip, not structuredClone: stored models are JSON anyway, and src stays free of host globals.
  /** @type {StoredModel} */
  const model = JSON.parse(JSON.stringify(stored));
  /** @type {string[]} */
  const applied = [];
  (model.courtyards || []).forEach((c, i) => {
    if (c.roofPolicy !== undefined) return;
    if (c.roofable === false) {
      c.roofPolicy = 'OPEN_TO_SKY';
      applied.push('courtyards[' + i + '].roofPolicy = OPEN_TO_SKY (v2.1.x: roofable false)');
      return;
    }
    throw Error('فناء قديم بلا roofPolicy ولا يمكن استنتاج حالة تسقيفه (roofable = ' + String(c.roofable) + ').');
  });
  // Shape only: every courtyard now has a roofPolicy. Validity is established by validateModel (see importModel).
  return { model: /** @type {ValidatedDesignGeometry} */ (model), applied };
}

/**
 * The supported import path: migrate, then validate with the unchanged validator.
 * @param {StoredModel} stored
 * @returns {{ model: ValidatedDesignGeometry, applied: string[] }}
 * @throws {Error} on migration failure or on the first validateModel() error
 */
export function importModel(stored) {
  const { model, applied } = migrateModel(stored);
  const errors = validateModel(model);
  if (errors.length) throw Error('النموذج المستورد غير صالح: ' + errors[0]);
  return { model, applied };
}
