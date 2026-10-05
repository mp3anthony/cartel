-- #107 (slice S2, Migration A): seed the Christchurch Store catalog. Data only.
--
-- Purpose: public.locations becomes a curated catalog instead of free-text
-- creation. This migration is the additive half: it renames/relocates the three
-- production rows that Ant confirmed match catalog stores, and inserts the other
-- 49 catalog stores. It changes no schema, grants or policies.
--
--   * Matched rows are UPDATED in place by their existing id, so every FK that
--     points at them (lists.location_id, location_items, location_checkoffs,
--     shop_sessions) stays valid and no shop history moves or cascades:
--       f2bbd013-... 'Woolworths Papanui'   -> 'Woolworths Northlands'
--       d53f3384-... "Pak'nsave Papanui"    -> 'PAK''nSAVE Papanui'
--       bd56e348-... 'New World South City' -> 'New World Durham Street'
--   * created_by is NULL for seeded rows: a migration runs without an auth.uid().
--     The column is nullable (on delete set null) and is never read back to clients.
--   * Source of truth: supabase/seed/store-catalog-christchurch.csv (the ids below
--     are that file's id column). Coordinates are OpenStreetMap-derived; attribution
--     "Contains data from OpenStreetMap contributors, ODbL 1.0" and provenance are in
--     docs/research/christchurch-store-catalog-sources.md.
--   * Migration B (locking RLS so clients can no longer insert locations) comes
--     later and is NOT part of this file. Until it lands, the free-text creation
--     path still works, which is why this half is safe to apply before the
--     frontend ships.
--
-- A trailing commented ROLLBACK block restores the pre-flight state.

-- Guard: the production table must hold exactly the three pre-flight rows. If
-- anyone created a store since pre-flight, abort rather than seed on top of it.
do $$
declare
  expected uuid[] := array[
    'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3',
    'd53f3384-f6b2-4462-886e-b38b36fe16b7',
    'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a'
  ]::uuid[];
  actual uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into actual from public.locations;
  if actual <> (select array_agg(e order by e) from unnest(expected) e) then
    raise exception 'store catalog seed: public.locations is not exactly the three pre-flight rows (found % rows); re-run pre-flight', coalesce(array_length(actual, 1), 0);
  end if;
end $$;

-- Matched rows, updated in place by id.
do $$
declare n integer;
begin
  update public.locations
     set name = 'New World Durham Street', lat = -43.538731, lng = 172.633136, chain = 'new_world'
   where id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'store catalog seed: expected to update exactly 1 row for bd56e348-c0ad-4fea-ae37-c333ea6ccf1a, updated %', n;
  end if;
end $$;

do $$
declare n integer;
begin
  update public.locations
     set name = 'Woolworths Northlands', lat = -43.491464, lng = 172.611749, chain = 'woolworths'
   where id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'store catalog seed: expected to update exactly 1 row for f2bbd013-791d-4acc-88d7-fa4ec8fc24d3, updated %', n;
  end if;
end $$;

do $$
declare n integer;
begin
  update public.locations
     set name = 'PAK''nSAVE Papanui', lat = -43.485578, lng = 172.614722, chain = 'paknsave'
   where id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'store catalog seed: expected to update exactly 1 row for d53f3384-f6b2-4462-886e-b38b36fe16b7, updated %', n;
  end if;
end $$;

-- The remaining 49 catalog stores.
insert into public.locations (id, name, lat, lng, chain) values
  ('9c84b704-0748-4a5e-952f-48e0eb66a81a', 'New World Bishopdale', -43.488450, 172.587207, 'new_world'),
  ('6bb56ca9-1edc-4a84-96d5-faa65d44ee64', 'New World Fendalton', -43.517932, 172.588375, 'new_world'),
  ('0e301330-0676-4974-8985-b5b9ad27d13a', 'New World Ferry Road', -43.549017, 172.683999, 'new_world'),
  ('a84cfc4d-20ba-47cd-8927-36ab2ba9e310', 'New World Halswell', -43.580634, 172.565907, 'new_world'),
  ('bd01d060-8e6a-417f-9ce9-976233235df0', 'New World Ilam', -43.525919, 172.569816, 'new_world'),
  ('3951956d-a970-4dd9-bdec-77d722734e8d', 'New World Kaiapoi', -43.382302, 172.659995, 'new_world'),
  ('9fd99f4b-05ea-403d-a173-d01a8d2a628e', 'New World Lincoln', -43.642172, 172.473748, 'new_world'),
  ('2eab12ae-5a9f-42f7-aa38-32e5d2d3d926', 'New World Northwood', -43.459648, 172.622380, 'new_world'),
  ('3f531d3e-3b24-4391-ac1f-f5b2f9177b9a', 'New World Prestons', -43.475142, 172.662021, 'new_world'),
  ('c62cb794-a69b-4f97-a474-7cccfa15c0dd', 'New World Rangiora', -43.302577, 172.594722, 'new_world'),
  ('f5186406-0930-48c3-9ed4-935bf2badaf6', 'New World Ravenswood', -43.307212, 172.671774, 'new_world'),
  ('7a2f7f25-54fb-4bd6-9f79-787948bbd256', 'New World Rolleston', -43.596763, 172.382424, 'new_world'),
  ('131fbedf-671b-4fc1-8547-5f25f08b73a9', 'New World St Martins', -43.557536, 172.654764, 'new_world'),
  ('4aaddfc8-4c67-4cd0-bcaf-a6fd139fd0a0', 'New World Stanmore', -43.520181, 172.656980, 'new_world'),
  ('bacc92da-d4ea-42b3-a3d4-be1a4d730d7e', 'New World Wigram', -43.552696, 172.557495, 'new_world'),
  ('ef7bd175-7de9-4377-aa48-fd6ea745d66f', 'PAK''nSAVE Hornby', -43.542793, 172.523177, 'paknsave'),
  ('82bc0410-af65-4463-9e29-464ffbccb77a', 'PAK''nSAVE Moorhouse', -43.539026, 172.638327, 'paknsave'),
  ('4cd8975a-08ab-4a65-84a3-e4d0bb5a07e2', 'PAK''nSAVE Rangiora', -43.324790, 172.600528, 'paknsave'),
  ('6f8b6e54-8a3b-4bc2-b49f-97b27147d70e', 'PAK''nSAVE Riccarton', -43.531177, 172.596227, 'paknsave'),
  ('2a3b53af-e1a0-41cc-af36-054f50e06873', 'PAK''nSAVE Rolleston', -43.597481, 172.396498, 'paknsave'),
  ('1acebb64-8eae-4817-a313-6d4b34d16a3d', 'PAK''nSAVE Wainoni', -43.512855, 172.693245, 'paknsave'),
  ('61c84168-8c77-4ae3-8da9-ee07791ef7f9', 'Four Square West Melton', -43.523235, 172.370412, 'four_square'),
  ('d8f2476b-7be1-4757-a6aa-b404647f109e', 'Four Square Diamond Harbour', -43.628392, 172.724461, 'four_square'),
  ('1dfdc309-1f68-42ea-9b22-41a43a23dd74', 'FreshChoice Barrington', -43.555765, 172.620604, 'freshchoice'),
  ('ae9f5939-bf95-4b61-a0ad-da880f5f5c40', 'FreshChoice City Market', -43.533957, 172.637828, 'freshchoice'),
  ('c3aca7a9-10eb-42e9-aa7b-d8a18c0f3574', 'FreshChoice Edgeware', -43.513208, 172.636812, 'freshchoice'),
  ('373edbbb-2a13-4858-8602-73881e57db1b', 'FreshChoice Fendalton', -43.509513, 172.590280, 'freshchoice'),
  ('19ab1888-e72c-4406-9d40-6b93d378c197', 'FreshChoice Lyttelton', -43.602858, 172.721529, 'freshchoice'),
  ('2e92e488-260f-42d1-aef7-90a1c51ba804', 'FreshChoice Mandeville', -43.380118, 172.536215, 'freshchoice'),
  ('0cb85dac-5263-4b2b-ac68-f701201b7be6', 'FreshChoice Merivale', -43.512655, 172.621299, 'freshchoice'),
  ('d2f0d9b6-083e-430c-9ea9-9caf871612ed', 'FreshChoice Parklands', -43.481239, 172.706116, 'freshchoice'),
  ('1734e746-407f-49ce-911c-88e9af70cc67', 'FreshChoice Prebbleton', -43.581752, 172.513762, 'freshchoice'),
  ('f00920c7-7039-4467-92f8-ccffd8d2ecce', 'FreshChoice Sumner', -43.569594, 172.760172, 'freshchoice'),
  ('d5aac658-6a0e-471b-9a0b-9d1ec6d6f5c1', 'Woolworths Avonhead', -43.511173, 172.557275, 'woolworths'),
  ('ea2fbb5e-a556-4a09-9160-d53c130ac33f', 'Woolworths Belfast', -43.447751, 172.628349, 'woolworths'),
  ('4582d085-50a8-4323-92fb-e3b7a95b0b30', 'Woolworths Christchurch Airport', -43.489861, 172.547710, 'woolworths'),
  ('7448ae95-15cf-4990-9ab1-e6fad301237b', 'Woolworths Church Corner', -43.532760, 172.573075, 'woolworths'),
  ('687e7f7d-02d0-4ceb-847c-0919d8bd5e43', 'Woolworths Colombo St', -43.553326, 172.635601, 'woolworths'),
  ('e9f698ca-91cc-45c2-9003-ee5674edf528', 'Woolworths Eastgate', -43.532451, 172.675585, 'woolworths'),
  ('f55ddf53-1f40-4295-9c5a-c7833e6ac9d1', 'Woolworths Ferrymead', -43.556825, 172.702514, 'woolworths'),
  ('c95899c6-d066-41ca-ad79-8c660e8f3c96', 'Woolworths Halswell', -43.568202, 172.578691, 'woolworths'),
  ('182b30f6-ee3f-4392-8953-137b7a6c47e0', 'Woolworths Hornby', -43.542764, 172.526909, 'woolworths'),
  ('0368ba6a-133c-49ea-b5b3-bec61f1047b6', 'Woolworths Kaiapoi', -43.385925, 172.657796, 'woolworths'),
  ('9759856c-d591-400c-bc6b-ca7e659d3357', 'Woolworths Moorhouse Ave', -43.538771, 172.641768, 'woolworths'),
  ('39b5a8aa-9349-4f07-9510-98fe71494662', 'Woolworths New Brighton', -43.506816, 172.729992, 'woolworths'),
  ('daa5aecc-487b-49b4-b3fd-533669217fd9', 'Woolworths Rangiora East', -43.307383, 172.598870, 'woolworths'),
  ('a36bdff7-9704-4191-a734-54398f7413d1', 'Woolworths Rolleston', -43.594157, 172.386640, 'woolworths'),
  ('0ed04cf4-84ea-427c-aebc-20d02d23f86e', 'Woolworths The Palms', -43.505450, 172.664377, 'woolworths'),
  ('269ef71f-a980-4e8d-a412-da2efe463c41', 'Woolworths Waimakariri Junction', -43.376384, 172.649449, 'woolworths');

-- ---------------------------------------------------------------------------
-- ROLLBACK (commented; run by hand only if Ant asks). Restores pre-flight state.
-- ---------------------------------------------------------------------------
-- (i) Stop if anything references a seeded (non-matched) store: deleting it would
--     cascade-delete location_items / location_checkoffs / shop_sessions rows. If
--     the count is above zero, stop and ask Ant instead of deleting.
--
-- do $$
-- declare
--   seeded uuid[] := array[
--     '9c84b704-0748-4a5e-952f-48e0eb66a81a',
--     '6bb56ca9-1edc-4a84-96d5-faa65d44ee64',
--     '0e301330-0676-4974-8985-b5b9ad27d13a',
--     'a84cfc4d-20ba-47cd-8927-36ab2ba9e310',
--     'bd01d060-8e6a-417f-9ce9-976233235df0',
--     '3951956d-a970-4dd9-bdec-77d722734e8d',
--     '9fd99f4b-05ea-403d-a173-d01a8d2a628e',
--     '2eab12ae-5a9f-42f7-aa38-32e5d2d3d926',
--     '3f531d3e-3b24-4391-ac1f-f5b2f9177b9a',
--     'c62cb794-a69b-4f97-a474-7cccfa15c0dd',
--     'f5186406-0930-48c3-9ed4-935bf2badaf6',
--     '7a2f7f25-54fb-4bd6-9f79-787948bbd256',
--     '131fbedf-671b-4fc1-8547-5f25f08b73a9',
--     '4aaddfc8-4c67-4cd0-bcaf-a6fd139fd0a0',
--     'bacc92da-d4ea-42b3-a3d4-be1a4d730d7e',
--     'ef7bd175-7de9-4377-aa48-fd6ea745d66f',
--     '82bc0410-af65-4463-9e29-464ffbccb77a',
--     '4cd8975a-08ab-4a65-84a3-e4d0bb5a07e2',
--     '6f8b6e54-8a3b-4bc2-b49f-97b27147d70e',
--     '2a3b53af-e1a0-41cc-af36-054f50e06873',
--     '1acebb64-8eae-4817-a313-6d4b34d16a3d',
--     '61c84168-8c77-4ae3-8da9-ee07791ef7f9',
--     'd8f2476b-7be1-4757-a6aa-b404647f109e',
--     '1dfdc309-1f68-42ea-9b22-41a43a23dd74',
--     'ae9f5939-bf95-4b61-a0ad-da880f5f5c40',
--     'c3aca7a9-10eb-42e9-aa7b-d8a18c0f3574',
--     '373edbbb-2a13-4858-8602-73881e57db1b',
--     '19ab1888-e72c-4406-9d40-6b93d378c197',
--     '2e92e488-260f-42d1-aef7-90a1c51ba804',
--     '0cb85dac-5263-4b2b-ac68-f701201b7be6',
--     'd2f0d9b6-083e-430c-9ea9-9caf871612ed',
--     '1734e746-407f-49ce-911c-88e9af70cc67',
--     'f00920c7-7039-4467-92f8-ccffd8d2ecce',
--     'd5aac658-6a0e-471b-9a0b-9d1ec6d6f5c1',
--     'ea2fbb5e-a556-4a09-9160-d53c130ac33f',
--     '4582d085-50a8-4323-92fb-e3b7a95b0b30',
--     '7448ae95-15cf-4990-9ab1-e6fad301237b',
--     '687e7f7d-02d0-4ceb-847c-0919d8bd5e43',
--     'e9f698ca-91cc-45c2-9003-ee5674edf528',
--     'f55ddf53-1f40-4295-9c5a-c7833e6ac9d1',
--     'c95899c6-d066-41ca-ad79-8c660e8f3c96',
--     '182b30f6-ee3f-4392-8953-137b7a6c47e0',
--     '0368ba6a-133c-49ea-b5b3-bec61f1047b6',
--     '9759856c-d591-400c-bc6b-ca7e659d3357',
--     '39b5a8aa-9349-4f07-9510-98fe71494662',
--     'daa5aecc-487b-49b4-b3fd-533669217fd9',
--     'a36bdff7-9704-4191-a734-54398f7413d1',
--     '0ed04cf4-84ea-427c-aebc-20d02d23f86e',
--     '269ef71f-a980-4e8d-a412-da2efe463c41'
--   ]::uuid[];
--   refs integer;
-- begin
--   select (select count(*) from public.lists where location_id = any (seeded))
--        + (select count(*) from public.location_items where location_id = any (seeded))
--        + (select count(*) from public.location_checkoffs where location_id = any (seeded))
--        + (select count(*) from public.shop_sessions where location_id = any (seeded))
--     into refs;
--   if refs > 0 then
--     raise exception 'rollback blocked: % rows reference seeded stores; ask Ant (cascades would delete shop history)', refs;
--   end if;
--   -- (ii) delete the seeded rows
--   delete from public.locations where id = any (seeded);
-- end $$;
--
-- (iii) restore the three pre-flight rows by id
-- update public.locations set name = 'Woolworths Papanui', lat = -43.4937355189184, lng = 172.61032240631, chain = 'woolworths'
--  where id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3';
-- update public.locations set name = 'Pak''nsave Papanui', lat = -43.4858055, lng = 172.6153195, chain = 'paknsave'
--  where id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7';
-- update public.locations set name = 'New World South City', lat = -43.5393609200078, lng = 172.632806925264, chain = 'new_world'
--  where id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a';
