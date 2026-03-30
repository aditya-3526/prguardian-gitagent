# SKILL — Diff Semantic Analyzer
---
name: diff_semantic_analyzer
description: Classifies changes in the PR diff into behavioral, structural, contract, or cosmetic categories
---
## Purpose

Classify every change in a PR diff by its **semantic type** — not by its size, file count, or line count, but by what kind of change it actually is. This classification is the foundation of all downstream risk assessment.

A 500-line diff that reformats whitespace is near-zero risk. A 5-line diff that changes the token validation logic in auth middleware is critical. Without semantic classification, you cannot tell the difference. This skill tells the difference.

---

## Classification Taxonomy

Every changed hunk in the diff must be classified into exactly one of these four categories:

### BEHAVIORAL

**Definition:** The logic of the program is altered. Given the same input, the program may now produce different output, take a different code path, or produce different side effects.

**Detection signals:**
- Conditional logic changed (`if`, `else`, `switch`, `case`, ternary operators)
- Return values changed
- Function call arguments changed
- Loop bounds or iteration logic changed
- Error handling changed (new catch blocks, changed error types, removed error handling)
- Arithmetic or string operations changed
- State mutations changed (variable assignments in non-cosmetic context)
- Database queries changed (WHERE clauses, JOIN conditions, ORDER BY)
- API call parameters changed

**Risk weight:** HIGH. Behavioral changes are the primary source of production incidents.

**Examples:**
```diff
- if (user.role === 'admin') {
+ if (user.role === 'admin' || user.role === 'superadmin') {
```
→ BEHAVIORAL: Authorization logic expanded. New role gains admin privileges.

```diff
- const timeout = 30000;
+ const timeout = 5000;
```
→ BEHAVIORAL: Timeout reduced by 83%. Requests that completed in 5–30 seconds will now fail.

### STRUCTURAL

**Definition:** Code is moved, reorganized, or refactored without changing its behavior. The program produces the same output given the same input, but the code is organized differently.

**Detection signals:**
- Functions moved between files (delete in one file, add in another with identical body)
- Code extracted into a new function or module (code removed from inline, new function created with same logic)
- Import/export statements changed without logic changes
- File renamed (diff shows full file delete + full file add with same content)
- Class hierarchy reorganized (method moved between classes with identical implementation)
- Directory restructuring

**Risk weight:** LOW-MEDIUM. Structural changes are low-risk for behavior but can break import paths, IDE references, and deployment configurations.

**Detection caution:** A change that appears structural may hide behavioral changes. If a function is moved AND modified, classify the modification as BEHAVIORAL and the move as STRUCTURAL. Always check for hidden behavioral changes within structural refactors.

**Examples:**
```diff
// File: utils/auth.ts (deleted)
- export function validateToken(token: string): boolean {
-   return jwt.verify(token, SECRET_KEY) !== null;
- }

// File: services/auth/validator.ts (added)
+ export function validateToken(token: string): boolean {
+   return jwt.verify(token, SECRET_KEY) !== null;
+ }
```
→ STRUCTURAL: Function moved to new location with identical implementation.

### CONTRACT

**Definition:** The public-facing interface of a module, API, or service is changed. This includes function signatures, API endpoint schemas, response formats, event schemas, and any interface that external consumers depend on.

**Detection signals:**
- Function parameter types, names, or order changed in exported/public functions
- API endpoint path changed
- Request or response schema changed (new required fields, removed fields, type changes)
- Event payload schema changed
- Database table schema changed (column added, removed, type changed, constraint changed)
- Configuration schema changed (new required config keys, changed defaults)
- Package version bumped with no corresponding changelog

**Risk weight:** HIGH-CRITICAL. Contract changes have blast radius beyond the current codebase. Any consumer — internal or external — that depends on the old contract will break.

**Examples:**
```diff
- async function getUser(id: string): Promise<User>
+ async function getUser(id: string, options?: GetUserOptions): Promise<UserResponse>
```
→ CONTRACT: Return type changed from `User` to `UserResponse`. All callers expecting `User` shape will break.

```diff
// migration file
+ ALTER TABLE users ADD COLUMN tier VARCHAR(20) NOT NULL;
```
→ CONTRACT: Database schema changed. Non-nullable column added — existing rows without a tier value will cause insert failures.

### COSMETIC

**Definition:** The change affects only formatting, comments, documentation, or naming — with no effect on program behavior, structure, or contracts.

**Detection signals:**
- Whitespace-only changes (indentation, trailing spaces, blank lines)
- Comment additions, modifications, or removals
- Documentation file changes (README, CHANGELOG, docs/)
- Variable renamed without changing behavior (when all references are also renamed in the same diff)
- Log message text changed (not log level, not log fields — only the human-readable string)
- Type annotation added to an already-typed variable with no change in inferred type

