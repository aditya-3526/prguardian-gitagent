# Knowledge: Risk Patterns

Reference document for PRGuardian's risk assessment skills. This file contains patterns, heuristics, and templates that inform risk analysis across all skills.

---

## High-Risk File Patterns

These file path patterns indicate areas of elevated risk. Any change matching these patterns should receive heightened scrutiny.

### Critical Paths (Risk Factor: +25)

| Pattern | Module | Why It's Critical |
|---------|--------|-------------------|
| `**/auth/**` | Authentication | Controls who can access the system. Bugs cause unauthorized access or lockouts. |
| `**/authentication/**` | Authentication | Same as above, alternate naming. |
| `**/authorization/**` | Authorization | Controls what users can do. Bugs cause privilege escalation. |
| `**/session/**` | Session Management | Manages user state. Bugs cause session hijacking or invalid logouts. |
| `**/payments/**` | Payment Processing | Handles money. Bugs cause financial loss, double charges, or failed transactions. |
| `**/billing/**` | Billing | Recurring charge logic. Bugs cause incorrect invoices or failed renewals. |
| `**/checkout/**` | Checkout Flow | Revenue-critical path. Bugs cause lost sales. |
| `**/crypto/**` or `**/encryption/**` | Cryptography | Handles secrets. Bugs cause data exposure. |

### High-Risk Paths (Risk Factor: +15)

| Pattern | Module | Why It's Risky |
|---------|--------|----------------|
| `**/middleware/**` | Middleware | In the request path of many routes. Wide blast radius. |
| `**/shared/**` or `**/common/**` or `**/core/**` | Shared Code | Used across modules. Changes affect many consumers. |
| `**/lib/**` or `**/utils/**` | Utility Libraries | Foundational code. Subtle bugs propagate widely. |
| `**/migrations/**` | Database Migrations | Schema changes are permanent. Mistakes are expensive to reverse. |
| `**/schema/**` | Data Schema | Defines data shape. Changes affect all readers and writers. |
| `**/config/**` or `**/.env*` | Configuration | Controls runtime behavior. Missing or wrong values crash services. |
| `**/api/**` or `**/routes/**` | API Layer | Public interfaces. Changes break consumers. |

### Moderate-Risk Paths (Risk Factor: +5)

| Pattern | Module | Risk |
|---------|--------|------|
| `**/services/**` | Business Logic | Core logic. Bugs affect feature correctness. |
| `**/models/**` or `**/entities/**` | Data Models | Data representation. Changes may affect serialization. |
| `**/hooks/**` | Lifecycle Hooks | Execution timing. Bugs cause race conditions or missed events. |
| `**/workers/**` or `**/jobs/**` | Background Processing | Async operations. Bugs may go unnoticed longer. |
| `**/cache/**` | Caching | Stale or invalid cache causes subtle issues. |

### Low-Risk Paths (Risk Factor: 0)

| Pattern | Module | Risk |
|---------|--------|------|
| `**/tests/**` or `**/__tests__/**` | Tests | Tests protect, not harm. But deleted tests reduce coverage. |
| `**/docs/**` or `**/documentation/**` | Documentation | No runtime impact. |
| `*.md` | Markdown | Documentation. No runtime impact. |
| `**/.github/**` (non-workflow) | GitHub Metadata | Labels, templates, etc. |
| `**/stories/**` or `**/storybook/**` | UI Stories | Development tools only. |

---

## Common Failure Mode Templates

### 1. The Silent Corruption
**Trigger:** A field is renamed in a serializer, but consumers that deserialize using the old field name are not updated.
**Symptom:** Data appears to save correctly but downstream systems receive null or default values.
**Detection:** Usually 3–14 days — until someone notices missing data in reports or dashboards.
**Severity:** CRITICAL — data loss may be unrecoverable for the affected time window.
**Common locations:** Serializers, mappers, API response builders, event payload constructors.

### 2. The Token Rejection Storm
**Trigger:** Auth validation logic changes reject a token format that was previously accepted.
**Symptom:** Spike in 401/403 errors. Users are logged out. Mobile apps enter retry loops.
**Detection:** 2–10 minutes if auth failure rate alerting is configured.
**Severity:** HIGH — user-facing outage, but no data loss. Rollback resolves.
**Common locations:** Token validators, session middleware, OAuth handlers.

### 3. The Midnight Migration
**Trigger:** Database migration runs during high-traffic period, acquiring locks on large tables.
**Symptom:** Query timeouts, degraded performance, potential service unavailability.
**Detection:** Immediate — health checks fail, response times spike.
**Severity:** HIGH — service degradation, but recoverable once migration completes or is cancelled.
**Common locations:** Migration files, schema change scripts.

### 4. The Missing Config
**Trigger:** New code references an environment variable that exists in development but not in production.
**Symptom:** Service fails to start, or crashes on first request that accesses the new variable.
**Detection:** Immediate if startup crash. Delayed if the variable is accessed lazily.
**Severity:** MEDIUM-HIGH — service outage, but recovery is fast (add the variable and restart).
**Common locations:** Config loaders, environment parsers, service initialization.

### 5. The Dependency Phantom
**Trigger:** Package version bump introduces a breaking change or vulnerability.
**Symptom:** Varies — could be runtime error, security vulnerability, or subtle behavior change.
**Detection:** Days to weeks for subtle changes. Immediate for compilation errors.
**Severity:** Variable — depends on the specific dependency change.
**Common locations:** package.json, requirements.txt, go.mod, Cargo.toml.

