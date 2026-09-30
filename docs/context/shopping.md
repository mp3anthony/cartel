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

### Finishing

**Check-off record**:
The anonymous, global record written on Finish shopping: the ordered, normalised names of the checked items plus a completion time. It carries no household, list or user. It is what teaches route order.
_Avoid_: Shopping log, receipt

**Finish shopping**:
The confirm-gated button that ends a shop. It records the check-off record and a Shop history entry in one atomic step. If everything was checked, the list is archived; if not, only the checked items are removed and the list stays active. A second finish is refused ("This shop has already been recorded."). Afterwards an in-flow "Shop recorded" banner appears.
_Avoid_: Complete, checkout, done

### Looking back

**Shop history**:
The household's record of finished shops, on the History screen (menu item "History"). Shows the 10 most recent (the intended cap is 5, see #89), each with every item of that shop, unbought items marked "(not in this shop)", plus "Start new list from this" and "Delete"; "Clear all history" removes every entry. Empty state: "No shops recorded yet".
_Avoid_: Receipts, past lists, trips

**Dashboard**:
The home screen (menu item "Home"). Sections: Nearby stores, Continue shopping, Where you shop (store-frequency donut), Pending corrections, Recent activity. "Continue shopping" excludes archived lists; nearby stores are only checked when the user taps "Check for nearby stores".
_Avoid_: Overview, feed
