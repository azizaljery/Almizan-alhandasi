import { runMultiEngineDesign } from '../../dist/multi-engine.mjs';
import { defaultRooms, validatePlot } from '../../dist/planner.mjs';

const plot = validatePlot({
  width: 20, length: 30, floors: 1, entry: 's',
  streets: { n: false, s: true, e: false, w: false },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
});
const rooms = defaultRooms();
const cases = [
  {
    idea: 'أريد مدخل ضيوف مستقل وخصوصية عالية للعائلة.',
    discovery: { likes: ['classic_living'], rejects: [], avoids: ['الضوضاء'], life: { children: 'مساحة آمنة' } },
    briefContext: { topPriorities: ['الخصوصية'] },
  },
  {
    idea: 'أريد حركة عائلية مفتوحة ومساحات يومية مرنة.',
    discovery: { likes: ['family_layout'], rejects: [], avoids: ['الصيانة'], life: { elders: 'سهولة الحركة' } },
    briefContext: { topPriorities: ['الضوء الطبيعي'] },
  },
];
const outputs = [];
for (const request of cases) outputs.push(await runMultiEngineDesign({ plot, rooms: structuredClone(rooms), ...request, seed: 31 }));
const differentSeed = await runMultiEngineDesign({ plot, rooms: structuredClone(rooms), ...cases[0], seed: 32 });
const layouts = result => result.models.map(model => ({ hash: model.integration.geometryHash.value, shape: model.shape })).sort((a, b) => a.hash.localeCompare(b.hash));
const summary = {
  sameCandidateGeometrySet: JSON.stringify(layouts(outputs[0])) === JSON.stringify(layouts(outputs[1])),
  candidateCount: outputs.map(result => result.models.length),
  selectedSameGeometry: outputs[0].selectedModel.integration.geometryHash.value === outputs[1].selectedModel.integration.geometryHash.value,
  differentSeedSelectedSameGeometry: outputs[0].selectedModel.integration.geometryHash.value === differentSeed.selectedModel.integration.geometryHash.value,
  selectedShapes: outputs.map(result => result.selectedModel.shape),
  firstPreferenceSet: outputs[0].request.softPreferences.map(item => item.id),
  secondPreferenceSet: outputs[1].request.softPreferences.map(item => item.id),
  azizNotes: outputs[0].aziz?.decision?.reasons || outputs[0].decision.reasons,
  repeatability: 'same plot, room program, seed, and candidate-generation path; only narrative/preferences differ',
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
