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
Where an item sits inside a store (an aisle or area, e.g. "Aisle 4"), matched by the item's normalised name (old UI words: Section, section tag; code: section tag). One per item per store, and anonymous: it records no creator. _Decided in #106, not built:_ matched by the same folded name as list items (case, inner spaces, accents), and labels are stored with a leading capital. _Decided in #112, not built:_ labels come only from the **Layout order sequence** below (typing free text is removed), and existing free-text labels are migrated (see below). The first one for an item is made from Shopping Mode or from the list screen's Location pin; the Item catalog can only correct existing ones.
_Avoid_: Section (in the UI), aisle, category, label

**Layout order sequence**:
_Decided in #112, not built:_ the fixed standard set of Item locations, identical for all stores, in NZ shop-floor wording chosen by Ant: Fruit & Veg, Butchery, Seafood, Deli, Bakery, Dairy, Chilled, then Aisles in numeric order (parsed as numbers, so 2 before 20 and 22), then Frozen, Health & Beauty, Pharmacy, Beer & Wine. It drives Shopping Mode's **Layout order** (`shopping.md`).
_Avoid_: Produce, Meat (use Fruit & Veg, Butchery)

**Aisle**:
_Decided in #112, not built:_ one option in the standard set, not a fixed list, because aisle numbers are per store and arbitrary (some run 1, 2, 3; others 20, 22, 23). Choosing it reveals a number control (stepper or number pad) and saves the plain-text label "Aisle 22" (no schema change; the sort parses "Aisle N"). Under the control, the aisle numbers already used at that store show as quick chips.

**Item location picker**:
_Decided in #112, not built:_ where the first Item location for an item is set (Shopping Mode, the list screen's Location pin) and where the Item catalog's edit does the same: tappable chips for the standard set, no typing and no "Other..." option. It ends with a small "Missing one? Tell us" link that opens the existing feedback flow with the subject "Item location missing" and the Store attached; Ant adds it to the set (report-only, the same pattern as the Store missing report). This touches the deployed `report-feedback` Edge Function that #109 also changes; whichever lands second rebases.
_Avoid_: Free-text entry, Other

**Item location migration**:
_Decided in #112, not built:_ a one-off production data change for existing free-text labels. Labels that fold cleanly to the standard set (e.g. "aisle 4" to "Aisle 4", "dairy section" to "Dairy") are rewritten; labels that do not map (e.g. "Cleaning") are cleared and those items re-tagged from the picker, with pending corrections on cleared tags going with them. Stops at the plan for Ant (locked-invariant escalation); an Investigator takes a read-only count first. Run in one pass with the #106 production migration, which also capitalises labels and merges duplicates.

**Correction**:
A proposal to change an item's Item location, made with "Propose" and confirmed with "Confirm". It stays pending until a second, independent user confirms; the proposer cannot confirm their own. Several different pending corrections may exist for one item; applying one clears the rest. There is no reject verb. Shown as a muted "Proposed: X" line; the dashboard lists "Pending corrections" (decided in #110, not built yet: removed from Home; corrections are seen in the Store's Item catalog only). _Decided in #106, not built:_ a correction that differs from the current label only by case or whitespace applies immediately with no second user.
_Avoid_: Edit, suggestion, vote (in the UI)

**Item catalog**:
The per-store screen reached by "View catalog" (old UI word: Location catalog): every item with an Item location, grouped by it, alphabetical within each, with "No item locations here yet" when empty. Where corrections are proposed. Not the Store catalog below. _Decided in #114, not built:_ opened from a small book icon at the right end of each store row on the Stores screen (main list and nearby rows; the row tap stays the picker select, and the "Selected" badge is replaced by an outline). The screen has a search box (by item name), Item location groups that collapse and expand (collapsed to start, a dot marks a pending correction, searching expands the matches), and one compact row per item with a clean SVG edit icon (not a glyph) in the style of the list's pin. A pending correction is a muted "Proposed: X" line with a small check inside the item's row.
_Avoid_: Store directory, item database, catalog (unqualified)

### Store catalog

**Store catalog**:
Not the Item catalog (the per-store screen of items). The seeded, Cartel-maintained list of supermarket and grocery chain branches (New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, SuperValue if any remain) in Christchurch and surrounding area, roughly Rangiora to Lincoln and the coast. Compiled from the brands' own store locators and OpenStreetMap, never from Google Maps; Ant spot-checks it before seeding. No independents, dairies or other shop types. Users find a store from it by nearby (dashboard radius) when Location Services is allowed, otherwise by name search with a brand filter. The picker's list puts the stores in the household's Shop history first (most visits first), then alphabetical; the nearby list stays ordered by distance. Staleness is accepted; Store missing reports and corrections are the freshness mechanism.
_Avoid_: Places search, maps integration, catalog (unqualified)

**Canonical name**:
The one agreed form of a catalog store's name: brand plus branch, e.g. "New World Riccarton", stored alongside its brand. Unique across the catalog. Exists to end differing spellings and duplicates. The brand also drives the badge (brand colour plus name text; New World is solid red; Four Square and FreshChoice show their red with a green or blue ring so the three reds can be told apart; real logos are a separate follow-up needing permission).
_Avoid_: Display name, nickname

**Store missing report**:
The only way a user adds a store: a report that a store is absent from the catalog. Report-only; Ant adds it. There is no temporary or custom store in the meantime.
_Avoid_: Add store, suggest a store
