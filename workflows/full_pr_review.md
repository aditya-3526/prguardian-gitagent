# Workflow: Full PR Review

## Overview

This is PRGuardian's primary workflow. It orchestrates all 7 skills in sequence, with decision gates and error handling, to produce a complete merge brief.

**Trigger:** A pull request is submitted for analysis.
**Output:** A complete merge brief with recommendation, risk score, and supporting analysis.
**Estimated Duration:** 30–90 seconds depending on diff size and model speed.

---

## Sequence

### Step 0: Consume Deterministic Signals (REQUIRED — ALWAYS FIRST)

**Source:** `deterministic_signals` object (provided in input payload by the deterministic analysis layer)
**Purpose:** Establish the factual foundation for all downstream reasoning.

The following signals are pre-computed by the deterministic analysis layer and are **AUTHORITATIVE**. All downstream skills must reference these signals and must not contradict them.

```
READ deterministic_signals FROM input payload
  CONTAINS:
    secrets          — Array of detected credential patterns (regex-based)
    sensitive_files  — Array of files classified by risk category
    diff_metrics     — Quantitative metrics (additions, deletions, file count, change size)
    risk_score       — Pre-computed deterministic risk score (0-100) — IMMUTABLE
    risk_breakdown   — Factor-level breakdown of the risk score
    recommendation   — Deterministic recommendation (floor — can be downgraded, never upgraded)
    hard_constraints_triggered — Array of triggered hard constraints (e.g., SECRET_DETECTED)
```

**Authority rules:**
- If `secrets.secrets_detected > 0`: final recommendation MUST be `DO_NOT_MERGE` regardless of skill output
- `risk_score` is FINAL. Skills may explain contributing factors but must not propose a different score
- `sensitive_files` classifications should be used by skills rather than re-inferring from file paths
- `diff_metrics` numbers must be used rather than estimating from raw diff text

**Skills are the REASONING LAYER over these signals.** Their job is to:
- Predict consequences using the signals as factual input
- Model failure scenarios informed by which files and categories are affected
- Explain WHY the risk score is what it is
- Recommend conditions, timing, and reviewers based on the detected risk profile

**Skills must NOT:**
- Override the risk score
- Dismiss or downgrade secret detections
- Upgrade the recommendation beyond what the deterministic layer set

---

### Step 1: Diff Semantic Analysis (REQUIRED)

**Skill:** `diff_semantic_analyzer`
**Input:** `pr_diff`, `changed_files`
**Purpose:** Classify every change in the diff by semantic type. This output drives all downstream decisions.

```
INVOKE diff_semantic_analyzer
  INPUT: pr_diff, changed_files
  STORE: semantic_analysis
```

**On success:** Proceed to Decision Gate 1.
**On error:** ABORT workflow. The diff semantic analysis is required for all downstream skills. Return error: "Unable to classify diff. Merge brief cannot be produced without semantic analysis."

---

### Decision Gate 1: Cosmetic Fast-Path

```
IF semantic_analysis.cosmetic_only == true:
  SET risk_score = 5
  SET recommendation = MERGE
  SKIP to Step 7 (merge_brief_synthesizer)
  NOTE: "All changes classified as cosmetic. Fast-path analysis applied."
ELSE:
  CONTINUE to Step 2
```

**Rationale:** A purely cosmetic diff (whitespace, comments, documentation) does not require blast radius estimation, failure mode prediction, or deployment timing analysis. The fast-path prevents unnecessary analysis and delivers a faster response.

---

### Step 2: Blast Radius Estimation (PARALLEL with Step 3)

**Skill:** `blast_radius_estimator`
**Input:** `pr_diff`, `changed_files`, `semantic_analysis`, `repo_context`
**Purpose:** Map which systems, services, and user flows are affected.

```
INVOKE blast_radius_estimator
  INPUT: pr_diff, changed_files, semantic_analysis, repo_context
  STORE: blast_radius
```

**On INSUFFICIENT_CONTEXT:** Store partial results. Note: "Blast radius estimation has limited scope due to [missing information]. Confidence may be reduced."
**On error:** Store empty results. Lower confidence by one level. Note: "Blast radius estimation failed. Impact assessment is unavailable."

---

### Step 3: Failure Mode Prediction (PARALLEL with Step 2)

