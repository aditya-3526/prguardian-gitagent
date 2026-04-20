'use strict';

/**
 * Deterministic Risk Scoring Engine
 * 
 * Computes a weighted risk score from deterministic signals.
 * The score is FULLY DETERMINISTIC and IMMUTABLE — the LLM layer
 * may explain it but cannot change it.
 * 
 * Factors:
 *   Security Risk    (0-40): secrets, auth/payment file changes
 *   Blast Radius     (0-25): sensitive file risk factors
 *   Change Complexity(0-20): diff size, file type diversity
 *   Deployment Timing(0-15): day/time, month/quarter end
 */

/**
 * Compute deterministic risk score.
 *
 * @param {Object} params
 * @param {Object} params.secrets - Output from secret-detector.js
 * @param {Object} params.sensitiveFiles - Output from sensitive-files.js
 * @param {Object} params.metrics - Output from diff-metrics.js
 * @param {Date|string} params.timestamp - Analysis timestamp
 * @returns {Object} { risk_score, recommendation, hard_constraints_triggered, breakdown }
 */
function score({ secrets, sensitiveFiles, metrics, timestamp }) {
  const breakdown = [];
  const hardConstraints = [];

  // ── Factor 1: Security Risk (0-40) ────────────────────────────────────────
  let securityRisk = 0;

  // Secrets: +20 each, capped at 40
  const secretCount = secrets?.secrets_detected || 0;
  if (secretCount > 0) {
    securityRisk += Math.min(secretCount * 20, 40);
    hardConstraints.push('SECRET_DETECTED');
  }

  // Auth/payment file changes: +10 each category present
  const criticalFiles = (sensitiveFiles?.files || []).filter(f => f.category === 'CRITICAL');
  const hasCriticalAuth = criticalFiles.some(f =>
    ['Authentication', 'Authorization', 'Session Management'].includes(f.module)
  );
  const hasCriticalPayment = criticalFiles.some(f =>
    ['Payment Processing', 'Billing', 'Checkout Flow'].includes(f.module)
  );

  if (hasCriticalAuth) securityRisk = Math.min(securityRisk + 10, 40);
  if (hasCriticalPayment) securityRisk = Math.min(securityRisk + 10, 40);

  breakdown.push({
    factor: 'Security Risk',
    contribution: securityRisk,
    max: 40,
    detail: buildSecurityDetail(secretCount, hasCriticalAuth, hasCriticalPayment)
  });

  // ── Factor 2: Blast Radius (0-25) ────────────────────────────────────────
  const totalRiskFactor = sensitiveFiles?.total_risk_factor || 0;
  const blastRadius = Math.min(totalRiskFactor, 25);

  breakdown.push({
    factor: 'Blast Radius',
    contribution: blastRadius,
    max: 25,
    detail: buildBlastRadiusDetail(sensitiveFiles)
  });

  // ── Factor 3: Change Complexity (0-20) ────────────────────────────────────
  let complexity = 0;

  // Size score
  const sizeScores = { SMALL: 2, MEDIUM: 8, LARGE: 14, VERY_LARGE: 20 };
  const sizeScore = sizeScores[metrics?.change_size] || 2;
  complexity += sizeScore;

  // File type diversity bonus
  const fileTypeCount = metrics?.file_type_count || 0;
  if (fileTypeCount > 2) {
    complexity += 5;
  }

  complexity = Math.min(complexity, 20);

  breakdown.push({
    factor: 'Change Complexity',
    contribution: complexity,
    max: 20,
    detail: `${metrics?.change_size || 'SMALL'} change (${metrics?.total_changes || 0} lines), ${fileTypeCount} file type(s)`
  });

  // ── Factor 4: Deployment Timing (0-15) ────────────────────────────────────
  let timingRisk = 0;
  const timingDetails = [];
  const now = timestamp ? new Date(timestamp) : new Date();

  const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
  const hour = now.getHours();
  const date = now.getDate();
  const month = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(now.getFullYear(), month + 1, 0).getDate();

  // Friday
  if (dayOfWeek === 5) {
    timingRisk += 10;
    timingDetails.push('Friday (+10)');
  }

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    timingRisk += 15;
    timingDetails.push('Weekend (+15)');
  }

  // Late night (22:00-04:00)
  if (hour >= 22 || hour < 4) {
    timingRisk += 5;
    timingDetails.push('Late night 22:00-04:00 (+5)');
  }

  // Month end (last 2 business days ≈ last 3 calendar days)
  if (date >= daysInMonth - 2) {
    timingRisk += 5;
    timingDetails.push('Month-end (+5)');
  }

  // Quarter end (months 2,5,8,11 = March,June,Sept,Dec and last 3 days)
  const quarterEndMonths = [2, 5, 8, 11];
  if (quarterEndMonths.includes(month) && date >= daysInMonth - 3) {
    timingRisk += 5;
    timingDetails.push('Quarter-end (+5)');
  }

  timingRisk = Math.min(timingRisk, 15);

  breakdown.push({
    factor: 'Deployment Timing',
    contribution: timingRisk,
    max: 15,
    detail: timingDetails.length > 0 ? timingDetails.join(', ') : 'No timing risk factors'
  });

  // ── Composite Score ───────────────────────────────────────────────────────
  const rawScore = securityRisk + blastRadius + complexity + timingRisk;
  const riskScore = Math.max(0, Math.min(100, rawScore));

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation;
  if (hardConstraints.includes('SECRET_DETECTED')) {
    recommendation = 'DO_NOT_MERGE';
  } else if (riskScore > 60) {
    recommendation = 'DO_NOT_MERGE';
  } else if (riskScore > 30) {
    recommendation = 'MERGE_WITH_CONDITIONS';
  } else {
    recommendation = 'MERGE';
  }

  return {
    risk_score: riskScore,
    recommendation,
    hard_constraints_triggered: hardConstraints,
    breakdown
  };
}

// ── Detail builders ─────────────────────────────────────────────────────────

function buildSecurityDetail(secretCount, hasAuth, hasPayment) {
  const parts = [];
  if (secretCount > 0) parts.push(`${secretCount} secret(s) detected`);
  if (hasAuth) parts.push('auth module modified');
  if (hasPayment) parts.push('payment module modified');
  return parts.length > 0 ? parts.join('; ') : 'No security risk factors';
}

function buildBlastRadiusDetail(sensitiveFiles) {
  if (!sensitiveFiles || sensitiveFiles.sensitive_file_count === 0) {
    return 'No sensitive files affected';
  }

  const byCat = {};
  for (const f of sensitiveFiles.files) {
    if (f.category === 'LOW') continue;
    byCat[f.category] = (byCat[f.category] || 0) + 1;
  }

  const parts = Object.entries(byCat).map(([cat, cnt]) => `${cnt} ${cat}`);
  return `${sensitiveFiles.sensitive_file_count} sensitive file(s): ${parts.join(', ')}`;
}

module.exports = { score };
