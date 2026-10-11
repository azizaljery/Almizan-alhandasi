# Bounded relational rectangle search

Local producer: `2.4.0-relational-1`. `dist/claude/planner.mjs` and
`vendor/claude-planner/src/planner.mjs` are identical. Candidate producer
`sourceSha256` binds the exact distributed native planner module; it is not a
hash of the entire package. The adapter is `architectural-exploration/1.1.0`.

The optional third argument is:

```js
generateModel(plot, rooms, {
  search: { variant: 0, relationships: [
    { roomIds: ['room-3', 'room-0'], relation: 'near', weight: 1 }
  ] }
});
```

Variants 0–2 change row anchors, grouping, and branch structure inside the
existing `packWing` / `packZone` / `solveWing` solver. Search is bounded by 48
zone states, 1,800 packing visits, and 11 wing width trials. The near/far
objective uses projected doors, branches and the spine before final geometry
is selected. It is a soft heuristic, not proof of optimality. Unsupported
variants, references or shapes reject explicitly. No-search calls preserve
the established layout path; regression fixtures cover all four entry sides.

Public requests currently forward recognized dining-near/far-majlis wishes.
Every dining/majlis pair participates. This is not a general relationship
language or unrestricted floor-plan solver. Exact dimensions, rotation
permission, side and position remain constraints; generated geometry still
passes native validation, request verification, bound review and AZIZ.

Physical novelty uses verified shared walls and a rooted door/corridor graph.
Labels, IDs, translation, reflection and rotation do not earn novelty.
Unambiguous collinear corridor subdivisions are merged; unsupported or invalid
evidence cannot earn relationship novelty. The bounded graph refinement is a
heuristic descriptor, not a complete graph-isomorphism proof. Existing shape
and geometry metrics remain part of diversity selection.

Priority affects traversal only. History and pairwise similarity gates apply
to every candidate. Search exhaustion is not proof that other plans cannot
exist. No eligible new alternative leaves previous alternatives untouched.
