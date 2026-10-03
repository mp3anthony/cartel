# Context Map

Cartel is a shared shopping-list app for households: lists that live with a household, stores that are known to everyone, and a Shopping Mode that learns the order you walk a store. Its vocabulary splits into five contexts.

## Contexts

- [Household](./docs/context/household.md) — who you shop with: the household, its members, invite codes and anonymous identity
- [Lists](./docs/context/lists.md) — the lists themselves: personal and shared lists, items, check-off, copying and the row and editor primitives
- [Locations](./docs/context/locations.md) — the global, anonymous store layer: locations, chains, section tags, corrections and the catalog
- [Shopping](./docs/context/shopping.md) — the act of shopping: Shopping Mode, route order, finishing a shop, history and the dashboard
- [Brand](./docs/context/brand.md) — palettes, theme, chain colours, the app icon and voice, plus the app shell (menu, version footer, feedback)

## Relationships

- **Brand → everything**: every context obeys the palette, touch-target and voice rules; a term elsewhere never overrides them.
- **Household → Lists**: a shared list is visible to every member of that household; a personal list is visible only to its owner.
- **Lists → Locations**: a list can be attached to a location; an item's section is found by matching its name against that location's section tags.
- **Locations ↔ Shopping**: Shopping Mode reads section tags to place untagged-history items, and Finish shopping writes an anonymous check-off record that teaches route order.
- **Hard boundary**: Locations never carries household or list knowledge. Location data is global and anonymous; list data is household-private; the two never share an access-control path (`docs/adr/0002-location-global-list-private.md`, `03-SPEC.md` section 0).

Workflow and process terms (orchestrator, subagents, labels, tickets, wrap-up) live in `CLAUDE.md`. Architectural decisions live in `docs/adr/`. Docs record only what the code cannot explain.

Non-glossary knowledge: binding build rules in `docs/conventions.md`, hard-won lessons and known items in `docs/lessons.md`, hosting, database and operations facts in `docs/environment.md`.
