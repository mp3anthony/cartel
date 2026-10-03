# Shopping

The act of shopping: walking a store with a list, finishing the shop, and looking back at it.

## Language

### In the store

**Shopping Mode**:
The screen opened by "Start shopping" on a list detail, where items are checked off in route order, with larger touch targets and type than the rest of the app. The add-item composer sits at the top, where attention is while shopping.
_Avoid_: Trip mode, store mode

**Route order**:
The order items are shown in Shopping Mode, computed when the screen is read and never stored. Observed check-off history at that location comes first; an untagged-in-history item falls back to its section tag's place; anything else keeps entry order.
_Avoid_: Aisle order, smart sort

**Glanceability**:
The design test for Shopping Mode: one-handed, one look, large rows, nothing that needs thinking. Quick successive check-offs must never block each other.
_Avoid_: Simplicity, minimal mode

**Shop in progress**:
A list with at least one item checked that has not been finished yet. What the dashboard's "Continue shopping" shows; a list row reads "3 of 12" while one is under way.
_Avoid_: Active list, open list (every list is active)

### Finishing

**Check-off record**:
The anonymous, global record written on Finish shopping: the ordered, normalised names of the checked items plus a completion time. It carries no household, list or user. It is what teaches route order.
_Avoid_: Shopping log, receipt

**Finish shopping**:
The confirm-gated button that ends a shop. It records the check-off record and a Shop history entry in one atomic step. The confirm offers two endings (#89). **Done shopping** then resets the list for reuse: every item is unchecked and kept, nothing is removed. **Continue at another store** keeps the checks so bought items stay ticked; the store picker opens straight away (skippable, keeping the current store) and the user carries on, and the next finish records only the items checked since this one. Either way each store gets its own Shop history entry and check-off record. Lists are never archived. A second finish is refused ("This shop has already been recorded."). Afterwards an in-flow "Shop recorded" banner appears.
_Avoid_: Complete, checkout, done

### Looking back

**Shop history**:
The household's record of finished shops, on the History screen (menu item "History"). Shows the 5 most recent shops (#89; the code showed 10 before). Each entry is titled by its store and date, with the list name as secondary text (the list name is the title when no store was attached). It expands to the items bought, in check-off order, followed by a collapsed "Not bought" group, expandable, holding the items left unchecked in that shop. "Start new list from this" and "Delete" sit on each entry; "Clear all history" removes every entry. Empty state: "No shops recorded yet".
_Avoid_: Receipts, past lists, trips

**Dashboard**:
The home screen (menu item "Home"). Sections: Nearby stores, Continue shopping, Where you shop (store-frequency donut), Pending corrections, Recent activity. "Continue shopping" shows only lists with a shop in progress (at least one item checked, not yet finished) and is hidden when there are none (#89). Nearby stores are only checked when the user taps "Check for nearby stores".
_Avoid_: Overview, feed
