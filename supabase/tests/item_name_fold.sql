-- Behaviour and catalogue tests for public.fold_item_name and public.capitalise_first
-- (issue #106, Slice 1 -- migration 20261008000000_item_name_fold.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The file is wrapped in
-- `begin ... rollback` and creates nothing.
--
-- WHAT IT GUARDS. The generated block asserts every case of
-- supabase/tests/item_name_cases.json (the same table the JS twin in
-- mobile/src/lib/itemName.ts is held to by scripts/check-item-name-parity.mjs),
-- plus fold idempotence and lower(btrim(fold(x))) = fold(x) for every input. The
-- hand-written block checks NULL handling, volatility, strictness, parallel
-- safety, the pinned search_path, the grants and the database encoding.
--
-- DO NOT EDIT THE GENERATED BLOCK BY HAND. Edit the JSON, then run
-- `node scripts/check-item-name-parity.mjs --write`.
--
-- If a locale-dependent case fails (final sigma, dotted capital I, sharp s,
-- Deseret), the database's lower()/upper() disagree with JS: post the pre-flight
-- result (datlocprovider, datcollate) on #106 before changing either side.

begin;

-- GENERATED BEGIN (node scripts/check-item-name-parity.mjs --write)
do $$
declare
  v text;
  inputs text[] := array[
    'Milk',
    'milk',
    '  milk  ',
    'milk',
    'MILK',
    'milk',
    'trim  milk',
    'trim milk',
    'milk ',
    'milk',
    U&'a\0009b\000Ac',
    'a b c',
    U&'milk\00A0',
    'milk',
    U&'\FEFF\2003milk\3000',
    'milk',
    U&'Jalape\00F1o',
    'jalapeno',
    U&'Jalapen\0303o',
    'jalapeno',
    U&'Cr\00E8me Fra\00EEche',
    'creme fraiche',
    U&'\212B',
    'a',
    U&'\0130stanbul',
    'istanbul',
    U&'\0419',
    U&'\0438',
    U&'Stra\00DFe',
    U&'stra\00DFe',
    U&'\00C6ble',
    U&'\00E6ble',
    U&'\00D8l',
    U&'\00F8l',
    U&'\0141\00F3d\017A',
    U&'\0142odz',
    U&'\039F\0394\039F\03A3',
    U&'\03BF\03B4\03BF\03C2',
    U&'\D55C\AE00',
    U&'\D55C\AE00',
    U&'\+01F34E Apples',
    U&'\+01F34E apples',
    'Lee''s',
    'lee''s',
    U&'Lee\2019s',
    'lee''s',
    U&'Lee\2018s',
    'lee''s',
    U&'a\201Bb\02BCc',
    'a''b''c',
    U&'\201CHot\201D sauce',
    '"hot" sauce',
    U&'\201EHot"',
    '"hot"',
    U&'Half\2013and\2014half',
    'half-and-half',
    '',
    '',
    '   ',
    '',
    U&'\0301\0302',
    '',
    'bread',
    'mILK',
    '2 litres milk',
    'iPhone cable',
    U&'\00E9clair',
    '  bread ',
    U&'\00A0bread\00A0',
    'a  b',
    U&'\00DF',
    U&'\+01F34E apples',
    U&'\+010428x',
    '',
    '   '
  ];
begin
  if public.fold_item_name('Milk') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'plain', public.fold_item_name('Milk');
  end if;
  if public.fold_item_name('  milk  ') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'trim', public.fold_item_name('  milk  ');
  end if;
  if public.fold_item_name('MILK') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'upper', public.fold_item_name('MILK');
  end if;
  if public.fold_item_name('trim  milk') is distinct from 'trim milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'inner double space', public.fold_item_name('trim  milk');
  end if;
  if public.fold_item_name('milk ') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'trailing space', public.fold_item_name('milk ');
  end if;
  if public.fold_item_name(U&'a\0009b\000Ac') is distinct from 'a b c' then
    raise exception 'FAIL: fold_item_name case %: got %', 'tab and newline inside', public.fold_item_name(U&'a\0009b\000Ac');
  end if;
  if public.fold_item_name(U&'milk\00A0') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'trailing NBSP (JS trims it, btrim does not)', public.fold_item_name(U&'milk\00A0');
  end if;
  if public.fold_item_name(U&'\FEFF\2003milk\3000') is distinct from 'milk' then
    raise exception 'FAIL: fold_item_name case %: got %', 'ideographic space, em space, BOM at edges', public.fold_item_name(U&'\FEFF\2003milk\3000');
  end if;
  if public.fold_item_name(U&'Jalape\00F1o') is distinct from 'jalapeno' then
    raise exception 'FAIL: fold_item_name case %: got %', 'jalapeno NFC', public.fold_item_name(U&'Jalape\00F1o');
  end if;
  if public.fold_item_name(U&'Jalapen\0303o') is distinct from 'jalapeno' then
    raise exception 'FAIL: fold_item_name case %: got %', 'jalapeno NFD', public.fold_item_name(U&'Jalapen\0303o');
  end if;
  if public.fold_item_name(U&'Cr\00E8me Fra\00EEche') is distinct from 'creme fraiche' then
    raise exception 'FAIL: fold_item_name case %: got %', 'Creme Fraiche', public.fold_item_name(U&'Cr\00E8me Fra\00EEche');
  end if;
  if public.fold_item_name(U&'\212B') is distinct from 'a' then
    raise exception 'FAIL: fold_item_name case %: got %', 'A with ring (Angstrom sign)', public.fold_item_name(U&'\212B');
  end if;
  if public.fold_item_name(U&'\0130stanbul') is distinct from 'istanbul' then
    raise exception 'FAIL: fold_item_name case %: got %', 'dotted capital I: lower gives i + U+0307, stripped', public.fold_item_name(U&'\0130stanbul');
  end if;
  if public.fold_item_name(U&'\0419') is distinct from U&'\0438' then
    raise exception 'FAIL: fold_item_name case %: got %', 'short i with breve folds to plain i (documented)', public.fold_item_name(U&'\0419');
  end if;
  if public.fold_item_name(U&'Stra\00DFe') is distinct from U&'stra\00DFe' then
    raise exception 'FAIL: fold_item_name case %: got %', 'sharp s is not folded', public.fold_item_name(U&'Stra\00DFe');
  end if;
  if public.fold_item_name(U&'\00C6ble') is distinct from U&'\00E6ble' then
    raise exception 'FAIL: fold_item_name case %: got %', 'ae ligature is not folded', public.fold_item_name(U&'\00C6ble');
  end if;
  if public.fold_item_name(U&'\00D8l') is distinct from U&'\00F8l' then
    raise exception 'FAIL: fold_item_name case %: got %', 'o with stroke is not folded', public.fold_item_name(U&'\00D8l');
  end if;
  if public.fold_item_name(U&'\0141\00F3d\017A') is distinct from U&'\0142odz' then
    raise exception 'FAIL: fold_item_name case %: got %', 'l with stroke is not folded', public.fold_item_name(U&'\0141\00F3d\017A');
  end if;
  if public.fold_item_name(U&'\039F\0394\039F\03A3') is distinct from U&'\03BF\03B4\03BF\03C2' then
    raise exception 'FAIL: fold_item_name case %: got %', 'Greek final sigma', public.fold_item_name(U&'\039F\0394\039F\03A3');
  end if;
  if public.fold_item_name(U&'\D55C\AE00') is distinct from U&'\D55C\AE00' then
    raise exception 'FAIL: fold_item_name case %: got %', 'Hangul survives NFD then NFC', public.fold_item_name(U&'\D55C\AE00');
  end if;
  if public.fold_item_name(U&'\+01F34E Apples') is distinct from U&'\+01F34E apples' then
    raise exception 'FAIL: fold_item_name case %: got %', 'emoji', public.fold_item_name(U&'\+01F34E Apples');
  end if;
  if public.fold_item_name('Lee''s') is distinct from 'lee''s' then
    raise exception 'FAIL: fold_item_name case %: got %', 'straight apostrophe', public.fold_item_name('Lee''s');
  end if;
  if public.fold_item_name(U&'Lee\2019s') is distinct from 'lee''s' then
    raise exception 'FAIL: fold_item_name case %: got %', 'right single quote', public.fold_item_name(U&'Lee\2019s');
  end if;
  if public.fold_item_name(U&'Lee\2018s') is distinct from 'lee''s' then
    raise exception 'FAIL: fold_item_name case %: got %', 'left single quote', public.fold_item_name(U&'Lee\2018s');
  end if;
  if public.fold_item_name(U&'a\201Bb\02BCc') is distinct from 'a''b''c' then
    raise exception 'FAIL: fold_item_name case %: got %', 'reversed and modifier apostrophes', public.fold_item_name(U&'a\201Bb\02BCc');
  end if;
  if public.fold_item_name(U&'\201CHot\201D sauce') is distinct from '"hot" sauce' then
    raise exception 'FAIL: fold_item_name case %: got %', 'curly double quotes', public.fold_item_name(U&'\201CHot\201D sauce');
  end if;
  if public.fold_item_name(U&'\201EHot"') is distinct from '"hot"' then
    raise exception 'FAIL: fold_item_name case %: got %', 'low double quote', public.fold_item_name(U&'\201EHot"');
  end if;
  if public.fold_item_name(U&'Half\2013and\2014half') is distinct from 'half-and-half' then
    raise exception 'FAIL: fold_item_name case %: got %', 'en and em dash', public.fold_item_name(U&'Half\2013and\2014half');
  end if;
  if public.fold_item_name('') is distinct from '' then
    raise exception 'FAIL: fold_item_name case %: got %', 'empty', public.fold_item_name('');
  end if;
  if public.fold_item_name('   ') is distinct from '' then
    raise exception 'FAIL: fold_item_name case %: got %', 'spaces only', public.fold_item_name('   ');
  end if;
  if public.fold_item_name(U&'\0301\0302') is distinct from '' then
    raise exception 'FAIL: fold_item_name case %: got %', 'only combining marks', public.fold_item_name(U&'\0301\0302');
  end if;
  if public.capitalise_first('bread') is distinct from 'Bread' then
    raise exception 'FAIL: capitalise_first case %: got %', 'plain', public.capitalise_first('bread');
  end if;
  if public.capitalise_first('mILK') is distinct from 'MILK' then
    raise exception 'FAIL: capitalise_first case %: got %', 'rest as typed', public.capitalise_first('mILK');
  end if;
  if public.capitalise_first('2 litres milk') is distinct from '2 litres milk' then
    raise exception 'FAIL: capitalise_first case %: got %', 'digit first is unchanged', public.capitalise_first('2 litres milk');
  end if;
  if public.capitalise_first('iPhone cable') is distinct from 'IPhone cable' then
    raise exception 'FAIL: capitalise_first case %: got %', 'first character only (documented, D3)', public.capitalise_first('iPhone cable');
  end if;
  if public.capitalise_first(U&'\00E9clair') is distinct from U&'\00C9clair' then
    raise exception 'FAIL: capitalise_first case %: got %', 'accented first letter', public.capitalise_first(U&'\00E9clair');
  end if;
  if public.capitalise_first('  bread ') is distinct from 'Bread' then
    raise exception 'FAIL: capitalise_first case %: got %', 'trims first', public.capitalise_first('  bread ');
  end if;
  if public.capitalise_first(U&'\00A0bread\00A0') is distinct from 'Bread' then
    raise exception 'FAIL: capitalise_first case %: got %', 'trims NBSP too', public.capitalise_first(U&'\00A0bread\00A0');
  end if;
  if public.capitalise_first('a  b') is distinct from 'A  b' then
    raise exception 'FAIL: capitalise_first case %: got %', 'inner spaces kept', public.capitalise_first('a  b');
  end if;
  if public.capitalise_first(U&'\00DF') is distinct from 'SS' then
    raise exception 'FAIL: capitalise_first case %: got %', 'sharp s upper-cases to SS', public.capitalise_first(U&'\00DF');
  end if;
  if public.capitalise_first(U&'\+01F34E apples') is distinct from U&'\+01F34E apples' then
    raise exception 'FAIL: capitalise_first case %: got %', 'emoji first is unchanged', public.capitalise_first(U&'\+01F34E apples');
  end if;
  if public.capitalise_first(U&'\+010428x') is distinct from U&'\+010400x' then
    raise exception 'FAIL: capitalise_first case %: got %', 'astral letter (Deseret) is one code point', public.capitalise_first(U&'\+010428x');
  end if;
  if public.capitalise_first('') is distinct from '' then
    raise exception 'FAIL: capitalise_first case %: got %', 'empty', public.capitalise_first('');
  end if;
  if public.capitalise_first('   ') is distinct from '' then
    raise exception 'FAIL: capitalise_first case %: got %', 'spaces only', public.capitalise_first('   ');
  end if;
  foreach v in array inputs loop
    if public.fold_item_name(public.fold_item_name(v)) is distinct from public.fold_item_name(v) then
      raise exception 'FAIL: fold_item_name is not idempotent for %', v;
    end if;
    if lower(btrim(public.fold_item_name(v))) is distinct from public.fold_item_name(v) then
      raise exception 'FAIL: lower(btrim(fold_item_name(x))) differs from fold_item_name(x) for %', v;
    end if;
  end loop;
end $$;
-- GENERATED END

do $$
declare
  fold_oid  oid := 'public.fold_item_name(text)'::regprocedure;
  cap_oid   oid := 'public.capitalise_first(text)'::regprocedure;
  fn        oid;
begin
  if current_setting('server_encoding') <> 'UTF8' then
    raise exception 'FAIL: server_encoding is %, normalize() needs UTF8', current_setting('server_encoding');
  end if;

  if public.fold_item_name(null) is not null or public.capitalise_first(null) is not null then
    raise exception 'FAIL: the functions must return NULL for NULL (strict)';
  end if;

  foreach fn in array array[fold_oid, cap_oid] loop
    if (select provolatile from pg_proc where oid = fn) <> 'i' then
      raise exception 'FAIL: % must be immutable', fn::regprocedure;
    end if;
    if not (select proisstrict from pg_proc where oid = fn) then
      raise exception 'FAIL: % must be strict', fn::regprocedure;
    end if;
    if (select proparallel from pg_proc where oid = fn) <> 's' then
      raise exception 'FAIL: % must be parallel safe', fn::regprocedure;
    end if;
    if not coalesce((select 'search_path=""' = any (proconfig) from pg_proc where oid = fn), false) then
      raise exception 'FAIL: % must pin search_path to the empty string', fn::regprocedure;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'FAIL: anon may execute %', fn::regprocedure;
    end if;
    if exists (
      select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = fn and a.grantee = 0
    ) then
      raise exception 'FAIL: public may execute %', fn::regprocedure;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'FAIL: authenticated may not execute %', fn::regprocedure;
    end if;
  end loop;

  if (select count(*) from pg_proc where proname in ('fold_item_name', 'capitalise_first')
        and pronamespace = 'public'::regnamespace) <> 2 then
    raise exception 'FAIL: each function must have exactly one overload (PGRST203)';
  end if;
end $$;

rollback;
