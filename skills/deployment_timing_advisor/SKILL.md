# SKILL — Deployment Timing Advisor
---
name: deployment_timing_advisor
description: Recommends optimal deployment timing based on risk and context
---
## Purpose

Recommend **when** to deploy a change, not just whether to merge it. A change that is technically safe to merge may be dangerous to deploy at the wrong time. A database migration on Friday at 17:00 is a different risk than the same migration on Tuesday at 10:00.

This skill turns PRGuardian from a merge reviewer into a deployment strategist.

---

## Inputs

This skill requires:
1. **Diff semantic analysis** — from `diff_semantic_analyzer` (what type of changes are being made)
2. **Blast radius** — from `blast_radius_estimator` (what systems are affected)
3. **Current timestamp** — the exact date and time the analysis is running
4. **Repo context** — whether the repo has payments, auth, or other critical modules

---

## Deployment Risk Calendar

### High-Risk Windows (AVOID)

| Window | Reason | Override Condition |
|--------|--------|--------------------|
| **Friday 14:00 – Monday 09:00** | Weekend coverage is reduced. Incidents during this window have slower response times and higher MTTR. | Hotfix for active production incident only. |
| **Day before a public holiday** | Same as Friday — reduced coverage in the following days. | Hotfix only. |
| **End of month (last 2 business days)** | Financial systems processing month-end. Payments, billing, and reporting are under higher load. | Non-financial changes to isolated modules only. |
| **End of quarter (last 3 business days)** | Quarterly reporting, compliance deadlines, audit windows. Higher organizational stress. | Non-financial, non-reporting changes only. |
| **Between 16:00–09:00 local time** | Evening and night deploys have fewer engineers available for incident response. | Scheduled maintenance window with on-call coverage only. |

### Low-Risk Windows (PREFERRED)

| Window | Reason |
|--------|--------|
| **Tuesday – Thursday, 10:00 – 14:00** | Mid-week, mid-day. Maximum team availability. Full business day remaining for monitoring. |
| **After a deploy freeze lifts** | Team is alert, monitoring is focused, rollback procedures are fresh. |
| **During scheduled maintenance windows** | Explicitly planned downtime with communication to users. |

### Change-Type-Specific Timing

| Change Type | Timing Rule |
|-------------|-------------|
| **Database migration (schema change)** | Deploy during maintenance window or lowest-traffic hour. Never on Friday. Must verify rollback procedure before execution. |
| **Auth/session changes** | Tuesday–Thursday only. Mid-day preferred. Must have on-call engineer aware of the change. |
| **Payment flow changes** | Never end-of-month. Tuesday–Wednesday preferred. Require payment-team engineer on standby. |
| **Feature flag rollout** | Gradual rollout (1% → 10% → 50% → 100%) over 2–4 days. Start Tuesday, reach 100% by Thursday. |
| **API contract changes** | Coordinate with consuming teams. Deploy with backward compatibility first, deprecate old contract after consumers update. |
| **Configuration changes** | Deploy during business hours with immediate verification. Configuration issues are often immediately visible. |
| **Cosmetic/documentation changes** | No timing restrictions. Deploy anytime. |

---

## Procedure

### Step 1: Determine Current Time Context

Establish:
- What day of the week is it?
- What time is it (in the timezone of analysis)?
- Are we within 2 business days of month-end?
- Are we within 3 business days of quarter-end?
- Is there a public holiday within the next 2 business days?

### Step 2: Map Changes to Timing Rules

For each changed module identified by the blast radius estimator:
- Match the module to a change type in the timing rules above
- Determine the most restrictive timing requirement across all changed modules

Example: A PR that changes both a configuration file (deploy during business hours) and a database migration (deploy during maintenance window) inherits the migration timing: **maintenance window only**.

### Step 3: Feature Flag Assessment

Evaluate whether the change is suitable for gradual rollout via feature flags:
- Can the behavioral change be wrapped in a feature flag?
- Is there an existing feature flag system in the codebase?
- Would a gradual rollout reduce the blast radius of a potential failure?

If gradual rollout is feasible, recommend it as the deployment strategy regardless of timing.

### Step 4: Generate Recommendation

Produce a specific deployment timing recommendation with:
1. **Recommended deployment window** (specific day and time range)
2. **Justification** (why this window, referencing the change types and risks)
3. **Pre-deployment checklist** (what to verify before deploying)
4. **Monitoring plan** (what to watch after deploying)

---

## Output Format

```yaml
deployment_timing:
  analysis_timestamp: "2026-03-29T15:00:00+05:30"
  analysis_day: "Saturday"
  current_risk_context:
    - "Weekend — reduced engineering coverage"
    - "End of Q1 in 2 business days — elevated financial system sensitivity"

  recommended_window:
    earliest: "2026-04-01T10:00:00+05:30"  # Next Tuesday 10:00 AM
    latest: "2026-04-02T14:00:00+05:30"    # Wednesday 2:00 PM
    justification: |
      This PR modifies auth middleware and includes a database migration.
      Auth changes should not deploy on Friday or during weekends due to
      reduced coverage. The migration requires a low-traffic window.
      Tuesday–Wednesday mid-day provides maximum team availability and
      full remaining business days for monitoring.

  deploy_now_assessment: |
    ⛔ DO NOT DEPLOY NOW. Analysis is running on Saturday. The change
    touches auth middleware and includes a migration. Weekend deployment
    of auth-critical changes with database migration carries unacceptable
    risk with reduced incident response capacity.

  gradual_rollout:
    feasible: true
    recommendation: |
      The behavioral change to token validation can be wrapped in a feature flag.
      Recommended rollout: 1% Tuesday AM → 10% Tuesday PM (if no errors) →
      50% Wednesday AM → 100% Wednesday PM.
    estimated_full_rollout: "2 days"

  pre_deployment_checklist:
    - "Verify database migration rollback script works in staging"
    - "Confirm on-call engineer is aware of auth middleware changes"
    - "Run integration test suite against staging with migration applied"
    - "Verify FEATURE_FLAG_TIER_SYSTEM environment variable is set in production"

  post_deployment_monitoring:
    - metric: "Auth failure rate (/api/auth/*)"
      threshold: ">2% triggers investigation, >5% triggers rollback"
      duration: "Monitor for 2 hours post-deploy"
    - metric: "Database query latency on users table"
      threshold: ">500ms p95 triggers investigation"
      duration: "Monitor for 1 hour post-deploy"
    - metric: "Mobile crash rate"
      threshold: ">1.5x baseline triggers investigation"
      duration: "Monitor for 24 hours post-deploy"

  risk_score_contribution: 15  # contribution to overall risk score (timing-specific)
```

---

## Special Cases

### Hotfix Override
If the PR description or context indicates this is a hotfix for an active production incident, timing rules are relaxed:
- Deploy immediately if the fix resolves the active incident
- Note: "Hotfix timing override active. Standard deployment windows do not apply to active incident remediation."
- Still recommend post-deployment monitoring

### Pre-Merged to Staging
If the change has been deployed to a staging environment and validated:
- Reduce timing restriction severity by one level
- Note: "Change has been validated in staging. Timing risk is reduced but not eliminated."

### Cosmetic-Only Changes
If the diff semantic analyzer classified the PR as cosmetic-only:
- No timing restrictions
- "This change is cosmetic (formatting, comments, documentation). Deploy at your convenience."
