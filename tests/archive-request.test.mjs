import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveRequestSignature, pendingArchiveKey } from '../dist/archive-request.mjs';

const request = overrides => ({
  url: '/api/archive/designs/design-1',
  method: 'PUT',
  targetDesignId: 'design-1',
  expectedVersion: 7,
  title: 'بيت العائلة',
  project: '{"savedAt":"","model":{"shape":"l"}}',
  ...overrides,
});

test('archive retry signature binds the URL, action, target, expected version, and full save payload', () => {
  const original = request(), signature = archiveRequestSignature(original);
  for (const change of [
    { url: '/api/archive/designs/design-2' },
    { method: 'POST' },
    { targetDesignId: 'design-2' },
    { expectedVersion: 8 },
    { title: 'بيت مختلف' },
    { project: '{"savedAt":"","model":{"shape":"u"}}' },
  ]) assert.notEqual(archiveRequestSignature(request(change)), signature, JSON.stringify(change));
  assert.equal(archiveRequestSignature(request()), signature);
});

test('lost-response retry reuses the same key only for the exact same save operation', () => {
  let keyCount = 0;
  const createKey = () => `stable-idempotency-key-${++keyCount}`;
  const signature = archiveRequestSignature(request());
  const first = pendingArchiveKey({}, signature, createKey);
  const afterLostResponse = pendingArchiveKey(first, signature, createKey);
  assert.equal(first.key, afterLostResponse.key);
  assert.equal(keyCount, 1);

  const changedRequest = archiveRequestSignature(request({ expectedVersion: 8 }));
  const changed = pendingArchiveKey(afterLostResponse, changedRequest, createKey);
  assert.notEqual(changed.key, first.key);
  assert.equal(keyCount, 2);
});
