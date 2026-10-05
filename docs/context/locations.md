# Locations

The global, anonymous store layer shared by every household. Nothing here knows about households or lists.

> The terms below are the UI words (shipped with #94). This file keeps its old name, as do the code, table names, routes and URLs.

> **Planned, not built (#107, ADR 0007):** stores become a seeded Store catalog; users stop creating stores, and the **Chain** (brand) comes from the catalog row instead of a user choice. The **Store catalog**, **Canonical name** and **Store missing report** entries at the bottom describe the planned behaviour.

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
A shop, global and shared across all households (old UI word: Location). Today users create one from "New store" on the Stores screen (name plus position); under #107 that creation is removed and stores come only from the Store catalog. No code path deletes one. Name and position cannot be edited after creation; only the Chain can. Under #107 the brand comes from the catalog, so even that edit goes away.
_Avoid_: Shop, place. In the UI never "location" for a store; the code keeps `location`.

**Store location**:
Where a store is on the map (its GPS position), used for nearby-store wording.
_Avoid_: Address, position (in the UI)

**Location Services**:
The iPhone's own name for its GPS switch. Phone permission messages say this, never bare "location", so it cannot be confused with a Store location or an Item location. It is the phone's setting, not a Cartel concept.

**Chain**:
The brand a store belongs to: New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, or Other. An explicit choice by the user, never inferred from the name. Any household member can change it at any time. "Other" is a real value, distinct from no chain set; both look the same. SuperValue is deliberately not offered. Under #107 the brand comes from the catalog row; the user no longer chooses or edits it.
_Avoid_: Brand, banner, franchise

**Merge prompt**:
Retired by #107 along with user-created stores. Until then: when creating a store near an existing one, the app offers the existing one instead of a duplicate (the prompt uses the Store word). "Merge" means reusing the nearby row; nothing is deleted. The radius is locked at 100 m (`MERGE_RADIUS_M`), distinct from the larger nearby-stores radius used on the dashboard.
_Avoid_: Dedupe, duplicate warning

**Attach**:
Linking a list to a store (the list detail "Attach a store" / "Change store" / "Remove store" controls). Any household member may do so. Detaching is attaching nothing.
_Avoid_: Assign, link, select

### Item locations

**Item location**:
Where an item sits inside a store (an aisle or area, e.g. "Aisle 4"), matched by the item's normalised name (old UI words: Section, section tag; code: section tag). One per item per store, and anonymous: it records no creator. The first one for an item is made from Shopping Mode or from the list screen's Location pin; the Item catalog can only correct existing ones.
_Avoid_: Section (in the UI), aisle, category, label

**Correction**:
A proposal to change an item's Item location, made with "Propose" and confirmed with "Confirm". It stays pending until a second, independent user confirms; the proposer cannot confirm their own. Several different pending corrections may exist for one item; applying one clears the rest. There is no reject verb. Shown as a muted "Proposed: X" line; the dashboard lists "Pending corrections".
_Avoid_: Edit, suggestion, vote (in the UI)

**Item catalog**:
The per-store screen reached by "View catalog" (old UI word: Location catalog): every item with an Item location, grouped by it, alphabetical within each, with "No item locations here yet" when empty. Where corrections are proposed. Not the Store catalog below. Its redesign is #114.
_Avoid_: Store directory, item database, catalog (unqualified)

### Store catalog (planned, #107)

**Store catalog**:
Not the Item catalog (the per-store screen of items). The seeded, Cartel-maintained list of supermarket and grocery chain branches (New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, SuperValue if any remain) in Christchurch and surrounding area, roughly Rangiora to Lincoln and the coast. Compiled from the brands' own store locators and OpenStreetMap, never from Google Maps; Ant spot-checks it before seeding. No independents, dairies or other shop types. Users find a store from it by nearby (dashboard radius) when Location Services is allowed, otherwise by name search with a brand filter. Staleness is accepted; Store missing reports and corrections are the freshness mechanism.
_Avoid_: Places search, maps integration, catalog (unqualified)

**Canonical name**:
The one agreed form of a catalog store's name: brand plus branch, e.g. "New World Riccarton", stored alongside its brand. Exists to end differing spellings and duplicates. The brand also drives the badge (brand colour plus name text; real logos are a separate follow-up needing permission).
_Avoid_: Display name, nickname

**Store missing report**:
The only way a user adds a store: a report that a store is absent from the catalog. Report-only; Ant adds it. There is no temporary or custom store in the meantime.
_Avoid_: Add store, suggest a store
