<p align="center">
  <h1 align="center">🛡️ PRGuardian</h1>
  <p align="center"><strong>Merge Consequence Intelligence</strong></p>
  <p align="center">
    PRGuardian analyzes PR diffs to predict merge consequences, estimate blast radius,<br/>
    model failure scenarios, and issue a structured merge brief — so engineers make<br/>
    better merge decisions faster.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/gitagent-v1.0.0-blue?style=flat-square" alt="GitAgent v1.0.0"/>
  <img src="https://img.shields.io/badge/model-claude--sonnet--4-purple?style=flat-square" alt="Claude Sonnet 4"/>
  <img src="https://img.shields.io/badge/skills-7-green?style=flat-square" alt="7 Skills"/>
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" alt="MIT License"/>
</p>

---

## The Problem

The merge button is the most consequential action in a codebase. It is pressed:

- Under **time pressure** ("let's ship this before the sprint ends")
- With **incomplete information** ("the tests pass, the diff looks fine")
- By **tired humans** ("it's Friday at 5 PM, LGTM")

Existing tools don't help with the actual decision. Linters check formatting rules. CI checks test pass/fail. Code coverage tools report percentages. None of them answer the question that matters:

> **"If I press merge, what happens next?"**

PRGuardian answers that question.

---

## What PRGuardian Does

PRGuardian is a **merge consequence intelligence agent** — a decision-support system that reasons about what will *happen* if a pull request is merged. Not whether it violates rules. What it will *cause*.

For every PR, PRGuardian produces a **merge brief**: a structured document containing:

| Output | Description |
|--------|-------------|
| **Recommendation** | `MERGE` / `MERGE_WITH_CONDITIONS` / `DO_NOT_MERGE` — clear and unambiguous |
| **Risk Score** | 0–100 composite score with factor breakdown |
| **Failure Scenarios** | 2–4 specific, named scenarios with triggers, impact, and recovery paths |
| **Blast Radius Map** | Which systems, services, and user flows are affected |
| **Deployment Timing** | When to deploy (not just whether to merge), accounting for day/time risk |
| **Review Requirements** | What expertise is needed to review this PR and why |
| **Confidence Level** | How much to trust this assessment, with explicit basis |

---

## Sample Merge Brief

> This is what PRGuardian produces. This is a real-format example for a PR that looks innocent but contains two blocking issues.

---

### PRGuardian Merge Brief

**PR:** #247 — Optimize mobile token refresh
**Analyzed:** 2026-03-28T16:47:00Z (Friday, 16:47 local time)
**Files Changed:** 4
**Non-Cosmetic Lines:** 74

---

#### Recommendation: DO_NOT_MERGE

**Risk Score:** 89/100
**Primary Reason:** Hardcoded Stripe API key detected in test configuration with production key prefix, combined with undocumented behavioral change to shared auth middleware.

---

#### Blocking Issues

**Issue 1: Hardcoded API Key**

| Element | Detail |
|---------|--------|
| **LOCATION** | `test/fixtures/payment_config.ts:L23` |
| **OBSERVATION** | String matching Stripe live key pattern (`sk_live_...`) assigned to constant |
| **CONSEQUENCE** | Key permanently embedded in Git history; extractable by anyone with repo read access |
| **REQUIRED ACTION** | Remove key, rotate in Stripe dashboard, replace with `process.env.STRIPE_API_KEY` |

**Confidence:** CONFIRMED

**Issue 2: Auth Middleware Behavioral Change**

| Element | Detail |
|---------|--------|
| **LOCATION** | `src/shared/auth/middleware/validateToken.ts:L31-L38` |
| **OBSERVATION** | Token validation now caches auth config in module scope; config changes require restart |
| **CONSEQUENCE** | After auth provider key rotation (every 24–72h), tokens signed with new keys are rejected by instances holding stale cache |
| **REQUIRED ACTION** | Add TTL to cache (recommended: 5 min), add test for config rotation handling |

**Confidence:** HIGH CONFIDENCE

---

#### Failure Scenario: Progressive Token Rejection

