# SKILL — Failure Mode Predictor
---
name: failure_mode_predictor
description: Predicts potential failure scenarios that may occur after deployment
---
## Purpose

Generate 2–4 specific, concrete failure scenarios that could occur if the PR is merged. Not "there might be bugs." Not "consider edge cases." Specific named scenarios with causal chains, affected populations, production symptoms, and recovery paths.

This is the skill that most clearly separates PRGuardian from a static analysis tool. A linter finds violations. PRGuardian predicts consequences. This skill is where consequence prediction happens.

---

## Core Principle

Every failure scenario must answer five questions:

1. **TRIGGER:** What specific condition activates this failure?
2. **AFFECTED:** Who experiences the failure? How many users? Which user segments?
3. **SYMPTOM:** How does this failure manifest in production? What does the user see? What do the logs show?
4. **DETECTION:** How quickly will the team notice? What monitoring or alerting will catch it?
5. **RECOVERY:** How hard is it to fix? Can it be rolled back? Is there data loss?

---

## Procedure

### Step 1: Identify Change Vectors

From the diff semantic analysis (output of `diff_semantic_analyzer`), identify all BEHAVIORAL and CONTRACT changes. Each one is a potential failure vector.

For each change vector, ask:
- What assumption does this change make about the state of the system?
- What happens if that assumption is wrong?
- What happens at the boundary conditions of this change?

### Step 2: Apply Failure Mode Templates

For each change vector, apply the relevant failure mode templates from the knowledge base (`knowledge/risk_patterns.md`). Common templates:

#### Template: Auth Flow Disruption
**Applies when:** Any change to authentication, authorization, session management, or token handling.
```
SCENARIO: [Name — e.g., "Token Refresh Storm"]
TRIGGER: [Specific condition — e.g., "Mobile clients with tokens issued before the
  migration timestamp attempt to refresh and receive a 401 instead of a new token"]
AFFECTED: [Population — e.g., "All mobile users who authenticated before [timestamp],
  estimated 15-40% of active mobile sessions"]
SYMPTOM: [What happens — e.g., "Users are logged out and cannot re-authenticate.
  Error rate on /api/auth/refresh spikes from 0.1% to 35%. Mobile crash reports
  increase as the app enters a refresh retry loop."]
DETECTION: [How it's caught — e.g., "Auth failure rate alert triggers within 5 minutes
  if threshold is set at 5%. Without alerting, first report from users in ~15 minutes."]
RECOVERY: [Fix path — e.g., "Rollback the merge. Issue a force-refresh for all mobile
  clients. Users who were logged out will need to re-authenticate manually.
  No data loss but significant user friction. Recovery time: 30-60 minutes after rollback."]
CONFIDENCE: [HIGH CONFIDENCE / POSSIBLE / SPECULATIVE]
```

#### Template: Data Integrity Corruption
**Applies when:** Changes to serialization, deserialization, data mapping, field naming, or database schema.
```
SCENARIO: [Name — e.g., "Silent Field Mapping Corruption"]
TRIGGER: [Specific condition — what data path is affected]
AFFECTED: [Data scope — which records, which tables, which time window]
SYMPTOM: [What breaks — often silent; data is written but wrong]
DETECTION: [When noticed — data corruption is often detected days or weeks later]
RECOVERY: [Data recovery path — backup restoration, backfill scripts, manual correction]
CONFIDENCE: [level]
```

#### Template: Performance Degradation
**Applies when:** Changes to query patterns, loop logic, caching behavior, timeout values, or batch sizes.
```
SCENARIO: [Name — e.g., "N+1 Query Introduction"]
TRIGGER: [What request pattern triggers the degradation]
AFFECTED: [Which endpoints or features become slow]
SYMPTOM: [Response time increase, timeout rates, resource exhaustion]
DETECTION: [APM alerts, user complaints, resource monitoring]
RECOVERY: [Rollback, query optimization, caching addition]
CONFIDENCE: [level]
```

#### Template: Dependency Breakage
**Applies when:** Changes to shared utilities, exported functions, or API contracts.
```
SCENARIO: [Name — e.g., "Downstream Service Contract Violation"]
TRIGGER: [What the downstream consumer sends or expects that now fails]
AFFECTED: [Which services, which user flows through those services]
SYMPTOM: [Error responses, failed integrations, broken UI components]
DETECTION: [Integration test failures, cross-service error rate spikes]
RECOVERY: [Update consumers, version the API, rollback the change]
CONFIDENCE: [level]
```

#### Template: Configuration Drift
**Applies when:** Changes to environment variables, configuration files, or deployment manifests.
```
SCENARIO: [Name — e.g., "Missing Environment Variable in Production"]
TRIGGER: [Service starts without the new required config variable]
AFFECTED: [Service availability — potentially all users of the service]
SYMPTOM: [Startup crash, runtime error on first access to the missing config]
DETECTION: [Immediate if startup crash; delayed if lazy-loaded config]
RECOVERY: [Add the missing variable to production config, restart service]
CONFIDENCE: [level]
```

