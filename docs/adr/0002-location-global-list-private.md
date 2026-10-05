# Locations are global, lists are household-private, and the two never share an access path

> Amended by [ADR 0007](./0007-seeded-store-catalog.md): locations are no longer user-created. `locations_insert_own` was dropped in `20261005000001`; `created_by` is kept as provenance (NULL for seeded rows, still withheld from every SELECT). The global, anonymous and list-separation rules here stand.

A location, its section tags, its corrections and its check-off records are visible to everyone and attributable to no one; lists, items and shop history belong to a household or a person. `location_items` has no creator column at all (stronger than `locations.created_by`, which exists but is withheld from every SELECT grant), and `location_item_votes.voter_id` is stored but never readable.

For the same reason, finishing a shop writes two separate tables: anonymous `location_checkoffs` (route learning) and household-visible `shop_sessions` (history, copy). One insert cannot serve both without mixing the two access rules; the `finish_shopping()` RPC does both inserts in a single transaction.
