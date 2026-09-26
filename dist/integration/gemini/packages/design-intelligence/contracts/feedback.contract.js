/**
 * @file feedback.contract.js
 * @description Auditable feedback loop and negative knowledge representation.
 */

export class AcceptedDesignFeedback {
  constructor(data) {
    if (!data.feedbackId || !data.projectId || !data.selectedPatternId) {
      throw new Error('AcceptedDesignFeedback requires feedbackId, projectId, and selectedPatternId');
    }
    this.feedbackId = data.feedbackId;
    this.projectId = data.projectId;
    this.selectedPatternId = data.selectedPatternId;
    this.version = data.version || '1.0.0';
    this.timestamp = data.timestamp || new Date().toISOString();
    this.preservedRelationships = data.preservedRelationships || [];
    this.modifiedRelationships = data.modifiedRelationships || [];
    this.rejectedAlternativePatternIds = data.rejectedAlternativePatternIds || [];
    this.userFeedbackNotes = data.userFeedbackNotes || '';
    this.isReversible = true;
    this.auditTrail = data.auditTrail || [];
  }
}

export class RejectedPatternCase {
  constructor(data) {
    if (!data.caseId || !data.patternId || !data.reasonRejected) {
      throw new Error('RejectedPatternCase requires caseId, patternId, and reasonRejected');
    }
    this.caseId = data.caseId;
    this.patternId = data.patternId;
    this.context = data.context || {};
    this.reasonRejected = data.reasonRejected;
    this.hardConflict = Boolean(data.hardConflict);
    this.softConflict = Boolean(data.softConflict);
    this.userRejection = Boolean(data.userRejection);
    this.geometryFailure = Boolean(data.geometryFailure);
    this.privacyFailure = Boolean(data.privacyFailure);
    this.circulationFailure = Boolean(data.circulationFailure);
    this.recordedAt = data.recordedAt || new Date().toISOString();
  }
}