> On Friday at 16:47, PR #247 was merged. The change introduced caching of auth provider configuration in the shared token validation middleware.
>
> On Saturday at 14:00, the auth provider performed its scheduled key rotation. New tokens were signed with the rotated key. Service instances running since Friday's deploy still held the pre-rotation configuration in cache.
>
> By Saturday at 14:30, the authentication failure rate reached 12%. Mobile clients experienced forced logouts. The on-call engineer investigated but saw no recent deploys and initially attributed the spike to an auth provider issue.
>
> The root cause was identified at 15:40 when a second engineer found the `cachedConfig` variable in the Friday diff. Rolling restart completed at 15:58.
>
> **Impact:** ~4,200 users experienced authentication failures over 90 minutes. No data loss.

---

#### Deployment Timing

⛔ **DO NOT DEPLOY.** Friday 16:47 is the worst possible deployment window for auth middleware changes. Weekend on-call coverage is reduced. Auth failures would compound over the weekend.

---

**Confidence in this assessment: HIGH.** Basis: Both blocking issues are directly visible in the diff with clear causal chains to production failure modes.

*This analysis covers technical consequence prediction only. Business logic validation, product intent review, and final merge authority remain with the engineering team.*

---

## Why PRGuardian Is Different

| Tool | What It Checks | What It Misses |
|------|---------------|----------------|
| **Linters** (ESLint, Pylint) | Style rules, syntax patterns | Whether the code change will break production |
| **CI Tests** | Whether existing tests pass | Whether the right tests exist, and what happens to systems not covered by tests |
| **Coverage Tools** | Percentage of lines covered | Whether the covered lines test the right things |
| **Static Analysis** (SonarQube) | Code smell patterns, complexity metrics | Downstream consequences, blast radius, deployment timing |
| **PRGuardian** | **What happens if you merge this** | Business logic correctness (explicitly out of scope) |

PRGuardian doesn't replace any of these tools. It adds a layer that none of them provide: **consequence prediction**. It reasons about the diff the way a staff engineer would — asking "what breaks downstream?" and "what happens at 2 AM Saturday?" instead of "does this line follow our naming convention?"

---

## Skill Architecture

PRGuardian uses 7 modular skills, executed in a defined sequence:

```
                    ┌──────────────────────────────┐
                    │   1. Diff Semantic Analyzer   │
                    │   (classify change types)     │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │     Cosmetic only?            │
                    │   YES → Skip to Brief (LOW)   │
                    │   NO  → Continue              │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
┌─────────────────────┐           ┌─────────────────────┐
│ 2. Blast Radius     │           │ 3. Failure Mode     │
│    Estimator        │           │    Predictor        │
│  (map impact)       │           │  (model failures)   │
└─────────┬───────────┘           └─────────┬───────────┘
          └────────────────┬────────────────┘
                           ▼
              ┌─────────────────────┐
              │ 4. Developer Context│
              │    Synthesizer      │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ 5. Deployment       │
              │    Timing Advisor   │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ 6. Reviewer         │
              │    Assignment       │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │ 7. Merge Brief      │
              │    Synthesizer      │
              │  (final output)     │
              └─────────────────────┘
```

Each skill has a complete `SKILL.md` with operational procedures, output formats, and edge case handling. See the `skills/` directory for details.

---

## Repository Structure

```
prguardian-gitagent/
├── agent.yaml                              # GitAgent manifest
├── SOUL.md                                 # Identity, values, communication style
├── RULES.md                                # Hard behavioral constraints
├── DUTIES.md                               # Segregation of duties & handoff protocol
├── AGENTS.md                               # Framework-agnostic runtime instructions
├── README.md                               # This file
├── skills/
│   ├── diff_semantic_analyzer/SKILL.md     # Classify change types in the diff
│   ├── blast_radius_estimator/SKILL.md     # Map impact surface
│   ├── failure_mode_predictor/SKILL.md     # Generate failure scenarios
│   ├── deployment_timing_advisor/SKILL.md  # Recommend deployment windows
│   ├── reviewer_assignment_reasoner/SKILL.md # Determine review requirements
│   ├── developer_context_synthesizer/SKILL.md # Calibrate review scrutiny
│   └── merge_brief_synthesizer/SKILL.md    # Produce the final merge brief
├── tools/
│   └── diff_parser.yaml                    # MCP tool: parse unified diffs
├── workflows/
│   └── full_pr_review.md                   # Complete PR review playbook
├── knowledge/
│   ├── risk_patterns.md                    # High-risk file patterns & failure templates
│   └── merge_brief_examples.md             # Example merge briefs
└── memory/
    └── runtime/
        └── context.md                      # Runtime session state template
```