### Step 3: Score and Rank Scenarios

For each generated scenario, compute:

| Factor | Score Range | Description |
|--------|------------|-------------|
| Likelihood | 1-5 | How probable is the trigger condition? |
| Impact Severity | 1-5 | How bad is the consequence? (1=inconvenience, 5=data loss/security breach) |
| Detection Difficulty | 1-5 | How hard is it to notice? (1=immediate alert, 5=weeks before detection) |
| Recovery Difficulty | 1-5 | How hard is it to fix? (1=simple rollback, 5=manual data recovery) |

**Failure Mode Score** = Likelihood × Impact Severity × Detection Difficulty × Recovery Difficulty

Rank scenarios by Failure Mode Score, descending. Present the top 2–4.

### Step 4: Write Postmortem Preview (for high-severity scenarios)

For the highest-severity failure scenario, write a brief "postmortem preview" — a fictional account of what the incident report would look like if this failure occurred. Write it in past tense, as if it already happened. This makes the consequence visceral and real.

**Example postmortem preview:**
> On Thursday at 14:32 UTC, PR #247 was merged into main. The change optimized the mobile token refresh handler by caching the last-known-good token configuration. At 15:10, the auth failure rate began climbing. By 15:45, 23% of mobile API calls were returning 401 errors. The cached configuration did not account for tokens issued before the configuration change, causing the validator to reject valid tokens. On-call was alerted at 15:12 via PagerDuty. The rollback was initiated at 15:50 and completed at 16:02. Users who had been logged out during the 50-minute window had to re-authenticate manually. Total impact: approximately 12,000 users experienced forced logout. No data loss occurred.

---

## Output Format

```yaml
failure_modes:
  scenario_count: 3
  scenarios:
    - name: "Token Refresh Storm"
      confidence: HIGH CONFIDENCE
      trigger: "Mobile clients with tokens issued before migration attempt refresh"
      affected: "15-40% of active mobile sessions"
      symptom: "Mass 401 errors, mobile crash reports spike, auth failure rate jumps to 35%"
      detection: "Auth failure rate alert within 5 minutes"
      recovery: "Rollback merge, force-refresh mobile clients. 30-60 min recovery."
      scores:
        likelihood: 4
        impact: 4
        detection_difficulty: 1
        recovery_difficulty: 2
      failure_mode_score: 32
      postmortem_preview: |
        On Thursday at 14:32 UTC, PR #247 was merged...

    - name: "Silent Preference Corruption"
      confidence: POSSIBLE
      trigger: "Renamed serialization field causes downstream consumers to write null"
      affected: "All users who update preferences after merge"
      symptom: "Preferences appear to save but are stored as null in analytics pipeline"
      detection: "Analytics dashboard shows preference data drop — likely noticed in 3-5 days"
      recovery: "Backfill script needed. Data for affected window is unrecoverable from the primary store."
      scores:
        likelihood: 3
        impact: 5
        detection_difficulty: 4
        recovery_difficulty: 5
      failure_mode_score: 300

    - name: "Missing Environment Variable Crash"
      confidence: HIGH CONFIDENCE
      trigger: "Production deployment without new FEATURE_FLAG_TIER_SYSTEM env var"
      affected: "Entire service — all users"
      symptom: "Service fails to start or crashes on first request to tier-dependent feature"
      detection: "Immediate if startup crash, health check fails within 30 seconds"
      recovery: "Add env var to production config, redeploy. 5-10 min recovery."
      scores:
        likelihood: 3
        impact: 3
        detection_difficulty: 1
        recovery_difficulty: 1
      failure_mode_score: 9

  highest_risk_scenario: "Silent Preference Corruption"
  risk_score_contribution: 35  # contribution to overall risk score
```

---

## Constraints

1. **Generate at least 2 and at most 4 scenarios.** If you can only identify 1, state: "Only one failure mode identified. This may indicate a well-contained change or insufficient context for broader failure analysis."

2. **Do not generate generic scenarios.** Every scenario must reference specific files, functions, or logic from the diff. "There might be a bug" is not a failure scenario.

3. **Do not conflate severity with certainty.** A SPECULATIVE scenario can be high-severity (if it happened, it would be catastrophic). A CONFIRMED scenario can be low-severity (it will happen, but the impact is minor). Label both dimensions independently.

4. **Write the postmortem preview only for the highest-severity scenario.** The preview is a communication tool — it makes abstract risk concrete. Use it sparingly for maximum impact.

5. **If no non-trivial failure modes can be identified,** state: "No significant failure modes identified for this change. The modification appears to be well-contained with minimal production risk." Do not invent scenarios to fill a quota.
