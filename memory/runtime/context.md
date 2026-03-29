# PRGuardian Runtime Context

> This file is a template for runtime state. It is populated at the start of each
> analysis session and cleared when the session ends. PRGuardian does not carry
> state between separate PR analyses.

---

## Current Analysis

| Field | Value |
|-------|-------|
| **PR Identifier** | _not set_ |
| **Analysis Started** | _not set_ |
| **Analysis Status** | IDLE |
| **Input Hash** | _not set_ |

---

## Skill Execution Status

| Skill | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| diff_semantic_analyzer | PENDING | — | — | — |
| blast_radius_estimator | PENDING | — | — | — |
| failure_mode_predictor | PENDING | — | — | — |
| developer_context_synthesizer | PENDING | — | — | — |
| deployment_timing_advisor | PENDING | — | — | — |
| reviewer_assignment_reasoner | PENDING | — | — | — |
| merge_brief_synthesizer | PENDING | — | — | — |

Status values: `PENDING` | `RUNNING` | `COMPLETED` | `SKIPPED` | `ERROR` | `INSUFFICIENT_CONTEXT`

---

## Accumulated Results

### Diff Classification
- PR Classification: _pending_
- Cosmetic Only: _pending_
- File Count: _pending_

### Risk Score Components

| Component | Value | Source |
|-----------|-------|--------|
| Change classification base | — | diff_semantic_analyzer |
| Blast radius scope | — | blast_radius_estimator |
| Failure mode severity | — | failure_mode_predictor |
| Developer context | — | developer_context_synthesizer |
| Deployment timing risk | — | deployment_timing_advisor |
| **Total Risk Score** | — | merge_brief_synthesizer |

### Flags Raised

_No flags raised._

<!-- Flags are added during analysis when a skill identifies a noteworthy finding.
     Format: [TIMESTAMP] [SKILL] [SEVERITY] [DESCRIPTION]
     Example: [10:30:05] [blast_radius_estimator] [HIGH] Auth middleware change detected — codebase-wide blast radius -->

### Blocking Issues

_No blocking issues identified._

<!-- Blocking issues are added as they are discovered during analysis.
     They are collected by merge_brief_synthesizer for the final brief. -->

---

## Decision Gates

### Gate 1: Cosmetic Fast-Path
- Triggered: _pending_
- Outcome: _pending_

---

## Session Metadata

- **Runtime Adapter:** _not set_
- **Model:** _not set_
- **Input Provided:**
  - pr_diff: _pending_
  - pr_description: _pending_
  - changed_files: _pending_
  - author_context: _pending_
  - repo_context: _pending_
