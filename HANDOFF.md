# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-06, end of session 15)

- **#111 (item quantity) is half shipped.** Grill done, docs merged (PR #134), plan approved by Ant, migration `20261006000000_item_quantity.sql` applied by hand (Ant says the SQL tests `rls_item_quantity.sql` and `rls_finish_shopping.sql` passed). **Slice A shipped as 0.0.44 (PR #135, merged):** the stepper on list detail and Shopping Mode ("+" at 1, a "×N" chip from 2 up that opens an inline "− N + Done" editor; chosen over an inline "− 2 +" because that left about 38pt for the name on an iPhone). **Slice B (0.0.45) is not started.** The PR #135 iPhone checklist was never run: Ant said to assume it passed. Ant has not seen the chip layout; long names and the Shopping Mode section pill (capped at 30% when a stepper is present) are the things to eyeball. Last active `03-SPEC.md` section: none.
- **Slice B scope (next session starts here).** Branch off `main`, version 0.0.45. Brief the Code Writer with this, then a separate Code Reviewer, live checks, PR with an iPhone checklist.
  - `lists.ts`: replace `addItem` with `addOrBumpItem(client, listId, name, lastPosition)` calling RPC `add_list_item` (returns item_id, name, quantity, bumped, capped; position from `keyBetween`). Never retry it. `addItems` takes `{ name, quantity }[]` and inserts the clamped quantity. Add `itemLabel(name, quantity)` ("Milk ×2" above 1, else "Milk", U+00D7).
  - `shopSessions.ts`: select `item_quantities` and `checked_item_quantities`; null or wrong-length arrays read as all 1s; `sessionItemBreakdown` returns `{ name, quantity, bought }`; `notBoughtNames` becomes `notBoughtItems()`.
  - `HistoryScreen.tsx`: bought and Not bought lines use `itemLabel`; the copy passes names zipped with quantities.
  - `ListDetailScreen.tsx` and `ShoppingScreen.tsx`: composer uses `addOrBumpItem`; on a bump show a note under the composer ("Milk is now ×2", or "Milk is already ×99" when capped), kept until the next add or tick, no timer; in Shopping Mode it sits directly under the composer at the top. `submitCopy` passes `{ name, quantity }`. Keep `blurOnSubmit={false}` and `keepFocus`.
  - Map `invalid_position` and `list_not_found` in `household.ts` if missing. Add a `docs/lessons.md` line: quantity writes are deltas, never retry `adjust_item_quantity` or `add_list_item`. Glossaries (`docs/context/lists.md`, `shopping.md`) already describe Slice B behaviour; check they match what ships.
  - iPhone checklist for B: bump on duplicate name, bump unticks a ticked item, same in Shopping Mode, new names still add at 1, History shows "Milk ×2" and a Not bought "Eggs ×3", copy from History and from list detail keep quantities, an old pre-update History entry shows plain names and copies at 1.
- **#106 relationship:** #111 lands before #106 (a note is on #106). #106 still owns location-tag lookup normalisation, merging existing duplicate rows (open: sum quantities clamped to 99? which tick state and position survive?), rename onto an existing name, and copying old History snapshots with duplicate names. If #106 changes name normalisation it must redefine `add_list_item` (it uses `lower(btrim())`).
- Open nits from the Slice A review, deliberately skipped: a narrow flicker window if a refetch lands after the last write resolves; a hung request keeps Finish disabled until reload; `writeShown` missing from an effect's deps (lint only). Each tap bumps `lists.last_activity_at`, so lists reload per tap (Ant mentioned lag elsewhere; watch it).
- **#107 shipped (0.0.43, PR #132).** Stores are read-only to clients (ADR 0007). Ant has not run scenario 1 (real GPS nearby) or a 0.0.43 iPhone smoke check. The S4 tests (`rls_locations*.sql`, fixtures, `store_catalog.sql`) were reviewed statically; Ant reports the quantity tests passed but has not confirmed the S4 ones. Run them (all roll back) before relying on them.
- Open nits: Store missing reports are public GitHub issues (accepted); no rate limit on that path; comment at `supabase/tests/rls_location_items.sql:23` still names the dropped `locations_insert_own`; `LocationsScreen.tsx` header comments may still describe the old create/edit flow; the badge shape is now a circle (docs only mention it in the `StoreBadge.tsx` comment).
- `main` is at 0.0.44 (`mobile/app.json`). Production holds real user data.
- #117 shipped (0.0.41); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run, the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project (all anonymous, inert): list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) on Woolworths Northlands with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user), and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at ×5, personal, no store). Cleanup is by id only, never a blanket wipe. Closed test issue #130.
- Tooling note: a direct production read through the Supabase MCP `execute_sql` was refused by the permission classifier this session; verify through the app or ask Ant to run SQL.

## Blocking order

Can start now (no blockers):

1. **#111 Slice B** (above). Finish this before #106.
2. Grill #109, #110, #114, #112. #109 and #110 unblock most of the rest.
3. #123 (low priority, whenever).

Then:

4. #103, blocked by #110.
5. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
6. #106, blocked by #111 Slice B. Production merge, stops at the plan for Ant.
7. #112, no longer blocked (#107 S4 shipped); needs grilling first.

Collisions: #103 touches `ListDetailScreen`; whichever lands second rebases onto the drag-handle row, the quantity control and the new wording.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
