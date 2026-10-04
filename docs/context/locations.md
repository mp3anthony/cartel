# Locations

The global, anonymous store layer shared by every household. Nothing here knows about households or lists.

> **Planned, not built (#107, ADR 0007):** locations become a seeded store catalog; users stop creating stores, and the **Chain** (brand) comes from the catalog row instead of a user choice. Until it ships, the terms below describe the app as it is. The **Store catalog**, **Canonical name** and **Store missing report** entries at the bottom describe the planned behaviour.

> **Pending rename (ticketed as #94, to land after #89):** in the UI, **Location** is to become **Store**, and **Section** / **section tag** is to become **location** (an item's place within a store). Code and schema names stay. Until that ships, the terms below describe the app as it is.

## Language

### Stores

**Location**:
A store, global and shared across all households. Today users create one from "New location" on the Locations screen (name plus position); under #107 that creation is removed and locations come only from the Store catalog. No code path deletes one. Name and position cannot be edited after creation; only the Chain can. Under #107 the brand comes from the catalog, so even that edit goes away.
_Avoid_: Shop, store (in code), place

**Chain**:
The brand a location belongs to: New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, or Other. An explicit choice by the user, never inferred from the name. Any household member can change it at any time. "Other" is a real value, distinct from no chain set; both look the same. SuperValue is deliberately not offered. Under #107 the brand comes from the catalog row; the user no longer chooses or edits it.
_Avoid_: Brand, banner, franchise

**Merge prompt**:
Retired by #107 along with user-created stores. Until then: when creating a location near an existing one, the app offers the existing one instead of a duplicate ("There's already a location nearby"). "Merge" means reusing the nearby row; nothing is deleted. The radius is locked at 100 m (`MERGE_RADIUS_M`), distinct from the larger nearby-stores radius used on the dashboard.
_Avoid_: Dedupe, duplicate warning

**Attach**:
Linking a list to a location ("Attach a location", "Change location", "Remove location" on list detail). Any household member may do so. Detaching is attaching nothing.
_Avoid_: Assign, link, select

### Sections

**Section tag**:
The section of a store (an aisle or area) that an item belongs to at one location, matched by the item's normalised name. One per item per location, and anonymous: it records no creator. The first tag for an item is made from Shopping Mode; the catalog can only correct existing tags.
_Avoid_: Aisle, category, label

**Correction**:
A proposal to change an item's section tag, made with "Propose" and confirmed with "Confirm". It stays pending until a second, independent user confirms; the proposer cannot confirm their own. Several different pending corrections may exist for one item; applying one clears the rest. There is no reject verb. Shown as a muted "Proposed: X" line; the dashboard lists "Pending corrections".
_Avoid_: Edit, suggestion, vote (in the UI)

**Location catalog**:
Not the planned Store catalog (the seeded list of stores). The per-location screen reached by "View catalog": every tagged item grouped by section, alphabetical within each, with "Nothing tagged here yet" when empty. Where corrections are proposed.
_Avoid_: Store directory, item database

### Catalog (planned, #107)

**Store catalog**:
Not the Location catalog (the per-location View catalog screen of tagged items). The seeded, Cartel-maintained list of supermarket and grocery chain branches (New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, SuperValue if any remain) in Christchurch and surrounding area, roughly Rangiora to Lincoln and the coast. Compiled from the brands' own store locators and OpenStreetMap, never from Google Maps; Ant spot-checks it before seeding. No independents, dairies or other shop types. Users find a store from it by nearby (dashboard radius) when location is allowed, otherwise by name search with a brand filter. Staleness is accepted; Store missing reports and corrections are the freshness mechanism.
_Avoid_: Places search, maps integration, catalog (unqualified)

**Canonical name**:
The one agreed form of a catalog store's name: brand plus branch, e.g. "New World Riccarton", stored alongside its brand. Exists to end differing spellings and duplicates. The brand also drives the badge (brand colour plus name text; real logos are a separate follow-up needing permission).
_Avoid_: Display name, nickname

**Store missing report**:
The only way a user adds a store: a report that a store is absent from the catalog. Report-only; Ant adds it. There is no temporary or custom store in the meantime.
_Avoid_: Add store, suggest a store