---

## Setup & Usage

### Prerequisites

- Node.js 18+ (for `npx gitagent`)
- An API key for your preferred model (Claude, GPT, Gemini, or Llama)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/aditya-3526/prguardian-gitagent.git
cd prguardian-gitagent

# Run with Claude adapter
npx gitagent run ./prguardian-gitagent --adapter claude

# Run with OpenAI adapter
npx gitagent run ./prguardian-gitagent --adapter openai

# Run with Gemini adapter
npx gitagent run ./prguardian-gitagent --adapter gemini

# Run with Lyzr adapter
npx gitagent run ./prguardian-gitagent --adapter lyzr

# Run with Python SDK
pip install gitclaw
gitclaw run ./prguardian-gitagent
```

### Run the Demo

The fastest way to see PRGuardian in action is to run the included demo scenario — PR #247, the Friday auth time bomb:
```bash
# Set your API key
export ANTHROPIC_API_KEY=your_key_here   # or OPENAI_API_KEY / GEMINI_API_KEY

# Run the demo
bash demo/run_demo.sh
```

This runs PRGuardian against a synthetic PR that has passing CI, two senior approvals, and two hidden issues that will cause a production incident. PRGuardian should issue `DO_NOT_MERGE` with risk score 89/100.

### Input

PRGuardian accepts:

```json
{
  "pr_diff": "<unified diff string>",
  "pr_description": "PR title and description",
  "changed_files": ["src/auth/middleware.ts", "migrations/024.sql"],
  "author_context": {
    "is_new_contributor": false,
    "pr_count_in_repo": 12,
    "hours_since_last_pr": 48
  },
  "repo_context": {
    "has_payments_module": true,
    "has_auth_module": true,
    "primary_language": "TypeScript"
  }
}
```

### Output

PRGuardian returns:

```json
{
  "merge_brief": "# PRGuardian Merge Brief\n...",
  "recommendation": "MERGE_WITH_CONDITIONS",
  "risk_score": 42,
  "blocking_issues": [],
  "confidence_level": "HIGH"
}
```

---

## Demo Scenario

### The Scenario

A developer submits PR #247: "Optimize mobile token refresh." The PR:
- Looks small (87 lines, 4 files)
- Has passing CI tests
- Has two approvals from senior engineers
- Was submitted at 16:47 on a Friday

What the humans missed:
1. A hardcoded Stripe API key in a test fixture file (`sk_live_...` — production prefix)
2. A behavioral change to shared auth middleware that caches token configuration without a TTL, meaning auth provider key rotations will cause progressive token rejection
3. The deployment timing (Friday 16:47) is the worst possible window for auth changes

### What PRGuardian Catches

PRGuardian issues `DO_NOT_MERGE` with risk score 89/100, identifying both the credential leak and the auth middleware time bomb. It generates a postmortem preview showing how a Saturday key rotation would cascade into 4,200 forced user logouts. It recommends not deploying on Friday and specifies Tuesday–Wednesday 10:00–14:00 as the optimal window.

### The Outcome

Without PRGuardian: The team merges on Friday. Saturday's key rotation triggers progressive auth failures. 4,200 users are affected. The on-call engineer spends the weekend debugging. The Stripe key sits in Git history for months.

With PRGuardian: The team sees the merge brief, blocks the PR, rotates the key, fixes the cache TTL, and deploys on Tuesday. Zero incidents.

---

## Built After Being Burned

PRGuardian wasn't built to demo well. It was built because the alternative — learning these lessons in production — was too expensive.

The Friday deploy that took down payments. The "trivial refactor" that silently corrupted user data for two weeks. The test fixture with a production API key that sat in Git history for four months.

Every skill in PRGuardian exists because a real team, somewhere, learned its lesson the hard way. The failure mode predictor writes postmortem previews because we've written too many real postmortems. The deployment timing advisor flags Friday deploys because we've spent too many weekends rolling back.

The merge button deserves better intelligence behind it.

---

## License

MIT

---

<p align="center">
  <em>Built for the <a href="https://hackculture.io/hackathons/gitagent-hackathon">GitAgent Hackathon 2026</a> by Lyzr × HackCulture</em>
</p>
