# Christchurch Store catalog: sources and provenance (#107, slice S1)

Compiled 2026-10-05. Output: `supabase/seed/store-catalog-christchurch.csv` (52 rows). Area: bounding box lat -43.70 to -43.25, lng 172.30 to 172.80 (not extended; every named place falls inside it). No Google Maps/Places data was used anywhere.

## Licence and attribution (read this before publishing the CSV)

The CSV has no comment line (a header comment would break a plain CSV/`\copy` import), so the notice lives here.

- Coordinates and the cross-check come from OpenStreetMap, licensed under the ODbL. Required attribution: "Contains data from OpenStreetMap contributors, ODbL 1.0" with a link to https://www.openstreetmap.org/copyright.
- OSM's own copyright page (fetched 2026-10-05): "You are free to copy, distribute, transmit and adapt our data, as long as you credit OpenStreetMap and its contributors." and "If you alter or build upon our data, you may distribute the result only under the same license." So the published CSV (a derived database) must go out under ODbL, as agreed.
- The lat/lng columns are OSM-derived. The names, branch list and addresses come from the brands' locators (facts: a shop's name and street address). See the terms caveat below.

## Sources

### 1. OpenStreetMap via Overpass (coordinates, cross-check)

- Server: https://overpass-api.de/api/interpreter. Data timestamp returned: 2026-10-05T06:46:48Z. Fetched 2026-10-05.
- Exact query (one query, as scoped; `out center` gives a point for building outlines):

```
[out:json][timeout:60];
(
  nwr["shop"~"^(supermarket|convenience)$"]["brand"~"New World|PAK'nSAVE|Pak'nSave|Four Square|Woolworths|Countdown|FreshChoice|Fresh Choice|SuperValue|Super Value",i](-43.70,172.30,-43.25,172.80);
  nwr["shop"~"^(supermarket|convenience)$"]["name"~"New World|PAK'nSAVE|Pak'nSave|Four Square|Woolworths|Countdown|FreshChoice|Fresh Choice|SuperValue|Super Value",i](-43.70,172.30,-43.25,172.80);
);
out center tags;
```

  (The second clause also matches by `name`, because one element had a name but no brand tag.) Returned 53 elements: 2 Four Square, 9 FreshChoice, 16 New World, 7 PAK'nSAVE, 1 SuperValue, 18 Woolworths (17 stores plus one duplicate node).
- A second, small query was run to resolve Mandeville and look for other SuperValue stores: elements with `name` matching Mandeville or FreshChoice in (-43.45,172.50,-43.33,172.70), plus `brand:wikidata=Q7642080` (SuperValue) in (-43.9,171.9,-43.0,173.2). It returned only the same Mandeville SuperValue node.
- Overpass/OSM terms: usage is governed by the ODbL above. No per-query clause beyond fair use was needed (two queries).

### 2. Brand locators (names, branch list, addresses)

| Brand | What was read | Method | Result |
|---|---|---|---|
| New World | https://www.newworld.co.nz/store-finder | WebFetch (page returned a static store list) | 16 stores in the area (list also holds out-of-area stores such as Ashburton, Temuka, Timaru, Waimate; excluded) |
| PAK'nSAVE | https://www.paknsave.co.nz/store-finder | WebFetch (static) | 7 in the area (Timaru excluded) |
| Four Square | https://www.foursquare.co.nz/store-finder | WebFetch (static) | Region list of 16; only West Melton and Diamond Harbour are inside the box (Akaroa, Darfield, Rakaia and the rest are outside) |
| FreshChoice | https://store.freshchoice.co.nz/ (the old /stores/ URL 301-redirects here) | WebFetch (static) | 10 stores |
| Woolworths | https://www.woolworths.co.nz/ store locator pages | NOT readable by WebFetch (timed out three times; /info/store-locations and /shop/storelocator return 404). Fallback: opened woolworths.co.nz in the browser pane and called the site's own JSON endpoint `/api/v1/addresses/pickup-addresses` (the list the site's "pick up" store chooser uses) | 17 stores in the area. This is the Click and Collect list, not a dedicated store-locator page; see "unverified" |
| SuperValue | https://www.supervalue.co.nz/ and https://store.supervalue.co.nz/ | Home page readable (names six stores in other regions); the store chooser is JavaScript-rendered ("made by Myfoodlink") and gave no store data | See SuperValue below |

### Terms of use, quoted (reuse of site content)

