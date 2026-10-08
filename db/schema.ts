import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const archiveDesigns = sqliteTable('archive_designs', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  title: text('title').notNull(),
  currentVersion: integer('current_version').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => ({
  ownerIdUnique: uniqueIndex('uq_archive_designs_id_owner').on(table.id, table.ownerUserId),
  ownerUpdated: index('idx_archive_designs_owner_updated').on(table.ownerUserId, table.updatedAt),
  versionPositive: check('ck_archive_designs_current_version', sql`${table.currentVersion} >= 1`),
  titleLength: check('ck_archive_designs_title_length', sql`length(${table.title}) BETWEEN 1 AND 120`),
}));

export const archiveDesignVersions = sqliteTable('archive_design_versions', {
  designId: text('design_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  projectSnapshotJson: text('project_snapshot_json').notNull(),
  exactModelJson: text('exact_model_json').notNull(),
  noveltyGeometryJson: text('novelty_geometry_json').notNull(),
  exactGeometryHash: text('exact_geometry_hash'),
  topologyJson: text('topology_json').notNull(),
  decisionTraceJson: text('decision_trace_json').notNull(),
  noveltyHash: text('novelty_hash').notNull(),
  geometryPolicyVersion: text('geometry_policy_version').notNull(),
  engineVersion: text('engine_version').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => ({
  pk: primaryKey({ name: 'pk_archive_design_versions', columns: [table.designId, table.versionNumber] }),
  parent: foreignKey({ name: 'fk_archive_versions_design_owner', columns: [table.designId, table.ownerUserId], foreignColumns: [archiveDesigns.id, archiveDesigns.ownerUserId] }).onDelete('cascade'),
  versionPositive: check('ck_archive_versions_version_number', sql`${table.versionNumber} >= 1`),
}));

// A novelty reservation survives edits and deletion. Active reservations retain the owner/design
// only so that the same design can restore one of its own historical geometries. Delete turns
// every reservation into a tombstone by clearing those identifiers; no model geometry is stored.
export const archiveGeometryClaims = sqliteTable('archive_geometry_claims', {
  noveltyHash: text('novelty_hash').primaryKey(),
  ownerUserId: text('owner_user_id'),
  designId: text('design_id'),
  createdAt: integer('created_at').notNull(),
  tombstonedAt: integer('tombstoned_at'),
}, table => ({
  ownerDesignIdx: index('idx_archive_claims_owner_design').on(table.ownerUserId, table.designId),
  tombstoneState: check('ck_archive_claim_tombstone_state', sql`(${table.ownerUserId} IS NOT NULL AND ${table.designId} IS NOT NULL AND ${table.tombstonedAt} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.designId} IS NULL AND ${table.tombstonedAt} IS NOT NULL)`),
}));

export const archiveReceipts = sqliteTable('archive_receipts', {
  receiptId: text('receipt_id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  designId: text('design_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  noveltyHash: text('novelty_hash').notNull(),
  exactGeometryHash: text('exact_geometry_hash').notNull(),
  geometryPolicyVersion: text('geometry_policy_version').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => ({
  designVersion: foreignKey({ name: 'fk_archive_receipt_version', columns: [table.designId, table.versionNumber], foreignColumns: [archiveDesignVersions.designId, archiveDesignVersions.versionNumber] }).onDelete('cascade'),
  ownerDesign: foreignKey({ name: 'fk_archive_receipt_design_owner', columns: [table.designId, table.ownerUserId], foreignColumns: [archiveDesigns.id, archiveDesigns.ownerUserId] }).onDelete('cascade'),
  ownerVersion: index('idx_archive_receipts_owner_version').on(table.ownerUserId, table.designId, table.versionNumber),
}));

export const archiveIdempotency = sqliteTable('archive_idempotency', {
  ownerUserId: text('owner_user_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  operation: text('operation').notNull(),
  targetDesignId: text('target_design_id').notNull(),
  expectedVersion: integer('expected_version').notNull(),
  requestHash: text('request_hash').notNull(),
  designId: text('design_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => ({
  pk: primaryKey({ name: 'pk_archive_idempotency', columns: [table.ownerUserId, table.idempotencyKey] }),
  designVersion: foreignKey({ name: 'fk_archive_idempotency_version_owner', columns: [table.designId, table.versionNumber], foreignColumns: [archiveDesignVersions.designId, archiveDesignVersions.versionNumber] }).onDelete('cascade'),
  ownerDesignIdx: index('idx_archive_idempotency_owner_design').on(table.ownerUserId, table.designId),
  keyLength: check('ck_archive_idempotency_key_length', sql`length(${table.idempotencyKey}) BETWEEN 16 AND 100`),
  operationAllowed: check('ck_archive_idempotency_operation', sql`${table.operation} IN ('create', 'update')`),
}));
