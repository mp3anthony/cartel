# Shopping

The act of shopping: walking a store with a list, finishing the shop, and looking back at it.

## Language

### In the store

**Shopping Mode**:
The screen opened by "Start shopping" on a list detail, where items are checked off in route order, with larger touch targets and type than the rest of the app. The add-item composer sits at the top, where attention is while shopping.
_Avoid_: Trip mode, store mode

**Route order**:
The order items are shown in Shopping Mode, computed when the screen is read and never stored. Observed check-off history at that store comes first; an untagged-in-history item falls back to its **Item location**; anything else keeps entry order.
_Avoid_: Aisle order, smart sort

**Glanceability**:
The design test for Shopping Mode: one-handed, one look, large rows, nothing that needs thinking. Quick successive check-offs must never block each other.
_Avoid_: Simplicity, minimal mode

**Shop in progress**:
A list with at least one item checked that has not been finished yet. What the dashboard's "Continue shopping" shows; a list row reads "3 of 12" while one is under way.
_Avoid_: Active list, open list (every list is active)

### Finishing

**Check-off record**:
The anonymous, global record written on Finish shopping: the ordered, normalised names of the checked items plus a completion time. It carries no household, list or user. It stays names-only: Quantity says nothing about store layout, so it is not recorded here. It is what teaches route order.
_Avoid_: Shopping log, receipt

**Finish shopping**:
The confirm-gated button that ends a shop. It records the check-off record and a Shop history entry in one atomic step. The confirm offers two endings. **Done shopping** then resets the list for reuse: every item is unchecked and kept with its Quantity, nothing is removed. **Continue at another store** keeps the checks so bought items stay ticked; the store picker opens straight away (skippable, keeping the current store) and the user carries on, and the next finish records only the items checked since this one. Either way each store gets its own Shop history entry and check-off record. Lists are never archived. Finish is disabled when nothing is checked; when every check is already recorded it offers only **Reset list**. Afterwards an in-flow "Shop recorded" banner appears.
_Avoid_: Complete, checkout ("Done shopping" names only one of its two endings)

**Reset list**:
Offered in place of the two endings only when everything checked was already recorded by an earlier Continue. It unticks every item (Quantity is kept) and records nothing: no Shop history entry, no check-off record. It exists because recording again would double-count the same purchases. When someone else already reset or finished, it reports "Nothing is ticked anymore".
_Avoid_: Finish, clear

### Looking back

**Shop history**:
The household's record of finished shops, on the History screen (menu item "History"). Shows the 5 most recent shops. The cap limits the display only: older shops stay stored and still count toward "Where you shop". Each entry is titled by its store and date, with the list name as secondary text (the list name is the title when no store was attached). It expands to the items bought, in check-off order, each with its Quantity when above 1 (for example "Milk ×2"), followed by a collapsed "Not bought" group, expandable, holding the items left unchecked in that shop, which show their Quantity the same way. "Start new list from this" and "Delete" sit inside an expanded entry, not on the collapsed card; "Clear all history" removes every entry. Empty state: "No shops recorded yet".
_Avoid_: Receipts, past lists, trips

**Dashboard**:
The home screen (menu item "Home"). Sections: Nearby stores, Continue shopping, Where you shop (store-frequency donut), Pending corrections, Recent activity. "Continue shopping" shows only lists with a shop in progress (at least one item checked, not yet finished) and is hidden when there are none. Nearby stores are only checked when the user taps "Check for nearby stores".
Decided in #110, not built yet (the list above stays true until the build lands). Home stays a dashboard; rejected: retiring it so Lists is the front door. Top to bottom, each section hidden when empty:
- **Hero**: when a shop is in progress, a card per shop with the list name, Store badge, a progress ring (ticked out of total) and a small Resume button; several shops sit in a horizontally swipeable row. With none, the hero becomes "Start a shop" with a small New list button and a small Nearby stores chip (still checked only on tap). Home never has an empty hero. Rejected: an always-present stats hero (gives no action); a stats hero plus a Resume strip.
- **Stores row**: circular Store badges in chain colours, labelled "Stores". A tap starts or continues a shop there as the donut tap does today; also opening the Store's own page is left to the plan.
- **Graphs**: two-up tiles, "Where you shop" (donut) and "How often you shop" (bars, shops over time), tap to expand.
- **Recent activity**: a quiet, low-density list with "See all history".
- **Pending corrections is removed from Home.** It belongs in the Store's Item catalog, where corrections already show as "Proposed: X"; the example seen in real data was a case-only rename that normalisation should make unnecessary.
- **Limits on graphs:** Cartel stores no prices and has no item categories (Item locations are free-text, per-Store tags), so spending or category graphs are not possible yet and are not in v1 (see `CHANGE-LOG.md`). v1 uses existing data only. Later candidates from existing data: most-bought items, items per shop.
_Avoid_: Overview, feed
