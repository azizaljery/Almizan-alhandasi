import { polygonContains, polygonsOverlap, centroidOf, isValidPolygon } from './geometry.js';
import { evaluateHardConstraints } from './hard-constraints.js';
// Candidate4R3 selection utility: internal to AZIZ ranking; this is not Mizan Score.
function clamp(v) {
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}
export function scoreCandidate(candidate, hardConstraints, softPreferences, conflicts, weights, config) {
    const axes = [];
    const mk = (axis, value, evidence) => ({
        axis, value: clamp(value), weight: weights[axis] ?? 0, evidence,
    });
    axes.push(mk('requirementCoverage', requirementCoverage(candidate, softPreferences), [`softPrefs=${softPreferences.length}`]));
    const hc = evaluateHardConstraints(candidate, hardConstraints, config);
    axes.push(mk('hardConstraintCompliance', hc.violations.length === 0 ? 100 : 0, [`violations=${hc.violations.length}`]));
    axes.push(mk('geometryValidity', geometryValidity(candidate), ['checked']));
    axes.push(mk('areaAccuracy', areaAccuracy(candidate, hardConstraints, config), ['checked']));
    axes.push(mk('adjacency', adjacencyScore(candidate, softPreferences), ['checked']));
    axes.push(mk('circulation', circulationScore(candidate), ['checked']));
    axes.push(mk('privacy', privacyScore(candidate), ['checked']));
    axes.push(mk('guestFamilySeparation', guestFamilySeparation(candidate), ['checked']));
    axes.push(mk('serviceFlow', serviceFlow(candidate), ['checked']));
    axes.push(mk('accessibility', accessibility(candidate), ['checked']));
    axes.push(mk('daylightPotential', daylightPotential(candidate), ['checked']));
    axes.push(mk('ventilationPotential', daylightPotential(candidate), ['checked']));
    axes.push(mk('designEfficiency', designEfficiency(candidate), ['checked']));
    axes.push(mk('referenceCompatibility', referenceCompatibility(candidate, conflicts), ['checked']));
    const relevant = conflicts.filter((c) => c.participants.some((p) => p.candidateId === candidate.candidateId));
    const critical = relevant.filter((c) => c.severity === 'critical').length;
    const major = relevant.filter((c) => c.severity === 'major').length;
    const penalty = Math.min(100, critical * 25 + major * 5);
    axes.push(mk('unresolvedPenalty', 100 - penalty, [`critical=${critical}`, `major=${major}`]));
    let weightedSum = 0, weightSum = 0;
    for (const a of axes) {
        weightedSum += a.value * a.weight;
        weightSum += a.weight;
    }
    const rawTotal = weightSum > 0 ? weightedSum / weightSum : 0;
    const conf = Math.max(0, Math.min(1, candidate.engineConfidence));
    const confidenceFactor = 0.5 + 0.5 * conf;
    return {
        candidateId: candidate.candidateId,
        axes,
        rawTotal,
        confidenceAdjustedTotal: rawTotal * confidenceFactor,
    };
}
function requirementCoverage(c, prefs) {
    if (prefs.length === 0)
        return 100;
    let covered = 0, total = 0;
    for (const p of prefs) {
        const w = Number.isFinite(p.weight) ? Math.max(0, p.weight) : 1;
        total += w;
        const r = prefResult(c, p);
        if (r === 'unsupported') {
            total -= w;
            continue;
        }
        if (r === true)
            covered += w;
    }
    return total > 0 ? (covered / total) * 100 : 100;
}
function prefResult(c, p) {
    switch (p.kind) {
        case 'prefer_zone_placement': {
            const v = p.value;
            if (!v?.type || !v?.zone)
                return 'unsupported';
            const room = c.rooms.find((r) => r.type === v.type);
            return room ? room.zone === v.zone : false;
        }
        case 'prefer_adjacency': {
            const v = p.value;
            if (!v?.a || !v?.b)
                return 'unsupported';
            return c.adjacency.some((adj) => (adj.a === v.a && adj.b === v.b) || (adj.a === v.b && adj.b === v.a));
        }
        case 'prefer_orientation': {
            const v = p.value;
            if (!v?.type || !v?.side)
                return 'unsupported';
            const room = c.rooms.find((r) => r.type === v.type);
            if (!room)
                return false;
            const cen = centroidOf(room.boundary);
            if (!Number.isFinite(cen.x))
                return 'unsupported';
            return sideOfPoint(cen, c) === v.side;
        }
        default:
            return 'unsupported';
    }
}
function sideOfPoint(p, c) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of c.footprint.points) {
        if (pt.x < minX)
            minX = pt.x;
        if (pt.y < minY)
            minY = pt.y;
        if (pt.x > maxX)
            maxX = pt.x;
        if (pt.y > maxY)
            maxY = pt.y;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const dx = p.x - cx, dy = p.y - cy;
    if (Math.abs(dx) > Math.abs(dy))
        return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'north' : 'south';
}
function geometryValidity(c) {
    if (!isValidPolygon(c.footprint))
        return 0;
    let score = 100;
    for (let i = 0; i < c.rooms.length; i++) {
        for (let j = i + 1; j < c.rooms.length; j++) {
            if (polygonsOverlap(c.rooms[i].boundary, c.rooms[j].boundary))
                score -= 10;
        }
    }
    for (const r of c.rooms) {
        if (!isValidPolygon(r.boundary)) {
            score -= 15;
            continue;
        }
        if (!polygonContains(c.footprint, r.boundary))
            score -= 15;
    }
    return clamp(score);
}
function areaAccuracy(c, constraints, config) {
    const acs = constraints.filter((x) => x.kind === 'explicit_area');
    if (acs.length === 0)
        return 100;
    let sum = 0;
    for (const ac of acs) {
        const v = ac.value;
        if (!Number.isFinite(v.area) || v.area <= 0) {
            sum += 0;
            continue;
        }
        const tol = Number.isFinite(v.tolerance) && v.tolerance >= 0
            ? v.tolerance
            : config.areaTolerancePercent / 100;
        const matched = v.roomId
            ? c.rooms.filter((r) => r.roomId === v.roomId)
            : v.type
                ? c.rooms.filter((r) => r.type === v.type)
                : [];
        if (matched.length === 0) {
            sum += 0;
            continue;
        }
        const avgDev = matched.reduce((s, r) => s + Math.abs(r.clearArea - v.area) / v.area, 0) / matched.length;
        sum += Math.max(0, 100 * (1 - avgDev / Math.max(tol, 0.01)));
    }
    return sum / acs.length;
}
function adjacencyScore(c, prefs) {
    const adj = prefs.filter((p) => p.kind === 'prefer_adjacency');
    if (adj.length === 0)
        return 100;
    let total = 0, covered = 0;
    for (const p of adj) {
        const w = Number.isFinite(p.weight) ? Math.max(0, p.weight) : 1;
        total += w;
        const v = p.value;
        if (v?.a && v?.b && c.adjacency.some((a) => (a.a === v.a && a.b === v.b) || (a.a === v.b && a.b === v.a)))
            covered += w;
    }
    return total > 0 ? (covered / total) * 100 : 100;
}
function circulationScore(c) {
    const seen = new Set();
    for (const adj of c.adjacency) {
        const key = [adj.a, adj.b].sort().join('|');
        seen.add(key);
    }
    return seen.size === 0 ? 0 : clamp(30 + seen.size * 8);
}
function footprintSpan(c) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of c.footprint.points) {
        if (pt.x < minX)
            minX = pt.x;
        if (pt.y < minY)
            minY = pt.y;
        if (pt.x > maxX)
            maxX = pt.x;
        if (pt.y > maxY)
            maxY = pt.y;
    }
    return Math.hypot(maxX - minX, maxY - minY);
}
function privacyScore(c) {
    const entryRoom = c.entryPoints[0]?.roomId;
    const bedrooms = c.rooms.filter((r) => r.type === 'bedroom' || r.type === 'master-bedroom');
    if (!entryRoom || bedrooms.length === 0)
        return 50;
    const entry = c.rooms.find((r) => r.roomId === entryRoom);
    if (!entry)
        return 50;
    const ec = centroidOf(entry.boundary);
    if (!Number.isFinite(ec.x))
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const avgD = bedrooms.reduce((s, b) => {
        const bc = centroidOf(b.boundary);
        if (!Number.isFinite(bc.x))
            return s;
        return s + Math.hypot(ec.x - bc.x, ec.y - bc.y);
    }, 0) / bedrooms.length;
    return clamp((avgD / span) * 100);
}
function guestFamilySeparation(c) {
    const majlis = c.rooms.find((r) => r.type === 'majlis');
    const living = c.rooms.find((r) => r.type === 'living');
    if (!majlis || !living)
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const mc = centroidOf(majlis.boundary);
    const lc = centroidOf(living.boundary);
    if (!Number.isFinite(mc.x) || !Number.isFinite(lc.x))
        return 50;
    return clamp((Math.hypot(mc.x - lc.x, mc.y - lc.y) / span) * 100);
}
function serviceFlow(c) {
    const kitchen = c.rooms.find((r) => r.type === 'kitchen');
    const service = c.rooms.find((r) => r.type === 'service' || r.type === 'maid' || r.type === 'storage');
    if (!kitchen || !service)
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const kc = centroidOf(kitchen.boundary);
    const sc = centroidOf(service.boundary);
    if (!Number.isFinite(kc.x) || !Number.isFinite(sc.x))
        return 50;
    return clamp(100 - (Math.hypot(kc.x - sc.x, kc.y - sc.y) / span) * 100);
}
function accessibility(c) {
    const linked = new Set();
    for (const adj of c.adjacency) {
        linked.add(adj.a);
        linked.add(adj.b);
    }
    if (c.rooms.length === 0)
        return 0;
    return clamp(((c.rooms.length - c.rooms.filter((r) => !linked.has(r.roomId)).length) / c.rooms.length) * 100);
}
function daylightPotential(c) {
    if (c.rooms.length === 0)
        return 0;
    let onExterior = 0;
    for (const r of c.rooms)
        if (isOnExteriorWall(r.boundary, c.footprint))
            onExterior++;
    return (onExterior / c.rooms.length) * 100;
}
function isOnExteriorWall(room, footprint) {
    for (const rp of room.points) {
        for (let i = 0; i < footprint.points.length; i++) {
            const a = footprint.points[i];
            const b = footprint.points[(i + 1) % footprint.points.length];
            if (pointOnSegmentLite(rp, a, b))
                return true;
        }
    }
    return false;
}
function pointOnSegmentLite(p, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9)
        return Math.hypot(p.x - a.x, p.y - a.y) < 1e-3;
    const cr = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cr) > 1e-3)
        return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    return dot >= -1e-3 && dot <= len * len + 1e-3;
}
function designEfficiency(c) {
    if (c.metrics.grossArea <= 0)
        return 0;
    const roomArea = c.rooms.reduce((s, r) => s + r.clearArea, 0);
    return clamp((roomArea / c.metrics.grossArea) * 100);
}
function referenceCompatibility(c, conflicts) {
    let score = 100;
    for (const cf of conflicts) {
        if (cf.participants.some((p) => p.candidateId === c.candidateId)) {
            score -= cf.severity === 'critical' ? 25 : cf.severity === 'major' ? 10 : 3;
        }
    }
    return clamp(score);
}
//# sourceMappingURL=scoring-engine.js.map