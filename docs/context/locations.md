# Locations

The global, anonymous store layer shared by every household. Nothing here knows about households or lists.

## Language

### Stores

**Location**:
A store, global and shared across all households, created from "New location" on the Locations screen (name plus position). No code path deletes one. Name and position cannot be edited after creation; only the Chain can.
_Avoid_: Shop, store (in code), place

**Chain**:
The brand a location belongs to: New World, PAK'nSAVE, Four Square, Woolworths, FreshChoice, or Other. An explicit choice by the user, never inferred from the name. Any household member can change it at any time. "Other" is a real value, distinct from no chain set; both look the same. FreshChoice is a Woolworths NZ franchise, not part of the Foodstuffs brands. SuperValue is deliberately not offered.
_Avoid_: Brand, banner, franchise

**Merge prompt**:
When creating a location near an existing one, the app offers the existing one instead of a duplicate ("There's already a location nearby"). "Merge" means reusing the nearby row; nothing is deleted. The radius is locked at 100 m (`MERGE_RADIUS_M`), distinct from the larger nearby-stores radius used on the dashboard.
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
The per-location screen reached by "View catalog": every tagged item grouped by section, alphabetical within each, with "Nothing tagged here yet" when empty. Where corrections are proposed.
_Avoid_: Store directory, item database

### Search

**Places search-assist**:
Parked (#52). Picking a Google place would prefill the New location form from its coordinates. The result still saves into Cartel's own locations table; Cartel does not query Google live.
_Avoid_: Autocomplete, maps integration