- New World (https://www.newworld.co.nz/terms-and-conditions): "You are not permitted to do anything which infringes these intellectual property rights (such as copying, modifying or reposting content)". Footer: "(c) 2026 New World. All rights reserved."
- PAK'nSAVE (https://www.paknsave.co.nz/terms-and-conditions): same sentence, "...unless you have express permission from us."
- Four Square (https://www.foursquare.co.nz/terms-and-conditions): same sentence, plus "We or Foodstuffs either own or are authorised to use the intellectual property in everything that you hear, read, download or access on or via the Online Services."
- FreshChoice (https://www.freshchoice.co.nz/terms-conditions/): "neither the Site, nor any material on it, may be altered, modified, reproduced, transmitted or distributed without our prior written consent." Personal download is allowed, otherwise not.
- Woolworths (https://www.woolworths.co.nz/help/terms-conditions): NOT retrieved. The page is JavaScript-rendered; neither WebFetch (timeout) nor an in-page fetch returned any terms text. Footer reads "(c) Woolworths New Zealand Limited 2026 - all rights reserved."
- None of these terms mentions a store-locator dataset specifically, and none grants a licence to republish. They all restrict copying and republishing site content. Our use is a re-keyed list of facts (shop name plus street address), not a copy of the pages, but this is a legal judgement for Ant, not a clearance. Nothing was scraped at volume: one page fetch per brand, plus one JSON call for Woolworths.

## Which stores came from where

- Every row's name, branch and address came from the brand's locator; every row's lat/lng and `osm_ref` came from OSM (no locator gave coordinates).
- Rows per chain: New World 16, PAK'nSAVE 7, Four Square 2, FreshChoice 10, Woolworths 17 (total 52).
- Every locator store in the box was matched to exactly one OSM element, and every in-box OSM element is accounted for. The single leftover is OSM's SuperValue node (see Mandeville).
- Matching was by branch tag where OSM had one, otherwise by street/suburb tags, otherwise by position against the locator address (the OSM elements missing branch tags are marked in each row's `notes`).

## Discrepancies between sources

- New World: locator "Ferry Road" is at 7-11 St John Street; OSM has the way on St Johns Street with no branch tag. Used the locator name (agreed rule: the brand's locator branch name).
- Woolworths Halswell is in OSM twice (way w1563906611 and node n14250423401 named "Woolworths Halswell"). One row; way used.
- OSM calls the Colombo St store branch "Colombo Street", and Moorhouse has no branch tag; locator names ("Colombo St", "Moorhouse Ave") used. Ant may prefer "Woolworths Colombo Street".
- FreshChoice Mandeville: OSM has no FreshChoice there, only a node tagged SuperValue (n5652951601) at Mandeville Village Shops (-43.38012, 172.53622). The FreshChoice locator lists Mandeville at 1/468 Mandeville Road, Ohoka. It is almost certainly the same shop, converted from SuperValue (the earlier research note records Woolworths converting SuperValue to FreshChoice), but I could not confirm that independently. Included as FreshChoice with the OSM coordinates and a note in the CSV.
- Four Square: OSM and the locator agree on both stores (West Melton, Diamond Harbour).
- Some OSM entries are dated: Eastgate node last checked 2023-08-06, Barrington 2025-01-13. Positions matched the locator addresses well enough to accept.
- Names have no apostrophe mismatch in the CSV: the PAK'nSAVE rows use the straight apostrophe, as the locator does.

## SuperValue finding

- No SuperValue store was found in the area. The SuperValue home page lists six stores, none in Canterbury (Bell Block, Mangawhai, Milton, Palomino, Plaza, Te Kuiti). The Overpass query for SuperValue (brand wikidata Q7642080) across -43.9..-43.0, 171.9..173.2 found only the stale Mandeville node, which the FreshChoice locator now lists as FreshChoice.
- So: zero SuperValue rows in the CSV. Consistent with the earlier research note (3 SuperValue stores left nationally as of March 2026). The SuperValue store chooser itself could not be read (JavaScript), so the home-page list is not proof of completeness.

## Unverified / could not fetch / omitted

- Woolworths: no dedicated locator page was readable. The 17 stores come from the site's Click and Collect list. A store without Click and Collect would be missing from it. Mitigation: OSM independently shows the same 17 (so likely complete), but OSM could also lag. Woolworths Amberley (outside the box) is on the list and omitted. Woolworths terms of use not retrieved.
- Four Square: the fetched locator list is a regional list read through a summarising fetch; a store missing from that summary would be missing here. No OSM Four Square exists in the box besides the two listed, which supports completeness. Sumner, Lyttelton, Woodend and Pegasus have no Four Square on either source.
- Addresses are from the locators as read through a summarising fetch (WebFetch paraphrases pages through a small model); they are marked review-only and are not seeded, but Ant's spot-check should not treat them as proofread. Coordinates are OSM's, not surveyed; way coordinates are building centre points.
- Opening status/closures: not checked beyond the brand locators listing each store as current.
- Omitted as outside the box or not a chain row: Akaroa, Darfield, Rakaia, Amberley, Ashburton and everything further out; non-supermarket formats.
- Nothing was found and left out for being unverifiable except SuperValue (none exist) and the items above kept with notes.
