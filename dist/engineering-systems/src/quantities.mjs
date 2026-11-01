export function quantities(disciplines, rates = {}) {
  const rows = new Map();
  const add = (key, discipline, kind, layer, unit, quantity) => {
    const row = rows.get(key) || { key, discipline, kind, layer, unit, quantity: 0, rate: null, amount: null };
    row.quantity += quantity; rows.set(key, row);
  };
  for (const d of disciplines) {
    for (const x of d.devices) add([d.id, x.kind, x.layer, 'each'].join(':'), d.id, x.kind, x.layer, 'each', 1);
    for (const r of d.routes) if (r.status === 'PROPOSED') add([d.id, r.kind, r.layer, r.widthM, r.heightM, 'm'].join(':'), d.id, r.kind + ` (${r.widthM}x${r.heightM}m envelope)`, r.layer, 'm', r.lengthM);
  }
  let pricedSubtotal = 0, unpricedCount = 0;
  for (const row of rows.values()) {
    const rate = rates[row.key];
    if (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0) { row.rate = rate; row.amount = row.quantity * rate; pricedSubtotal += row.amount; }
    else unpricedCount++;
  }
  return { basis: 'PRELIMINARY_POINT_COUNTS_AND_PROPOSED_CENTRELINES', rows: [...rows.values()], pricedSubtotal, unpricedCount, total: unpricedCount ? null : pricedSubtotal, includesFittingsWasteTaxOrContingency: false };
}
