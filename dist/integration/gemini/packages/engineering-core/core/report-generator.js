export class ReportGenerator {
  static generateMarkdown(pkg) {
    const lines = [];

    lines.push(`# MIZAN Engineering Coordination Report`);
    lines.push(`**Project ID**: \`${pkg.projectId}\`  `);
    lines.push(`**Coordination Stage**: \`${pkg.coordinationStage}\`  `);
    lines.push(`**Generated At**: ${pkg.generatedAt}  `);
    lines.push(`**Source Schema Version**: \`${pkg.sourceSchemaVersion}\`  `);
    lines.push(`**Source Geometry Hash (SHA-256)**: \`${pkg.sourceGeometryHash}\`  `);
    lines.push(`**Overall Status**: **${pkg.status}**  `);
    lines.push(``);
    lines.push(`> ⚠️ **DISCLAIMER**: ${pkg.disclaimer}`);
    lines.push(``);

    lines.push(`## 1. Summary Metrics`);
    lines.push(`### Discipline Issues`);
    lines.push(`| Metric | Value | Note |`);
    lines.push(`| :--- | :--- | :--- |`);
    lines.push(`| **Total Discipline Issues** | **${pkg.summaryMetrics.totalIssuesCount}** | Critical + Major + Minor + Advisory |`);
    lines.push(`| ├─ Critical Issues | ${pkg.summaryMetrics.criticalIssuesCount} | Violates statutory building code or basic safety |`);
    lines.push(`| ├─ Major Issues | ${pkg.summaryMetrics.majorIssuesCount} | Severe scheme coordination deficit |`);
    lines.push(`| ├─ Minor Issues | ${pkg.summaryMetrics.minorIssuesCount} | Inefficiency or sub-optimal routing |`);
    lines.push(`| └─ Advisory Issues | ${pkg.summaryMetrics.advisoryIssuesCount} | Informational best-practice observation |`);
    lines.push(``);

    lines.push(`### Cross-Discipline Clashes`);
    lines.push(`| Metric | Value | Note |`);
    lines.push(`| :--- | :--- | :--- |`);
    lines.push(`| **Total Cross-Discipline Clashes** | **${pkg.summaryMetrics.totalClashesCount}** | Hard + Soft + Zone Incompatibilities |`);
    lines.push(`| ├─ Hard Clashes | ${pkg.summaryMetrics.hardClashesCount} | Physical structural penetrations |`);
    lines.push(`| ├─ Soft Clashes | ${pkg.summaryMetrics.softClashesCount} | Maintenance & working space clearance |`);
    lines.push(`| └─ Zone Incompatibilities | ${pkg.summaryMetrics.zoneClashesCount} | Prohibited spatial adjacencies (e.g. water over elec) |`);
    lines.push(``);

    lines.push(`### Change Requests & Total Findings`);
    lines.push(`| Metric | Value |`);
    lines.push(`| :--- | :--- |`);
    lines.push(`| **Total Engineering Findings** | **${pkg.summaryMetrics.totalFindingsCount}** (${pkg.summaryMetrics.totalIssuesCount} Issues + ${pkg.summaryMetrics.totalClashesCount} Clashes) |`);
    lines.push(`| **Structured Change Requests (SCR)** | **${pkg.summaryMetrics.totalStructuredChangeRequests}** |`);
    lines.push(``);

    lines.push(`## 2. Discipline Reviews`);

    lines.push(`### Architectural Review`);
    lines.push(`* Evaluated Checks: ${pkg.architecturalReview.evaluatedChecksCount}`);
    lines.push(`* Issues: ${pkg.architecturalReview.issues.length}`);
    for (const iss of pkg.architecturalReview.issues) {
      lines.push(`  - [${iss.severity}] **${iss.title}**: ${iss.description}`);
    }
    lines.push(``);

    lines.push(`### Structural Coordination (Preliminary)`);
    lines.push(`* Max Observed Span: ${pkg.structuralCoordination.maxObservedSpanMeters} m`);
    lines.push(`* Irregular Vertical Stacking: ${pkg.structuralCoordination.irregularStackingDetected ? 'DETECTED' : 'NONE'}`);
    for (const iss of pkg.structuralCoordination.issues) {
      lines.push(`  - [${iss.severity}] **${iss.title}**: ${iss.description}`);
    }
    lines.push(``);

    lines.push(`### Electrical Coordination (Preliminary)`);
    lines.push(`* Indicative Connected Load: ${pkg.electricalCoordination.estimatedTotalConnectedKVA} kVA`);
    lines.push(`* Panel Clearance Violations: ${pkg.electricalCoordination.panelClearanceViolations}`);
    for (const iss of pkg.electricalCoordination.issues) {
      lines.push(`  - [${iss.severity}] **${iss.title}**: ${iss.description}`);
    }
    lines.push(``);

    lines.push(`### Plumbing Coordination (Preliminary)`);
    lines.push(`* Wet-Area Stacking Efficiency: ${(pkg.plumbingCoordination.wetStackingEfficiencyRatio * 100).toFixed(0)}%`);
    lines.push(`* Prohibited Water-over-Electrical Violations: ${pkg.plumbingCoordination.criticalZoningViolations}`);
    for (const iss of pkg.plumbingCoordination.issues) {
      lines.push(`  - [${iss.severity}] **${iss.title}**: ${iss.description}`);
    }
    lines.push(``);

    lines.push(`### HVAC Coordination (Preliminary)`);
    lines.push(`* Indicative Total Capacity: ${pkg.hvacCoordination.totalEstimatedTonsRefrigeration} TR`);
    lines.push(`* Spaces with Ceiling Plenum Deficit: ${pkg.hvacCoordination.plenumDeficitSpaces.length}`);
    for (const iss of pkg.hvacCoordination.issues) {
      lines.push(`  - [${iss.severity}] **${iss.title}**: ${iss.description}`);
    }
    lines.push(``);

    lines.push(`## 3. Cross-Discipline Clashes`);
    if (pkg.crossDisciplineClashes.length === 0) {
      lines.push(`*No cross-discipline clashes detected.*`);
    } else {
      lines.push(`| Clash ID | Type | Severity | Involved Elements | Disciplines | Description |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);
      for (const cl of pkg.crossDisciplineClashes) {
        lines.push(`| \`${cl.clashId}\` | ${cl.clashType} | **${cl.severity}** | \`${cl.involvedElementIds.join(', ')}\` | ${cl.involvedDisciplines.join(' vs ')} | ${cl.description} |`);
      }
    }
    lines.push(``);

    lines.push(`## 4. Structured Change Requests (SCRs for Design Core)`);
    if (pkg.structuredChangeRequests.length === 0) {
      lines.push(`*No change requests emitted.*`);
    } else {
      for (const scr of pkg.structuredChangeRequests) {
        lines.push(`* **[${scr.requestId}]** Action: \`${scr.actionType}\` on \`${scr.targetElementIds.join(', ')}\``);
        lines.push(`  - *Target Discipline*: ${scr.targetDiscipline}`);
        lines.push(`  - *Justification*: ${scr.justification}`);
        lines.push(`  - *Proposed Parameters*: \`${JSON.stringify(scr.proposedParameters)}\``);
      }
    }
    lines.push(``);

    lines.push(`## 5. Engineering Provenance & Rule Citations (SBC 2024 Baseline)`);
    lines.push(`| Rule ID | Classification | Document ID | Edition | Clause | Effective From | Confidence |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
    for (const r of pkg.engineeringProvenance.appliedRules) {
      lines.push(`| \`${r.ruleId}\` | ${r.classification} | \`${r.documentId}\` | ${r.edition} | ${r.subsection || r.clause} | ${r.effectiveFrom || 'N/A'} | ${(r.confidence * 100).toFixed(0)}% |`);
    }

    return lines.join(String.fromCharCode(10));
  }
}
