'use strict';

/**
 * PRGuardian Orchestrator
 * 
 * 4-phase execution pipeline:
 *   Phase 1: Deterministic analysis (authoritative)
 *   Phase 2: LLM reasoning (advisory, with graceful degradation)
 *   Phase 3: Enforcement + confidence calibration (code authority)
 *   Phase 4: Logging
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { parseDiff, parseInputFile } = require('./analyzers/diff-parser');
const secretDetector = require('./analyzers/secret-detector');
const sensitiveFiles = require('./analyzers/sensitive-files');
const diffMetrics = require('./analyzers/diff-metrics');
const riskEngine = require('./scoring/risk-engine');
const { enforceHardConstraints, calibrateConfidence } = require('./enforcement');
const Logger = require('./logger');

// In-session cache for identical diffs
const diffCache = new Map();

// Maximum LLM input size (100K chars)
const MAX_LLM_INPUT_SIZE = 100000;

/**
 * Main analysis function.
 *
 * @param {Object} input
 * @param {string} input.rawDiff - Raw unified diff string
 * @param {string} [input.prDescription] - PR description text
 * @param {string[]} [input.changedFiles] - List of changed file paths
 * @param {Object} [input.authorContext] - Author context signals
 * @param {Object} [input.repoContext] - Repository context
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Verbose logging
 * @param {boolean} [options.logToFile] - Persist logs to file
 * @param {boolean} [options.jsonOutput] - Return JSON instead of markdown
 * @returns {Object} Analysis result
 */
