# CHANGE-LOG.md

> One line per entry, appended by the orchestrator when a request falls outside
> `SPEC.md` (Protocol Step 1). Triage these yourself — nothing here gets built
> until you move it into the spec.

| Date | Description | Affected area | Status |
|---|---|---|---|
| 2026-08-10 | Captcha on anonymous sign-in — Supabase flags unprotected anonymous auth as an abuse/MAU-cost risk. Not in spec; not built. | Auth (Slice 1) | pending |
| 2026-08-10 | Orphaned households — removing every member leaves the `households` row, invisible to all via RLS and unreachable forever. No v1 flow deletes users, so not a Slice 1 defect. | Data model | pending |
| 2026-08-10 | Item quantities ("2× milk") — `list_items` has no quantity field and the CRD never asks for one, but real lists carry them. Raised at Slice 2 Step 2 and deliberately left out of that slice. | Data model (Slice 2) | pending |
