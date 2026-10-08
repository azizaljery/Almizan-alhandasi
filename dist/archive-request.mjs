/** Stable identity for retrying one archive write after an unknown network outcome. */
export function archiveRequestSignature({ url, method, targetDesignId = '', expectedVersion = null, title, project }) {
  return JSON.stringify({
    url: String(url),
    action: String(method).toUpperCase(),
    targetDesignId: targetDesignId || null,
    expectedVersion: expectedVersion ?? null,
    payload: { title: String(title), project: String(project) },
  });
}

export function pendingArchiveKey(pending, signature, createKey) {
  if (pending?.key && pending.signature === signature) return { key: pending.key, signature };
  return { key: createKey(), signature };
}
