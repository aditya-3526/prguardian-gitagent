# SKILL — Developer Context Synthesizer

## Purpose

Analyze meta-signals about the developer and circumstances around a PR to calibrate review scrutiny. The code is only part of the risk picture. A first-time contributor submitting at 3 AM after a burst of commits has a different risk profile than a veteran contributor during business hours.

This skill does not judge developers — it makes implicit review heuristics explicit and consistent.

---

## Input Signals

From `author_context`:
- `is_new_contributor` (boolean)
- `pr_count_in_repo` (integer)
- `hours_since_last_pr` (integer)

Derived from the diff and timestamp:
- Non-cosmetic lines changed
- File count
- Analysis time and day
- PR description length and quality

---

## Calibration Matrix

Base scrutiny score: 50 (range 10–100).

### Contributor Experience

| Condition | Modifier | Reasoning |
|-----------|----------|-----------|
| `is_new_contributor == true` | +20 | Unfamiliar with conventions and implicit contracts |
| `pr_count_in_repo < 5` | +15 | Still building mental model |
| `5 <= pr_count < 20` | +5 | Growing familiarity |
| `pr_count >= 20` | 0 | Established contributor |

### Velocity

| Condition | Modifier | Reasoning |
|-----------|----------|-----------|
| `hours_since_last_pr < 2` | +10 | Rapid burst suggests pressure or insufficient self-review |
| `2 <= hours < 24` | 0 | Normal pace |
| `hours >= 168` | +5 | Context loss after long gap |

### PR Size

| Condition | Modifier |
|-----------|----------|
| < 20 non-cosmetic lines | -5 |
| 20–200 lines | 0 |
| 200–500 lines | +10 |
| > 500 lines | +20 |

### Temporal

| Condition | Modifier |
|-----------|----------|
| 00:00–06:00 local | +10 |
| Weekend | +5 |
| Normal business hours | 0 |

### Description Quality

| Condition | Modifier |
|-----------|----------|
| Empty or < 10 chars | +15 |
| 10–50 chars | +5 |
| > 200 chars with issue links | -5 |

---

## Procedure

1. **Collect** all available signals. Use 0 modifier for missing signals.
2. **Compute** scrutiny_score = 50 + sum(modifiers), clamped to [10, 100].
3. **Classify:** 10–30 REDUCED, 31–60 STANDARD, 61–80 ELEVATED, 81–100 MAXIMUM.
4. **Narrate** which signals contributed and why.

---

## Output Format

```yaml
developer_context:
  scrutiny_score: 85
  scrutiny_level: MAXIMUM
  signals:
    is_new_contributor: false
    pr_count_in_repo: 3
    hours_since_last_pr: 0.75
    non_cosmetic_lines: 347
    analysis_day: Saturday
  modifiers_applied:
    - signal: "Low PR count"
      modifier: +15
    - signal: "Rapid burst"
      modifier: +10
    - signal: "Large PR"
      modifier: +10
    - signal: "Weekend"
      modifier: +5
    - signal: "Thorough description"
      modifier: -5
  narrative: |
    Developer context suggests maximum scrutiny. Four contributing signals:
    low repo familiarity, rapid PR burst, large diff, weekend submission.
    Offset by thorough description. This reflects contextual risk, not
    developer capability.
  recommendations:
    - "Request author self-review walkthrough"
    - "Consider splitting into smaller PRs"
    - "Assign experienced codebase contributor as reviewer"
  risk_score_contribution: 10
```

---

## Ethical Constraints

1. Never judge developer skill. This measures contextual signals, not human quality.
2. Never use signals to block a PR. Modifiers affect scrutiny, not approval.
3. Apply consistently — same signals produce same modifiers for everyone.
4. If `author_context` is absent, return INSUFFICIENT_CONTEXT and skip.
