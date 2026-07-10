---
name: verify-saas
description: Run the SaaS verification sequence (type-check, vitest, oxlint) and judge results against the known test baseline. Use when the user says "verify", "run the checks", "does it still pass", or after finishing any code change in this repo.
---

# Verify the SaaS repo

Run all three, in this order, from the repo root `/Users/zeek/Projects/voice-engine/voiceagent-saas`:

## 1. Type-check (whole monorepo)

```bash
pnpm type-check
```

Turbo fans out across all 18 packages (apps/saas runs `next typegen && tsc --noEmit`). Any error fails verification.

## 2. Tests (apps/saas vitest)

```bash
cd apps/saas && pnpm test
```

**Known baseline — these 2 failures are pre-existing and are NOT regressions:**

- `modules/voiceagents/components/flow/compile.test.ts` → "rejects a branch node as the entry"
- `modules/voiceagents/components/flow/compile.test.ts` → "flags an empty say and rejects a statement as the entry"

Expected: exactly those 2 failing, 36 passing. Judge:

- Same 2 failures, ≥36 passing → **PASS**
- Any other failing test → **FAIL** (regression)
- The 2 baseline tests now pass → still PASS; tell the user the baseline may be fixed and this file + CLAUDE.md should be updated.

## 3. Lint

```bash
pnpm lint
```

oxlint over the workspace. Errors fail verification; report new warnings.

## Report

Give a single verdict (PASS/FAIL) then per-step results. On FAIL, quote the exact error/test name and the likely file. Do not auto-fix unless asked — formatting issues are handled by `pnpm format` (oxfmt) and the PostToolUse hook.
