# Stores come from a seeded catalog we compile, not from users or Google Places

Amends the user-created part of [ADR 0002](./0002-location-global-list-private.md); the global and anonymous rules there stand. Decided 2026-10-04 in #107, which supersedes #52.

Free-text stores produced differing spellings and duplicates of the same branch, and the 100 m merge prompt only partly caught them. Locations are therefore a backend catalog seeded by us, limited to supermarket and grocery chains in Christchurch and surrounding area (roughly Rangiora to Lincoln and the coast). Names are canonical: brand plus branch ("New World Riccarton"), stored with the brand. The list is compiled from the brands' own store locators and OpenStreetMap (with attribution; locator terms checked), never scraped or exported from Google Maps, and Ant spot-checks it before seeding. Production holds only three user-created stores; the seed matches them to catalog entries so their tags and history survive, with Ant confirming first.

Users find a store nearby (dashboard radius) when location is allowed, otherwise by name search with a brand filter. If a store is missing, they send a report and Ant adds it. Stores show as a brand-colour badge plus name text.

## Rejected

- **Google Places (#52):** its terms forbid caching or storing Places content, which Cartel's own locations table would do; it also needs an API key and a billing prepayment. A list we compile needs none.
- **Keep free-text creation:** the source of the spelling drift and duplicates.
- **Report plus a temporary custom store:** brings the duplicates and spelling drift back, and the custom row would have to be reconciled later.
- **Real brand logos:** trademarked and copyrighted; needs permission from Foodstuffs and Woolworths NZ. A separate follow-up if granted.

## Consequences

- The catalog goes stale as stores open and close. Accepted: Store missing reports and corrections are the freshness mechanism.
- Coverage is deliberately narrow (no independents, dairies or other shop types) and regional; widening it is a manual compile-and-seed job.
- Adding a store needs Ant; there is no user path to create one.
- Migration B (`20261005000001`) removed client INSERT and the #54 chain UPDATE on `locations`: clients only read stores. `chain` is not null and one of the five brands (`other` is retired), and names are unique. Adding a brand or a store is a migration that Ant applies by hand. `created_by` is kept as provenance (NULL for seeded rows) and is still withheld from SELECT.
