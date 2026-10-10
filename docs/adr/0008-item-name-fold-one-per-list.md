# One live item per folded name per list, enforced by the database

Decided 2026-10-10 in #106 (slices 1 to 4a). Vocabulary is in `docs/context/lists.md` (**Item**) and `docs/context/locations.md` (**Item location**); the migrations are `20261010000000_list_items_fold.sql` (list side) and `20261011000000_location_items_fold.sql` (location side, below).

Items that differed only by case, inner spacing or accents ("milk", "Milk", "jalapeno", "Jalapeño") sat side by side and fragmented Quantity, ticks and Item location matching. Every layer now uses one definition of "same item", `fold_item_name` (Migration A, `20261008000000`; mirrored in the client and kept in step by `scripts/check-item-name-parity.mjs`), and the database enforces it:

- A unique partial index, `list_items_live_name_key`, on `(list_id, fold_item_name(name))` where `deleted_at is null`. The name is load-bearing: the client recognises the 23505 by it.
- A `BEFORE INSERT OR UPDATE OF name` trigger, `list_items_tidy_name`, stores `capitalise_first(name)` and refuses a name whose fold is empty (only combining marks, say). The stored spelling is therefore the same whichever path wrote it.
- `add_list_item` matches and takes its advisory lock on the fold; `finish_shopping` writes the fold of each ticked name into `location_checkoffs`, which `item_names_are_normalized` requires.

## One-off merge of existing duplicates

- The oldest row by `(created_at, id)` survives, keeping its id, position and spelling. Losers are soft-deleted at the run time; nothing references `list_items.id`, so nothing is orphaned.
- Quantity becomes `least(99, sum)`. Ticks follow rule (a) (D9): ticked if any copy was ticked, with the earliest tick time; the survivor keeps its own `recorded_at`. Edge: if the oldest copy was unticked and a newer one was ticked and recorded, the survivor shows as an unrecorded tick. Accepted (production had no mixed-tick groups).
- Items on removed lists are merged too (D7), so the index never has to exempt them.
- `lists.last_activity_at` is deliberately untouched: the two activity triggers are paused for the run and a post-check proves every list kept its value.
- Backups live in a closed schema `migration_106`, kept 30 days after Migration C2 (D8). Production data was small (131 live items, one duplicate group).

## Split

The location side is not in the list-side migration. The work is Migration B (list side, `20261010000000`), C1 (tags, votes and check-offs fold, `20261011000000`, below) and C2 (labels, the vote function's apply rule and #155), so each production apply is small enough to verify by hand (D4).

## Location side (Migration C1, slice 4a)

Item locations are matched by the same fold, so the location tables store it:

- `location_items.name` and `location_item_votes.item_name` hold `fold_item_name(...)`, enforced by CHECKs (`name = fold_item_name(name)`) in place of the old `lower(btrim)` ones, and by a `BEFORE INSERT OR UPDATE OF name` trigger, `location_items_tidy`, that stores the fold, refuses an empty fold (`invalid_name`) and capitalises a new tag's section. Because a BEFORE trigger runs before the CHECKs, an old client that sends `lower(btrim(name))` is rescued rather than refused, and a twin of an existing tag still hits `unique (location_id, name)` (23505, which the client treats as success).
- `item_names_are_normalized` now requires each check-off element to equal its fold, and the existing check-off arrays were re-folded element by element (order kept; no rows to change are expected in production). `finish_shopping` already wrote folds.
- `vote_location_item_correction` folds the item name it is given (the one change to its body), so a cached client that sends a raw name still finds its tag.
- Tags that share a fold key within a store are merged: the oldest by `(created_at, id)` survives (D5), and correction votes cast on a losing tag are deleted with it (D13). Unlike the list side, the losing tags are hard-deleted (the table has no `deleted_at`, and adding one for a one-off merge would be schema nothing reads); the backup in `migration_106` and the merge log are the audit trail, and the revert script re-inserts them by id. Production is expected to have no such group (the slice 1 pre-flight found none among 47 tags); the slice 4a PRE-1 confirms it before the run.
- The three `lower(btrim)` constraints were auto-named, so the migration finds them by definition in `pg_constraint` (exactly one of each or it aborts), logs their names and definitions, and re-adds the foreign key under its old name; the revert rebuilds them from that log.
- Edge until C2: a case-only correction still needs a second user; Item catalog names lose their accents (D11, fixed in #148 with a proper display name).

## Rejected

- **Client-only dedupe:** two phones or an old cached client can still write duplicates; only the index guarantees one.
- **Case-insensitive index on `lower(name)`:** misses accents and inner spaces, and would not match the client fold.
- **Rewriting old shop history snapshots:** they are records of what was shopped; copy folds at read time instead.
- **A new column holding the folded key:** one more thing to keep in sync; an expression index on the immutable function needs no new data.
- **Hard-deleting merge losers (list side):** loses the audit trail; soft-delete plus backup is reversible. The location side has no `deleted_at` and hard-deletes with a backup instead (above).

## Consequences

- **Old cached clients (D10):** a pre-0.0.52 client that renames onto an existing name, or copies a list into one already holding the item, sees the raw Postgres unique-violation text once instead of the friendly note. Accepted. The current client refuses these before the database does.
- Residual race: a direct rename landing between `add_list_item`'s select and insert can still raise 23505; the client shows "That item is already on this list."
- `capitalise_first` uses ICU `upper()`, which can lengthen a name (sharp s becomes SS). A 120-character name starting with such a letter could fail the 1..120 check as a raw 23514. The pre-flight asserts no existing row is affected.
- The index is only as stable as the server's Unicode tables: after a Postgres major upgrade, reindex it (`docs/environment.md`).
