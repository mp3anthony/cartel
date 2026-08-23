# NZ supermarket branding & Google Places API — research notes

Researched 2026-08-23. Two independent questions for the Cartel app:

1. Real NZ supermarket chains/banners today, and their real brand colours (for
   tinting donut-chart segments and store badges instead of one flat app accent).
2. Whether Google Places API is a viable replacement/augmentation for the app's
   own `locations` table (cost, ToS, caching legality).

All claims below are cited inline. Where I could only find a secondary source
(Wikipedia, a blog) I say so explicitly in the "confidence" column/note rather
than presenting it as verified.

---

## Question 1 — NZ supermarket chains and brand colours

### The current landscape (verified, not assumed from stale training data)

New Zealand's grocery market is a duopoly of two co-operative/corporate groups,
each running several banners:

- **Foodstuffs** (a co-operative split into **Foodstuffs North Island** and
  **Foodstuffs South Island**) operates the retail banners **New World**,
  **PAK'nSAVE**, and **Four Square**, plus non-supermarket banners **Gilmours**
  (North Island wholesale foodservice), **Trents** (South Island wholesale
  foodservice) and **Liquorland**, and a small South-Island-only convenience
  format called **On the Spot**.
  Source: [Foodstuffs NZ — Our Brands](https://www.foodstuffs.co.nz/our-brands)
  (lists New World, PAK'nSAVE, Four Square, Gilmours, Liquorland for Foodstuffs
  North Island) and
  [Foodstuffs Exchange — Banner Group Overview](https://www.foodstuffs-exchange.co.nz/processes-and-guides/banner-group-overview)
  (adds Trents and On the Spot, and confirms Four Square/New World/PAK'nSAVE are
  the consumer-facing supermarket formats).

- **Woolworths New Zealand** (the NZ subsidiary of the Australian Woolworths
  Group) completed its rebrand from **Countdown** to **Woolworths** in
  **December 2025** — the last Countdown-branded store (Botany) switched over
  then. As of 2026 there are no operating "Countdown" stores left; the banner
  is fully "Woolworths" now.
  Source: [NZ Herald — "The final Countdown: Woolworths rebrand complete as last store makes switch"](https://www.nzherald.co.nz/business/companies/retail/countdown-botany-completes-woolworths-rebrand-as-chain-ends-14-year-era/KD47TSWSVREYPCI7Y2RGRACU3M/).

- **FreshChoice** and **SuperValue** — **this corrects an assumption in the
  brief.** These are **not** Foodstuffs South Island franchises. Both are
  franchised out of **Wholesale Distributors Limited (WDL), a division of
  Woolworths New Zealand**, itself 100%-owned by the Australian Woolworths
  Group. Individual stores are locally owned/operated franchisees, but the
  franchisor and brand owner is Woolworths NZ, not Foodstuffs.
  Sources: [SuperValue — Franchise Opportunities](https://www.supervalue.co.nz/about/franchise-opportunities/)
  and [FreshChoice — Franchise Opportunities](https://www.freshchoice.co.nz/about/franchise-opportunities/)
  (both state "Wholesale Distributors Limited (WDL) is a division of Woolworths
  New Zealand (WWNZ)... 100% owned by Woolworths Limited"), corroborated by
  [Wikipedia — FreshChoice](https://en.wikipedia.org/wiki/FreshChoice) and
  [Wikipedia — SuperValue](https://en.wikipedia.org/wiki/SuperValue).
  **Also worth knowing for a donut chart:** Woolworths NZ has been actively
  converting SuperValue stores to FreshChoice since 2023 — per the Wikipedia
  SuperValue page, **only 3 SuperValue stores remained as of March 2026**, down
  from a much larger network. SuperValue is close to extinct as a live banner;
  weight it accordingly (or fold it into FreshChoice) rather than treating it
  as a peer of the other five.

- **Other names checked and confirmed NOT current, standalone consumer
  chains**: **Write Price** was a Foodstuffs-owned discount banner in
  Feilding, closed/absorbed back into New World around 2017–18
  ([Stuff — "Petition against Foodstuffs' decision to close Write Price Feilding"](https://www.stuff.co.nz/business/102387385/petition-against-foodstuffs-decision-to-close-write-price-feilding));
  it does not appear in Foodstuffs' current banner list. **Raeward Fresh**
  (Christchurch/Nelson fresh-food mini-supermarkets) wound down to a single
  wholesale-only outlet — its last Christchurch retail store closed May 2025,
  and its final Christchurch store had already been operating as a Foodstuffs
  franchise, not an independent chain, since 2022
  ([The Press — "Last Raeward Fresh in Christchurch to close its doors"](https://www.thepress.co.nz/nz-news/360687407/last-raeward-fresh-christchurch-close-its-doors)).
  Neither is a currently-operating brand worth a chart segment.

**Recommended set for the app: New World, PAK'nSAVE, Four Square, Woolworths,
FreshChoice**, with SuperValue included only if you want completeness (and
flagged as near-extinct).

### Brand colours

Neither Foodstuffs nor Woolworths NZ publishes a public brand-guideline PDF I
could find. In its absence I pulled hex values directly from each chain's
**own official logo asset or live website CSS/theme metadata** — a stronger
source than a generic "brand colour" blog post, though still one step short of
an official press-kit PDF. Every value below was extracted from primary
material (not a colour-name blog), with the extraction method stated so you
can re-verify.

| Chain/Banner | Primary hex | Secondary hex | Source(s) | Confidence / notes |
|---|---|---|---|---|
| **New World** | `#E11A2C` (red) | `#231F20` (near-black), white | [Wikimedia Commons — New World (nz) Logo 10.2024.svg](https://commons.wikimedia.org/wiki/File:New_World_(nz)_Logo_10.2024.svg) — hex read directly from the SVG's `fill` attributes | Good: exact fill values from the current (Oct 2024 Foodstuffs rebrand) logo file, but it's a Wikimedia-hosted mirror, not a Foodstuffs-hosted PDF. newworld.co.nz is a client-rendered site (Next.js) so its brand CSS wasn't reachable via a plain HTTP fetch to corroborate independently — treat as good-not-certain. |
| **PAK'nSAVE** | `#FFD600` (yellow) | `#000000` (black) | [Wikimedia Commons — Pak'nSave Logo 10.2024.svg](https://commons.wikimedia.org/wiki/File:Pak'nSave_Logo_10.2024.svg) — hex read directly from SVG `fill` attributes | Good: matches the well-known "Stickman" yellow/black identity; same caveat as New World (Commons mirror, not a Foodstuffs PDF). |
| **Four Square** | `#ED1D24` (red) | `#278342` (green), `#FFD600` (yellow) | [Wikimedia Commons — Four Square (nz, North Island) Logo 10.2024.svg](https://commons.wikimedia.org/wiki/File:Four_Square_(nz,_North_Island)_Logo_10.2024.svg) and the South Island variant, same file family — hex read directly from SVG `fill` attributes; identical palette in both North and South Island logo files | Good: three-colour red/green/yellow palette corroborated independently by [Best Design Awards — Four Square](https://bestawards.co.nz/graphic/large-brand-identity/fcb-new-zealand/four-square/), which describes "the original red/yellow/green palette was reintroduced" in the brand's redesign. |
| **Woolworths NZ** | `#007837` (green) | `#125430` (darker green) | Read directly from woolworths.co.nz's own served CSS: `.btn--primary{background-color:#007837}` in the site's production stylesheet, and the page's `<meta name="theme-color" content="#076034">` tag (a very close second green) | Good: taken directly from the live official site's own CSS/meta, not a third party. Two slightly different greens exist in their CSS (#007837 for primary buttons, #125430 darker), typical of a design system with a couple of green shades — use #007837 as the single "primary" swatch. |
| **FreshChoice** | `#D8232A` (red, outer leaf) | `#9EC73D` (green, mid leaf), `#CDD936` (yellow-green, inner leaf) | Read directly from the inline SVG logo mark embedded in freshchoice.co.nz's own page HTML | Good for the logo mark itself (a 3-colour leaf icon), but note the site's own UI accent/button colour is a *different* blue (`#18A3D7`, used for `.fc-button--primary`) — for a "brand colour" that matches physical FreshChoice signage, use the leaf-mark red/green, not the website's internal UI blue. |
| **SuperValue** | `#D30C00` (red) | — | Read directly from supervalue.co.nz's own served CSS: `.sv-button--primary{background-color:#d30c00}` | Moderate: this is the site's primary-action red, a reasonable proxy for brand red, but SuperValue's own SVG logo mark uses `fill="currentcolor"` (inherits color from context) so no hex is baked into the logo file itself the way New World/PAK'nSAVE/Four Square are. Given only ~3 stores remain (see above), treat this one as lowest-priority to get pixel-perfect. |

**Before shipping**: sample actual pixels off each chain's real signage/app
icon (a screenshot + eyedropper) to sanity-check these against what shoppers
actually see in stores — none of the sources above is a formal brand-guideline
PDF with Pantone/hex specs, which neither Foodstuffs nor Woolworths NZ appears
to publish publicly.

---

## Question 2 — Google Places API as a `locations` replacement/augmentation

### (a) Which product/endpoint

Google's **legacy Places API** (the one with the classic `Nearby Search`
`GET` endpoint) is in **"Legacy" status**, one stage before Deprecated:

> "This product or feature is in Legacy status."
— [Places API (Legacy) overview](https://developers.google.com/maps/documentation/places/web-service/legacy/overview-legacy)

What "Legacy" actually means, per Google's own lifecycle policy page:

> "Existing projects already using Legacy services can continue to do so" and
> will "retain full support"... "new feature requests will only be considered
> for updated non-Legacy services"... **"legacy services are not available in
> new Cloud projects"** ... "we will provide at least a 12-month notice prior
> to the decommission of the services."
— [Google Maps Platform — Legacy products and features](https://developers.google.com/maps/legacy)

That last point matters concretely for Cartel: since this would be a **brand
new** Google Cloud project, **the legacy Nearby Search endpoint likely
wouldn't even be enablable** — new projects are pointed at the current API by
default. So this isn't just "Google recommends the new one," it's "the old
one probably isn't an option here at all."

The current, recommended product is **Places API (New)**, specifically its
**`searchNearby`** method (a `POST` to
`https://places.googleapis.com/v1/places:searchNearby`) — the direct
replacement for legacy Nearby Search, documented at
[Method: places.searchNearby](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchNearby)
with a step-by-step guide at
[Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search).
(`searchText` is the sibling method for free-text queries — not the right fit
here, since the use case is "what supermarkets are near this lat/lng," not a
text search.)

### (b) Pricing (2026)

Two structural things changed since older articles about this API were
written, both confirmed from Google's own current pricing page:

1. **The old universal $200/month credit was retired on 28 February 2025.**
   In its place, Google now gives **each SKU its own free monthly call
   allowance** instead of one shared dollar credit.
   Source: [Places API — Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
   (page states the $200 credit applied "until February 2025").

2. **Nearby Search (New) is billed per request via one of three SKUs**, chosen
   automatically by which fields you request (the `FieldMask` header) — you're
   billed at the *highest* SKU touched by any field in your request:

   | SKU | Free calls/month | Price per 1,000 calls (next tier, 5,001–100,000 or 1,001–100,000) |
   |---|---|---|
   | **Nearby Search Pro** (`99F9-A108-83A6`) | 5,000 | $32.00 |
   | Nearby Search Enterprise (`772E-9975-BE34`) | 1,000 | $35.00 |
   | Nearby Search Enterprise + Atmosphere (`F20E-7034-0EF7`) | 1,000 | $40.00 |

   Source: [Google Maps Platform — pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
   (`Nearby Search Pro`/`Nearby Search Enterprise`/`Nearby Search Enterprise +
   Atmosphere` rows, read directly from the page's pricing table).

   **Which tier applies to "name + location + maybe address"?** Per Google's
   own field-to-SKU mapping, `id`, `displayName` (name), `location`
   (lat/lng), `formattedAddress`, `types`, and `businessStatus` are all in the
   **Nearby Search Pro** tier — the cheapest of the three, with the largest
   free allowance (5,000/month). Only richer fields like `rating` and
   `userRatingCount` push a request up into the pricier Enterprise tiers.
   Source: [Place Data Fields (New)](https://developers.google.com/maps/documentation/places/web-service/data-fields).
   **So: for Cartel's actual need ("nearby supermarkets, name + location +
   address"), Nearby Search Pro is the right (and cheapest) SKU** — no need
   to request ratings/reviews/websites, which would be both unnecessary and
   more expensive.

3. **A Google Cloud billing account is required regardless of usage level** —
   even to stay inside the free monthly allowance:

   > "To begin using Google Maps Platform APIs and SDKs, first, create a new
   > Cloud project and **enable billing** in the Google Cloud console... Next,
   > enable the desired APIs... Finally, create an API key."
   — [Getting started with Google Maps Platform](https://developers.google.com/maps/get-started)
   (page dated "Last updated 2026-08-19 UTC" — current as of this research).

   A card on file is mandatory before the first call, free tier or not.

### (c) Setup and attribution requirements

- **Billing account + API key**, as above — no way around either even for
  low/free usage.
- **Attribution is required whenever Places content is shown off a Google
  Map** (which is exactly Cartel's case — a plain list/badge UI, not an
  embedded map):

  > "Attribution should take the form of the Google Maps logo whenever
  > possible. In cases where space is limited, the text **Google Maps** is
  > acceptable." ... "You don't need to add extra attribution if the Content
  > is shown on a Google Map where the attribution is already visible."
  — [Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies)

  In plain terms: since Cartel would show nearby-store names/badges without an
  actual embedded Google Map, a visible "Google Maps" logo/text credit would
  need to sit near that UI. This is a real (if small) UI-design cost, not
  optional.

### (d) Caching / storage restrictions — direct ToS conflict with the current design

This is the important one, and it's a genuine problem for the app's current
architecture. Quoting Google's **current, live** Maps Platform Service
Specific Terms (Section 14, "Places API (Legacy and New)"):

> "14.3 *Caching.* Customer may temporarily cache latitude and longitude
> values from the Places API for up to 30 consecutive calendar days, after
> which Customer must delete the cached latitude and longitude values."
— [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), §14.3.

And from Google's separate Places API policy page (last updated **2026-08-19
UTC** — essentially today):

> "You must not pre-fetch, cache, or store Places API content beyond the
> allowed exceptions, although the place_id is exempt from caching
> restrictions." ... "the place ID, used to uniquely identify a place, is
> exempt from the caching restrictions. You can therefore store place ID
> values indefinitely."
— [Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies), "Exceptions from caching restrictions."

**In plain terms, the rule is:**
- **`place_id` only** may be stored indefinitely.
- **Latitude/longitude** may be cached, but only for **30 days**, then must be
  deleted (or re-fetched to refresh the 30-day clock).
- **Everything else** — name, formatted address, business status, and any
  other Places field — **may not be cached or stored at all**, beyond what's
  needed to serve the single response that returned it.

**This directly conflicts with Cartel's current design.** The app's
`locations` table stores lat/lng and a name/address indefinitely, shared
household-wide, edited via a quorum-vote correction system — exactly the kind
of durable, shared, long-lived store that the Places API ToS forbids for
anything except the bare `place_id`. If Cartel were to *populate* `locations`
rows from Google Places data, it could legally keep the `place_id` forever,
but would need to either (a) re-fetch fresh place details from Google on
every use (defeating the purpose of a persisted table) or (b) restrict itself
to lat/lng only, refreshed at least every 30 days, with no persisted name or
address — which breaks the "search a location by name" and "user-editable
section tags on this location" features the current schema depends on.

**A workable-in-principle pattern** exists (store `place_id`s permanently,
call Place Details fresh each time a name/address is actually needed,
never persist the name/address fields), but it's a materially different and
more complex architecture than "one row per location, read straight from
Postgres" — and it still means paying for a live network call plus latency
on every read that needs a display name, not just on "find nearby."

### (e) Rough monthly cost for realistic small-app usage

Using the **Nearby Search Pro** SKU numbers from (b): **5,000 free calls per
month**, then $32.00 per additional 1,000 calls (5,001–100,000 tier). The free
allowance applies once per Cloud Billing Account per month (Google aggregates
usage across all projects under one billing account for tier calculation —
[pricing page](https://developers.google.com/maps/billing-and-pricing/pricing)).

For the brief's estimate of **500–2,000 calls/month** (a handful of
households occasionally checking "nearby stores"):

> 500–2,000 calls is entirely inside the 5,000/month free allowance.
> **Estimated cost: $0.00/month.**

For context, if usage grew well past what's realistic for this app today:

| Monthly calls | Free portion | Billable portion | Cost |
|---|---|---|---|
| 2,000 | 2,000 | 0 | $0.00 |
| 5,000 | 5,000 | 0 | $0.00 |
| 10,000 | 5,000 | 5,000 × $32/1,000 | $160.00 |
| 20,000 | 5,000 | 15,000 × $32/1,000 | $480.00 |

So cost is not the blocker for an app this size today — it would take roughly
a 3–4x jump from the low end of the estimate before the free tier is even
touched, and the marginal cost past that ($32 per extra 1,000 calls) is steep
but only relevant at a scale Cartel isn't near. The real blocker is (d), the
caching/storage ToS restriction, not price.

---

## Plain-English summary

**On the supermarket colours**: yes, this is worth doing, and the data is in
good shape. New World, PAK'nSAVE, Four Square, Woolworths (the old Countdown,
fully renamed as of December 2025), and FreshChoice are the real, currently
operating chains worth putting on the chart — I'd leave SuperValue off or
treat it as a footnote, since Woolworths has been quietly converting it to
FreshChoice and only three stores are left. One correction to flag: FreshChoice
and SuperValue are not, as assumed, a Foodstuffs South Island thing — they're
actually owned by Woolworths New Zealand. The actual brand colours (red New
World, yellow/black PAK'nSAVE, red/green/yellow Four Square, green Woolworths,
red/green FreshChoice) were pulled straight from each chain's own logo files
or live website styling, not guessed — good enough to ship, though it'd be
smart to eyeball them against a real photo of each store's signage once before
launch, since none of these companies publishes a formal brand-colour PDF.

**On switching to Google Places API**: cost is not the problem — at the
usage level this app would realistically see (a few hundred to a couple
thousand "nearby stores" checks a month), it would be completely free, well
inside Google's monthly free allowance. The problems are legal/practical
instead. First, it needs a Google Cloud billing account on file (a credit
card) even to use the free tier, and it requires showing a "Google Maps"
attribution credit somewhere in the UI, which the app doesn't need today.
Second, and more seriously: Google's terms explicitly forbid keeping the
store name, address, or other details it returns for more than the moment
you use them — you're only allowed to permanently keep an internal ID and,
separately, a location's coordinates for 30 days before you have to delete
or refresh them. That's a direct conflict with how Cartel's `locations`
table works today, where a location's name and address are entered once and
then shared and edited by a household indefinitely. Using Google Places to
*discover* new nearby stores (a one-off search) would be fine and free; using
it to *replace* the durable, editable location records the app already has
would mean either re-designing that feature around Google's rules or
re-fetching from Google every single time — both bigger changes than "swap
one data source for another." My read: it's worth it as a **discovery aid**
layered on top of the existing table (search Google once, then let the user
save what they find into Cartel's own row as they do today), not as a
wholesale replacement for it.
