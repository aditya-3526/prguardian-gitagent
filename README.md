<p align="center">
  <h1 align="center">🛡️ PRGuardian</h1>
  <p align="center"><strong>Merge Consequence Intelligence</strong></p>
  <p align="center">
    A hybrid deterministic + LLM agent that analyzes PR diffs to predict merge consequences,<br/>
    detect hardcoded secrets, estimate blast radius, model failure scenarios,<br/>
    and produce structured merge briefs — so engineers make better merge decisions faster.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/gitagent-v1.0.0-blue?style=flat-square" alt="GitAgent v1.0.0"/>
  <img src="https://img.shields.io/badge/architecture-hybrid-blueviolet?style=flat-square" alt="Hybrid Architecture"/>
  <img src="https://img.shields.io/badge/tests-76%2F76_passing-brightgreen?style=flat-square" alt="76/76 Tests Passing"/>
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
| **Risk Score** | 0–100 composite score with weighted factor breakdown |
| **Blocking Issues** | Hardcoded secrets, credential leaks — with exact file, line, and remediation steps |
| **Blast Radius Map** | Which systems, services, and user flows are affected |
| **Failure Scenarios** | Named scenarios with triggers, impact, and recovery paths |
| **Deployment Timing** | When to deploy, accounting for day/time risk |
| **Confidence Level** | How much to trust this assessment, with explicit basis |

---

## Hybrid Architecture

PRGuardian v2 uses a **hybrid deterministic + LLM architecture**. Deterministic code handles pattern matching, secret detection, and risk scoring with absolute authority. LLM skills handle consequence reasoning, failure mode modeling, and natural language synthesis as advisory input.

```
┌─────────────────────────────────────────────────────────┐
│  CLI / GitHub Action / GitAgent Runtime                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: DETERMINISTIC ANALYSIS (Authoritative)        │
│                                                         │
│  diff-parser ──▶ secret-detector ──▶ sensitive-files    │
│                         │                                │
│                   diff-metrics ──▶ risk-engine           │
│                                                         │
│  Output: deterministic_signals JSON (immutable)          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: LLM REASONING (Advisory)                      │
│                                                         │
│  Receives deterministic signals as primary input.        │
│  Skills: diff_semantic_analyzer, blast_radius_estimator, │
│  failure_mode_predictor, deployment_timing_advisor,      │
│  reviewer_assignment_reasoner, merge_brief_synthesizer   │
│                                                         │
│  ⚡ Graceful degradation: if LLM fails, the system      │
│  falls back to deterministic-only analysis automatically │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: ENFORCEMENT + CALIBRATION (Authoritative)     │
│                                                         │
│  • Secrets detected → force DO_NOT_MERGE (non-negotiable)│
│  • Risk score is immutable (LLM cannot override)         │
│  • Recommendations can only be downgraded, never upgraded│
│  • Confidence calibrated against signal strength         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 4: STRUCTURED OUTPUT                              │
│                                                         │
│  Merge Brief (markdown) + JSON signals + Exit Code       │
└─────────────────────────────────────────────────────────┘
```

### Authority Boundaries

The key design decision: deterministic code has **final authority** over hard decisions. LLM skills are **advisory only**.

| Deterministic (Authoritative) | LLM Skills (Advisory) |
|-------------------------------|----------------------|
| ✅ Secret detection (regex, 14 patterns) | ✅ Consequence prediction |
| ✅ Risk score (weighted, immutable) | ✅ Failure mode modeling |
| ✅ Sensitive file classification | ✅ Blast radius reasoning |
| ✅ Diff metrics computation | ✅ Deployment timing context |
| ✅ Hard constraint enforcement | ✅ Reviewer recommendations |
| ✅ Confidence floor calibration | ✅ Merge brief prose |
| ✅ Blocking issue triggers | ❌ Cannot change risk score |
|  | ❌ Cannot dismiss secrets |
|  | ❌ Cannot upgrade recommendation |

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **npm** (for installing dependencies)

### Installation

```bash
git clone https://github.com/aditya-3526/prguardian-gitagent.git
cd prguardian-gitagent
npm install
```

### CLI Usage

PRGuardian ships with a standalone CLI (`analyze.js`) that runs the full deterministic pipeline without requiring any API keys or external services:

```bash
# Analyze a diff file — outputs a formatted merge brief
node analyze.js path/to/pr.diff

# Analyze a JSON input file (diff + metadata)
node analyze.js demo/sample_pr.json

# Output structured JSON instead of markdown
node analyze.js path/to/pr.diff --json

# Pipe a diff from stdin
git diff main..feature | node analyze.js --stdin

# Fetch and analyze a GitHub PR directly (requires GITHUB_TOKEN)
export GITHUB_TOKEN=ghp_xxxxx
node analyze.js --pr facebook/react#36310

# Enable verbose logging
node analyze.js path/to/pr.diff --verbose

# Persist logs to logs/ directory
node analyze.js path/to/pr.diff --log
```

