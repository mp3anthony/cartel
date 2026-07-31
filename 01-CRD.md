# Client Requirements Document — Cartel

> Produced via discovery interview. This is the reference all downstream work (spec, tickets, build) reads first.

## 1. Problem
- Current pain: Shopping list apps don't know the shopper's route through a specific supermarket. NZ supermarkets don't publish item locations on their websites, so lists stay in an arbitrary/entry order. This causes backtracking and missed items during a shop.
- Why now: Ongoing frustration, not a single triggering event — same root cause as above. Compounded by how humans actually build lists: items get added in the order they're remembered, not the order they'll be encountered in-store, so the list needs to reorder itself rather than expecting the user to enter it in order.

## 2. Users
- Primary user(s): A household (e.g. a couple) who share a grocery list and shop together or separately.
- Roles/permissions (if more than one type of user): Flat — no hierarchy. Every household member has equal rights to add, check off, and reorder items on shared (household) lists. Users can also create personal lists visible only to themselves.

## 3. Core Flows (Must-Haves)
1. Build a list throughout the week (add items as remembered, any order).
2. Arrive at a shop on whatever day — open the list for that store.
3. Walk the store with the list open, ticking off items as they're collected. While shopping, optionally tag an item with its shelf/location if that location isn't known yet (crowdsourced location capture).
4. Over time, as a store's items get location-tagged and shoppers' check-off order is observed, the app learns that store's layout/route and starts ordering new lists to match — the more a store is shopped, the better the suggested route.
5. Crowdsourcing is global, not per-household — a new household shopping at an already-populated store benefits immediately from other users' prior contributions (see Data below for what's shared vs. private).

## 4. Data
- What needs to persist between sessions? Current unshopped lists (always visible to all household members, live). A short shopping history — last 5-10 completed shops, viewable after finishing. Recent/past lists reusable as a starting point for a new list (list templates), so users aren't creating from scratch each time. Lists can be scoped as personal (visible to just that user) or household (shared/visible to everyone in the household).
- Where does it live (local, cloud, synced)? Cloud, synced — required for global crowdsourcing of location data across all users.
- Sensitive data / privacy considerations? Item-location contributions are anonymous (not tied to who added them) and shared globally across all users of a store. Shopping lists themselves stay private to the household that owns them. Locations are crowd-correctable: if an item moves in-store, any user can update it and the fix reflects for everyone at that store.

## 5. Constraints
- Platform: Mobile app (iOS/Android).
- Stack (if already decided): Open — not decided. Should support a dynamic, interactive UI (movement/gestures — e.g. drag-to-reorder, animated transitions), which should factor into stack choice at the spec stage.
- Timeline: No fixed deadline. Priority order matters more than a date — see Non-negotiables and Out of Scope for phasing.
- Must integrate with: Nothing external (see Out of Scope).
- Non-negotiables: v1 is supermarkets only — user-created locations (e.g. "Papanui PakNSave"), shared household lists, route learning per location, and real-time sync across household members (not eventual/manual refresh).

## 6. Definition of Done
"I know this works when I can shop at a supermarket using a shared household list without missing items — with the list showing real-time updates across household members and reflecting a learned route for that location."

## 7. Out of Scope
- Non-supermarket store types (hardware stores, butchers, bakeries, etc.) — later phase.
- Official supermarket API/directory integration — locations stay user-created.
- Offline mode — later phase (see Open Questions for detail).

## 8. Open Questions
- Household pairing: RESOLVED — one person sets up the household first, then generates an invite code for others to join.
- Duplicate locations: RESOLVED — app requests location permission and geotags a location on first creation. When a user tries to create a new location, the app checks for an existing one within a radius (e.g. ~100-150m) and prompts to confirm/merge into the existing one instead of creating a duplicate. Manual search/select fallback needed for when permission is denied.
- Conflicting location edits: RESOLVED — voting system. A proposed correction to an item's shelf location doesn't overwrite immediately; it needs agreement from more than one user before it takes effect.
- Offline support: DEFERRED — not a v1 concern (NZ signal coverage is generally fine), but should be lined up for a later phase (offline viewing/ticking with sync-on-reconnect).

---
*Next step: hand this document to the spec-writing skill to produce a vertically-sliced spec, then to the tickets skill to log milestones to GitHub.*
