// A custom system uses exactly the same coordinates, identity, routing and export pipeline.
import { createEngineeringPackage, networkDiscipline } from '../src/index.mjs';
export async function withIrrigation(project) {
  const irrigation = networkDiscipline('irrigation', 'I', 'حدد الطلب المائي والضغط والأقطار والتغطية والصمامات من بيانات الموقع.');
  return createEngineeringPackage(project, { disciplines: ['electrical', 'hvac', 'plumbing', 'irrigation'], plugins: [irrigation] });
}
// project.services.irrigation = { devices: [...], connections: [...] }.
// This extension provides positioned devices and pathways; irrigation hydraulics must be added separately.
