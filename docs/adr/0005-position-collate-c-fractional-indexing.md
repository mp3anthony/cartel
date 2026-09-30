# Item order is a base-62 fractional key under collate "C"

`list_items.position` is a text fractional-indexing key, declared `collate "C"` and sorted `order by position, id`. The database default (ICU) collation sorts `a1` before `A1`, while the keys are only correct in byte order, so dropping the collation silently reorders lists.

Keys are made in one place, `keyBetween()` in `mobile/src/lib/lists.ts`, and its `digits` argument must never be passed: the default alphabet is the format every stored key already uses, and changing it is a permanent, irreversible break. Check-off never writes `position`; shopping route order is computed at read time.