**Skill:** `failure_mode_predictor`
**Input:** `pr_diff`, `semantic_analysis`, `blast_radius` (partial if Step 2 is still in progress), `repo_context`
**Purpose:** Generate specific failure scenarios.

```
INVOKE failure_mode_predictor
  INPUT: pr_diff, semantic_analysis, repo_context
  STORE: failure_modes
```

**On INSUFFICIENT_CONTEXT:** Store partial results. Note: "Failure mode prediction has limited scope."
**On error:** Store empty results. Lower confidence by one level. Note: "Failure mode prediction failed."

**Note:** Steps 2 and 3 are independent and can execute in parallel. If parallel execution is not supported, execute Step 2 first, then Step 3.

---

### Step 4: Developer Context Synthesis (CONDITIONAL)

**Skill:** `developer_context_synthesizer`
**Input:** `author_context`, `pr_diff`, analysis timestamp
**Purpose:** Calibrate review scrutiny based on developer signals.

```
IF author_context IS PROVIDED:
  INVOKE developer_context_synthesizer
    INPUT: author_context, pr_diff, current_timestamp
    STORE: developer_context
ELSE:
  SET developer_context = { status: "SKIPPED", reason: "author_context not provided" }
  NOTE: "Developer context calibration skipped — no author context provided."
```

**On error:** Store default (STANDARD scrutiny). Note: "Developer context synthesis failed. Using default scrutiny level."

---

### Step 5: Deployment Timing Assessment

**Skill:** `deployment_timing_advisor`
**Input:** `semantic_analysis`, `blast_radius`, current timestamp, `repo_context`
**Purpose:** Recommend when to deploy.

```
INVOKE deployment_timing_advisor
  INPUT: semantic_analysis, blast_radius, current_timestamp, repo_context
  STORE: deployment_timing
```

**On error:** Store default recommendation: "Deploy during standard low-risk window (Tuesday–Thursday, 10:00–14:00)." Note: "Deployment timing analysis failed. Using conservative default."

---

### Step 6: Reviewer Assignment

**Skill:** `reviewer_assignment_reasoner`
**Input:** `semantic_analysis`, `blast_radius`, `developer_context`
**Purpose:** Determine review expertise requirements.

```
INVOKE reviewer_assignment_reasoner
  INPUT: semantic_analysis, blast_radius, developer_context
  STORE: review_requirements
```

**On error:** Store minimum defaults: { minimum_reviewers: 1, note: "Reviewer assignment reasoning unavailable." }

---

### Step 7: Merge Brief Synthesis (REQUIRED — ALWAYS LAST)

**Skill:** `merge_brief_synthesizer`
**Input:** All stored outputs from Steps 1–6
**Purpose:** Produce the final merge brief.

```
INVOKE merge_brief_synthesizer
  INPUT: semantic_analysis, blast_radius, failure_modes,
         developer_context, deployment_timing, review_requirements
  OUTPUT: merge_brief, recommendation, risk_score,
          blocking_issues, confidence_level
```

**On error:** This is the only unrecoverable error at this stage. Return error: "Merge brief synthesis failed. Partial results from individual skills are available but the synthesized brief could not be produced."

---

## Error Handling Summary

| Skill | On Error | Impact on Brief |
|-------|----------|----------------|
| diff_semantic_analyzer | ABORT workflow | Cannot proceed |
| blast_radius_estimator | Continue with empty results | Confidence drops, blast radius section empty |
| failure_mode_predictor | Continue with empty results | Confidence drops, failure scenarios empty |
| developer_context_synthesizer | Continue with STANDARD scrutiny | Developer context section shows default |
| deployment_timing_advisor | Continue with conservative default | Shows conservative timing recommendation |
| reviewer_assignment_reasoner | Continue with minimum defaults | Shows minimum review requirements |
| merge_brief_synthesizer | FAIL — return partial results | Brief cannot be assembled |

---

## Output

The workflow produces the output schema defined in `agent.yaml`:

```yaml
merge_brief: <markdown>     # Full merge brief document
recommendation: <enum>      # MERGE | MERGE_WITH_CONDITIONS | DO_NOT_MERGE
risk_score: <integer>       # 0–100
blocking_issues: <list>     # Each with location, observation, consequence, required_action
confidence_level: <enum>    # HIGH | MEDIUM | LOW
```

This output is the final deliverable of PRGuardian for a single PR analysis.
