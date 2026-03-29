# Skill: developer_context_synthesizer

## Purpose

This skill analyzes signals about the *developer* and the *circumstances* of the PR submission to calibrate how much scrutiny the rest of the analysis should apply. The insight is simple but important: the same 200-line diff deserves different levels of skepticism depending on who wrote it, when, and in what state. A first-time contributor touching auth code at 11 PM after six rapid commits is a very different signal from a senior maintainer making a focused change during business hours.

This skill does not judge the quality of the code. It adjusts the sensitivity of the overall analysis based on context that the diff itself cannot reveal.

---

## Inputs

- `author_context.is_new_contributor` — boolean: is this the author's first PR in this repository?
- `author_context.pr_count_in_repo` — integer: how many PRs has this author merged in this repo previously?
- `author_context.hours_since_last_pr` — integer: hours elapsed since this author's previous PR was submitted
- `author_context.submitted_at` — ISO 8601 timestamp: when the PR was submitted
- `author_context.day_of_week` — string: day name (Monday–Sunday)
- `author_context.local_hour` — integer 0–23: local hour of submission (24h)
- The semantic classification output from `diff_semantic_analyzer` (specifically: change types present and total non-cosmetic lines)

---

## Calibration Matrix

The skill produces a **scrutiny level** from 1 (standard) to 5 (maximum). Each signal contributes a modifier. The final scrutiny level is the sum of all applicable modifiers, capped at 5.

### Base Level
All PRs begin at scrutiny level **1**.

### Positive Modifiers (increase scrutiny)

| Signal | Condition | Modifier |
|--------|-----------|----------|
| New contributor | `is_new_contributor = true` | +2 |
| First 5 PRs in repo | `pr_count_in_repo < 5` | +1 |
| Late night submission | `local_hour` between 22–04 | +1 |
| Weekend submission | `day_of_week` is Saturday or Sunday | +1 |
| Rapid burst of commits | `hours_since_last_pr < 2` | +1 |
| Large diff for author | Non-cosmetic lines > 3× this author's median | +1 |
| Behavioral change present | Semantic analysis found behavioral changes | +1 |
| Contract change present | Semantic analysis found contract changes | +1 |

### Negative Modifiers (decrease scrutiny)

| Signal | Condition | Modifier |
|--------|-----------|----------|
| Experienced contributor | `pr_count_in_repo >= 20` | -1 |
| Purely cosmetic diff | Semantic analysis: cosmetic only | -1 |

### Scrutiny Level Definitions

**Level 1 — Standard:** Apply normal analysis depth. No special flags.

**Level 2 — Elevated:** Flag any ambiguous findings as warnings rather than passing them silently. Note the contributing context signals in the merge brief.

**Level 3 — High:** Apply conservative interpretation of all ambiguous findings. Require explicit test evidence for any behavioral change claims. Flag in merge brief with context explanation.

**Level 4 — Maximum:** Treat all ambiguous findings as potential blocking issues pending clarification. Recommend that a senior engineer explicitly reviews the context signals alongside the code.

**Level 5 — Critical:** Issue an explicit advisory in the merge brief recommending that the PR author walk a senior engineer through the changes in real time before merge. This level should be reserved for new contributors making behavioral changes to security or payment-related code outside of business hours.

---

## Output
```json
{
  "scrutiny_level": 4,
  "contributing_signals": [
    "New contributor (+2)",
    "Late night submission — 23:14 local time (+1)",
    "Behavioral change detected in auth middleware (+1)"
  ],
  "scrutiny_label": "MAXIMUM",
  "advisory": "This PR was submitted by a first-time contributor at 23:14 making behavioral changes to shared authentication middleware. Apply conservative interpretation to all ambiguous findings. Recommend explicit senior review before merge.",
  "context_note": "Scrutiny level does not reflect code quality — it reflects the degree of verification warranted given submission context."
}
```

---

## Important Constraint

The scrutiny level output from this skill affects *how* other findings are interpreted and framed in the merge brief — it does not add findings of its own. A high scrutiny level makes the merge brief more conservative; it does not independently generate blocking issues. The context note in the output must always be included to prevent the author from feeling judged on personal factors rather than their work.

---

## Edge Cases

If `author_context` is partially or fully missing, default to scrutiny level 2 (elevated) and note in the output that context data was unavailable. Never default to scrutiny level 1 (standard) when context is missing — the absence of information is itself a reason for elevated care, not reduced scrutiny.
