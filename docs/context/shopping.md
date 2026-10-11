# Shopping

The act of shopping: walking a store with a list, finishing the shop, and looking back at it.

## Language

### In the store

**Shopping Mode**:
The screen opened by "Start shopping" on a list detail, where items are checked off in route order (_decided in #112, not built:_ Layout order), with larger touch targets and type than the rest of the app. The add-item composer sits at the top, where attention is while shopping.
_Avoid_: Trip mode, store mode

**Route order**:
The order items are shown in Shopping Mode, computed when the screen is read and never stored. Observed check-off history at that store comes first; an untagged-in-history item falls back to its **Item location**; anything else keeps entry order. _Decided in #112, not built:_ replaced by **Layout order**; the learned history sort is removed from Shopping Mode (the read-time sort in `computeRouteOrder` goes). Finish shopping still writes the Check-off record unchanged, so history keeps accumulating. The learned per-user walking order is parked as #151 (grill only, depends on #112).
_Avoid_: Aisle order, smart sort

**Layout order**:
_Decided in #112, not built:_ the order of Shopping Mode, the same for every store and every list, following the standard sequence in `locations.md` (see **Layout order sequence**). Items with no Item location go last, in the order they were added; within one department or aisle, items sort alphabetically. Shopping Mode's only ordering until #151.
_Avoid_: Route order (the old learned ordering), smart sort

**Glanceability**:
The design test for Shopping Mode: one-handed, one look, large rows, nothing that needs thinking. Quick successive check-offs must never block each other.
_Avoid_: Simplicity, minimal mode

**Shop in progress**:
A list with at least one item checked that has not been finished yet. What Home's hero shows; a list row reads "3 of 12" while one is under way.
_Avoid_: Active list, open list (every list is active)

### Finishing

**Check-off record**:
The anonymous, global record written on Finish shopping: the ordered, normalised names of the checked items plus a completion time. It carries no household, list or user. It stays names-only: Quantity says nothing about store layout, so it is not recorded here. It is what teaches route order. _Decided in #112, not built:_ no order is learned from it once the learned sort is removed; it keeps accumulating for #151 only.
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
The home screen (menu item "Home"). Built in #144 (0.0.58) and #145 (0.0.59). Top to bottom, every section but the hero hidden when empty:
- **Hero**: a card per shop in progress (at least one item checked, not yet finished) with the Store badge and name ("No store" when none), the list name with its scope icon, a progress ring (ticked out of total) and a content-sized Resume button; several shops sit in a horizontally swipeable row with the next card peeking. With none, the hero is "Start a shop" with a New list button and a small Nearby stores chip. Nearby stores are checked only when the user taps the chip, never on load. Home never has an empty hero.
- **Stores row**: circular Store badges in chain colours, labelled "Stores", scrolling sideways with no cap. Membership: the Stores in the user's shop history, most-shopped first, then any Store attached to one of their lists, in list order (most recent activity first). A tap starts or continues a shop there, exactly as a donut legend tap does; it does not open the Store's own page.
- **Graphs**: two tiles side by side, "Where you shop" (a donut of shops per Store) and "How often you shop" (bars of shops per week over the last 8 weeks; weeks start Monday). Tapping a tile opens a detail card below the tiles (tap again to close, tap the other to switch): for "Where you shop" the donut with its legend, whose rows start or continue a shop at that Store; for "How often you shop" the last 6 months as monthly bars with counts. Both are hidden when there is no shop history. Motion: about 250ms on mount (rings fill, the donut sweeps, numbers count up), once per mount and never on a refresh; nothing moves under Reduce Motion.
- **Recent activity**: the three latest shops, one quiet line each (Store badge, "Store · date", list name as secondary text), then "See all history".
- **Pending corrections is removed from Home.** It lives only in the Store's Item catalog, where corrections show as "Proposed: X".
- **Limits on graphs:** Cartel stores no prices and has no item categories (Item locations are per-Store tags, not categories), so spending or category graphs are not possible yet and are not in v1 (see `CHANGE-LOG.md`). v1 uses existing data only.
_Avoid_: Overview, feed