### 6. The N+1 Introduction
**Trigger:** A loop that makes individual database queries is introduced where a batch query existed.
**Symptom:** Endpoint response times increase linearly with data size. Eventually causes timeouts.
**Detection:** Performance monitoring may catch within hours. Users notice slowness.
**Severity:** MEDIUM — degradation, not outage. But compounds over time as data grows.
**Common locations:** Data access layers, resolvers, list endpoints.

### 7. The Race Condition Gate
**Trigger:** A state check and state mutation are separated by an async operation, allowing concurrent requests to pass the check before the mutation is applied.
**Symptom:** Double-processing (double charges, duplicate records), or inconsistent state.
**Detection:** Difficult — may only manifest under load or specific timing.
**Severity:** HIGH for financial systems. MEDIUM for others.
**Common locations:** Payment processors, inventory systems, reservation systems.

---

## Deployment Risk Calendar

### Why Friday Deploys Are Dangerous

1. **Reduced coverage:** Weekend on-call typically has fewer engineers and slower response times.
2. **Delayed detection:** Users report issues on Monday when they return. Two days of silent degradation.
3. **Rollback complexity:** If a Friday deploy requires rollback, the rollback team may be different from the deploy team.
4. **Compounding risk:** Friday deploys that introduce subtle bugs interact with weekend background jobs (report generation, batch processing) in untested ways.

### High-Risk Calendar Periods

| Period | Risk | Reason |
|--------|------|--------|
| Friday 14:00+ | HIGH | Weekend begins. Half a business day to detect issues. |
| Day before holiday | HIGH | Extended reduced coverage. |
| Month-end (last 2 days) | HIGH for financial | Billing cycles, statement generation, reconciliation. |
| Quarter-end (last 3 days) | HIGH for financial | Quarterly reporting, compliance, audit windows. |
| Year-end (Dec 20–Jan 2) | EXTREME | Skeleton crew, holiday traffic patterns, annual processing. |
| Major product launch day | HIGH | All hands on launch; deploy introduces uncontrolled variable. |

---

## Secret Pattern Detection

### Known Secret Formats

| Pattern | Type | Example |
|---------|------|---------|
| `AKIA[A-Z0-9]{16}` | AWS Access Key | `AKIAIOSFODNN7EXAMPLE` |
| `sk_live_[a-zA-Z0-9]{24,}` | Stripe Live Key | `sk_live_EXAMPLE_KEY_REDACTED_FOR_PUSH_PROTECTION` |
| `sk_test_[a-zA-Z0-9]{24,}` | Stripe Test Key | `sk_test_EXAMPLE_KEY_REDACTED_FOR_PUSH_PROTECTION` |
| `ghp_[a-zA-Z0-9]{36}` | GitHub Personal Token | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `-----BEGIN RSA PRIVATE KEY-----` | RSA Private Key | PEM format private key |
| `-----BEGIN EC PRIVATE KEY-----` | EC Private Key | PEM format EC key |
| `mongodb(\+srv)?://[^/\s]+:[^/\s]+@` | MongoDB Connection URI | `mongodb://user:pass@host` |
| `postgres(ql)?://[^/\s]+:[^/\s]+@` | PostgreSQL Connection URI | `postgresql://user:pass@host` |
| `mysql://[^/\s]+:[^/\s]+@` | MySQL Connection URI | `mysql://user:pass@host` |
| `Bearer [a-zA-Z0-9\-._~+/]+=*` | Bearer Token (high entropy) | Long base64-like strings |
| `xox[bpsa]-[a-zA-Z0-9-]+` | Slack Token | `xoxb-xxx-xxx-xxx` |
| `SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}` | SendGrid API Key | `SG.xxxxx.xxxxx` |
| `AIza[0-9A-Za-z_-]{35}` | Google API Key | `AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### Common False Positives

- Example keys in documentation or tests (check for "example", "test", "dummy", "placeholder" in filename or surrounding context)
- Base64-encoded content that matches token patterns (check for `.png`, `.jpg`, font data)
- Variable names that contain "key" or "secret" but are assigned from environment variables (this is correct behavior)

### Suspicious Variable Name Patterns

Variables with these names assigned to string literals (not env vars) are suspicious:
- `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_CREDENTIAL`
- `api_key`, `apiKey`, `API_KEY`
- `secret`, `password`, `token`, `credential`
- `private_key`, `privateKey`, `PRIVATE_KEY`

---

## Blast Radius Heuristics

| If This Changes... | These Are Likely Affected |
|--------------------|-----------------------------|
| Auth middleware | All authenticated routes, session management, mobile auth |
| Database schema | All queries on affected tables, ORM models, reports, analytics |
| Shared utility function | Every file that imports it — check import graph |
| API response format | All API consumers (web, mobile, third-party, internal services) |
| Configuration schema | Service startup, feature flags, all components reading config |
| Package dependencies | Build pipeline, all code using the updated package, security surface |
| CI/CD pipeline | Build, test, deploy processes for all branches |
| Docker/infrastructure | Service deployment, scaling, networking, monitoring |
| Error handling in shared code | Error behavior across all callers — especially important for retry logic |
| Logging format/fields | Monitoring dashboards, alerting rules, log aggregation pipelines |
