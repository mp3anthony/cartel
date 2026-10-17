# Shopping

The act of shopping: walking a store with a list, finishing the shop, and looking back at it.

## Language

### In the store

**Shopping Mode**:
The screen opened by "Start shopping" on a list detail, where items are checked off in **Layout order** (built in #153, 0.0.63), with larger touch targets and type than the rest of the app. The add-item composer sits at the top, where attention is while shopping.
_Avoid_: Trip mode, store mode

**Route order**:
The order items are shown in Shopping Mode, computed when the screen is read and never stored. Observed check-off history at that store comes first; an untagged-in-history item falls back to its **Item location**; anything else keeps entry order. _Superseded, built in #153 (0.0.63):_ replaced by **Layout order**; the learned history sort is gone from Shopping Mode. Finish shopping still writes the Check-off record unchanged, so history keeps accumulating. The learned per-user walking order is parked as #151 (grill only, depends on #112).
_Avoid_: Aisle order, smart sort

**Layout order**:
_Built in #153 (0.0.63):_ the order of Shopping Mode, the same for every store and every list, following the standard sequence in `locations.md` (see **Layout order sequence**). Items with no Item location go last, in the list's own order (the manual order from list detail, so a newly added item stays at the end); within one department or aisle, items sort alphabetically. A free-text label that is not in the standard set sorts after Beer & Wine, grouped by label. Shopping Mode's only ordering until #151.
_Avoid_: Route order (the old learned ordering), smart sort

**Glanceability**:
The design test for Shopping Mode: one-handed, one look, large rows, nothing that needs thinking. Quick successive check-offs must never block each other.
_Avoid_: Simplicity, minimal mode

**Shop in progress**:
A list with at least one item checked that has not been finished yet. What Home's hero shows; a list row reads "3 of 12" while one is under way.
_Avoid_: Active list, open list (every list is active)

### Finishing

**Check-off record**:
The anonymous, global record written on Finish shopping: the ordered, normalised names of the checked items plus a completion time. It carries no household, list or user. It stays names-only: Quantity says nothing about store layout, so it is not recorded here. It no longer drives any order (#153 removed the learned sort); it keeps accumulating for #151 only.
_Avoid_: Shopping log, receipt

**Finish shopping**:
The confirm-gated button that ends a shop. It records the check-off record and a Shop history entry in one atomic step. The confirm offers two endings. **Done shopping** then resets the list for reuse: every item is unchecked and kept with its Quantity, nothing is removed. **Continue at another store** keeps the checks so bought items stay ticked; the store picker opens straight away (skippable, keeping the current store) and the user carries on, and the next finish records only the items checked since this one. Either way each store gets its own Shop history entry and check-off record. Lists are never archived. Finish is disabled when nothing is checked; when every check is already recorded it offers only **Reset list**. Afterwards an in-flow "Shop recorded" banner appears.
_Avoid_: Complete, checkout ("Done shopping" names only one of its two endings)

**Reset list**:
Offered in place of the two endings only when everything checked was already recorded by an earlier Continue. It unticks every item (Quantity is kept) and records nothing: no Shop history entry, no check-off record. It exists because recording again would double-count the same purchases. When someone else already reset or finished, it reports "Nothing is ticked anymore".
_Avoid_: Finish, clear

### Looking back

**Shop history**:
The household's record of finished shops, on the History screen (menu item "History"). Shows the 5 most recent shops. The cap limits the display only: older shops stay stored and still count toward "Where you shop". Under a **History filter** the cap is lifted and every matching shop shows (built in #216, 0.0.69). Each entry is titled by its store and date, with the list name as secondary text (the list name is the title when no store was attached). It expands to the items bought, in check-off order, each with its Quantity when above 1 (for example "Milk ×2"), followed by a collapsed "Not bought" group, expandable, holding the items left unchecked in that shop, which show their Quantity the same way. "Start new list from this" and "Delete" sit inside an expanded entry, not on the collapsed card; "Clear all history" removes every entry. Empty state: "No shops recorded yet".
_Avoid_: Receipts, past lists, trips

**History filter**:
_Built in #216 (0.0.69):_ in the "How often you shop" pop-up, tapping a bar column opens History filtered to that week or month, and tapping a Store's slice of it filters to that Store too (the grey "Other stores" slice to every Store outside the top 5). A legend row opens History for that Store over all time ("Other stores": every Store outside the top 5). The filter lifts the 5-shop display cap so all matching shops show. A chip such as "Week of 6 Oct · Clear" shows the filter ("October 2026 · Clear"; with a Store, "Week of 6 Oct · PAK'nSAVE Papanui · Clear"; several tail Stores read "Other stores") and clears it. No match shows "No matching shops" with "Nothing recorded for this filter. Clear it to see all your shops." The filter lives in the History route params (`period`, `start` as a local YYYY-MM-DD, `stores` as comma-separated Store ids), so a link can carry it; bad parts are ignored and never break the screen. History has no back circle (Ant, #216): it stays a bottom-nav destination, and browser Back or the Home pill returns Home with the pop-up closed. The pop-up closes before History opens. _Touch-target exception (Ant, #216):_ bar columns are under 44pt wide and slices a few points tall; the whole column is the tap area, a slice tap is a pointer shortcut, and the accessible routes are the column and the legend rows (see `docs/conventions.md`). _Planner's choices, accepted by Ant:_ the chip and empty-state wording, and legend rows opening all-time Store history.
_Avoid_: Drill-down, search

**Dashboard**:
The home screen (menu item "Home"). Built in #144 (0.0.58), #145 (0.0.59) and #214 (0.0.65). Top to bottom, every section but the hero hidden when empty:
- **Hero**: a card per shop in progress (at least one item checked, not yet finished) with the Store badge and name ("No store" when none), the list name with its scope icon, a progress ring (ticked out of total) and a content-sized Resume button; several shops sit in a horizontally swipeable row with the next card peeking. With none, the hero is "Start a shop" with a New list button and a Nearby stores button. Nearby stores are checked only when the user taps the button, never on load. Home never has an empty hero. New list and Nearby stores are equal-width buttons that together fill the card (#213); the Nearby check uses the same 2 km radius as the Stores page (one shared constant, `NEARBY_RADIUS_M`) and shows distances rounded to the nearest 10 m. The Nearby button stays in place, results sit below it.
- **Stores row**: circular Store badges in chain colours, labelled "Stores", scrolling sideways with no cap. Membership: the Stores in the user's shop history, most-shopped first, then any Store attached to one of their lists, in list order (most recent activity first). A tap starts or continues a shop there, exactly as a donut legend tap does; it does not open the Store's own page. Store names wrap in full, never truncated (#214).
- **Graphs**: two tiles side by side, "Where you shop" (a donut of shops per Store) and "How often you shop" (bars of shops per week over the last 8 weeks; weeks start Monday). Built in #215 (0.0.68), replacing the old inline detail card: tiles do not expand inline; each opens a pop-up card. The "Where you shop" tile keeps its title and "N shops" figure and shows only the donut; its pop-up pins the donut at the top and scrolls only the Store list (full names wrapping, shops and percentage per row; a row tap still starts or continues a shop). The "How often you shop" bars are stacked per Store on the tile and in the pop-up; the pop-up shows 8 weeks plus 6 months, with a legend (full names). One colour rule serves the donut, the bars and the legend: the top 5 Stores by lifetime shops get a colour (chain brand colour, else the accent at falling strength), every other Store merges into a neutral "Other stores". The legend lists the Stores that have a shop in the 6-month window. The pop-up is dismissed by the close circle, the scrim or Escape, not by the browser Back button. PAK'nSAVE yellow has no outline (Ant accepted the default). Known limit: same-chain Stores share one colour, and the New World, Four Square and FreshChoice reds are near-identical, so colour alone cannot tell them apart (the legend names them). _Planner's choices, not Ant's decisions:_ no chevron or selected border on the tiles; weekly labels show the day of the month, with the short month on the first column and wherever the month changes. Bars, segments and legend rows open the **History filter** (#216). Both are hidden when there is no shop history. Motion: about 250ms on mount (rings fill, the donut sweeps, numbers count up), once per mount and never on a refresh; nothing moves under Reduce Motion.
- **Recent activity is removed from Home** (#214). History stays in the nav; Lists is unchanged.
- **Pending corrections is removed from Home.** It lives only in the Store's Item catalog, where corrections show as "Proposed: X".
- **Limits on graphs:** Cartel stores no prices and has no item categories (Item locations are per-Store tags, not categories), so spending or category graphs are not possible yet and are not in v1 (see `CHANGE-LOG.md`). v1 uses existing data only.
_Avoid_: Overview, feed
