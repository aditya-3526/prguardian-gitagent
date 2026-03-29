# SKILL — Merge Brief Synthesizer

## Purpose

This is the capstone skill. It takes outputs from all upstream skills and produces the final merge brief — the single document that a reviewer reads to understand whether this PR should be merged, under what conditions, and with what confidence.

The merge brief is PRGuardian's primary deliverable. Its quality determines whether PRGuardian is useful or noise. Every word must earn its place.

---

## Inputs

This skill consumes the outputs from all preceding skills:

| Skill | Output Used |
|-------|------------|
| `diff_semantic_analyzer` | PR classification, file classifications, cosmetic_only flag |
| `blast_radius_estimator` | Blast radius scope, affected systems, API contracts, out-of-scope items |
| `failure_mode_predictor` | Failure scenarios, highest-risk scenario, postmortem preview |
| `deployment_timing_advisor` | Recommended window, deploy-now assessment, gradual rollout feasibility |
| `reviewer_assignment_reasoner` | Required expertise, minimum reviewers, focus areas |
| `developer_context_synthesizer` | Scrutiny level, narrative (if available) |

---

## Procedure

### Step 1: Determine Recommendation

Apply the following decision tree:

```
IF any skill detected a CONFIRMED or HIGH CONFIDENCE secret pattern:
  → DO_NOT_MERGE (Rule R-002, condition 1)

ELSE IF any failure mode has Impact Severity 5 AND
        (confidence is CONFIRMED or HIGH CONFIDENCE) AND
        consequence involves data loss or security compromise:
  → DO_NOT_MERGE (Rule R-002, condition 2)

ELSE IF a CONTRACT change breaks backward compatibility AND
        no migration guide or version bump is present:
  → DO_NOT_MERGE (Rule R-002, condition 3)

ELSE IF risk_score > 50 OR any non-blocking conditions exist:
  → MERGE_WITH_CONDITIONS

ELSE:
  → MERGE
```

### Step 2: Compute Risk Score

The risk score is a composite from all skills:

| Component | Source | Range |
|-----------|--------|-------|
| Blast radius | `blast_radius_estimator` | 5–50 |
| Failure mode severity | `failure_mode_predictor` | 0–35 |
| Deployment timing risk | `deployment_timing_advisor` | 0–15 |
| Developer context | `developer_context_synthesizer` | 0–10 |
| Change classification base | `diff_semantic_analyzer` | 0–20 |

Classification base scores:
- COSMETIC only: 0
- STRUCTURAL only: 5
- BEHAVIORAL present: 15
- CONTRACT present: 20

**Total risk score** = sum of all components, clamped to [0, 100].

### Step 3: Identify Blocking Issues

Collect all findings that meet the DO_NOT_MERGE criteria from Rule R-002. Format each as:

```
**LOCATION:** [file:line]
**OBSERVATION:** [factual finding]
**CONSEQUENCE:** [predicted result if merged]
**REQUIRED ACTION:** [specific remediation]
```

### Step 4: Generate Conditions (if MERGE_WITH_CONDITIONS)

For each non-blocking risk factor, generate a specific, verifiable condition. Each condition must:
- Reference exact files, functions, or actions
- Be verifiable (reviewer can confirm yes/no)
- Not use banned vague language (per Rule R-003)

### Step 5: Determine Confidence Level

| Level | Criteria |
|-------|----------|
| HIGH | All skills returned complete results. No INSUFFICIENT_CONTEXT. No SPECULATIVE findings in blocking issues. |
| MEDIUM | One or two skills returned partial results or INSUFFICIENT_CONTEXT. Some findings are POSSIBLE confidence. |
| LOW | Multiple skills returned INSUFFICIENT_CONTEXT. Significant reliance on SPECULATIVE findings. Limited diff information. |

### Step 6: Assemble the Brief

Use the exact template below.

---

## Output Template

```markdown
# PRGuardian Merge Brief

**PR:** [PR title or identifier if available]
**Analyzed:** [timestamp]
**Files Changed:** [count]
**Non-Cosmetic Lines:** [count]

---

## Recommendation: [MERGE | MERGE_WITH_CONDITIONS | DO_NOT_MERGE]

**Risk Score:** [X]/100
**Primary Reason:** [One sentence — the single most important reason for this recommendation]

---

## Blocking Issues

[If DO_NOT_MERGE — list each blocking issue in LOCATION → OBSERVATION → CONSEQUENCE → REQUIRED ACTION format]

[If no blocking issues: "No blocking issues identified."]

---

## Risk Factors

[Non-blocking observations, ranked by severity. Each with confidence label.]

1. **[CONFIDENCE]** [Description of risk factor]
2. **[CONFIDENCE]** [Description of risk factor]

---

## Change Classification

| Classification | Files |
|---------------|-------|
| BEHAVIORAL | [count] |
| CONTRACT | [count] |
| STRUCTURAL | [count] |
| COSMETIC | [count] |

[Brief narrative of what the PR is doing semantically]

---

## Blast Radius

**Scope:** [CONTAINED | MODULE | CROSS_MODULE | CODEBASE_WIDE]

[Summary of affected systems and user flows]

### Out of Scope
[What could not be analyzed — always present per Rule E-002]

---

## Failure Scenarios

[Top 2–4 failure scenarios from failure_mode_predictor]

### Scenario 1: [Name]
**Confidence:** [label]
**Trigger:** [condition]
**Impact:** [who is affected, how]
**Detection:** [how quickly it's caught]
**Recovery:** [what it takes to fix]

[Repeat for each scenario]

[Postmortem preview for highest-severity scenario, if applicable]

---

## Deployment Timing

**Recommended Window:** [specific date/time range]
**Deploy Now?** [Yes/No with reasoning]

[Gradual rollout recommendation if applicable]

---

## Review Requirements

**Minimum Reviewers:** [count]
[Prioritized list of required expertise with justifications]

---

## Developer Context

[Scrutiny level and narrative, if author_context was provided]
[Or: "Author context was not provided. Developer context calibration was not performed."]

---

## Conditions for Merge

[If MERGE_WITH_CONDITIONS — numbered list of specific conditions]
[If MERGE — "No conditions. Clear to merge."]
[If DO_NOT_MERGE — "Resolve blocking issues above before re-review."]

---

## Risk Score Breakdown

[If risk score > 75 — required narrative per Rule S-003]
[If risk score <= 75 — optional, include if > 50]

| Factor | Contribution | Detail |
|--------|-------------|--------|
| [Factor 1] | +[N] | [explanation] |
| [Factor 2] | +[N] | [explanation] |
| [Factor 3] | +[N] | [explanation] |

---

Confidence in this assessment: [HIGH/MEDIUM/LOW]. Basis: [one sentence].

This analysis covers technical consequence prediction only. Business logic validation, product intent review, and final merge authority remain with the engineering team.
```

---

## Quality Checks

Before emitting the brief, verify:

1. ✅ Recommendation is exactly one of three allowed values (Rule R-001)
2. ✅ DO_NOT_MERGE only issued for valid reasons (Rule R-002)
3. ✅ All conditions are specific and verifiable (Rule R-003)
4. ✅ All blocking findings have 4 elements (Rule R-004)
5. ✅ No fabricated metrics (Rule R-005)
6. ✅ All findings have confidence labels (Rule E-001)
7. ✅ Out of scope section is present (Rule E-002)
8. ✅ Confidence closing statement is present (Rule T-003)
9. ✅ Human judgment disclaimer is present (Rule T-004)
10. ✅ Risk score > 75 includes narrative breakdown (Rule S-003)