### Exit Codes

The CLI returns meaningful exit codes for CI/CD integration:

| Exit Code | Meaning |
|:---------:|---------|
| `0` | `MERGE` — safe to merge |
| `1` | `MERGE_WITH_CONDITIONS` — merge after addressing conditions |
| `2` | `DO_NOT_MERGE` — blocking issues found |
| `3` | Error — analysis could not complete |

### GitAgent Runtime

When used with the GitAgent framework, PRGuardian activates the full LLM reasoning layer:

```bash
# Claude adapter
npx gitagent run ./prguardian-gitagent --adapter claude

# OpenAI adapter
npx gitagent run ./prguardian-gitagent --adapter openai

# Gemini adapter
npx gitagent run ./prguardian-gitagent --adapter gemini

# Lyzr adapter
npx gitagent run ./prguardian-gitagent --adapter lyzr

# Python SDK
pip install gitclaw
gitclaw run ./prguardian-gitagent
```

---

## GitHub Action

PRGuardian includes a GitHub Action workflow that automatically analyzes every PR and posts the merge brief as a comment:

```yaml
# .github/workflows/prguardian.yml — already included in the repo
name: PRGuardian Analysis
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Fetch PR diff and analyze
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          node analyze.js --pr ${{ github.repository }}#${{ github.event.pull_request.number }} --json > result.json
          # Comment is auto-posted by the comment-poster module
```

The comment poster is **idempotent** — it finds and updates the existing PRGuardian comment instead of creating duplicates on each push.

---

## Sample Merge Brief

> This is what PRGuardian produces when it detects a real secret leak. This output was generated by the deterministic pipeline analyzing the included `secret-leak.diff` test fixture.

---

### PRGuardian Merge Brief

**Analyzed:** 2026-04-20 (Monday, 23:07 local time)
**Files Changed:** 3
**Lines Changed:** +10 / -3 (SMALL)

---

#### Recommendation: DO_NOT_MERGE

**Risk Score:** 72/100
**Primary Reason:** Hard constraint triggered — SECRET_DETECTED.

---

#### Blocking Issues

**Issue 1: PostgreSQL Connection URI**

| Element | Detail |
|---------|--------|
| **LOCATION** | `src/config/database.ts:L2` |
| **OBSERVATION** | PostgreSQL Connection URI detected. Content: `postgres****123@` |
| **CONSEQUENCE** | If merged, this credential will be permanently embedded in Git history. Any user with repository read access can extract it. |
| **REQUIRED ACTION** | (1) Remove the hardcoded credential. (2) Rotate immediately. (3) Replace with environment variable. |

**Confidence:** CONFIRMED

**Issue 2: AWS Access Key**

| Element | Detail |
|---------|--------|
| **LOCATION** | `src/services/payment/stripe-handler.ts:L1` |
| **OBSERVATION** | AWS Access Key detected. Content: `AKIAI44Q****KTOQ` |
| **CONSEQUENCE** | If merged, this credential will be permanently embedded in Git history. |
| **REQUIRED ACTION** | (1) Remove. (2) Rotate in AWS IAM. (3) Replace with environment variable. |

**Confidence:** CONFIRMED

---

#### Risk Score Breakdown

| Factor | Contribution | Max | Detail |
|--------|:-----------:|:---:|--------|
| Security Risk | +40 | 40 | 2 secret(s) detected; payment module modified |
| Blast Radius | +25 | 25 | 2 sensitive files: 1 HIGH, 1 CRITICAL |
| Change Complexity | +2 | 20 | SMALL change (13 lines), 1 file type |
| Deployment Timing | +5 | 15 | Late night deployment window |
| **Total** | **72** | **100** | |

---

## Secret Detection

PRGuardian's deterministic layer scans every added line for 14 secret patterns:

| Pattern | Example Match |
|---------|--------------|
| AWS Access Key | `AKIAIOSFODNN7EXAMPLE` |
| AWS Secret Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| Stripe Live Key | `sk_live_4eC39HqLyj...` (masked) |
| GitHub Token | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Private Key Block | `-----BEGIN RSA PRIVATE KEY-----` |
| PostgreSQL URI | `postgresql://user:pass@host:5432/db` |
| MongoDB URI | `mongodb+srv://user:pass@cluster.mongodb.net` |
| JWT Token | `eyJhbGciOiJIUzI1NiIs...` |
| Generic API Key | `api_key = "sk-proj-..."` |
| Google API Key | `AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Slack Token | `xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx` |
| SendGrid Key | `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Twilio Auth Token | 32-character hex in Twilio context |
| Generic Secret | `secret = "..."` assignments |

