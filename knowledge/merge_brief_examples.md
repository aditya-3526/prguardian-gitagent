# Knowledge: Merge Brief Examples

These are complete example merge briefs that demonstrate PRGuardian's output format, reasoning depth, and communication style. Skills should reference these for formatting guidance.

---

## Example 1: DO NOT MERGE

> **Context:** PR #247 — "Optimize mobile token refresh" — 87 lines changed across 4 files. The PR appears benign but contains a hardcoded staging API key and a behavioral change to shared auth middleware.

---

# PRGuardian Merge Brief

**PR:** #247 — Optimize mobile token refresh
**Analyzed:** 2026-03-28T16:47:00Z (Friday, 16:47 local time)
**Files Changed:** 4
**Non-Cosmetic Lines:** 74

---

## Recommendation: DO_NOT_MERGE

**Risk Score:** 89/100
**Primary Reason:** Hardcoded Stripe API key detected in test configuration file with production permissions pattern, combined with an undocumented behavioral change to shared auth middleware affecting all authenticated routes.

---

## Blocking Issues

### Blocking Issue 1: Hardcoded API Key

**LOCATION:** `test/fixtures/payment_config.ts:L23`
**OBSERVATION:** A string matching the Stripe live key pattern (`sk_live_XXXXX...`) is assigned directly to the `STRIPE_API_KEY` constant. The prefix `sk_live_` indicates a production-environment key, despite the file being in a test directory.
**CONSEQUENCE:** If merged, this key will be permanently embedded in the Git history. Any user with repository read access can extract it. Even if the line is removed in a subsequent commit, the key remains in history. If this key has production payment processing permissions, it can be used to issue charges, create refunds, or access customer payment data.
**REQUIRED ACTION:** (1) Remove the hardcoded key immediately. (2) Rotate the Stripe API key in the Stripe dashboard — the key must be considered compromised since it exists in branch history. (3) Replace with environment variable injection: `process.env.STRIPE_API_KEY`. (4) Add `**/fixtures/**` to the project's secret scanning configuration.

**Confidence:** CONFIRMED — the pattern `sk_live_` is a documented Stripe production key prefix. The string has sufficient entropy to be a real key.

### Blocking Issue 2: Undocumented Auth Middleware Behavioral Change

**LOCATION:** `src/shared/auth/middleware/validateToken.ts:L31-L38`
**OBSERVATION:** The token validation function now caches the last-known-good token configuration in a module-scoped variable (`let cachedConfig = null`). On subsequent calls, it uses the cached configuration instead of reading from the auth provider. This is a behavioral change — the function will no longer pick up configuration changes (key rotations, algorithm changes) until the service is restarted.
**CONSEQUENCE:** If the auth provider rotates signing keys (standard security practice, typically every 24–72 hours), tokens signed with the new key will be rejected by instances holding a stale cached configuration. This creates a progressive authentication failure — the longer a service instance runs, the more likely it is to reject valid tokens. The failure rate will increase with each key rotation until the service is restarted.
**REQUIRED ACTION:** (1) Add a TTL (time-to-live) to the cached configuration, e.g., `if (cachedConfig && Date.now() - cachedConfig.timestamp < 300000)` for a 5-minute cache. (2) Document the caching behavior in the function's JSDoc. (3) Add a test that verifies the validator correctly handles configuration changes during its lifetime.

**Confidence:** HIGH CONFIDENCE — the caching behavior is clearly visible in the diff. The consequence (stale config rejecting rotated keys) is a well-documented failure pattern for auth systems.

---

## Risk Factors

1. **[CONFIRMED]** Friday 16:47 deployment timing — this is the worst possible deployment window for auth changes. Weekend on-call coverage is reduced. Auth failures would compound over the weekend as more users' tokens interact with the stale cache.

2. **[HIGH CONFIDENCE]** Shared middleware change — `validateToken.ts` is in `src/shared/auth/middleware/`, a path imported by all authenticated API routes. The blast radius is codebase-wide, not isolated to mobile token refresh.

3. **[POSSIBLE]** Mobile client retry behavior — mobile clients that receive 401 errors from stale-cache token rejection may enter a retry loop, amplifying the load on the auth service during an incident.

---

## Change Classification

| Classification | Files |
|---------------|-------|
| BEHAVIORAL | 2 |
| CONTRACT | 0 |
| STRUCTURAL | 0 |
| COSMETIC | 2 |

The PR is described as a "token refresh optimization" but contains a behavioral change to shared auth middleware (token config caching) and a test fixture file with a hardcoded API key. The two cosmetic changes (README update and comment additions) are benign.

---

## Blast Radius

**Scope:** CODEBASE_WIDE

The change to `src/shared/auth/middleware/validateToken.ts` affects every route that uses the `requireAuth` middleware — which, based on the import path, is the shared auth middleware for the entire application.

