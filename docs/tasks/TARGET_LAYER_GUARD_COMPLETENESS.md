# 🟡 Target: Layer Guard Completeness

**Found**: 2026-08-27, by accident, while verifying a newly added rule in
`tests/unit/layerBoundaries.test.ts`.
**Status**: ✅ **all three closed** the same day — see §6. Kept as the record of what was wrong and
how each fix was verified, because the failure mode (a guard that passes while enforcing nothing) is
the kind that returns quietly.

---

## 0. Why this is worth a document

`tests/unit/layerBoundaries.test.ts` is the enforcement arm of
[`docs/architecture/LAYERS.md`](../architecture/LAYERS.md). Six rules now depend on one function —
`buildGraph()` — being an accurate model of the import graph. It is not, in three ways.

A guard that under-reports does not fail. It passes, and the property it was written to protect
quietly stops holding. That is strictly worse than having no guard, because the green check is read
as evidence.

The file already understands this danger about *itself*: its first test asserts the graph found
more than 50 modules, precisely so a broken walker cannot make everything pass vacuously. The gaps
below are the same class of problem one level down.

---

## 1. Bare side-effect imports are invisible — **confirmed**

`buildGraph()` collects specifiers with:

```js
const specifierPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
```

That matches `from "x"` and `import("x")`. It does **not** match:

```ts
import "@/lib/client/petStore";     // no `from`, no parens
```

### How it was found

While confirming the new `src/lib/client/` rule was non-vacuous, a violation was injected into
`src/lib/matchEngine.ts` (a non-client module) as a bare `import "@/lib/client/petStore";`. **All
six rules passed.** Re-injecting the same violation as `import { usePetStore } from "@/lib/client/petStore";`
failed correctly, naming the exact file pair. The rule was fine; the graph was blind.

### Current exposure

One bare first-party import exists in `src/`:

```
src/app/layout.tsx:4:  import "./globals.css";
```

It resolves to a `.css` file, which `resolveSpecifier` returns `null` for anyway — so the form is
in active use in this codebase, and the day someone writes `import "@/lib/client/settingsStore";`
for its registration side effect, every rule here will wave it through.

### Fix

Extend the pattern to accept the bare form:

```js
const specifierPattern =
  /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
```

`import\s+` must come **last** in the alternation — regex alternation is ordered, and putting it
first would let it match the `import ` in `import {x} from "y"` and capture nothing useful.

Add a fixture asserting the bare form is captured, or this regression returns unnoticed.

---

## 2. The directive window is 400 bytes — latent

```js
const head = source.slice(0, 400);
isClient: /^\s*["']use client["']/m.test(head),
```

A module whose `"use client"` sits past byte 400 — behind a long licence header or a file-level
JSDoc block — is classified as a **server** module. It would then be invisible to the "no Server
Action reaches client code" rule *and* wrongly caught by the "only client modules may import
`src/lib/client/`" rule.

**Verified**: every `"use client"` in `src/` today is within 400 bytes, so nothing is misclassified
now. The risk is that this codebase writes substantial file-level doc comments — several modules
open with 10+ line JSDoc blocks — and the directive must legally precede them anyway, so the
failure mode is a *wrongly formatted* file being silently reclassified rather than flagged.

### Fix

Cheaper and more correct than widening the window: a directive is only valid before any statement,
so scan the leading run of comments and blank lines rather than a byte count. Failing that, assert
that no file contains `"use client"` outside `head` — a two-line check that converts a silent
misclassification into a loud one.

---

## 3. Comments are parsed as imports — latent

The regex runs over the whole source with no comment stripping, so this inside a JSDoc block:

```ts
/**
 * A static `import { resetServerStore } from "@/lib/server/fallbackState"` would
 * instantiate the repositories before the test file's mock registers.
 */
```

registers a **real edge** from that module to `fallbackState` (removed on 2026-10-20, when each
store began registering its own reset with `src/lib/stateResets.ts`). This is the inverse failure of §1 —
a false positive, producing a violation report for an import that does not exist.

**Verified**: no such comment exists in `src/` today. One does exist in
`tests/setup/nextMocks.ts`, which is harmless only because `buildGraph()` walks `src/` alone — and
that near-miss is the point. The comment is *load-bearing documentation* explaining why the import
is dynamic; the natural place for such a comment is beside the code it describes.

### Fix

Strip block and line comments before matching, or accept the false-positive risk explicitly with a
comment saying so. Either is fine; silence is not.

---

## 4. Suggested order

| # | Item | Effort | Why this order |
|---|---|---|---|
| 1 | §1 regex + fixture | ~15 min | Confirmed hole, trivially closed, protects all six rules |
| 2 | §3 comment stripping | ~15 min | Prevents a confusing false positive as doc comments grow |
| 3 | §2 directive scan | ~30 min | Latent, and the loud-failure check is most of the value |

All three are edits to one test file with no production impact. Gate: the suite still reports
**39 files / 518 tests** and each of the six rules still fails when its violation is injected —
re-run the injection checks, since a regex change is exactly what could make a rule vacuous again.

---

## 5. Related: the restructure is not finished

Tracked in [`PLAN_LIB_RESTRUCTURE.md`](PLAN_LIB_RESTRUCTURE.md) §9–§11. One item remains, blocked on
another session's uncommitted files rather than on design:

- `petStatusPresentation.ts` and `applicationStatusPresentation.ts` → `src/lib/presentation/`
  (blocked: `PetStatusIcon.tsx` and `ApplicationStatusIcon.tsx` carry another session's work)

`prisma.ts`, `userStore.ts` and `donationLedger.ts` have **landed** in `src/lib/server/`. Moving
them meant relocating four `vi.mock("@/lib/prisma")` specifiers in the same commit — a mock whose
specifier stops resolving fails silently, the same class of problem as §1.

---

## 6. Resolution — 2026-08-27

All three closed in `tests/unit/layerBoundaries.test.ts`.

| § | Fix | Verified by |
|---|---|---|
| 1 | `import\s+` added last in the alternation | Re-injected the bare `import "@/lib/client/petStore";` into a non-client module — now **fails** with the exact file pair, where before it passed |
| 3 | `stripComments()` blanks block and line comments before the specifier scan | Put the same import inside a JSDoc block — correctly **not** flagged |
| 2 | `hasDirective()` replaces the 400-byte window: skip leading whitespace and test the first statement | The graph's own census test (`isServer >= 6`, `isClient >= 10`) still passes, so no module was reclassified |

Comments are blanked rather than deleted, so the directive check still sees the file's true leading
run — deleting them would let a comment above `"use client"` close the gap between the directive and
the start of the file and change what counts as first.

The Prisma rule was also converted from a filename allow-list to a **path rule** in the same pass:
any module under `src/lib/server/` may import the client, plus `src/lib/domain/auditLog.ts`, which
every repository calls and so cannot live inside the layer it instruments without a cycle. A list
had to be edited whenever a repository was added, and editing it is indistinguishable from widening
it deliberately.

### What is left

Only `petStatusPresentation.ts` and `applicationStatusPresentation.ts` → `src/lib/presentation/`,
still blocked on `PetStatusIcon.tsx` and `ApplicationStatusIcon.tsx` carrying another session's
uncommitted work. `prisma.ts`, `userStore.ts` and `donationLedger.ts` have landed in
`src/lib/server/`.
