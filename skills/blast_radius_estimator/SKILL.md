# SKILL — Blast Radius Estimator

## Purpose

Map the impact surface of a pull request. Determine which systems, services, modules, and user flows are affected by the changes — not just directly, but transitively. A change to a shared utility module doesn't just affect that file; it affects every file that imports it, every service that calls those files, and every user flow that touches those services.

This skill answers the question: **"If this change has a bug, what breaks?"**

---

## Analysis Procedure

### Step 1: Direct Impact Mapping

For each file modified in the diff, identify:

1. **Module boundaries:** Is this file part of a clearly bounded module (e.g., `auth/`, `payments/`, `user-service/`)? Document the module.
2. **Export surface:** Does this file export functions, classes, constants, or types that other files import? List them.
3. **Shared vs. isolated:** Is this file imported by other modules, or is it internal to its own module?

**Classification:**
- **ISOLATED** — File is only imported within its own module/directory. Blast radius is contained.
- **SHARED** — File is imported across module boundaries. Blast radius extends to all importing modules.
- **CORE** — File is part of a shared utility, middleware, or framework layer imported by most of the codebase. Blast radius is codebase-wide.

### Step 2: Import Graph Analysis

From the diff, reconstruct the import relationships:

1. Look at `import` / `require` / `from` statements in the changed files
2. Look at the files being changed — which other files in the codebase might import from these paths?
3. Check if any file path changed (file rename, directory restructure) — this breaks all existing imports.

For each modified file, produce an import impact chain:
```
modified: src/shared/auth/validate.ts
  ← imported by: src/api/routes/users.ts
  ← imported by: src/api/routes/admin.ts
  ← imported by: src/api/middleware/requireAuth.ts
    ← used by: ALL authenticated API routes
```

**If the import graph cannot be fully reconstructed from the diff alone**, state this explicitly. Do not guess. Report: "Import graph analysis is limited to relationships visible in the diff. Files importing the changed modules from outside the diff could not be identified."

### Step 3: API Contract Surface

If any changed file defines or modifies an API endpoint, assess:

1. **Internal APIs:** Other services within the organization that call this endpoint
2. **External APIs:** Third-party consumers or public API users
3. **Client contracts:** Mobile apps, SPAs, or CLIs that depend on the response format

For each affected API:
- What changed in the contract (new fields, removed fields, type changes, auth changes)
- What consumers would observe (error, missing data, unexpected format)
- Whether the change is backward-compatible

### Step 4: Database Impact

If the diff includes database-related changes (migrations, schema files, query changes):

1. **Schema changes:** Which tables are affected? Are columns added/removed/modified?
2. **Query changes:** Which queries are affected? Do they read/write different data?
3. **Migration risks:** Does the migration require downtime? Lock tables? Backfill data?
4. **Rollback path:** Can the schema change be rolled back without data loss?

### Step 5: Shared Resource Impact

Identify changes to shared resources:

1. **Configuration files:** `.env`, `config.yaml`, `docker-compose.yml`, `Dockerfile`
2. **Package dependencies:** `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`
3. **CI/CD pipelines:** `.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml`
4. **Infrastructure:** Terraform files, Kubernetes manifests, cloud formation templates

These changes have blast radius beyond the application code.

### Step 6: User Flow Mapping

Map changed code to user-facing flows:

| Changed Module | Affected User Flows | Confidence |
|---------------|---------------------|------------|
| `auth/middleware` | Login, signup, session refresh, any authenticated action | HIGH CONFIDENCE |
| `payments/checkout` | Purchase flow, cart checkout, subscription renewal | HIGH CONFIDENCE |
| `shared/utils/date` | Any feature displaying dates (could be many) | POSSIBLE |
| `api/routes/settings` | User settings page | CONFIRMED |

---

## Output Format

```yaml
blast_radius:
  overall_scope: CONTAINED | MODULE | CROSS_MODULE | CODEBASE_WIDE
  confidence: HIGH | MEDIUM | LOW

  direct_impact:
    - file: src/auth/middleware/token_validator.ts
      module: auth
      classification: CORE
      reason: "Shared auth middleware imported by all authenticated routes"

    - file: src/payments/receipt_generator.ts
      module: payments
      classification: ISOLATED
      reason: "Internal to payments module, not imported externally"

  transitive_impact:
    - area: "All authenticated API routes"
      trigger: "auth/middleware change"
      confidence: HIGH CONFIDENCE
      detail: "Any modification to token validation logic affects every route behind requireAuth middleware"

    - area: "Mobile client session management"
      trigger: "Token refresh behavior change"
      confidence: POSSIBLE
      detail: "Mobile clients implement token refresh; behavioral changes may cause refresh failures"

  api_contracts_affected:
    - endpoint: "POST /api/auth/refresh"
      change: "Token validation logic modified"
      backward_compatible: false
      consumers: ["mobile-app", "web-spa", "admin-dashboard"]

  database_impact:
    tables_affected: ["users"]
    migration_required: true
    downtime_required: false
    rollback_possible: true
    detail: "New column 'tier' added with NOT NULL constraint"

  shared_resources_affected:
    - type: "configuration"
      file: ".env.staging"
      detail: "New environment variable FEATURE_FLAG_TIER_SYSTEM required"

  user_flows_affected:
    - flow: "User login"
      severity: HIGH
      detail: "Auth middleware changes directly affect login flow"
    - flow: "Mobile session refresh"
      severity: HIGH
      detail: "Token refresh behavior change may cause session failures"

  out_of_scope: |
    The following could not be assessed from the available diff:
    - Services in other repositories that consume the affected APIs
    - Downstream data pipeline consumers of the 'users' table
    - Cache invalidation behavior for auth tokens (Redis/Memcached config not in diff)
    - Other in-flight PRs that may interact with the same files
    - Runtime dependencies not visible in the import graph (dynamic imports, reflection)
```

---

## Risk Scoring Contribution

The blast radius estimator contributes to the overall risk score as follows:

| Blast Radius Scope | Risk Contribution |
|--------------------|--------------------|
| CONTAINED | +5 to risk score |
| MODULE | +15 to risk score |
| CROSS_MODULE | +30 to risk score |
| CODEBASE_WIDE | +50 to risk score |

Additional modifiers:
- API contract broken (not backward-compatible): +20
- Database schema change with no rollback path: +15
- Shared middleware/core utility modified: +10
- Configuration change affecting deployment: +10

---

## Critical Patterns

The following patterns should trigger elevated blast radius assessment:

1. **Any file in `shared/`, `common/`, `core/`, `lib/`, `utils/`** — These are by definition shared across modules. Treat as CORE unless proven otherwise.

2. **Any file in `middleware/`** — Middleware is typically in the request path of many routes. Changes have wide blast radius by default.

3. **Any file matching `**/auth/**` or `**/authentication/**`** — Auth is a cross-cutting concern. Changes affect every authenticated flow.

4. **Any migration file** — Database changes are permanent and affect all code that queries the affected tables.

5. **Any file in `config/`, `.env*`, or `**/settings/**`** — Configuration changes can alter behavior without changing code.

6. **Package manifest changes** (`package.json`, `requirements.txt`, etc.) — Dependency changes can introduce vulnerabilities, break builds, or change runtime behavior in subtle ways.