Affected user flows:
- **User login** — HIGH
- **Mobile session refresh** — HIGH (directly modified)
- **Any authenticated API call** — HIGH
- **Admin dashboard** — HIGH
- **Webhook processing** (if authenticated) — POSSIBLE

### Out of Scope
- Services in other repositories that authenticate against the same auth provider
- Mobile client retry behavior and crash handling for 401 responses
- Auth provider key rotation schedule and configuration
- Redis/session store interaction with cached token configurations

---

## Failure Scenarios

### Scenario 1: Progressive Token Rejection (Highest Risk)

**Confidence:** HIGH CONFIDENCE
**Trigger:** Auth provider rotates signing keys (standard practice, typically every 24–72 hours). Service instances holding stale cached configuration reject tokens signed with the new key.
**Impact:** Authentication failure rate increases progressively. After 24 hours, approximately 50% of new tokens may be rejected (depending on rotation overlap period). After 72 hours, all new tokens are rejected by long-running instances.
**Detection:** Auth failure rate monitoring (if configured at >5% threshold) would alert within minutes of significant rejection. Without specific monitoring, first user reports in 15–30 minutes.
**Recovery:** Restart all service instances to clear cached configurations. No data loss. Recovery time: 5–15 minutes for rolling restart.

#### Postmortem Preview

> On Friday at 16:47, PR #247 ("Optimize mobile token refresh") was merged into main and deployed to production at 17:02. The change introduced module-level caching of auth provider configuration in the shared token validation middleware. The change passed all automated tests — the test suite does not simulate auth provider key rotation during a service lifetime.
>
> On Saturday at 14:00, the auth provider performed its scheduled 48-hour key rotation. New tokens issued after 14:00 were signed with the rotated key. Service instances that had been running since Friday's deploy still held the pre-rotation configuration in cache.
>
> By Saturday at 14:30, the authentication failure rate reached 12%. Mobile clients began experiencing forced logouts. The Friday on-call engineer received a PagerDuty alert at 14:08 but, upon investigating, saw no recent deploys (the Friday deploy had successfully completed 21 hours earlier) and initially attributed the spike to an auth provider issue.
>
> The root cause was identified at 15:40 when a second engineer noticed the `cachedConfig` variable in the Friday diff. A rolling restart was initiated at 15:45 and completed at 15:58. Auth failure rate returned to baseline by 16:05.
>
> Total impact: approximately 4,200 users experienced authentication failures over a 90-minute window. No data loss occurred. The Stripe API key in `test/fixtures/payment_config.ts` was discovered during the incident investigation and rotated at 16:30.

### Scenario 2: API Key Exploitation Window

**Confidence:** POSSIBLE
**Trigger:** Repository read access is sufficient to extract the hardcoded Stripe key from Git history.
**Impact:** If the key has production permissions, an attacker could process fraudulent charges, access customer payment data, or issue unauthorized refunds.
**Detection:** Stripe dashboard monitoring for unusual API activity. May not be detected if volume is low.
**Recovery:** Key rotation in Stripe dashboard (immediate). Audit of all API activity during the exposure window. Potential PCI compliance investigation.

---

## Deployment Timing

**Recommended Window:** DO NOT DEPLOY — blocking issues must be resolved first.
**Deploy Now?** ⛔ ABSOLUTELY NOT. It is Friday 16:47. Even without blocking issues, deploying auth middleware changes on a Friday evening is unacceptable per deployment timing policy.

After blocking issues are resolved, deploy Tuesday–Wednesday, 10:00–14:00 with auth failure rate monitoring at >2% threshold.

---

## Review Requirements

**Minimum Reviewers:** 2

1. 🔴 **CRITICAL — Security Engineer:** Hardcoded API key requires security review. Key rotation must be verified complete before this PR is re-submitted.
2. 🔴 **CRITICAL — Auth Domain Expert:** Behavioral change to shared token validation middleware requires review from someone who understands the auth provider's key rotation lifecycle.
3. 🟠 **HIGH — Platform Engineer:** Shared middleware change with codebase-wide blast radius requires platform team awareness.

---

## Conditions for Merge

Resolve blocking issues above before re-review. After resolution:

1. Remove the hardcoded Stripe key from `test/fixtures/payment_config.ts` and replace with `process.env.STRIPE_TEST_KEY`
2. Rotate the compromised Stripe key in the Stripe dashboard and confirm the old key is invalidated
3. Add TTL to the cached auth config (recommend 5-minute TTL with tests verifying cache expiration)
4. Add integration test: validate that `validateToken` correctly accepts tokens after a simulated key rotation
5. Deploy Tuesday–Wednesday during business hours with auth failure rate monitoring active

---

## Risk Score Breakdown

| Factor | Contribution | Detail |
|--------|-------------|--------|
| Secret detected (CONFIRMED) | +40 | Stripe live key hardcoded in test fixture |
| Auth middleware behavioral change | +20 | Shared middleware with codebase-wide blast radius |
| Codebase-wide blast radius | +15 | Affects all authenticated routes |
| Friday evening timing | +14 | Worst deployment window for auth changes |

