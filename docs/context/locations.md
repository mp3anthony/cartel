# Locations

The global, anonymous store layer shared by every household. Nothing here knows about households or lists.

> The terms below are the UI words (shipped with #94). This file keeps its old name, as do the code, table names, routes and URLs.

## Old-to-new mapping (#94, UI wording only)

| Old UI word | New UI word |
| --- | --- |
| Location | **Store** (the "Stores" menu item and screen) |
| Section / Section tag | **Item location** |
| Location catalog | **Item catalog** |
| (new) | **Store location** (where a store is on the map) |
| bare "location" in phone permission messages | **Location Services** |

`03-SPEC.md`, the ADRs, code identifiers, table names (`locations`, `location_items`, ...), routes and file names (including this file's) keep the old words as historical record (the spec has a locked section 0). A reader of the spec: "location" there means Store, "section" means Item location. The dashboard's "Sections" blocks (see `shopping.md`) are a different meaning and keep their name. The other glossaries use the new words.

## Language

### Stores

**Store**:
A shop, global and shared across all households (old UI word: Location). Stores come only from the Store catalog; users cannot create, rename, move or edit one, and no code path deletes one.
_Avoid_: Shop, place. In the UI never "location" for a store; the code keeps `location`.

**Store location**:
Where a store is on the map (its GPS position), used for nearby-store wording.
_Avoid_: Address, position (in the UI)

**Location Services**:
The iPhone's own name for its GPS switch. Phone permission messages say this, never bare "location", so it cannot be confused with a Store location or an Item location. It is the phone's setting, not a Cartel concept.

**Chain**:
The brand a store belongs to: New World, PAK'nSAVE, Four Square, Woolworths or FreshChoice. Always set from the catalog row, never chosen by the user and never inferred from the name. There is no "Other". SuperValue is deliberately not offered; a new brand needs a migration.
_Avoid_: Brand, banner, franchise

**Merge prompt**:
Retired by #107 with user-created stores.
_Avoid_: Dedupe, duplicate warning

**Attach**:
Linking a list to a store (the list detail "Attach a store" / "Change store" / "Remove store" controls). Any household member may do so. Detaching is attaching nothing.
_Avoid_: Assign, link, select

### Item locations

**Item location**:
Where an item sits inside a store (an aisle or area, e.g. "Aisle 4"), matched by the item's folded name, the same fold as list items (case, inner spaces, accents), stored that way (old UI words: Section, section tag; code: section tag). One per item per store, and anonymous: it records no creator. Because the stored name is the fold, the Item catalog shows names with a leading capital only (the folded name with a leading capital); accents and inner capitals are not recoverable. Labels are stored with a leading capital: the client adds it on a new tag, the database on a new tag and on a proposal; the picker's labels already carry it. _Built in #106 (0.0.56, Migration C2):_ existing labels were moved onto the standard set (see **Item location migration**). _Built in #154 (0.0.64):_ labels come only from the **Layout order sequence** below, picked with the **Item location picker** (typing free text is removed); existing free-text labels were migrated (see below). The first one for an item is made from Shopping Mode or from the list screen's Location pin; the Item catalog can only correct existing ones, using the same picker. Both stored forms and the picker's chips are read with the forgiving label rules, so the picker marks "dairy section" as Dairy.
_Avoid_: Section (in the UI), aisle (as a name for the whole concept; **Aisle** below is one option in the set), category, label

**Layout order sequence**:
The fixed standard set of Item locations, identical for all stores, in NZ shop-floor wording: Fruit & Veg, Butchery, Seafood, Deli, Bakery, Dairy, Chilled, then Aisles in numeric order (parsed as numbers, so 2 before 20 and 22), then Frozen, Health & Beauty, Pharmacy, Beer & Wine. It drives Shopping Mode's **Layout order** (`shopping.md`). _Sorting built in #153 (0.0.63)_ in `mobile/src/lib/layoutOrder.ts`, which reads labels forgivingly with rules 1 and 2 of the C2 migration (so "dairy section" is Dairy, "isle 04" is Aisle 4); the migration's synonym map (rule 3, e.g. "Meat") is not applied, so such a label sorts as unknown. _The picker that restricts typing was built in #154 (0.0.64)._
_Avoid_: Produce, Meat (use Fruit & Veg, Butchery)

**Aisle**:
_Built in #154 (0.0.64):_ one option in the standard set, not a fixed list, because aisle numbers are per store and arbitrary (some run 1, 2, 3; others 20, 22, 23). Choosing it reveals a number control (1 to 999, the same cap the sort reads) and saves the plain-text label "Aisle 22" (no schema change; the sort parses "Aisle N"). Under the control, the aisle numbers already used at that store (read from its existing tags) show as quick chips.

**Item location picker**:
_Built in #154 (0.0.64):_ where the first Item location for an item is set (Shopping Mode, the list screen's Location pin) and where the Item catalog's edit does the same: tappable chips for the standard set, no typing and no "Other..." option. The chip for the item's current label is marked (wash and a check). The picker closes without writing only when the stored label is exactly the standard one (a write would be refused as matching the current label). An older label such as "Dairy section" is still marked on the standard chip, but tapping it sends the standard label: applied at once if only capitals differ, otherwise a normal correction that needs a second user. It ends with a small "Missing one? Tell us" link that opens the existing Feedback form with the title "Item location missing" (a cleared title falls back to it) and the Store as a read-only line, sent as the first line of the report. The line appears only once the Store's name is known (looked up from the Store ID if the link carried none); the ID is never shown or sent, so a report sent before the lookup finishes goes without it; the item's name is not attached, because reports are public GitHub issues. Ant adds the missing one to the set (report-only, the same pattern as the Store missing report). It reuses the existing `report` type, so the `report-feedback` Edge Function is unchanged.
_Avoid_: Free-text entry, Other

**Item location migration**:
_Built in #106 slice 4b / #155 (0.0.56, Migration C2; the production run date is in `HANDOFF.md` and on #106):_ a one-off production data change for existing free-text labels. A label is rewritten when, ignoring case, a leading "the", a trailing "section", "department", "area", "aisle" or similar, and "and" for "&", it is a standard label ("dairy section" to "Dairy"); when it reads as an aisle number ("aisle 4", "isle 04", "aisle no. 4" to "Aisle 4"; "Aisle 4a" or a bare "Aisle" do not); or when it is one of the few synonyms and bare numbers Ant approved after a read-only count (production: "15" and "23" to Aisle 15 and Aisle 23, "Fruit & Vegetables" to Fruit & Veg, "Meat" to Butchery). Every other label ("Cleaning", "Dali") is cleared: the tag is deleted and the item is re-tagged from Shopping Mode or the pin, with its pending corrections going with it. Pending corrections on tags that survive are rewritten the same way; one that maps to nothing, or equals its tag's label afterwards, is deleted; duplicates after mapping keep the oldest; a proposal that two different users end up sharing only through the mapping is applied and that item's votes cleared. Free text can no longer be typed since the Item location picker (#154), so non-standard labels no longer appear; any left from before it are read as unknown and sort after the standard ones. Backups and logs are in `migration_106`.

**Correction**:
A proposal to change an item's Item location, made with "Propose" and confirmed with "Confirm". It stays pending until a second, independent user confirms; the proposer cannot confirm their own. Several different pending corrections may exist for one item; applying one clears the rest. There is no reject verb. Shown as a muted "Proposed: X" line; it is no longer shown on Home (#144); corrections are seen in the Store's Item catalog only, where the dot on a collapsed group header is now the only hint that one is waiting. _Built in #106 (0.0.56):_ a correction that differs from the current label only by case or whitespace applies immediately with no second user, and clears the item's other pending corrections; every proposal is stored with a leading capital. (Typing is gone since #154, so this only matters for labels stored before it.)
_Avoid_: Edit, suggestion, vote (in the UI)

**Item catalog**:
The per-store screen reached from the book icon on each store row of the Stores screen (old UI word: Location catalog): every item with an Item location, grouped by it, alphabetical within each, with "No item locations here yet" when empty. Where corrections are proposed. Not the Store catalog below. One compact row per item (name, SVG edit icon in the style of the list's pin); a pending correction is a muted "Proposed: X" line with a check icon to confirm. _Built in #147 (0.0.62):_ the book icon (label "View catalog for <store>") sits at the right end of each store row, in the main list and the nearby rows; the row tap stays the picker select, and the old "Selected" badge is replaced by a 2px accent border that appears on the selected row (constant width, so rows never shift). _Built in #149 (0.0.61):_ a search box (by item name only, not Item location names) and Item location groups that collapse and expand. Every group starts collapsed, every visit; nothing is remembered between visits, and a store with one Item location still starts collapsed. While searching, matching groups open, the header count shows matches, and "No items match" shows when nothing does; collapsing a group while searching does not change the user's own choices once the search is cleared. A dot on a group header marks a pending correction in it.
_Avoid_: Store directory, item database, catalog (unqualified)

### Store catalog

**Store catalog**:
Not the Item catalog (the per-store screen of items). The seeded, Cartel-maintained list of supermarket and grocery chain branches (New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, SuperValue if any remain) in Christchurch and surrounding area, roughly Rangiora to Lincoln and the coast. Compiled from the brands' own store locators and OpenStreetMap, never from Google Maps; Ant spot-checks it before seeding. No independents, dairies or other shop types. Users find a store from it by nearby (one shared 2 km radius, the same on Home and the Stores page) when Location Services is allowed, otherwise by name search with a brand filter. The picker's list puts the stores in the household's Shop history first (most visits first), then alphabetical; the nearby list stays ordered by distance. Staleness is accepted; Store missing reports and corrections are the freshness mechanism.
_Avoid_: Places search, maps integration, catalog (unqualified)

**Canonical name**:
The one agreed form of a catalog store's name: brand plus branch, e.g. "New World Riccarton", stored alongside its brand. Unique across the catalog. Exists to end differing spellings and duplicates. The brand also drives the badge (brand colour plus name text; New World is solid red; Four Square and FreshChoice show their red with a green or blue ring so the three reds can be told apart; real logos are a separate follow-up needing permission).
_Avoid_: Display name, nickname

**Store missing report**:
The only way a user adds a store: a report that a store is absent from the catalog. Report-only; Ant adds it. There is no temporary or custom store in the meantime.
_Avoid_: Add store, suggest a store
