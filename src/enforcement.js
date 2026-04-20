'use strict';

/**
 * Hard Constraint Enforcement Layer
 * 
 * Runs AFTER LLM reasoning to ensure deterministic findings
 * are never overridden. This is the final authority.
 * 
 * Rules:
 *   1. Secrets detected → force DO_NOT_MERGE
 *   2. Risk score is immutable (always from deterministic engine)
 *   3. Recommendation can only be downgraded, never upgraded
 *   4. Secret-derived blocking issues are always present
 */

const SEVERITY = { 'MERGE': 0, 'MERGE_WITH_CONDITIONS': 1, 'DO_NOT_MERGE': 2 };

/**
 * Enforce hard constraints on LLM output.
 *
 * @param {Object} signals - deterministic_signals from orchestrator
 * @param {Object} llmOutput - Output from LLM reasoning (or fallback)
 * @returns {Object} Enforced output
 */
function enforceHardConstraints(signals, llmOutput) {
  const result = { ...llmOutput };
  const enforcements = [];

  // RULE 1: Secrets detected → force DO_NOT_MERGE
  if (signals.secrets && signals.secrets.secrets_detected > 0) {
    if (result.recommendation !== 'DO_NOT_MERGE') {
      enforcements.push(
        `Recommendation overridden: ${result.recommendation} → DO_NOT_MERGE (secret detected)`
      );
    }
    result.recommendation = 'DO_NOT_MERGE';
  }

  // RULE 2: Risk score is immutable
  if (result.risk_score !== signals.risk_score) {
    enforcements.push(
      `Risk score corrected: ${result.risk_score} → ${signals.risk_score} (deterministic authority)`
    );
  }
  result.risk_score = signals.risk_score;

  // RULE 3: Recommendation can only be downgraded, never upgraded
  const signalSeverity = SEVERITY[signals.recommendation] || 0;
  const resultSeverity = SEVERITY[result.recommendation] || 0;
  if (resultSeverity < signalSeverity) {
    enforcements.push(
      `Recommendation downgraded: ${result.recommendation} → ${signals.recommendation} (cannot upgrade past deterministic floor)`
    );
    result.recommendation = signals.recommendation;
  }

  // RULE 4: Secret-derived blocking issues are always present
  if (signals.secrets && signals.secrets.secrets_detected > 0) {
    const secretBlockers = signals.secrets.findings.map(secretToBlockingIssue);
    result.blocking_issues = deduplicateBlockingIssues(
      secretBlockers,
      result.blocking_issues || []
    );
  }

  // Record enforcement actions for observability
  result._enforcements = enforcements;

  return result;
}

/**
 * Calibrate confidence level against deterministic signals.
 * Prevents contradictions like high risk + LOW confidence.
 *
 * @param {Object} signals - deterministic_signals
 * @param {Object} result - Post-enforcement result
 * @returns {Object} Calibrated result
 */
function calibrateConfidence(signals, result) {
  const calibrated = { ...result };
  calibrated._confidence_calibrated = false;

  // High risk (>70) with LOW confidence → floor at MEDIUM
  if (signals.risk_score > 70 && calibrated.confidence_level === 'LOW') {
    calibrated.confidence_level = 'MEDIUM';
    calibrated._confidence_calibrated = true;
    calibrated._calibration_reason =
      'Confidence raised: LOW → MEDIUM. Deterministic risk score >70 provides objective basis.';
  }

  // Secrets detected → confidence cannot be LOW
  if (signals.secrets && signals.secrets.secrets_detected > 0 && calibrated.confidence_level === 'LOW') {
    calibrated.confidence_level = 'MEDIUM';
    calibrated._confidence_calibrated = true;
    calibrated._calibration_reason =
      'Confidence raised: LOW → MEDIUM. Confirmed secret detection is an objective finding.';
  }

  // Deterministic-only fallback → always MEDIUM
  if (result._fallback) {
    calibrated.confidence_level = 'MEDIUM';
    calibrated._confidence_calibrated = true;
    calibrated._calibration_reason =
      'Confidence set to MEDIUM: LLM unavailable, deterministic analysis only.';
  }

  return calibrated;
}

/**
 * Convert a secret finding to a blocking issue.
 */
function secretToBlockingIssue(finding) {
  return {
    location: `${finding.file}:L${finding.line}`,
    observation: `${finding.type} detected matching pattern. Matched content: ${finding.matched_content}`,
    consequence: `If merged, this credential will be permanently embedded in Git history. Any user with repository read access can extract it. The credential must be considered compromised.`,
    required_action: `(1) Remove the hardcoded credential. (2) Rotate the credential immediately — it exists in branch history. (3) Replace with environment variable injection. (4) Verify no other instances exist in the codebase.`,
    confidence: finding.confidence,
    source: 'deterministic'
  };
}

/**
 * Deduplicate blocking issues, preferring deterministic ones.
 */
function deduplicateBlockingIssues(deterministicIssues, llmIssues) {
  const seen = new Set();
  const merged = [];

  // Deterministic issues first (they have priority)
  for (const issue of deterministicIssues) {
    const key = `${issue.location}:${issue.observation.substring(0, 50)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }

  // LLM issues second (skip duplicates)
  for (const issue of (llmIssues || [])) {
    const key = `${issue.location}:${(issue.observation || '').substring(0, 50)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }

  return merged;
}

module.exports = { enforceHardConstraints, calibrateConfidence };
