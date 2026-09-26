export interface Point {
    x: number;
    y: number;
}
export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Polygon {
    points: Point[];
    holes?: Point[][];
}
export interface RoomShape {
    roomId: string;
    type: string;
    zone: string;
    boundary: Polygon;
    clearArea: number;
}
export type EngineRole = 'requirements' | 'architectural' | 'geometry' | 'reference' | 'custom';
export interface EngineCapabilities {
    disciplines: string[];
    supportsGeometry: boolean;
    supportsRequirements: boolean;
    supportsScoring: boolean;
    deterministic: boolean;
    custom?: Record<string, unknown>;
}
export interface EngineExecutionContext {
    signal: AbortSignal;
    deadlineMs: number;
}
export interface EngineExecutionMeta {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    version: string;
    status: 'ok' | 'partial' | 'failed';
    errorMessage?: string;
}
export interface EngineProvenance {
    engineId: string;
    engineVersion: string;
    invocationId: string;
    requestedAt: string;
    completedAt: string;
    inputHash: string;
}
export interface EngineAssumption {
    id: string;
    statement: string;
    confidence: number;
}
export interface EngineWarning {
    id: string;
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
}
export interface EngineConstraintEvaluation {
    constraintId: string;
    satisfied: boolean;
    evidence?: string;
    confidence: number;
}
export interface DesignCandidate {
    candidateId: string;
    producedBy: string;
    producedByVersion: string;
    invocationId: string;
    schemaVersion: string;
    createdAt: string;
    label: string;
    description?: string;
    geometryHash: string;
    footprint: Polygon;
    rooms: RoomShape[];
    adjacency: Array<{
        a: string;
        b: string;
        sharedLength: number;
    }>;
    entryPoints: Array<{
        id: string;
        side: string;
        roomId: string;
    }>;
    metrics: {
        grossArea: number;
        buildRatio: number;
        roomCount: number;
    };
    engineConfidence: number;
    engineSelfReportedScore?: number;
    tags?: string[];
    raw?: unknown;
}
export interface EngineOutputContract {
    engineId: string;
    engineVersion: string;
    invocationId: string;
    capabilities: EngineCapabilities;
    confidence: number;
    execution: EngineExecutionMeta;
    provenance: EngineProvenance;
    assumptions: EngineAssumption[];
    warnings: EngineWarning[];
    constraintsEvaluated: EngineConstraintEvaluation[];
    candidates: DesignCandidate[];
    raw?: unknown;
}
export interface EngineInputContract {
    requestId: string;
    hardConstraints: HardConstraint[];
    softPreferences: SoftPreference[];
    context: {
        plotArea: number;
        cityCode: string;
        locale: string;
    };
    previousFeedback?: RefinementRequest;
}
export interface EngineAdapter {
    readonly engineId: string;
    readonly engineVersion: string;
    readonly role: EngineRole;
    readonly capabilities: EngineCapabilities;
    execute(input: EngineInputContract, context?: EngineExecutionContext): Promise<EngineOutputContract>;
    healthCheck?(): Promise<{
        healthy: boolean;
        reason?: string;
    }>;
}
export type HardConstraintKind = 'room_count_exact' | 'room_count_min' | 'room_count_max' | 'room_type_required' | 'room_type_forbidden' | 'explicit_area' | 'entry_side_required' | 'privacy_required' | 'access_required' | 'custom';
export interface HardConstraint {
    id: string;
    kind: HardConstraintKind;
    description: string;
    value: unknown;
    appliesTo?: string;
    source: 'user' | 'municipality' | 'engineer' | 'system';
    priority: 'must';
}
export type SoftPreferenceKind = 'prefer_area_near' | 'prefer_zone_placement' | 'prefer_adjacency' | 'prefer_orientation' | 'prefer_aesthetic' | 'custom';
export interface SoftPreference {
    id: string;
    kind: SoftPreferenceKind;
    description: string;
    weight: number;
    value: unknown;
    appliesTo?: string;
    source: 'user' | 'engineer' | 'system';
}
export type ConflictSeverity = 'critical' | 'major' | 'minor';
export interface Conflict {
    conflictId: string;
    severity: ConflictSeverity;
    subject: string;
    participants: Array<{
        engineId: string;
        candidateId: string;
        position: string;
        confidence: number;
    }>;
    description: string;
    evidence: string[];
}
export type ScoreAxis = 'requirementCoverage' | 'hardConstraintCompliance' | 'geometryValidity' | 'areaAccuracy' | 'adjacency' | 'circulation' | 'privacy' | 'guestFamilySeparation' | 'serviceFlow' | 'accessibility' | 'daylightPotential' | 'ventilationPotential' | 'designEfficiency' | 'referenceCompatibility' | 'unresolvedPenalty';
export interface AxisScore {
    axis: ScoreAxis;
    value: number;
    weight: number;
    evidence: string[];
}
export interface CandidateScore {
    candidateId: string;
    axes: AxisScore[];
    rawTotal: number;
    confidenceAdjustedTotal: number;
}
export type RejectionReasonCode = 'OUTSIDE_BUILDING_BOUNDARY' | 'ROOM_OVERLAP' | 'HARD_REQUIREMENT_MISSING' | 'INVALID_ACCESS' | 'PRIVACY_CONFLICT' | 'AREA_TOLERANCE_EXCEEDED' | 'UNRESOLVED_ENGINE_CONFLICT' | 'EMPTY_CANDIDATE' | 'INVALID_SCHEMA' | 'VERSION_MISMATCH' | 'TIMEOUT' | 'LOW_CONFIDENCE' | 'DUPLICATE_CANDIDATE';
export interface Rejection {
    candidateId: string;
    engineId: string;
    code: RejectionReasonCode;
    description: string;
    evidence: string[];
    violatedConstraintId?: string;
    severity: ConflictSeverity;
}
export interface RefinementRequest {
    requestId: string;
    createdAt: string;
    attempt: number;
    reason: string;
    failedConstraints: Array<{
        constraintId: string;
        evidence: string[];
    }>;
    failedCandidates: Array<{
        candidateId: string;
        engineId: string;
        reason: RejectionReasonCode;
    }>;
    engineHints: Array<{
        engineId: string;
        hint: string;
    }>;
    mustPreserve: {
        hardConstraintIds: string[];
        explicitAreas: Array<{
            roomId: string;
            area: number;
        }>;
        requiredRooms: string[];
    };
    mayChange: string[];
    mayNotChange: string[];
    deadlineMs: number;
}
export interface ProvenanceEntry {
    entryId: string;
    at: string;
    actor: string;
    action: 'proposed' | 'supported' | 'objected' | 'modified' | 'rejected' | 'accepted' | 'tie-broken' | 'retried';
    subject: string;
    statement: string;
    evidence: string[];
    confidence: number;
}
export interface DecisionTraceStep {
    stepId: string;
    order: number;
    subject: string;
    summary: string;
    drivingEvidence: string[];
    participatingEngines: string[];
    weights: Array<{
        axis: ScoreAxis;
        weight: number;
        source: string;
    }>;
}
export interface DecisionTrace {
    traceId: string;
    candidateId: string;
    steps: DecisionTraceStep[];
    narrative: string;
}
export interface AzizConfig {
    weights: Record<ScoreAxis, number>;
    weightProfiles: Record<string, Partial<Record<ScoreAxis, number>>>;
    activeProfile: string;
    confidenceFloor: number;
    tieThreshold: number;
    maxRefinementAttempts: number;
    areaTolerancePercent: number;
    engineTimeoutMs: number;
}
export interface AzizInput {
    requestId: string;
    context: {
        plotArea: number;
        cityCode: string;
        locale: string;
    };
    hardConstraints: HardConstraint[];
    softPreferences: SoftPreference[];
    engineOutputs: EngineOutputContract[];
    previousRefinement?: RefinementRequest;
}
export interface AzizDesignState {
    requestId: string;
    builtAt: string;
    config: AzizConfig;
    inputs: AzizInput;
    candidatesReceived: number;
    candidatesRejected: Rejection[];
    candidatesSurvived: string[];
    scores: CandidateScore[];
    conflicts: Conflict[];
    selectedCandidateId: string | null;
    selectionReason: string | null;
    decisionTrace: DecisionTrace | null;
    provenance: ProvenanceEntry[];
    refinementRequest: RefinementRequest | null;
    engineOutputsIndex: Array<{
        engineId: string;
        engineVersion: string;
        invocationId: string;
        candidateCount: number;
        confidence: number;
        warnings: number;
        status: 'ok' | 'partial' | 'failed';
    }>;
    status: 'selected' | 'all-rejected' | 'no-candidates';
    durationMs: number;
}
//# sourceMappingURL=types.d.ts.map