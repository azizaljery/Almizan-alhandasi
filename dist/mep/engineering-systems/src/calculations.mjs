import { number, fail, sum } from './core.mjs';
const pos = (v, p) => number(v, p, { positive: true });
const nonneg = (v, p) => number(v, p, { min: 0 });
const factor = (v, p) => number(v, p, { positive: true, max: 1 });

export function electricalCurrent({ powerW, voltageV, powerFactor, phases }) {
  nonneg(powerW, 'powerW'); pos(voltageV, 'voltageV'); factor(powerFactor, 'powerFactor');
  if (![1, 3].includes(phases)) fail('PHASES_1_OR_3', 'phases');
  return powerW / (voltageV * powerFactor * (phases === 3 ? Math.sqrt(3) : 1));
}
export function voltageDrop({ currentA, lengthM, resistanceOhmPerKm, reactanceOhmPerKm, powerFactor, phases, voltageV }) {
  nonneg(currentA, 'currentA'); nonneg(lengthM, 'lengthM'); nonneg(resistanceOhmPerKm, 'resistanceOhmPerKm'); nonneg(reactanceOhmPerKm, 'reactanceOhmPerKm'); factor(powerFactor, 'powerFactor'); pos(voltageV, 'voltageV');
  if (![1, 3].includes(phases)) fail('PHASES_1_OR_3', 'phases');
  const volts = (phases === 3 ? Math.sqrt(3) : 2) * currentA * lengthM / 1000 * (resistanceOhmPerKm * powerFactor + reactanceOhmPerKm * Math.sqrt(1 - powerFactor ** 2));
  return { volts, percent: volts / voltageV * 100 };
}
export function lightingCount({ targetLux, areaM2, lumensPerFixture, utilizationFactor, maintenanceFactor }) {
  pos(targetLux, 'targetLux'); pos(areaM2, 'areaM2'); pos(lumensPerFixture, 'lumensPerFixture'); factor(utilizationFactor, 'utilizationFactor'); factor(maintenanceFactor, 'maintenanceFactor');
  return Math.ceil(targetLux * areaM2 / (lumensPerFixture * utilizationFactor * maintenanceFactor));
}
export function powerComponents({ powerW, powerFactor, demandFactor }) {
  nonneg(powerW, 'powerW'); factor(powerFactor, 'powerFactor'); number(demandFactor, 'demandFactor', { min: 0, max: 1 });
  const reactiveVar = powerW * Math.tan(Math.acos(powerFactor));
  return { connectedW: powerW, connectedVar: reactiveVar, demandW: powerW * demandFactor, demandVar: reactiveVar * demandFactor };
}
export function steadyStateHeatGain(p) {
  const { outdoorC, indoorC, surfaces, solarW, internalSensibleW, internalLatentW, infiltrationM3S, outdoorAirM3S, outdoorHumidityRatio, indoorHumidityRatio, densityKgM3, cpJkgK, latentHeatJkg } = p;
  number(outdoorC, 'outdoorC'); number(indoorC, 'indoorC');
  if (!Array.isArray(surfaces)) fail('SURFACES_REQUIRED', 'surfaces');
  for (const s of surfaces) { nonneg(s.areaM2, 'surface.areaM2'); nonneg(s.uWm2K, 'surface.uWm2K'); }
  for (const k of ['solarW', 'internalSensibleW', 'internalLatentW', 'infiltrationM3S', 'outdoorAirM3S', 'outdoorHumidityRatio', 'indoorHumidityRatio']) nonneg(p[k], k);
  pos(densityKgM3, 'densityKgM3'); pos(cpJkgK, 'cpJkgK'); pos(latentHeatJkg, 'latentHeatJkg');
  const deltaK = Math.max(0, outdoorC - indoorC), flow = infiltrationM3S + outdoorAirM3S;
  const conductionW = sum(surfaces.map(s => s.areaM2 * s.uWm2K * deltaK));
  const airSensibleW = densityKgM3 * cpJkgK * flow * deltaK;
  const airLatentW = densityKgM3 * latentHeatJkg * flow * Math.max(0, outdoorHumidityRatio - indoorHumidityRatio);
  const sensibleW = conductionW + solarW + internalSensibleW + airSensibleW, latentW = internalLatentW + airLatentW;
  return { conductionW, airSensibleW, airLatentW, sensibleW, latentW, totalW: sensibleW + latentW };
}
export function sensibleAirflow({ sensibleW, densityKgM3, cpJkgK, supplyDeltaK }) {
  nonneg(sensibleW, 'sensibleW'); pos(densityKgM3, 'densityKgM3'); pos(cpJkgK, 'cpJkgK'); pos(supplyDeltaK, 'supplyDeltaK'); return sensibleW / (densityKgM3 * cpJkgK * supplyDeltaK);
}
export function zoneOutdoorAir({ persons, areaM2, lSPerPerson, lSPerM2, distributionEffectiveness }) {
  nonneg(persons, 'persons'); pos(areaM2, 'areaM2'); nonneg(lSPerPerson, 'lSPerPerson'); nonneg(lSPerM2, 'lSPerM2'); pos(distributionEffectiveness, 'distributionEffectiveness');
  return (persons * lSPerPerson + areaM2 * lSPerM2) / distributionEffectiveness / 1000;
}
export function achAirflow({ volumeM3, airChangesPerHour }) { pos(volumeM3, 'volumeM3'); nonneg(airChangesPerHour, 'airChangesPerHour'); return volumeM3 * airChangesPerHour / 3600; }
export function circularDiameter({ flowM3S, velocityMS }) { nonneg(flowM3S, 'flowM3S'); pos(velocityMS, 'velocityMS'); return Math.sqrt(4 * flowM3S / (Math.PI * velocityMS)); }
export function drainageFall({ horizontalLengthM, slope }) { nonneg(horizontalLengthM, 'horizontalLengthM'); number(slope, 'slope', { positive: true, max: 1 }); return horizontalLengthM * slope; }
export function tankVolume({ persons, litresPerPersonDay, autonomyDays }) { nonneg(persons, 'persons'); pos(litresPerPersonDay, 'litresPerPersonDay'); pos(autonomyDays, 'autonomyDays'); return persons * litresPerPersonDay * autonomyDays; }
export function rainfallFlow({ intensityMmH, areaM2, runoffCoefficient }) { nonneg(intensityMmH, 'intensityMmH'); pos(areaM2, 'areaM2'); factor(runoffCoefficient, 'runoffCoefficient'); return intensityMmH * areaM2 * runoffCoefficient / 3600000; }
export function waterHeatingPower({ flowM3S, deltaK, densityKgM3, cpJkgK, efficiency }) { nonneg(flowM3S, 'flowM3S'); nonneg(deltaK, 'deltaK'); pos(densityKgM3, 'densityKgM3'); pos(cpJkgK, 'cpJkgK'); factor(efficiency, 'efficiency'); return flowM3S * densityKgM3 * cpJkgK * deltaK / efficiency; }
export function hydraulicHead({ flowM3S, diameterM, lengthM, darcyFrictionFactor, minorLossK, elevationRiseM, requiredResidualHeadM, gravityMS2 }) {
  nonneg(flowM3S, 'flowM3S'); pos(diameterM, 'diameterM'); nonneg(lengthM, 'lengthM'); nonneg(darcyFrictionFactor, 'darcyFrictionFactor'); nonneg(minorLossK, 'minorLossK'); number(elevationRiseM, 'elevationRiseM'); nonneg(requiredResidualHeadM, 'requiredResidualHeadM'); pos(gravityMS2, 'gravityMS2');
  const velocityMS = flowM3S / (Math.PI * diameterM ** 2 / 4), velocityHeadM = velocityMS ** 2 / (2 * gravityMS2);
  return { velocityMS, frictionHeadM: darcyFrictionFactor * lengthM / diameterM * velocityHeadM, minorLossHeadM: minorLossK * velocityHeadM, totalHeadM: elevationRiseM + requiredResidualHeadM + (darcyFrictionFactor * lengthM / diameterM + minorLossK) * velocityHeadM };
}
