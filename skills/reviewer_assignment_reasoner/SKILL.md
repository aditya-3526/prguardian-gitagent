# SKILL — Reviewer Assignment Reasoner

## Purpose

Determine **who** should review this PR and **why**, based on which systems were modified, what type of changes were made, and what domain expertise is required. This transforms PRGuardian from a passive analysis tool into an active workflow orchestrator.

The goal is not to assign specific people (PRGuardian doesn't have an org chart). The goal is to specify **what expertise is required**, so the team can route the review to the right person.

---

## Review Requirement Categories

### Domain Expertise Requirements

| Changed Area | Required Expertise | Priority |
|-------------|-------------------|----------|
| `auth/`, `authentication/`, `authorization/`, `session/` | **Security-aware engineer** with auth domain knowledge | 🔴 CRITICAL |
| `payments/`, `billing/`, `checkout/`, `subscription/` | **Payments domain expert** — understands payment processor integrations, PCI implications | 🔴 CRITICAL |
| `migrations/`, `schema/`, database-related files | **Database/platform engineer** — understands migration safety, locking, rollback | 🟠 HIGH |
| `shared/`, `common/`, `core/`, `lib/`, `utils/` | **Platform/framework engineer** — understands cross-cutting impact | 🟠 HIGH |
| `middleware/` | **Backend engineer** with middleware architecture knowledge | 🟠 HIGH |
| `api/`, `routes/`, `endpoints/`, `controllers/` | **API design reviewer** — understands contract stability, versioning | 🟡 MEDIUM |
| `config/`, `.env*`, infrastructure files | **DevOps/infrastructure engineer** | 🟡 MEDIUM |
| `.github/workflows/`, CI/CD files | **CI/CD engineer** — understands pipeline safety | 🟡 MEDIUM |
| `tests/`, `__tests__/`, `spec/` | **QA-aware engineer** — validates test quality, not just presence | 🟢 STANDARD |
| Frontend components, UI files | **Frontend engineer** with component architecture knowledge | 🟢 STANDARD |
| Documentation, README, changelog | **Any engineer** — standard review | 🟢 STANDARD |

### Change-Type-Based Requirements

| Change Classification | Additional Requirement |
|----------------------|----------------------|
| BEHAVIORAL change to critical path | **Senior engineer** — behavioral changes to auth/payments require senior review regardless of file location |
| CONTRACT change | **API contract owner** — anyone who changes a public interface needs approval from the interface owner |
| Large diff (>500 lines of non-cosmetic changes) | **Second reviewer** — large changes benefit from two independent perspectives |
| First-time contributor | **Mentorship reviewer** — someone familiar with codebase conventions to provide constructive guidance |
| Cross-module change | **System architect or tech lead** — cross-module changes need someone who understands the overall system |

---

## Procedure

### Step 1: Map Files to Review Domains

For each file in the diff, match it against the domain expertise table above. Record:
- Which domains are touched
- The priority of each domain
- How many files fall into each domain

### Step 2: Apply Change-Type Modifiers

Cross-reference with `diff_semantic_analyzer` output:
- If BEHAVIORAL changes exist in critical domains (auth, payments), escalate review priority to CRITICAL
- If CONTRACT changes exist, add API contract owner requirement
- If the PR is cross-module, add system architect requirement

### Step 3: Synthesize Minimum Review Requirements

Produce a prioritized list of review requirements. The list should be:
- **Ordered by priority** (CRITICAL → HIGH → MEDIUM → STANDARD)
- **Deduplicated** (if auth and payments both need "security-aware engineer," list it once)
- **Specific about why** (not just "security review needed" but "security review needed because auth middleware token validation logic changed")

### Step 4: Determine Minimum Reviewer Count

| Condition | Minimum Reviewers |
|-----------|------------------|
| Cosmetic-only change | 1 |
| Standard single-module change | 1 |
| Cross-module change | 2 |
| Critical domain change (auth/payments) | 2 (including domain expert) |
| Large diff (>500 non-cosmetic lines) | 2 |
| Contract-breaking change | 2 (including contract owner) |

---

## Output Format

```yaml
review_requirements:
  minimum_reviewers: 2
  reason_for_count: "Cross-module change touching auth middleware and database schema"

  required_expertise:
    - priority: CRITICAL
      domain: "Authentication & Security"
      reason: "Auth middleware token validation logic changed (src/auth/middleware/token_validator.ts). Behavioral change to security-critical path requires security-aware reviewer."
      must_understand:
        - "Token validation lifecycle and refresh flow"
        - "Impact of validation logic changes on downstream authenticated services"
        - "Session token security implications"

    - priority: HIGH
      domain: "Database & Platform Engineering"
      reason: "Database migration adds non-nullable column to users table (migrations/024_add_tier.sql). Migration safety, locking behavior, and rollback path must be verified."
      must_understand:
        - "PostgreSQL locking behavior during ALTER TABLE"
        - "Migration rollback procedures"
        - "Impact on ORM models and query patterns"

    - priority: MEDIUM
      domain: "API Contract"
      reason: "User API response shape may be affected by new 'tier' field (src/api/routes/users.ts). Consumers expecting the old schema need to be assessed."
      must_understand:
        - "API versioning strategy in this codebase"
        - "Known consumers of the User API endpoints"

  review_focus_areas:
    - file: "src/auth/middleware/token_validator.ts"
      focus: "Verify that the behavioral change to token validation does not reject valid tokens under any edge case. Test with tokens issued before and after the change."
    - file: "migrations/024_add_tier.sql"
      focus: "Verify rollback script exists and works. Check if existing rows have a default value strategy. Assess table lock duration for the users table."
    - file: "src/api/routes/users.ts"
      focus: "Verify backward compatibility of the API response. Check if the new 'tier' field breaks any known consumers."

  optional_reviewers:
    - domain: "Mobile Platform"
      reason: "Token refresh behavior may affect mobile clients. Mobile engineer review is recommended but not required if no mobile-specific code was changed."

  risk_score_contribution: 5  # small contribution — reviewer assignment is a process signal, not a risk factor
```

---

## Principles

1. **Never assign specific people.** PRGuardian doesn't know the org chart, team structure, or individual availability. It specifies what expertise is needed. The team maps expertise to people.

2. **Justify every requirement.** "Security review needed" is not enough. "Security review needed because the auth middleware's token validation logic was changed — a behavioral modification to a security-critical path" is enough.

3. **Don't over-require.** Not every PR needs 3 reviewers with 5 specializations. A well-contained change to a single module needs one reviewer with relevant domain knowledge. Match the review intensity to the risk.

4. **Include focus areas.** Don't just say who should review — say what they should look for. This makes the review faster and more effective.