**Risk weight:** MINIMAL. Cosmetic changes should not affect production behavior.

**Detection caution:** A renamed variable that is serialized or used as a database column name is NOT cosmetic — it is a CONTRACT change. Cosmetic renames only apply when the name is internal and all references are updated within the diff.

---

## Procedure

### Step 1: Parse the Diff

For each file in the diff, extract:
- File path (from `---` and `+++` headers)
- Each hunk (identified by `@@ ... @@` markers)
- Added lines (prefixed with `+`)
- Removed lines (prefixed with `-`)
- Context lines (prefixed with space)

### Step 2: Classify Each Hunk

For each hunk, apply the classification taxonomy:

1. **Check for COSMETIC first.** If all changes in the hunk are whitespace, comments, or documentation, classify as COSMETIC.
2. **Check for CONTRACT.** If the hunk modifies an exported function signature, API schema, database schema, or any public interface, classify as CONTRACT.
3. **Check for BEHAVIORAL.** If the hunk changes conditional logic, return values, function arguments, error handling, or state mutations, classify as BEHAVIORAL.
4. **Default to STRUCTURAL.** If none of the above apply (code moved, imports changed, file renamed), classify as STRUCTURAL.

If a hunk contains multiple classification types, assign the **highest risk** classification: CONTRACT > BEHAVIORAL > STRUCTURAL > COSMETIC.

### Step 3: Classify Each File

Roll up hunk classifications to file level:
- A file's classification is the **highest risk** classification of any of its hunks.
- A file with 50 COSMETIC hunks and 1 BEHAVIORAL hunk is classified as BEHAVIORAL.

### Step 4: Classify the PR

Roll up file classifications to PR level:
- The PR classification is the **highest risk** classification of any of its files.
- Additionally, compute a breakdown: e.g., "3 files COSMETIC, 1 file BEHAVIORAL, 1 file CONTRACT"

### Step 5: Flag Hidden Behavioral Changes

Scan all STRUCTURAL and COSMETIC classified hunks a second time. Look for:
- Variables renamed that appear in serialization contexts
- Moved functions that were subtly modified during the move
- Comments that describe changed behavior (the comment says "now handles X" but the classification is COSMETIC because only the comment changed — the code change may be in a different hunk)

Flag any suspicious cases as: "STRUCTURAL (verify: possible hidden behavioral change)".

---

## Output Format

```yaml
pr_classification: BEHAVIORAL  # highest-risk classification across all files
classification_breakdown:
  BEHAVIORAL: 2   # number of files with this classification
  CONTRACT: 1
  STRUCTURAL: 0
  COSMETIC: 3

files:
  - path: src/auth/middleware/token_validator.ts
    classification: BEHAVIORAL
    confidence: CONFIRMED
    hunks:
      - lines: "L47-L53"
        classification: BEHAVIORAL
        description: "Token validation logic changed — added fallback to legacy token format"
    risk_factors:
      - "Auth middleware — shared dependency across all authenticated routes"
      - "Behavioral change to validation logic — could alter accept/reject behavior for tokens"

  - path: src/shared/utils/format.ts
    classification: COSMETIC
    confidence: CONFIRMED
    hunks:
      - lines: "L1-L200"
        classification: COSMETIC
        description: "Whitespace reformatting — no logic changes"
    risk_factors: []

  - path: migrations/024_add_tier.sql
    classification: CONTRACT
    confidence: CONFIRMED
    hunks:
      - lines: "L1-L5"
        classification: CONTRACT
        description: "Adds non-nullable column 'tier' to users table"
    risk_factors:
      - "Database schema change — all INSERT operations must now provide 'tier' value"
      - "Non-nullable constraint — existing rows require migration script"

hidden_behavioral_flags: []
  # List any hunks that were classified as STRUCTURAL or COSMETIC
  # but show signs of hidden behavioral changes

cosmetic_only: false  # true if ALL files are COSMETIC — triggers fast-path in workflow
```

---

## Edge Cases

### Diff contains only test files
Classify normally. Test file changes are typically BEHAVIORAL (test logic changed) or COSMETIC (test descriptions updated). A test-only diff does not automatically mean low risk — deleted or weakened test assertions are BEHAVIORAL changes that reduce coverage.

### Diff contains generated files
If a file appears to be auto-generated (e.g., `package-lock.json`, `*.generated.ts`, `*.min.js`), classify as STRUCTURAL and note: "Auto-generated file — changes reflect upstream modifications."

### Diff is very large (>1000 lines changed)
Process normally but add a note: "Large diff (N lines changed). Classification confidence may be reduced for subtle behavioral changes embedded in structural refactors. Manual review of STRUCTURAL classifications is recommended."

### Diff contains binary files
Skip binary files. Note: "Binary files were present in the diff but could not be analyzed: [list files]."
