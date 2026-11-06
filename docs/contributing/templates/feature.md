# Feature documentation template

Copy this section into the relevant page under `docs/features/` and fill in every heading. Delete a
heading only if it truly doesn't apply. Link to code and tests with relative paths so the docs test
can verify them.

---

## <Feature name>

**What it does.** One or two sentences in user terms.

**How to use it.** Where it lives in the UI (exact labels) and the route, if any.

**Behaviour and limits.**

| Rule | Limit | Enforced by |
| --- | --- | --- |
| … | … | Zod schema / trigger / RLS policy / bucket config |

**Code.** Components, hooks, actions, route handlers, lib modules.

**Data and permissions.** Tables, RPCs, Realtime topics, Storage buckets; who can read and write,
and where that is enforced.

**Data flow.** A short sequence (or a Mermaid diagram) for anything asynchronous.

**Errors and recovery.** What the user sees for each failure, and how to recover.

**Status.** Shipped / Needs setup (what setup) / Partial (what's missing). Update
[`docs/features/README.md`](../../features/README.md).

**Tests.** Unit, component, PGlite and E2E files that cover it.

**Known limitations.** Anything deliberately left out, platform limits, unverified areas. Add lasting
ones to [`docs/known-limitations.md`](../../known-limitations.md).
