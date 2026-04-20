#!/usr/bin/env node
'use strict';

/**
 * PRGuardian — Deterministic Test Suite
 * 
 * Tests all deterministic modules WITHOUT LLM dependency.
 * Run: node tests/test-runner.js
 */

const path = require('path');
const fs = require('fs');

// ── Import modules under test ───────────────────────────────────────────────
const { parseDiff, parseInputFile } = require('../src/analyzers/diff-parser');
const secretDetector = require('../src/analyzers/secret-detector');
const sensitiveFiles = require('../src/analyzers/sensitive-files');
const diffMetrics = require('../src/analyzers/diff-metrics');
const riskEngine = require('../src/scoring/risk-engine');
const { enforceHardConstraints, calibrateConfidence } = require('../src/enforcement');

// ── Test infrastructure ─────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, detail) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedTests++;
    const msg = `  ❌ ${testName}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

function assertEqual(actual, expected, testName) {
  const pass = actual === expected;
  assert(pass, testName, pass ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertGreaterThan(actual, threshold, testName) {
  assert(actual > threshold, testName, `expected > ${threshold}, got ${actual}`);
}

function assertLessThan(actual, threshold, testName) {
  assert(actual < threshold, testName, `expected < ${threshold}, got ${actual}`);
}

function section(name) {
  console.log(`\n  ── ${name} ${'─'.repeat(60 - name.length)}\n`);
}

// ── Load fixtures ───────────────────────────────────────────────────────────

const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       🛡️  PRGuardian — Deterministic Test Suite      ║');
console.log('╚══════════════════════════════════════════════════════╝');

// ── 1. Diff Parser Tests ────────────────────────────────────────────────────

section('Diff Parser');

// Test: Safe PR
const safeDiff = loadFixture('safe-pr.diff');
const safeParsed = parseDiff(safeDiff);
assertEqual(safeParsed.file_count, 2, 'Safe PR: parses 2 files');
assertGreaterThan(safeParsed.total_additions, 0, 'Safe PR: has additions');
assertEqual(safeParsed.files[0].path, 'README.md', 'Safe PR: first file is README.md');

// Test: Secret leak PR
const secretDiff = loadFixture('secret-leak.diff');
const secretParsed = parseDiff(secretDiff);
assertGreaterThan(secretParsed.file_count, 0, 'Secret PR: parses files');
assertGreaterThan(secretParsed.total_additions, 0, 'Secret PR: has additions');

// Test: Auth change PR
const authDiff = loadFixture('auth-change.diff');
const authParsed = parseDiff(authDiff);
assertGreaterThan(authParsed.file_count, 0, 'Auth PR: parses files');

// Test: Empty/invalid input
const emptyParsed = parseDiff('');
assertEqual(emptyParsed.error, 'INVALID_DIFF', 'Empty input: returns INVALID_DIFF');
assertEqual(emptyParsed.file_count, 0, 'Empty input: 0 files');

const nullParsed = parseDiff(null);
assertEqual(nullParsed.error, 'INVALID_DIFF', 'Null input: returns INVALID_DIFF');

// Test: JSON input parsing
const samplePR = fs.readFileSync(path.join(__dirname, '..', 'demo', 'sample_pr.json'), 'utf-8');
const jsonInput = parseInputFile(samplePR);
assertGreaterThan(jsonInput.rawDiff.length, 0, 'JSON input: extracts rawDiff');
assertGreaterThan(jsonInput.changedFiles.length, 0, 'JSON input: extracts changedFiles');
assert(jsonInput.authorContext !== null, 'JSON input: extracts authorContext');

// ── 2. Secret Detector Tests ────────────────────────────────────────────────

section('Secret Detector');

// Test: Secret leak PR should detect secrets
const secretScan = secretDetector.scan(secretParsed);
assertGreaterThan(secretScan.secrets_detected, 0, 'Secret PR: detects secrets');

// Check for specific secret types
const secretTypes = secretScan.findings.map(f => f.type);
assert(
  secretTypes.some(t => t.includes('Stripe') || t.includes('AWS') || t.includes('PostgreSQL')),
  'Secret PR: identifies high-severity secret type'
);

// Test: Safe PR should detect NO secrets
const safeScan = secretDetector.scan(safeParsed);
assertEqual(safeScan.secrets_detected, 0, 'Safe PR: no secrets detected');

// Test: Auth change PR should detect NO secrets (no hardcoded creds)
const authScan = secretDetector.scan(authParsed);
assertEqual(authScan.secrets_detected, 0, 'Auth PR: no secrets detected');

// Test: False positive filtering
const falsePositiveDiff = parseDiff(`diff --git a/config.js b/config.js
--- a/config.js
+++ b/config.js
@@ -1,2 +1,3 @@
+const apiKey = process.env.API_KEY;
+const example = 'AKIAIOSFODNN7EXAMPLE';
+const testKey = 'sk_test_placeholder_not_real_key_here1';
`);
const fpScan = secretDetector.scan(falsePositiveDiff);
assertEqual(fpScan.secrets_detected, 0, 'False positive: env vars and placeholder keys are filtered');

// ── 3. Sensitive Files Tests ────────────────────────────────────────────────

section('Sensitive File Detector');

// Test: Auth change PR should flag sensitive files
const authSensitive = sensitiveFiles.classify(authParsed);
assertGreaterThan(authSensitive.sensitive_file_count, 0, 'Auth PR: detects sensitive files');

// Verify specific classifications
const authFiles = authSensitive.files;
const authMiddleware = authFiles.find(f => f.path.includes('auth/'));
assert(authMiddleware !== undefined, 'Auth PR: identifies auth directory file');
if (authMiddleware) {
  assertEqual(authMiddleware.category, 'CRITICAL', 'Auth PR: auth file classified as CRITICAL');
}

const migrationFile = authFiles.find(f => f.path.includes('migrations'));
assert(migrationFile !== undefined, 'Auth PR: identifies migration file');
if (migrationFile) {
  assertEqual(migrationFile.category, 'HIGH', 'Auth PR: migration classified as HIGH');
}

// Test: Safe PR should have no sensitive files
const safeSensitive = sensitiveFiles.classify(safeParsed);
assertEqual(safeSensitive.sensitive_file_count, 0, 'Safe PR: no sensitive files');

// Test: Individual file classification
const { classifyFile } = sensitiveFiles;
assertEqual(classifyFile('src/auth/middleware/validate.ts').category, 'CRITICAL', 'classifyFile: auth middleware → CRITICAL');
assertEqual(classifyFile('src/payments/checkout.ts').category, 'CRITICAL', 'classifyFile: payments → CRITICAL');
assertEqual(classifyFile('src/shared/utils/format.ts').category, 'HIGH', 'classifyFile: shared utils → HIGH');
assertEqual(classifyFile('migrations/001_init.sql').category, 'HIGH', 'classifyFile: migrations → HIGH');
assertEqual(classifyFile('src/services/user.ts').category, 'MODERATE', 'classifyFile: services → MODERATE');
assertEqual(classifyFile('README.md').category, 'LOW', 'classifyFile: README → LOW');
assertEqual(classifyFile('tests/unit/helper.ts').category, 'LOW', 'classifyFile: tests → LOW');

// ── 4. Diff Metrics Tests ───────────────────────────────────────────────────

section('Diff Metrics');

const safeMetrics = diffMetrics.compute(safeParsed);
assertEqual(safeMetrics.file_count, 2, 'Safe PR: 2 files');
assertEqual(safeMetrics.change_size, 'SMALL', 'Safe PR: SMALL change size');
assertEqual(safeMetrics.primary_language, 'Markdown', 'Safe PR: primary language is Markdown');

const secretMetrics = diffMetrics.compute(secretParsed);
assertGreaterThan(secretMetrics.total_changes, 0, 'Secret PR: has changes');

const authMetrics = diffMetrics.compute(authParsed);
assertGreaterThan(authMetrics.file_count, 2, 'Auth PR: multiple files changed');
assertGreaterThan(authMetrics.file_type_count, 1, 'Auth PR: multiple file types');

// ── 5. Risk Engine Tests ────────────────────────────────────────────────────

section('Risk Engine');

// Test: Safe PR → low risk, MERGE
const safeRisk = riskEngine.score({
  secrets: { secrets_detected: 0, findings: [] },
  sensitiveFiles: safeSensitive,
  metrics: safeMetrics,
  timestamp: new Date('2026-04-15T10:00:00') // Tuesday 10 AM
});
assertLessThan(safeRisk.risk_score, 15, 'Safe PR: risk score < 15');
assertEqual(safeRisk.recommendation, 'MERGE', 'Safe PR: recommendation is MERGE');
assertEqual(safeRisk.hard_constraints_triggered.length, 0, 'Safe PR: no hard constraints');

// Test: Secret PR → high risk, DO_NOT_MERGE
const secretRisk = riskEngine.score({
  secrets: secretScan,
  sensitiveFiles: sensitiveFiles.classify(secretParsed),
  metrics: secretMetrics,
  timestamp: new Date('2026-04-15T10:00:00')
});
assertGreaterThan(secretRisk.risk_score, 60, 'Secret PR: risk score > 60');
assertEqual(secretRisk.recommendation, 'DO_NOT_MERGE', 'Secret PR: recommendation is DO_NOT_MERGE');
assert(
  secretRisk.hard_constraints_triggered.includes('SECRET_DETECTED'),
  'Secret PR: SECRET_DETECTED constraint triggered'
);

// Test: Auth PR → medium risk, MERGE_WITH_CONDITIONS
const authRisk = riskEngine.score({
  secrets: authScan,
  sensitiveFiles: authSensitive,
  metrics: authMetrics,
  timestamp: new Date('2026-04-15T10:00:00')
});
assertGreaterThan(authRisk.risk_score, 25, 'Auth PR: risk score > 25');
assertEqual(authRisk.hard_constraints_triggered.length, 0, 'Auth PR: no hard constraints');

// Test: Friday timing increases risk
const fridayRisk = riskEngine.score({
  secrets: { secrets_detected: 0, findings: [] },
  sensitiveFiles: authSensitive,
  metrics: authMetrics,
  timestamp: new Date('2026-04-18T16:00:00') // Friday 4 PM
});
assertGreaterThan(fridayRisk.risk_score, authRisk.risk_score, 'Friday timing increases risk score');

// Test: Risk breakdown has 4 factors
assertEqual(safeRisk.breakdown.length, 4, 'Risk breakdown has 4 factors');
assert(
  safeRisk.breakdown.every(f => typeof f.contribution === 'number'),
  'All breakdown factors have numeric contributions'
);

// ── 6. Enforcement Tests ────────────────────────────────────────────────────

section('Enforcement Layer');

// Test: Secrets → force DO_NOT_MERGE
const signalsWithSecrets = {
  secrets: { secrets_detected: 1, findings: [{ type: 'AWS Key', file: 'config.ts', line: 5, confidence: 'CONFIRMED', matched_content: 'AKIA****' }] },
  risk_score: 85,
  recommendation: 'DO_NOT_MERGE'
};

const llmTriedMerge = {
  recommendation: 'MERGE',
  risk_score: 20,
  blocking_issues: [],
  confidence_level: 'HIGH'
};

const enforced = enforceHardConstraints(signalsWithSecrets, llmTriedMerge);
assertEqual(enforced.recommendation, 'DO_NOT_MERGE', 'Enforcement: secrets → DO_NOT_MERGE even if LLM says MERGE');
assertEqual(enforced.risk_score, 85, 'Enforcement: risk score corrected to deterministic value');
assertGreaterThan(enforced.blocking_issues.length, 0, 'Enforcement: secret blocking issue injected');
assertGreaterThan(enforced._enforcements.length, 0, 'Enforcement: actions are recorded');

// Test: Cannot upgrade recommendation
const signalsMedium = {
  secrets: { secrets_detected: 0, findings: [] },
  risk_score: 45,
  recommendation: 'MERGE_WITH_CONDITIONS'
};

const llmTriedUpgrade = {
  recommendation: 'MERGE',
  risk_score: 45,
  blocking_issues: [],
  confidence_level: 'HIGH'
};

const enforcedUpgrade = enforceHardConstraints(signalsMedium, llmTriedUpgrade);
assertEqual(enforcedUpgrade.recommendation, 'MERGE_WITH_CONDITIONS', 'Enforcement: cannot upgrade from MERGE_WITH_CONDITIONS to MERGE');

// Test: Can downgrade recommendation (LLM found additional issues)
const llmDowngraded = {
  recommendation: 'DO_NOT_MERGE',
  risk_score: 45,
  blocking_issues: [{ location: 'file.ts:L10', observation: 'Critical bug', consequence: 'Data loss', required_action: 'Fix' }],
  confidence_level: 'HIGH'
};

const enforcedDowngrade = enforceHardConstraints(signalsMedium, llmDowngraded);
assertEqual(enforcedDowngrade.recommendation, 'DO_NOT_MERGE', 'Enforcement: LLM can downgrade recommendation');

// ── 7. Confidence Calibration Tests ─────────────────────────────────────────

section('Confidence Calibration');

// Test: High risk + LOW confidence → MEDIUM
const highRiskLowConf = calibrateConfidence(
  { risk_score: 80, secrets: { secrets_detected: 0, findings: [] } },
  { recommendation: 'DO_NOT_MERGE', risk_score: 80, confidence_level: 'LOW' }
);
assertEqual(highRiskLowConf.confidence_level, 'MEDIUM', 'Calibration: risk > 70 + LOW → MEDIUM');
assertEqual(highRiskLowConf._confidence_calibrated, true, 'Calibration: flagged as calibrated');

// Test: Secrets + LOW confidence → MEDIUM
const secretsLowConf = calibrateConfidence(
  { risk_score: 85, secrets: { secrets_detected: 1, findings: [] } },
  { recommendation: 'DO_NOT_MERGE', risk_score: 85, confidence_level: 'LOW' }
);
assertEqual(secretsLowConf.confidence_level, 'MEDIUM', 'Calibration: secrets + LOW → MEDIUM');

// Test: Low risk + HIGH confidence → stays HIGH (valid)
const lowRiskHighConf = calibrateConfidence(
  { risk_score: 10, secrets: { secrets_detected: 0, findings: [] } },
  { recommendation: 'MERGE', risk_score: 10, confidence_level: 'HIGH' }
);
assertEqual(lowRiskHighConf.confidence_level, 'HIGH', 'Calibration: low risk + HIGH stays HIGH');

// Test: Fallback → always MEDIUM
const fallbackConf = calibrateConfidence(
  { risk_score: 10, secrets: { secrets_detected: 0, findings: [] } },
  { recommendation: 'MERGE', risk_score: 10, confidence_level: 'HIGH', _fallback: true }
);
assertEqual(fallbackConf.confidence_level, 'MEDIUM', 'Calibration: fallback → MEDIUM');

// ── 8. Graceful Degradation Tests ───────────────────────────────────────────

section('Graceful Degradation');

// Test: Malformed diff doesn't crash
const malformedParsed = parseDiff('this is not a valid diff at all');
assert(malformedParsed !== null, 'Malformed diff: returns valid object (not crash)');
assertEqual(malformedParsed.file_count, 0, 'Malformed diff: 0 files parsed');

const malformedSecrets = secretDetector.scan(malformedParsed);
assertEqual(malformedSecrets.secrets_detected, 0, 'Malformed diff: secret scan returns 0');

const malformedSensitive = sensitiveFiles.classify(malformedParsed);
assertEqual(malformedSensitive.sensitive_file_count, 0, 'Malformed diff: sensitive file scan returns 0');

const malformedMetrics = diffMetrics.compute(malformedParsed);
assertEqual(malformedMetrics.file_count, 0, 'Malformed diff: metrics returns 0 files');

const malformedRisk = riskEngine.score({
  secrets: malformedSecrets,
  sensitiveFiles: malformedSensitive,
  metrics: malformedMetrics,
  timestamp: new Date()
});
assert(typeof malformedRisk.risk_score === 'number', 'Malformed diff: risk engine returns numeric score');
assert(['MERGE', 'MERGE_WITH_CONDITIONS', 'DO_NOT_MERGE'].includes(malformedRisk.recommendation), 'Malformed diff: valid recommendation');

// ── 9. End-to-End Integration ───────────────────────────────────────────────

section('End-to-End (Deterministic Pipeline)');

// Test full pipeline for each fixture
function runDeterministicPipeline(diffContent, name) {
  const parsed = parseDiff(diffContent);
  const secrets = secretDetector.scan(parsed);
  const sensitive = sensitiveFiles.classify(parsed);
  const metrics = diffMetrics.compute(parsed);
  const risk = riskEngine.score({
    secrets,
    sensitiveFiles: sensitive,
    metrics,
    timestamp: new Date('2026-04-15T10:00:00') // Controlled timestamp
  });

  return { parsed, secrets, sensitive, metrics, risk };
}

// Safe PR e2e
const safeE2E = runDeterministicPipeline(safeDiff, 'safe-pr');
assertEqual(safeE2E.risk.recommendation, 'MERGE', 'E2E Safe PR: MERGE');
assertLessThan(safeE2E.risk.risk_score, 15, 'E2E Safe PR: score < 15');
assertEqual(safeE2E.secrets.secrets_detected, 0, 'E2E Safe PR: 0 secrets');

// Secret leak PR e2e
const secretE2E = runDeterministicPipeline(secretDiff, 'secret-leak');
assertEqual(secretE2E.risk.recommendation, 'DO_NOT_MERGE', 'E2E Secret PR: DO_NOT_MERGE');
assertGreaterThan(secretE2E.risk.risk_score, 60, 'E2E Secret PR: score > 60');
assertGreaterThan(secretE2E.secrets.secrets_detected, 0, 'E2E Secret PR: secrets detected');

// Auth change PR e2e
const authE2E = runDeterministicPipeline(authDiff, 'auth-change');
assertGreaterThan(authE2E.risk.risk_score, 25, 'E2E Auth PR: score > 25');
assertEqual(authE2E.secrets.secrets_detected, 0, 'E2E Auth PR: 0 secrets');
assertGreaterThan(authE2E.sensitive.sensitive_file_count, 0, 'E2E Auth PR: sensitive files detected');

// Demo sample_pr.json e2e
// Note: Demo PR uses placeholder secrets ('sk_live_EXAMPLE_REDACTED_KEY_HERE')
// which are correctly filtered by the false positive detector.
// Correct deterministic result: MERGE_WITH_CONDITIONS based on
// critical auth file changes + Friday deployment timing.
const sampleInput = parseInputFile(samplePR);
const sampleParsed = parseDiff(sampleInput.rawDiff);
const sampleSecrets = secretDetector.scan(sampleParsed);
const sampleSensitive = sensitiveFiles.classify(sampleParsed);
const sampleMetrics = diffMetrics.compute(sampleParsed);
const sampleRisk = riskEngine.score({
  secrets: sampleSecrets,
  sensitiveFiles: sampleSensitive,
  metrics: sampleMetrics,
  timestamp: new Date('2026-03-28T16:47:00') // Saturday 16:47 (March 28, 2026)
});

assertGreaterThan(sampleRisk.risk_score, 40, 'E2E Demo PR: score > 40 (critical files + weekend timing)');
assertEqual(sampleRisk.recommendation, 'MERGE_WITH_CONDITIONS', 'E2E Demo PR: MERGE_WITH_CONDITIONS (placeholder secrets filtered)');

// ════════════════════════════════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════');
console.log(`  Results: ${passedTests}/${totalTests} passed, ${failedTests} failed`);

if (failedTests > 0) {
  console.log('\n  Failed tests:');
  for (const f of failures) {
    console.log(f);
  }
  console.log('');
  process.exit(1);
} else {
  console.log('  🎉 All tests passed!');
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}
