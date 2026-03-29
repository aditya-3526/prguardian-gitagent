# PRGuardian — Design Decisions

This document explains the key architectural choices behind PRGuardian and the reasoning that shaped them. It exists because "what was built" is visible in the code, but "why it was built this way" is not.

---

## Why the Skill Sequence Is Ordered This Way

The seven skills execute in a specific sequence, and the order is not arbitrary — each step depends on the output of the previous one in a way that makes the sequence the only sensible ordering.

**Step 1 is always `diff_semantic_analyzer`** because it produces the classification that gates everything downstream. Before knowing whether a change is behavioral, structural, contract-level, or cosmetic, it is impossible to reason meaningfully about blast radius or failure modes. Running `blast_radius_estimator` on a purely cosmetic diff would produce noise. Running it on a behavioral change to shared middleware is critical. The semantic classifier decides which path applies.

**The early exit for cosmetic-only diffs** (skip directly to `merge_brief_synthesizer` with LOW risk) is a deliberate design choice for two reasons. First, it is honest: cosmetic changes genuinely carry near-zero production risk, and treating them with the same scrutiny as behavioral changes would dilute the signal value of a serious finding. Second, it is efficient: the agent's time and the engineer's attention are finite, and both are better spent on non-cosmetic changes.

**Steps 2 and 3 (`blast_radius_estimator` and `failure_mode_predictor`) run on the same input** from step 1 because they answer orthogonal questions. Blast radius asks "what else is affected?" Failure modes ask "what goes wrong?" These are independent reasoning tasks — neither depends on the output of the other — and keeping them separate prevents each from contaminating the other's framing. A blast radius finding should not be colored by a hypothesized failure mode, and vice versa.

**`developer_context_synthesizer` runs after the technical analysis** (steps 2 and 3) and before synthesis. This is intentional. The scrutiny level it produces affects how ambiguous findings are *interpreted* in the final brief — more conservative framing for high-scrutiny contexts, standard framing otherwise. If it ran before the technical analysis, it might bias the analysis itself rather than calibrating the presentation of its results.

**`deployment_timing_advisor` and `reviewer_assignment_reasoner` run last** among the analysis skills because they consume the full picture. Deployment timing is meaningless without knowing what kind of change this is and what it affects. Reviewer requirements are meaningless without knowing which systems were touched. Both skills synthesize upstream findings rather than generating independent analysis.

**`merge_brief_synthesizer` is always last** because it is not an analysis skill — it is a synthesis skill. It transforms findings into a decision document. Its value depends entirely on having complete inputs from every upstream skill. Running it earlier would produce an incomplete brief; running it again after would create duplication.

---

## Why Consequence Prediction Instead of Rule Checking

The design space for "AI code review" splits into two approaches: rule checking and consequence prediction. Rule checking asks "does this PR comply with our policies?" Consequence prediction asks "what happens if we merge this?"

PRGuardian is explicitly in the second category, and this was a deliberate choice.

Rule checking is already solved. ESLint, SonarQube, Semgrep, and a hundred other tools check rules faster and more reliably than a language model. Building an AI that does rule checking is building an expensive, slower version of something that already exists. It adds a personality to a linter.

Consequence prediction is not solved. It requires reasoning about the relationship between a code change and its runtime behavior, about the downstream systems that depend on shared utilities, about the specific failure mode that emerges when an auth cache has no TTL and a key rotation happens on Saturday. These are reasoning tasks, not pattern-matching tasks. They are exactly what language models are suited for, and exactly what no existing tool does.

The downside of this choice is that consequence prediction is harder to verify — you cannot write a test that confirms a failure mode prediction is correct. The upside is that a correct consequence prediction is worth far more than a passed linter check.

---

## Why the Confidence Labeling System Exists

Every finding in a PRGuardian merge brief carries a confidence label: CONFIRMED, HIGH CONFIDENCE, POSSIBLE, or SPECULATIVE. This is not decoration — it is a core epistemic design decision.

An agent that presents all findings with equal certainty is an agent that teaches engineers to distrust it. If a CONFIRMED secret detection and a SPECULATIVE race condition hypothesis appear with the same weight, engineers will either over-respond to speculation or under-respond to real findings. Either failure mode erodes trust over time.

The confidence labels serve two purposes. First, they allow engineers to triage correctly: a CONFIRMED finding demands immediate action, while a SPECULATIVE finding warrants investigation. Second, they make PRGuardian's uncertainty explicit rather than hiding it. An agent that says "I am not certain about this" is more trustworthy than one that projects false confidence — and more useful, because it tells you exactly how much to rely on each finding.

The rule that SPECULATIVE findings cannot drive the primary recommendation follows directly from this. A DO_NOT_MERGE issued on speculation would eventually be wrong, and each wrong recommendation would cost PRGuardian credibility it cannot afford to lose.

---

## What PRGuardian Deliberately Does Not Do

Scope decisions — what an agent refuses to do — are as important as what it does. PRGuardian has three explicit non-scopes:

**It does not validate business logic.** Whether a feature behaves according to product intent requires understanding of the product, the user, and the business context that no diff analysis can provide. Pretending to validate business logic would produce authoritative-sounding nonsense.

**It does not make architectural recommendations.** PRGuardian reviews the PR as submitted. Suggesting that the developer should have used a different pattern, refactored a module, or made a different technical choice is outside scope — those conversations belong in design review, not merge review.

**It does not issue final merge approval.** The MERGE recommendation is a recommendation, not a command. Human judgment on product intent and business correctness is always required. PRGuardian makes the human's decision better-informed; it does not replace it.

These non-scopes are documented in `DUTIES.md` and stated explicitly in every merge brief. This is intentional: an agent that is clear about its limits is one that can be trusted within them.
