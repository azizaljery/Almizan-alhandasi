// Demonstration assumptions, NOT SBC values, a customer design, or manufacturer selections.
const route = (routeHeightM, widthM, heightM, clearanceM = .03) => ({ routeHeightM, widthM, heightM, clearanceM });
const node = (id, kind, roomId, x, y, z) => ({ id, kind, roomId, levelId: 'L1', position: { x, y, z } });
export function demoConfig(rooms) {
  const cable = { sizeMm2: 2.5, resistanceOhmPerKm: 8, reactanceOhmPerKm: .08 };
  const protection = { ratedA: 16, correctedAmpacityA: 18, voltageDropLimitPercent: 3, source: 'DEMO ONLY: engineer must replace with verified cable installation data and project limit' };
  const lightingByRoom = Object.fromEntries(rooms.map((r, i) => [r.id, { targetLux: r.type === 'kitchen' ? 250 : 150, lumensPerFixture: 1600, utilizationFactor: .6, maintenanceFactor: .8, wattsPerFixture: 14, powerFactor: .95, demandFactor: 1, mountHeightM: 2.9, panelId: 'DB1', phase: ['L1', 'L2', 'L3'][i % 3], voltageV: 230, routing: route(2.85, .03, .03), cable, protection }]));
  const circuit = (id, loadIds, phase) => ({ id, panelId: 'DB1', loadIds, phases: 1, phase, voltageV: 230, cable, protection, routing: route(2.85, .03, .03) });
  const thermal = areaM2 => ({ outdoorC: 44, indoorC: 24, surfaces: [{ areaM2: 22, uWm2K: .45 }, { areaM2, uWm2K: .25 }], solarW: 500, internalSensibleW: 300, internalLatentW: 150, infiltrationM3S: .003, outdoorAirM3S: .01, outdoorHumidityRatio: .012, indoorHumidityRatio: .009, densityKgM3: 1.2, cpJkgK: 1006, latentHeatJkg: 2450000 });
  const zone = (id, roomId) => ({ id, roomId, equipmentId: 'AC1', thermal: thermal(rooms.find(r => r.id === roomId).areaM2), supplyDeltaK: 12, terminalHeightM: 2.8, ductVelocityMS: 4, ventilation: { persons: 3, lSPerPerson: 2.5, lSPerM2: .3, distributionEffectiveness: 1 }, routing: route(2.8, .3, .25, .05) });
  return {
    rules: {
      routingByLevel: { L1: { polygon: [{ x: -.5, y: -.5 }, { x: 12.8, y: -.5 }, { x: 12.8, y: 14.5 }, { x: -.5, y: 14.5 }], holes: [], stepM: .25 } },
      structuralModelComplete: false, rates: {},
      provenance: [{ id: 'DEMO-ASSUMPTIONS', classification: 'PROJECT_ASSUMPTION', authority: 'EXAMPLE_ONLY', verifiedCodeClause: null, noteAr: 'جميع الشدة الضوئية والمعاملات والأبعاد والأحمال والمناخ والأسعار في المثال افتراضات توضيحية قابلة للتعديل؛ ليست اشتراطات سعودية.' }]
    },
    services: {
      electrical: {
        panels: [node('DB1', 'PANEL', 'r2', 11, 1, 1.6)], lightingByRoom,
        loads: [{ ...node('SO1', 'SOCKET', 'r1', 5, 1, .4), powerW: 1000, powerFactor: .95, demandFactor: .4 }, { ...node('AC1-LOAD', 'EQUIPMENT_LOAD', 'r2', 10.5, 4, 2.7), powerW: 1400, powerFactor: .9, demandFactor: 1, sourceEquipmentId: 'AC1' }],
        circuits: [circuit('C-SOCKET', ['SO1'], 'L1'), circuit('C-AC', ['AC1-LOAD'], 'L2')]
      },
      hvac: { equipment: [{ ...node('AC1', 'AIR_EQUIPMENT', 'r2', 10.5, 4, 2.7), ratedInputW: 1400 }], zones: [zone('Z1', 'r1'), zone('Z4', 'r4')], exhaust: [{ id: 'EF1', roomId: 'r6', airChangesPerHour: 8, fan: { position: { x: 10.7, y: 9.5, z: 2.6 } }, discharge: { id: 'EX1', kind: 'DISCHARGE', levelId: 'L1', position: { x: 12.5, y: 9.5, z: 2.6 } }, routing: route(2.6, .15, .15) }] },
      plumbing: {
        fixtures: [node('WC1', 'WC', 'r6', 10.4, 9, 0), node('BASIN1', 'BASIN', 'r6', 11.3, 9.4, .8)],
        equipment: [node('MAN1', 'MANIFOLD', 'r7', 11.4, 12.3, .3), { id: 'MH1', kind: 'MANHOLE', levelId: 'L1', position: { x: 12.5, y: 9, z: -.342 } }],
        connections: [{ id: 'CW1', system: 'cold_water', fromId: 'MAN1', toId: 'BASIN1', flowM3S: .0002, velocityMS: 1.5, selectedDiameterMm: 20, routing: route(.4, .03, .03) }, { id: 'DR1', system: 'sanitary', fromId: 'WC1', toId: 'MH1', flowM3S: .001, velocityMS: .8, selectedDiameterMm: 110, startInvertM: -.3, endInvertM: -.342, slope: .02, routing: route(-.3, .12, .12, .02) }],
        tank: { persons: 5, litresPerPersonDay: 200, autonomyDays: 2 },
        roofDrainage: [{ id: 'ROOF1', intensityMmH: 90, areaM2: 168, runoffCoefficient: 1 }],
        hotWater: { flowM3S: .0001, deltaK: 30, densityKgM3: 998, cpJkgK: 4180, efficiency: .9 }
      },
      fire: { devices: [node('SD1', 'SMOKE_DETECTOR', 'r1', 2, 2, 3), node('FACP1', 'FIRE_ALARM_PANEL', 'r2', 10, 1.5, 1.4)], connections: [{ id: 'F1', fromId: 'FACP1', toId: 'SD1', routing: route(2.65, .02, .02) }] },
      low_current: { devices: [node('LAN1', 'DATA_RACK', 'r2', 10.5, 2, 1.2), node('DATA1', 'DATA_OUTLET', 'r4', 11, 6, .4)], connections: [{ id: 'T1', fromId: 'LAN1', toId: 'DATA1', projectLengthLimitM: 90, routing: route(2.45, .03, .03) }] },
      solar: { capacity: { panelCount: 2, wattsPerPanel: 450 }, devices: [{ id: 'PV1', kind: 'PV_MODULE', levelId: 'L1', position: { x: 3, y: 6, z: 3.4 } }, { id: 'PV2', kind: 'PV_MODULE', levelId: 'L1', position: { x: 5, y: 6, z: 3.4 } }] }
    },
    obstacles: [{ id: 'COL-DEMO', kind: 'column', min: { x: 6.6, y: 6, z: 0 }, max: { x: 7, y: 6.4, z: 3.2 } }]
  };
}
