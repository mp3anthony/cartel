-- Issue #106 -- Slice 1 (Migration A). The item-name fold and the capitalise rule,
-- as two pure functions. ADDITIVE: no table, policy, trigger or existing function
-- is touched, and nothing calls these yet. Safe to apply ahead of any client.
--
-- WHAT IS ADDED
--   public.fold_item_name(text)    The one comparison key for an item name: what
--                                  counts as "the same item". Used from Migration
--                                  B (list_items) and C1/C2 (location data) on.
--   public.capitalise_first(text)  The stored spelling of an item name or Item
--                                  location label.
--
-- THE FOLD (identical in mobile/src/lib/itemName.ts; scripts/check-item-name-parity.mjs
-- runs both against supabase/tests/item_name_cases.json)
--   1 lower-case          first, so U+0130 (dotted capital I) becomes i + U+0307,
--                         which step 3 then strips
--   2 NFD
--   3 strip U+0300-U+036F combining marks (accent folding without the unaccent
--     extension: no extra dependency, exact parity with JS). The sharp s, the
--     ae ligature, o-stroke and l-stroke have no decomposition and are NOT
--     folded; the Cyrillic short i becomes plain i (its breve is a mark).
--   4 map U+2018 U+2019 U+201B U+02BC to ', U+201C U+201D U+201E to ", and the
--     en and em dash to - (iOS Smart Punctuation; D2)
--   5 collapse runs of whitespace to one space. The class is JS trim()'s set,
--     written out: Postgres btrim trims only U+0020, so btrim alone would leave
--     an NBSP that JS trims.
--   6 trim spaces
--   7 NFC
--
-- WHY set search_path = '' AND UNQUALIFIED normalize/lower/...: every function used
-- lives in pg_catalog, which is always searched, so an empty search_path closes
-- the search_path-hijack hole without qualifying anything. The functions are
-- IMMUTABLE so they can sit in the unique index Migration B builds. That is a
-- promise about the Unicode tables of the running Postgres: after a major
-- upgrade, `reindex` that index and re-run the parity script.
--
-- GRANTS: like every other function here, EXECUTE is revoked from public and anon
-- and granted to authenticated (default privileges would otherwise hand it to anon).
--
-- capitalise_first: trims with the same whitespace class, upper-cases the first
-- code point and leaves the rest exactly as typed ("iPhone cable" becomes
-- "IPhone cable"; D3). '' stays ''.
--
-- PRE-FLIGHT (read-only, supabase/checks/106_slice1_preflight_and_counts.sql): the
-- database encoding must be UTF8 (normalize() requires it).

begin;

create function public.fold_item_name(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select normalize(
    btrim(
      regexp_replace(
        translate(
          regexp_replace(normalize(lower(txt), NFD), '[̀-ͯ]', '', 'g'),
          -- From: U+2018 U+2019 U+201B U+02BC U+201C U+201D U+201E U+2013 U+2014.
          -- To:   '      '      '      '      "      "      "      -      -
          U&'\2018\2019\201B\02BC\201C\201D\201E\2013\2014',
          '''''''''"""--'
        ),
        '[\t\n\v\f\r    -     　﻿]+',
        ' ',
        'g'
      ),
      ' '
    ),
    NFC
  )
$$;

create function public.capitalise_first(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select upper(left(t.s, 1)) || substr(t.s, 2)
  from (
    select regexp_replace(
      txt,
      '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
      '',
      'g'
    ) as s
  ) t
$$;

revoke execute on function public.fold_item_name(text) from public, anon;
grant execute on function public.fold_item_name(text) to authenticated;

revoke execute on function public.capitalise_first(text) from public, anon;
grant execute on function public.capitalise_first(text) to authenticated;

commit;
