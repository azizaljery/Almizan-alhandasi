import type { DesignCandidate, CandidateScore, Conflict, ProvenanceEntry, DecisionTrace, ScoreAxis } from './types.js';
export declare function buildDecisionTrace(winner: DesignCandidate, winnerScore: CandidateScore, allScores: CandidateScore[], conflicts: Conflict[], provenance: ProvenanceEntry[], weights: Record<ScoreAxis, number>): DecisionTrace;
//# sourceMappingURL=decision-trace.d.ts.map