---

Confidence in this assessment: HIGH. Basis: Both blocking issues are directly visible in the diff with clear causal chains to production failure modes.

This analysis covers technical consequence prediction only. Business logic validation, product intent review, and final merge authority remain with the engineering team.

---
---

## Example 2: MERGE WITH CONDITIONS

> **Context:** PR #389 — "Add user tier system for premium features" — 234 lines changed across 6 files. Well-tested feature PR with a database migration that needs deployment timing consideration.

---

# PRGuardian Merge Brief

**PR:** #389 — Add user tier system for premium features
**Analyzed:** 2026-03-25T10:30:00Z (Wednesday, 10:30 local time)
**Files Changed:** 6
**Non-Cosmetic Lines:** 198

---

## Recommendation: MERGE_WITH_CONDITIONS

**Risk Score:** 42/100
**Primary Reason:** Well-structured feature addition with comprehensive tests, but includes a database migration (non-nullable column on users table) that requires controlled deployment timing and a missing CHANGELOG entry for the new API response field.

---

## Blocking Issues

No blocking issues identified.

---

## Risk Factors

1. **[CONFIRMED]** Database migration adds non-nullable column `tier` to `users` table (3.2M rows). Migration itself is correct but requires timing consideration.
2. **[HIGH CONFIDENCE]** API response for `GET /api/users/:id` now includes a `tier` field. This is a non-breaking addition (new field, not removing or changing existing fields), but consumers should be notified.
3. **[POSSIBLE]** Application startup may fail if `TIER_DEFAULT_VALUE` environment variable is not set in production before migration runs.

---

## Change Classification

| Classification | Files |
|---------------|-------|
| BEHAVIORAL | 2 |
| CONTRACT | 1 |
| STRUCTURAL | 0 |
| COSMETIC | 3 |

The PR adds a user tier system: a database column, a service method, an API endpoint extension, and corresponding tests. The behavioral changes are well-scoped to the new feature with clear test coverage.

---

## Blast Radius

**Scope:** MODULE

The changes are primarily contained to the user module (`src/services/user/`, `src/api/routes/users.ts`). The database migration affects the `users` table, which is widely queried, but the change (adding a column) doesn't modify existing columns. The API addition is non-breaking.

### Out of Scope
- Analytics pipeline consumers of the users table (may need schema update)
- Admin dashboard user detail views (may want to display tier)

---

## Failure Scenarios

### Scenario 1: Migration Lock Timeout

**Confidence:** POSSIBLE
**Trigger:** `ALTER TABLE users ADD COLUMN` on 3.2M rows acquires a lock during peak traffic
**Impact:** Query timeouts on the users table for 10–60 seconds during lock acquisition
**Detection:** Database monitoring, response time alerts
**Recovery:** Migration completes on its own, or cancel and retry during low-traffic window

### Scenario 2: Missing Environment Variable

**Confidence:** HIGH CONFIDENCE
**Trigger:** Application deployed after migration but without `TIER_DEFAULT_VALUE` env var
**Impact:** Application crashes or returns errors when creating new users without a tier
**Detection:** Immediate — health check failure or first user creation error
**Recovery:** Set environment variable and restart. 2–5 minutes.

---

## Deployment Timing

**Recommended Window:** Wednesday 10:30 is an acceptable deployment time.
**Deploy Now?** ✅ Current timing is acceptable for a staged rollout.

Recommended deployment sequence:
1. Set `TIER_DEFAULT_VALUE=free` environment variable in production (before code deploy)
2. Run database migration during low-traffic window or current time (Wednesday morning)
3. Deploy application code after migration completes
4. Verify user creation works with new tier field

---

## Review Requirements

**Minimum Reviewers:** 1

1. 🟡 **MEDIUM — Backend Engineer:** Familiar with the user model and database migration patterns.

---

## Conditions for Merge

1. Add `TIER_DEFAULT_VALUE` to the production environment configuration. Verify in deployment runbook that the variable is set before the migration runs.
2. Run the migration with a lock timeout: `SET lock_timeout = '5s';` before the `ALTER TABLE` statement. If lock acquisition fails, retry during the 02:00–04:00 UTC low-traffic window.
3. Add an entry to `CHANGELOG.md` documenting the new `tier` field in the user API response. Consumers should be aware they may begin receiving this field.
4. Verify that the analytics pipeline schema for the `users` table is updated to include the `tier` column, or confirm that the pipeline ignores unknown columns.

---

Confidence in this assessment: HIGH. Basis: All changes are fully visible in the diff with clear scope boundaries and comprehensive test coverage.

This analysis covers technical consequence prediction only. Business logic validation, product intent review, and final merge authority remain with the engineering team.
