# Import-layer requirement: stored models and courtyard roof states

Applies to any code that loads a model it did not just receive from `generateModel()`
(local storage, exported JSON, server copies, undo history persisted across sessions).

## IR-M1 -- One entry point

A stored model MUST be loaded through `importModel(stored)` (src/migrations.mjs).
`importModel` = `migrateModel` (upgrade) + `validateModel` (the unchanged validator).
It returns `{ model, applied }` or throws an Arabic `Error`. Callers MUST NOT:

- call `validateModel` on a stored model without migrating it first (v2.1.x U models fail);
- catch the error and use the stored model anyway;
- edit `validateModel` or relax its rules to accept old data.

## IR-M2 -- What migration may change (exhaustive)

| Stored state | Result |
|---|---|
| courtyard has `roofPolicy` | unchanged (the validator decides) |
| courtyard has no `roofPolicy`, `roofable === false` (v2.1.x) | `roofPolicy = 'OPEN_TO_SKY'`, recorded in `applied` |
| courtyard has no `roofPolicy`, `roofable` true or missing | throws -- not upgradable without guessing |
| `version !== 2`, or not an object | throws |

Nothing else is touched: no geometry, areas, ids or warnings. The input is never mutated.
`applied` SHOULD be logged; an empty array means the model was already current.

## IR-M3 -- Persist only the migrated model

After a successful import, persist `model` (which has `roofPolicy`), never the original.

## IR-M4 -- Roof states: implemented vs reserved

Runtime table: `ROOF_POLICY_SUPPORT` (src/planner.mjs).

| roofPolicy | status | engine emits | quantities() | viewers |
|---|---|---|---|---|
| OPEN_TO_SKY | implemented | yes | excluded from footprint | render as open void |
| PARTIALLY_COVERED | reserved | no | throws | no rendering requirement |
| COVERED_ATRIUM | reserved | no | throws | no rendering requirement |

A reserved value is schema-valid (`validateModel` accepts it when `roofable` is consistent), so a
future engine can emit it without a schema break. Until it is implemented, a viewer that meets one
MUST NOT silently draw it as open or roofed; show it as unsupported. Pricing (`quantities`,
`quantityRows`, `estimate`) refuses such models with an explicit error rather than a wrong number.

## Acceptance (tests/hardening.test.mjs, H04-H05)

- a v2.1.x U model imports, reports one applied change, validates, and deep-equals a fresh model;
- a legacy courtyard with `roofable: true` and no `roofPolicy` is refused;
- the stored input is unchanged after import;
- `quantities()` throws for reserved and for missing roof states.
