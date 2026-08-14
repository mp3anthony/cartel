# CHANGE-LOG.md

> One line per entry, appended by the orchestrator when a request falls outside
> `SPEC.md` (Protocol Step 1). Triage these yourself — nothing here gets built
> until you move it into the spec.

| Date | Description | Affected area | Status |
|---|---|---|---|
| 2026-08-10 | Captcha on anonymous sign-in — Supabase flags unprotected anonymous auth as an abuse/MAU-cost risk. Not in spec; not built. | Auth (Slice 1) | pending |
| 2026-08-10 | Orphaned households — removing every member leaves the `households` row, invisible to all via RLS and unreachable forever. No v1 flow deletes users, so not a Slice 1 defect. | Data model | pending |
| 2026-08-10 | Item quantities ("2× milk") — `list_items` has no quantity field and the CRD never asks for one, but real lists carry them. Raised at Slice 2 Step 2 and deliberately left out of that slice. | Data model (Slice 2) | pending |
| 2026-08-11 | On-screen version number at the bottom of the app, so a live build can be told apart from a preview at a glance. Not in `03-SPEC.md`; user triaged directly in chat rather than via a filed issue. Built as `mobile/src/lib/buildInfo.ts` + a `ListsScreen`-only footer, [PR #18](https://github.com/mp3anthony/cartel/pull/18), merged to `main`. | UI (`ListsScreen` only) | done |
| 2026-08-14 | App icon (light/dark cart-and-C mark, full asset set). Not in `03-SPEC.md`; scoped interactively in chat plus a design artifact ([The Cartel File](https://claude.ai/code/artifact/3e49c565-69b7-433c-be28-9dcc4edf821b)). | Branding (`mobile/assets`) | issue filed ([#25](https://github.com/mp3anthony/cartel/issues/25)) |
| 2026-08-14 | Global hamburger navigation menu, replacing `ListsScreen`'s 3-button header row on every screen. Not in `03-SPEC.md`. | Navigation | issue filed ([#24](https://github.com/mp3anthony/cartel/issues/24)) |
| 2026-08-14 | Dashboard home screen — `Lists` becomes its own standalone page; a new `Dashboard` screen takes over as home, with a store-frequency chart, continue-shopping, household snapshot, and a recent-activity card. Not in `03-SPEC.md`. | Navigation / UI | issue filed ([#22](https://github.com/mp3anthony/cartel/issues/22)) |
| 2026-08-14 | Dashboard stretch widgets — nearby-store nudge, pending-corrections nudge. Split from the dashboard core as a fast-follow; both need real UX judgment the core issue doesn't. | UI | issue filed ([#23](https://github.com/mp3anthony/cartel/issues/23)) |
| 2026-08-14 | In-app Light/Dark/System theme toggle — real UI theming (not the app icon's OS-driven light/dark pair). Needs a new dark palette design pass; deliberately scoped separate from the dashboard and menu work above. | Theming (`mobile/src/theme`) | issue filed ([#26](https://github.com/mp3anthony/cartel/issues/26)) |
