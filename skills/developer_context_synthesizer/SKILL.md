# Skill: developer_context_synthesizer
---
name: developer_context_synthesizer
description: Adjusts scrutiny level based on developer and PR context
---
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
| Large diff for author | Non-cosmetic lines > 300 with no prior large PRs | +1 |
| Behavioral change present | Semantic analysis found behavioral changes | +1 |
| Contract change present | Semantic analysis found contract changes | +1 |

### Negative Modifiers (decrease scrutiny)

| Signal | Condition | Modifier |
|--------|-----------|----------|
| Experienced contributor | `pr_count_in_repo >= 20` | -1 |
| Purely cosmetic diff | Semantic analysis: cosmetic only | -1 |

### Scrutiny Level Definitions

**Level 1 — Standard:** Apply normal analysis depth. No special flags. The vast majority of PRs from experienced contributors during business hours will land here.

**Level 2 — Elevated:** Flag any ambiguous findings as warnings rather than passing them silently. Note the contributing context signals in the merge brief so the reviewer understands why the bar is slightly higher.

**Level 3 — High:** Apply conservative interpretation of all ambiguous findings. Require explicit test evidence for any behavioral change claims. Flag in the merge brief with a plain-language explanation of the context signals driving the elevated level.

**Level 4 — Maximum:** Treat all ambiguous findings as potential blocking issues pending clarification. Recommend that a senior engineer explicitly reviews the context signals alongside the code. This level should produce a visible advisory section in the merge brief.

**Level 5 — Critical:** Issue an explicit advisory in the merge brief recommending that the PR author walk a senior engineer through the changes in real time before merge. Reserve this level for new contributors making behavioral or contract changes to security or payment-related code outside of business hours.

---

## Worked Examples

These examples show exactly how the calibration matrix applies to real scenarios. Working through them builds intuition for what the skill is detecting and why.

### Example A — Scrutiny Level 1 (Standard)

**Scenario:** A developer with 34 merged PRs in this repository submits a 40-line cosmetic change (import reordering and a comment cleanup) on a Tuesday at 10:30 AM. Their previous PR was two days ago.

**Modifier calculation:**
- Base: 1
- Experienced contributor (pr_count = 34): -1
- Purely cosmetic diff (semantic analysis: cosmetic only): -1
- Final scrutiny level: **1 (Standard)**

**What this means in practice:** The merge brief notes the cosmetic-only classification and issues a clean analysis without elevated framing. No advisory is needed. This is a routine change from a trusted contributor, and treating it otherwise would create noise that erodes the signal value of genuine warnings.

---

### Example B — Scrutiny Level 3 (High)

**Scenario:** A developer with 8 merged PRs submits a 180-line PR on a Sunday at 14:30 that includes a behavioral change to a shared utility function. Their previous PR was submitted 90 minutes ago (rapid burst signal).

**Modifier calculation:**
- Base: 1
- Weekend submission: +1
- Rapid burst of commits (hours_since_last_pr = 1.5): +1
- Behavioral change present: +1
- Final scrutiny level: **3 (High)**

**What this means in practice:** The merge brief applies conservative interpretation to any ambiguous findings in the behavioral change. The `failure_mode_predictor` is asked to err toward specificity rather than brevity in its scenario generation. The merge brief includes a context note: "This PR was submitted on a Sunday during a rapid commit burst and contains behavioral changes to shared code. Conservative interpretation applied to ambiguous findings."

---

### Example C — Scrutiny Level 5 (Critical)

**Scenario:** A first-time contributor submits a PR at 23:14 on a Saturday that includes a behavioral change to `src/shared/auth/middleware/validateToken.ts`. The PR is 74 lines. Their `pr_count_in_repo` is 0.

**Modifier calculation:**
- Base: 1
- New contributor (is_new_contributor = true): +2
- Late night submission (local_hour = 23): +1
- Weekend submission (day_of_week = Saturday): +1
- Behavioral change present: +1
- Final scrutiny level: **6 → capped at 5 (Critical)**

**What this means in practice:** This is exactly the scenario the Critical level was designed for. The merge brief opens with a prominent advisory before the recommendation itself: "CONTEXT ADVISORY: This PR was submitted by a first-time contributor at 23:14 on a Saturday and modifies shared authentication middleware. A senior engineer should review this PR alongside the author before merge, independent of the technical findings below." All ambiguous findings are treated as blocking pending clarification. This is not a judgment on the contributor's skill — it is a recognition that the combination of unfamiliarity with the codebase, late-night cognitive state, and high-stakes code location warrants an extra layer of human verification.

---

### Example D — Scrutiny Level 2 (Elevated), Modifier Cancellation

**Scenario:** A developer with 3 merged PRs (still in their first 5) submits a purely cosmetic PR — a documentation update — on a Monday at 09:00.

**Modifier calculation:**
- Base: 1
- First 5 PRs (pr_count = 3): +1
- Purely cosmetic diff: -1
- Final scrutiny level: **2 (Elevated)**

**What this means in practice:** The cosmetic nature of the diff partially offsets the new-contributor signal, but does not eliminate it entirely. The brief notes the contributor's early stage in this codebase and flags any ambiguous findings as warnings. This is a case where the modifiers partially cancel — the result is a mild elevation rather than a binary outcome. The skill is designed to produce these gradations precisely because real situations are rarely at the extremes.

---

## Output Format
```json
{
  "scrutiny_level": 3,
  "scrutiny_label": "HIGH",
  "contributing_signals": [
    "Weekend submission — Sunday 14:30 (+1)",
    "Rapid commit burst — 1.5 hours since last PR (+1)",
    "Behavioral change detected in shared utility (+1)"
  ],
  "advisory": "This PR was submitted on a Sunday during a rapid commit burst and contains behavioral changes to shared code. Conservative interpretation applied to all ambiguous findings.",
  "context_note": "Scrutiny level reflects submission context and change type — not code quality or contributor competence."
}
```

---

## Important Constraints

The scrutiny level output from this skill affects *how* other findings are interpreted and framed in the merge brief — it does not independently generate blocking issues. A high scrutiny level makes the merge brief more conservative in its framing of ambiguous findings; it does not create findings where none exist.

The `context_note` field must always be included in the output and must always appear in the merge brief wherever scrutiny level is referenced. This ensures that contributors understand the reasoning and do not interpret an elevated scrutiny level as a personal judgment.

If `author_context` is partially or fully missing, default to scrutiny level 2 (Elevated) and note explicitly that context data was unavailable. Never default to level 1 when context is missing — the absence of information is itself a signal that warrants elevated care, not reduced scrutiny.