### False Positive Filtering

The detector uses a two-tier filtering system to maintain precision:

1. **Value-level filtering** — matched credential values containing `EXAMPLE`, `placeholder`, `test`, `sample`, `dummy`, `fake`, `xxx`, `000`, `REDACTED`, `changeme`, or `TODO` are discarded.

2. **Source-level filtering** — lines sourcing from `process.env`, `os.environ`, `System.getenv`, `ENV["..."]`, or other environment variable patterns are excluded.

This ensures the AWS documentation key `AKIAIOSFODNN7EXAMPLE` is correctly filtered (because the *matched value* contains "EXAMPLE"), while a real key like `AKIAI44QH8DHBFNRKTOQ` on a line that happens to say "example usage" is **not** filtered — because the check examines the credential value, not the surrounding text.

---

## Risk Scoring Engine

The risk engine computes a weighted composite score from 4 factors:

| Factor | Weight | What It Measures |
|--------|:------:|-----------------|
| **Security Risk** | 40 | Secrets detected, auth/payment module changes |
| **Blast Radius** | 25 | Number and criticality of sensitive files |
| **Change Complexity** | 20 | Lines changed, file count, language diversity |
| **Deployment Timing** | 15 | Day-of-week and time-of-day risk multipliers |

### Recommendation Thresholds

| Score Range | Recommendation |
|:-----------:|---------------|
| 0–29 | `MERGE` |
| 30–59 | `MERGE_WITH_CONDITIONS` |
| 60–100 | `DO_NOT_MERGE` |

Hard constraints override thresholds: any detected secret forces `DO_NOT_MERGE` regardless of score.

### File Classification

Every changed file is classified into a risk category:

| Category | Risk Factor | Examples |
|----------|:-----------:|---------|
| **CRITICAL** | +25 | `src/auth/`, `src/payments/`, middleware, `.env` files |
| **HIGH** | +15 | `config/`, `migrations/`, `shared/`, API routes |
| **MODERATE** | +5 | `services/`, `controllers/`, `models/` |
| **LOW** | 0 | `tests/`, `docs/`, `README.md`, `.gitignore` |

---

## Real-World Validation

PRGuardian was validated against 3 real, public GitHub PRs from `facebook/react`:

