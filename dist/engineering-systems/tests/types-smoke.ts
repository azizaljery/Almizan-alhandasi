import { createEngineeringPackage, createAgentActions, equations, type Project, type Result } from '../src/index.mjs';
declare const project: Project;
const pending: Promise<Result> = createEngineeringPackage(project, { disciplines: ['electrical', 'hvac'] });
const actions = createAgentActions({ getProject: () => project });
const current: number = equations.electricalCurrent({ powerW: 1000, voltageV: 230, powerFactor: .9, phases: 1 });
void pending; void actions; void current;
