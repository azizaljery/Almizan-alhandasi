import type { DesignCandidate, HardConstraint, Rejection, AzizConfig } from './types.js';
export interface HardConstraintEvaluation {
    violations: Rejection[];
    satisfiedIds: string[];
    axisScore: number;
    evidence: string[];
}
export declare function evaluateHardConstraints(candidate: DesignCandidate, constraints: HardConstraint[], config: AzizConfig): HardConstraintEvaluation;
//# sourceMappingURL=hard-constraints.d.ts.map