async function analyze(input, options = {}) {
  const logger = new Logger({
    verbose: options.verbose || false,
    logToFile: options.logToFile || false
  });

  const timestamp = new Date();

  // ── Performance: Check cache ──────────────────────────────────────────────
  const diffHash = crypto.createHash('sha256').update(input.rawDiff || '').digest('hex');
  if (diffCache.has(diffHash)) {
    logger.info('Cache hit — returning previously computed result', { hash: diffHash.substring(0, 12) });
    return diffCache.get(diffHash);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: DETERMINISTIC ANALYSIS (Authoritative)
  // ════════════════════════════════════════════════════════════════════════════
  logger.info('Phase 1: Running deterministic analysis');

  const parsed = parseDiff(input.rawDiff);
  logger.debug('Diff parsed', { file_count: parsed.file_count, additions: parsed.total_additions, deletions: parsed.total_deletions });

  const secrets = secretDetector.scan(parsed);
  logger.info('Secret scan complete', { secrets_detected: secrets.secrets_detected });

  const sensitive = sensitiveFiles.classify(parsed);
  logger.debug('Sensitive file classification complete', { sensitive_count: sensitive.sensitive_file_count });

  const metrics = diffMetrics.compute(parsed);
  logger.debug('Diff metrics computed', { change_size: metrics.change_size, total_changes: metrics.total_changes });

  const risk = riskEngine.score({
    secrets,
    sensitiveFiles: sensitive,
    metrics,
    timestamp
  });
  logger.info('Risk score computed', { risk_score: risk.risk_score, recommendation: risk.recommendation });

  // Assemble deterministic signals
  const signals = {
    secrets,
    sensitive_files: sensitive,
    diff_metrics: metrics,
    risk_score: risk.risk_score,
    risk_breakdown: risk.breakdown,
    recommendation: risk.recommendation,
    hard_constraints_triggered: risk.hard_constraints_triggered
  };

  logger.info('Deterministic signals assembled', {
    risk_score: signals.risk_score,
    secrets_detected: signals.secrets.secrets_detected,
    sensitive_files: signals.sensitive_files.sensitive_file_count,
    recommendation: signals.recommendation,
    hard_constraints: signals.hard_constraints_triggered
  });

  // Write signals to memory/runtime/context.md for GitAgent compatibility
  writeSignalsToContext(signals);

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: LLM REASONING (Advisory, with graceful degradation)
  // ════════════════════════════════════════════════════════════════════════════
  logger.info('Phase 2: LLM reasoning layer');

  let llmOutput;
  let llmFailed = false;

  try {
    // Prepare LLM input with truncation safeguard
    let diffForLLM = input.rawDiff || '';
    let truncated = false;
    if (diffForLLM.length > MAX_LLM_INPUT_SIZE) {
      diffForLLM = diffForLLM.substring(0, MAX_LLM_INPUT_SIZE);
      truncated = true;
      logger.warn('Diff truncated for LLM input', {
        original_size: input.rawDiff.length,
        truncated_to: MAX_LLM_INPUT_SIZE
      });
    }

    // Build the LLM prompt payload
    const promptPayload = buildLLMPayload(signals, diffForLLM, input, truncated);
    logger.info('LLM input payload prepared', { size: promptPayload.length });

    // In standalone mode (no gitagent runtime), generate merge brief from deterministic signals
    // When gitagent runtime is available, this would invoke the actual LLM skills
    llmOutput = generateMergeBrief(signals, parsed, input, timestamp, truncated);

  } catch (err) {
    // ── Graceful Degradation ──────────────────────────────────────────────
    logger.warn('LLM reasoning failed — falling back to deterministic-only analysis', err.message || err);
    llmFailed = true;
    llmOutput = buildDeterministicFallback(signals, parsed, input, timestamp);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3: ENFORCEMENT + CONFIDENCE CALIBRATION
  // ════════════════════════════════════════════════════════════════════════════
  logger.info('Phase 3: Enforcement + calibration');

  const enforced = enforceHardConstraints(signals, llmOutput);
  if (enforced._enforcements && enforced._enforcements.length > 0) {
    logger.warn('Enforcement actions taken', enforced._enforcements);
  }

  const calibrated = calibrateConfidence(signals, enforced);
  if (calibrated._confidence_calibrated) {
    logger.info('Confidence calibrated', calibrated._calibration_reason);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4: LOGGING
  // ════════════════════════════════════════════════════════════════════════════
  const result = {
    merge_brief: calibrated.merge_brief,
    recommendation: calibrated.recommendation,
    risk_score: calibrated.risk_score,
    blocking_issues: calibrated.blocking_issues || [],
    confidence_level: calibrated.confidence_level,
    deterministic_signals: signals,
    _metadata: {
      analyzed_at: timestamp.toISOString(),
      diff_hash: diffHash.substring(0, 12),
      llm_fallback: llmFailed,
      enforcements: calibrated._enforcements || [],
      confidence_calibrated: calibrated._confidence_calibrated || false
    }
  };

  logger.info('Final decision', {
    recommendation: result.recommendation,
    risk_score: result.risk_score,
    confidence: result.confidence_level,
    blocking_issues: result.blocking_issues.length,
    llm_fallback: llmFailed
  });

  // Persist logs if requested
  const logFile = logger.persist();
  if (logFile) {
    logger.info('Logs persisted to', logFile);
  }

  // Cache the result
  diffCache.set(diffHash, result);

  return result;
}

/**
 * Build the LLM prompt payload (for when gitagent runtime is available).
 */
function buildLLMPayload(signals, diff, input, truncated) {
  const payload = {
    deterministic_signals: signals,
    pr_diff: diff,
    pr_description: input.prDescription || '',
    changed_files: input.changedFiles || [],
    author_context: input.authorContext || null,
    repo_context: input.repoContext || null,
    truncated: truncated
  };

  return JSON.stringify(payload);
}

/**
 * Generate a merge brief from deterministic signals + structured reasoning.
 * This runs as the standalone synthesizer when no LLM runtime is available.
 */
function generateMergeBrief(signals, parsed, input, timestamp, truncated) {
  const { risk_score, recommendation, risk_breakdown, hard_constraints_triggered } = signals;
  const { secrets, sensitive_files, diff_metrics } = signals;

  // Determine confidence level
  let confidenceLevel = 'HIGH';
  let confidenceBasis = 'All signals computed deterministically with full diff context.';

  if (truncated) {
    confidenceLevel = 'MEDIUM';
    confidenceBasis = 'Diff was truncated — analysis may be incomplete for truncated sections.';
  }

  if (parsed.error) {
    confidenceLevel = 'LOW';
    confidenceBasis = 'Diff parsing encountered errors — analysis is based on partial data.';
  }

  // Build blocking issues
  const blockingIssues = [];
  if (secrets.secrets_detected > 0) {
    for (const finding of secrets.findings) {
      blockingIssues.push({
        location: `${finding.file}:L${finding.line}`,
        observation: `${finding.type} detected matching pattern. Content: ${finding.matched_content}`,
        consequence: 'If merged, this credential will be permanently embedded in Git history. Any user with repository read access can extract it.',
        required_action: '(1) Remove the hardcoded credential. (2) Rotate the credential immediately. (3) Replace with environment variable injection.',
        confidence: finding.confidence,
        source: 'deterministic'
      });
    }
  }

  // Build risk factors
  const riskFactors = [];
  for (const f of sensitive_files.files || []) {
    if (f.category !== 'LOW') {
      riskFactors.push({
        confidence: 'CONFIRMED',
        description: `${f.category} risk file: \`${f.path}\` — ${f.reason}`
      });
    }
  }

  // Build the markdown merge brief
  const brief = buildMarkdownBrief({
    recommendation,
    risk_score,
    risk_breakdown,
    hard_constraints_triggered,
    blocking_issues: blockingIssues,
    risk_factors: riskFactors,
    diff_metrics,
    sensitive_files,
    secrets,
    parsed,
    input,
    timestamp,
    confidenceLevel,
    confidenceBasis,
    truncated
  });

  return {
    merge_brief: brief,
    recommendation,
    risk_score,
    blocking_issues: blockingIssues,
    confidence_level: confidenceLevel,
    confidence_basis: confidenceBasis
  };
}

/**
 * Build the markdown merge brief document.
 */
function buildMarkdownBrief(data) {
  const {
    recommendation, risk_score, risk_breakdown, hard_constraints_triggered,
    blocking_issues, risk_factors, diff_metrics, sensitive_files, secrets,
    parsed, input, timestamp, confidenceLevel, confidenceBasis, truncated
  } = data;

  const lines = [];
  const ts = timestamp.toISOString();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[timestamp.getDay()];
  const timeStr = `${ts} (${dayName}, ${timestamp.getHours()}:${String(timestamp.getMinutes()).padStart(2, '0')} local time)`;

  lines.push('# PRGuardian Merge Brief');
  lines.push('');
  if (input.prDescription) {
    const titleMatch = input.prDescription.match(/^(.+?)[\n\r]/);
    if (titleMatch) {
      lines.push(`**PR:** ${titleMatch[1]}`);
    }
  }
  lines.push(`**Analyzed:** ${timeStr}`);
  lines.push(`**Files Changed:** ${parsed.file_count}`);
  lines.push(`**Lines Changed:** +${diff_metrics.total_additions} / -${diff_metrics.total_deletions} (${diff_metrics.change_size})`);
  if (truncated) {
    lines.push(`**⚠️ Note:** Diff was truncated to ${MAX_LLM_INPUT_SIZE} characters for analysis.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Recommendation
  lines.push(`## Recommendation: ${recommendation}`);
  lines.push('');
  lines.push(`**Risk Score:** ${risk_score}/100`);

  // Primary reason
  if (hard_constraints_triggered.length > 0) {
    lines.push(`**Primary Reason:** Hard constraint triggered — ${hard_constraints_triggered.join(', ')}.`);
  } else if (recommendation === 'DO_NOT_MERGE') {
    lines.push(`**Primary Reason:** Risk score exceeds safety threshold (${risk_score}/100).`);
  } else if (recommendation === 'MERGE_WITH_CONDITIONS') {
    lines.push(`**Primary Reason:** Elevated risk factors require conditions before merge.`);
  } else {
    lines.push(`**Primary Reason:** Low-risk change with no blocking issues detected.`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Blocking Issues
  lines.push('## Blocking Issues');
  lines.push('');
  if (blocking_issues.length === 0) {
    lines.push('No blocking issues identified.');
  } else {
    for (let i = 0; i < blocking_issues.length; i++) {
      const issue = blocking_issues[i];
      lines.push(`### Blocking Issue ${i + 1}: ${issue.confidence} Detection`);
      lines.push('');
      lines.push(`**LOCATION:** \`${issue.location}\``);
      lines.push(`**OBSERVATION:** ${issue.observation}`);
      lines.push(`**CONSEQUENCE:** ${issue.consequence}`);
      lines.push(`**REQUIRED ACTION:** ${issue.required_action}`);
      lines.push('');
      lines.push(`**Confidence:** ${issue.confidence}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // Risk Factors
  lines.push('## Risk Factors');
  lines.push('');
  if (risk_factors.length === 0) {
    lines.push('No elevated risk factors identified.');
  } else {
    for (let i = 0; i < risk_factors.length; i++) {
      lines.push(`${i + 1}. **[${risk_factors[i].confidence}]** ${risk_factors[i].description}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Change Classification
  lines.push('## Change Classification');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files Changed | ${diff_metrics.file_count} |`);
  lines.push(`| Lines Added | ${diff_metrics.total_additions} |`);
  lines.push(`| Lines Deleted | ${diff_metrics.total_deletions} |`);
  lines.push(`| Change Size | ${diff_metrics.change_size} |`);
  lines.push(`| Primary Language | ${diff_metrics.primary_language} |`);
  if (diff_metrics.file_types) {
    const typeStr = Object.entries(diff_metrics.file_types).map(([ext, count]) => `${ext}: ${count}`).join(', ');
    lines.push(`| File Types | ${typeStr} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Blast Radius (sensitive files)
  lines.push('## Blast Radius');
  lines.push('');
  if (sensitive_files.sensitive_file_count === 0) {
    lines.push('**Scope:** CONTAINED');
    lines.push('');
    lines.push('No sensitive files affected. Changes are isolated.');
  } else {
    const scope = sensitive_files.total_risk_factor > 40 ? 'CODEBASE_WIDE' :
                  sensitive_files.total_risk_factor > 20 ? 'CROSS_MODULE' :
                  sensitive_files.total_risk_factor > 10 ? 'MODULE' : 'CONTAINED';
    lines.push(`**Scope:** ${scope}`);
    lines.push('');
    lines.push('| File | Category | Risk Factor | Module |');
    lines.push('|------|----------|-------------|--------|');
    for (const f of sensitive_files.files) {
      if (f.category !== 'LOW') {
        lines.push(`| \`${f.path}\` | ${f.category} | +${f.risk_factor} | ${f.module} |`);
      }
    }
  }

  lines.push('');
  lines.push('### Out of Scope');
  lines.push('');
  lines.push('The following could not be assessed from the available diff:');
  lines.push('- Services in other repositories that consume affected APIs');
  lines.push('- Runtime dependencies not visible in the import graph');
  lines.push('- Other in-flight PRs that may interact with the same files');
  lines.push('- Cache invalidation behavior and background job interactions');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Risk Score Breakdown
  lines.push('## Risk Score Breakdown');
  lines.push('');
  lines.push('| Factor | Contribution | Max | Detail |');
  lines.push('|--------|-------------|-----|--------|');
  for (const factor of risk_breakdown) {
    lines.push(`| ${factor.factor} | +${factor.contribution} | ${factor.max} | ${factor.detail} |`);
  }
  lines.push(`| **Total** | **${risk_score}** | **100** | |`);

  lines.push('');
  lines.push('---');
  lines.push('');

  // Conditions
  lines.push('## Conditions for Merge');
  lines.push('');
  if (recommendation === 'MERGE') {
    lines.push('No conditions. Clear to merge.');
  } else if (recommendation === 'DO_NOT_MERGE') {
    lines.push('Resolve all blocking issues above before re-review.');
    if (secrets.secrets_detected > 0) {
      lines.push('');
      lines.push('**Required before re-submission:**');
      let condNum = 1;
      for (const finding of secrets.findings) {
        lines.push(`${condNum}. Remove \`${finding.type}\` from \`${finding.file}\` and replace with environment variable`);
        condNum++;
        lines.push(`${condNum}. Rotate the compromised credential — it exists in branch history`);
        condNum++;
      }
    }
  } else {
    // MERGE_WITH_CONDITIONS
    let condNum = 1;
    for (const f of sensitive_files.files) {
      if (f.category === 'CRITICAL') {
        lines.push(`${condNum}. Verify that changes to \`${f.path}\` (${f.module}) have been reviewed by a domain expert`);
        condNum++;
      }
    }
    if (diff_metrics.change_size === 'LARGE' || diff_metrics.change_size === 'VERY_LARGE') {
      lines.push(`${condNum}. Large change (${diff_metrics.total_changes} lines) — verify comprehensive test coverage`);
      condNum++;
    }
    if (condNum === 1) {
      lines.push('1. Verify all risk factors above have been reviewed and accepted');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Confidence closing
  lines.push(`Confidence in this assessment: ${confidenceLevel}. Basis: ${confidenceBasis}`);
  lines.push('');
  lines.push('This analysis covers technical consequence prediction only. Business logic validation, product intent review, and final merge authority remain with the engineering team.');

  return lines.join('\n');
}

/**
 * Build deterministic-only fallback output when LLM fails.
 */
function buildDeterministicFallback(signals, parsed, input, timestamp) {
  const result = generateMergeBrief(signals, parsed, input, timestamp, false);

  result._fallback = true;
  result._fallback_reason = 'LLM unavailable — deterministic analysis only';
  result.confidence_level = 'MEDIUM';
  result.confidence_basis = 'LLM reasoning unavailable. Assessment based on deterministic signal analysis only.';

  // Append fallback notice to the brief
  result.merge_brief += '\n\n---\n\n> **⚠️ Note:** This analysis was produced using deterministic signals only. LLM-based consequence prediction, failure mode modeling, and deployment timing reasoning were not available. The risk score and recommendation are reliable; the explanatory narrative is limited.\n';

  return result;
}

/**
 * Write deterministic signals to memory/runtime/context.md for GitAgent workflow compatibility.
 */
function writeSignalsToContext(signals) {
  try {
    const contextDir = path.join(process.cwd(), 'memory', 'runtime');
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    const contextPath = path.join(contextDir, 'context.md');
    const content = [
      '# Runtime Context — Deterministic Signals',
      '',
      '> Auto-generated by PRGuardian deterministic analysis layer.',
      '> These signals are AUTHORITATIVE. LLM skills must not override them.',
      '',
      '```json',
      JSON.stringify(signals, null, 2),
      '```',
      '',
      `Generated at: ${new Date().toISOString()}`
    ].join('\n');

    fs.writeFileSync(contextPath, content);
  } catch {
    // Non-critical — context file is for GitAgent compatibility only
  }
}

module.exports = { analyze };