| PR | Description | PRGuardian | Actual | Verdict |
|-----|------------|:----------:|:------:|:-------:|
| [#36308](https://github.com/facebook/react/pull/36308) | Changelog update | MERGE (12) | Merged in 19 min | ✅ Correct |
| [#36148](https://github.com/facebook/react/pull/36148) | Add iframe attribute | MERGE (22) | Merged after 25-day review | ⚠️ Partial |
| [#34075](https://github.com/facebook/react/pull/34075) | Core Fiber bug fix | MERGE (13) | Merged after 110-day review | ❌ Missed |

**Key insight:** The deterministic layer excels at catching secrets and classifying application-level risk patterns. It correctly produces zero false positives. However, it cannot assess *semantic* risk — the difference between adding a line to a README and adding a line to the React Fiber reconciler. This is exactly the gap the LLM reasoning layer is designed to fill.

Full validation report with detailed analysis of each PR is available in the repository.

---

## Test Suite

PRGuardian includes a comprehensive deterministic test suite — **76 tests, 0 dependencies outside Node.js**:

```bash
node tests/test-runner.js
```

```
╔══════════════════════════════════════════════════════╗
║       🛡️  PRGuardian — Deterministic Test Suite      ║
╚══════════════════════════════════════════════════════╝

  ── Diff Parser ────────────────────── 12/12 ✅
  ── Secret Detector ────────────────── 5/5   ✅
  ── Sensitive File Detector ────────── 12/12 ✅
  ── Diff Metrics ───────────────────── 6/6   ✅
  ── Risk Engine ────────────────────── 11/11 ✅
  ── Enforcement Layer ──────────────── 6/6   ✅
  ── Confidence Calibration ─────────── 5/5   ✅
  ── Graceful Degradation ───────────── 7/7   ✅
  ── End-to-End Integration ─────────── 12/12 ✅

══════════════════════════════════════════════════════
  Results: 76/76 passed, 0 failed
  🎉 All tests passed!
══════════════════════════════════════════════════════
```

Test fixtures include:
- `safe-pr.diff` — README + docs change → expects MERGE, score < 15
- `secret-leak.diff` — PostgreSQL URI + AWS key → expects DO_NOT_MERGE, score > 60
- `auth-change.diff` — Auth middleware + migration + MFA → expects score > 25
- `demo/sample_pr.json` — Full JSON input with placeholder secrets → expects correct filtering

---

## Why PRGuardian Is Different

| Tool | What It Checks | What It Misses |
|------|---------------|----------------|
| **Linters** | Style rules, syntax | Whether the code will break production |
| **CI Tests** | Whether existing tests pass | Whether the right tests exist |
| **Coverage Tools** | Percentage of lines covered | Whether covered lines test the right things |
| **Static Analysis** | Code smells, complexity | Downstream consequences, blast radius, timing |
| **Secret Scanners** | Known secret patterns | Blast radius, deployment risk, consequence modeling |
| **PRGuardian** | **What happens if you merge this** | Business logic correctness (explicitly out of scope) |

PRGuardian doesn't replace any of these tools. It adds a layer that none of them provide: **consequence prediction**. It reasons about the diff the way a staff engineer would — asking "what breaks downstream?" and "what happens at 2 AM Saturday?" instead of "does this line follow our naming convention?"

---

## Repository Structure

```
prguardian-gitagent/
├── agent.yaml                           # GitAgent manifest (skills, inputs, outputs)
├── analyze.js                           # CLI entry point
├── package.json                         # Node.js manifest
│
├── src/                                 # Deterministic analysis layer
│   ├── index.js                         # 4-phase orchestrator
│   ├── enforcement.js                   # Post-LLM hard constraint enforcer
│   ├── logger.js                        # Structured logging
│   ├── analyzers/
│   │   ├── diff-parser.js               # Unified diff parser
│   │   ├── secret-detector.js           # Regex-based secret scanner (14 patterns)
│   │   ├── sensitive-files.js           # File risk classifier
│   │   └── diff-metrics.js             # Change size, language, type analysis
│   ├── scoring/
│   │   └── risk-engine.js              # Weighted risk scoring (0-100)
│   └── github/
│       ├── pr-fetcher.js               # GitHub API diff fetcher
│       └── comment-poster.js           # Idempotent PR comment poster
│
├── skills/                              # LLM skill definitions
│   ├── diff_semantic_analyzer/          # Classify change types
│   ├── blast_radius_estimator/          # Map impact surface
│   ├── failure_mode_predictor/          # Generate failure scenarios
│   ├── deployment_timing_advisor/       # Recommend deployment windows
│   ├── reviewer_assignment_reasoner/    # Determine review requirements
│   ├── developer_context_synthesizer/   # Calibrate review scrutiny
│   └── merge_brief_synthesizer/        # Produce final merge brief
│
├── tests/
│   ├── test-runner.js                  # 76-test deterministic suite
│   ├── fixtures/                       # Test diff fixtures
│   └── real-world/                     # Real GitHub PR diffs
│
├── workflows/
│   └── full_pr_review.md               # Complete PR review playbook
├── knowledge/
│   ├── risk_patterns.md                # High-risk patterns & failure templates
│   └── merge_brief_examples.md         # Example merge briefs
├── .github/workflows/
│   └── prguardian.yml                  # GitHub Action for automated PR analysis
│
├── SOUL.md                             # Identity, values, communication style
├── RULES.md                            # Hard behavioral constraints
├── DUTIES.md                           # Segregation of duties & handoff protocol
├── AGENTS.md                           # Framework-agnostic runtime instructions
└── DESIGN.md                           # Architecture decisions & rationale
```

---

## Graceful Degradation

PRGuardian is designed to **always return a valid result**, even when components fail:

| Failure | Behavior |
|---------|----------|
| LLM API unavailable | Falls back to deterministic-only analysis. Merge brief notes the limitation. Confidence set to MEDIUM. |
| Malformed diff | Parser returns empty result. All downstream modules handle 0-file input gracefully. |
| Diff too large (>100K chars) | Diff is truncated. Analysis proceeds on available content. Confidence lowered to MEDIUM. |
| Invalid JSON input | Parser attempts raw diff extraction. Falls back to unified diff parsing. |

The deterministic layer is the reliability guarantee. It runs in <100ms, requires zero API keys, and produces a valid recommendation from pure code — no network calls, no tokens, no model availability concerns.

---

## Demo Scenario

The included demo (`demo/sample_pr.json`) simulates PR #247: "Optimize mobile token refresh."

**What it looks like:** Small (87 lines, 4 files), passing CI, two senior approvals, Friday at 16:47.

**What PRGuardian catches:**
- The test fixture contains a Stripe key with production prefix (`sk_live_...`)
- Auth middleware caches token configuration without TTL
- Friday 16:47 is the worst deployment window for auth changes

**Run it:**

```bash
node analyze.js demo/sample_pr.json
```

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
