# CHANGE-LOG.md

> One line per entry, appended by the orchestrator when a request falls outside
> `03-SPEC.md` (scope-check triage, `CLAUDE.md`). Triage these yourself. Nothing here gets built
> until you move it into the spec. Only `pending` rows are kept; once a row is done or filed as an
> issue, delete it (issues and git history hold the record).

| Date | Description | Affected area | Status |
|---|---|---|---|
| 2026-08-10 | Captcha on anonymous sign-in. Supabase flags unprotected anonymous auth as an abuse/MAU-cost risk. Not in spec; not built. | Auth (Slice 1) | pending |
| 2026-10-06 | Members add a first name or nickname so other members see names instead of just a count. Split out of #109. Needs a new column and an RLS read policy, so it stops at the plan for Ant. Open questions: required or optional, what a member shows as before setting one, who can see whose name. | Household (schema, RLS, Settings) | pending (`out-of-spec`) |
| 2026-10-06 | Rename a household from Settings. Split out of #109. Today the name is read-only after creation. Needs an RLS write; with equal-rank members, who may rename is an open question. | Household (RLS, Settings) | pending (`out-of-spec`) |
| 2026-10-06 | Category and spending graphs on Home (for example spend on produce or dairy). Split out of #110. Cartel has no prices and no item categories (Item locations are free-text per-Store tags), so this needs prices and/or a category field: a schema change, so it stops at the plan for Ant. | Home graphs, data model | pending (`out-of-spec`) |
