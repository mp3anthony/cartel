# One live item per folded name per list, enforced by the database

Decided 2026-10-10 in #106 (slices 1 to 3). Vocabulary is in `docs/context/lists.md` (**Item**); the migration is `20261010000000_list_items_fold.sql`.

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

The location side is not in this migration. The work is Migration B (list side, this one), C1 (location_items and votes fold) and C2 (check-offs and the retire step), so each production apply is small enough to verify by hand (D4).

## Rejected

- **Client-only dedupe:** two phones or an old cached client can still write duplicates; only the index guarantees one.
- **Case-insensitive index on `lower(name)`:** misses accents and inner spaces, and would not match the client fold.
- **Rewriting old shop history snapshots:** they are records of what was shopped; copy folds at read time instead.
- **A new column holding the folded key:** one more thing to keep in sync; an expression index on the immutable function needs no new data.
- **Hard-deleting merge losers:** loses the audit trail; soft-delete plus backup is reversible.

## Consequences

- **Old cached clients (D10):** a pre-0.0.52 client that renames onto an existing name, or copies a list into one already holding the item, sees the raw Postgres unique-violation text once instead of the friendly note. Accepted. The current client refuses these before the database does.
- Residual race: a direct rename landing between `add_list_item`'s select and insert can still raise 23505; the client shows "That item is already on this list."
- `capitalise_first` uses ICU `upper()`, which can lengthen a name (sharp s becomes SS). A 120-character name starting with such a letter could fail the 1..120 check as a raw 23514. The pre-flight asserts no existing row is affected.
- The index is only as stable as the server's Unicode tables: after a Postgres major upgrade, reindex it (`docs/environment.md`).
