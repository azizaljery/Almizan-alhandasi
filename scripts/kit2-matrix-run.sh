#!/usr/bin/env bash
# (الجولة 21 — 02c/01b، أداة قياس) تشغيل تشكيل واحد بالحدود نفسها لـ PROPOSAL.md §3: C1–C10 وH1–H10 (diagnose-r21) ثم بذرة التطوير dev
# (coverage-r21 --seed dev، 40 طلبًا). لا يشغّل بذرة التقييم ولا H11–H15.
#   scripts/kit2-matrix-run.sh <label> <engine-root> [R14_OFF]
set -e
label="$1"; root="$2"; off="${3:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$here/evidence/diagnosis-r21/proposal-matrix/$label" "$here/evidence/coverage-r21/proposal-matrix"
for c in main:C1 main:C2 main:C3 main:C4 main:C5 main:C6 main:C7 main:C8 main:C9 main:C10 heldout:H1 heldout:H2 heldout:H3 heldout:H4 heldout:H5 heldout2:H6 heldout2:H7 heldout2:H8 heldout2:H9 heldout2:H10; do
  set_="${c%%:*}"; id="${c##*:}"
  R14_OFF="$off" node "$here/scripts/diagnose-r21.mjs" "$set_" "$id" --root "$root" --label "kx-$label" > /dev/null 2>&1 || echo "fail $id"
  mv "$here/evidence/diagnosis-r21/kx-$label/$set_-$id.json" "$here/evidence/diagnosis-r21/proposal-matrix/$label/$set_-$id.json"
done
rmdir "$here/evidence/diagnosis-r21/kx-$label" 2>/dev/null || true
R14_OFF="$off" node "$here/scripts/coverage-r21.mjs" "kx-$label" --seed dev --root "$root" > "$here/evidence/coverage-r21/proposal-matrix/$label-dev.log" 2>&1
mv "$here/evidence/coverage-r21/kx-$label-dev.json" "$here/evidence/coverage-r21/proposal-matrix/$label-dev.json"
echo "done $label"
