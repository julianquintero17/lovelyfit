\set ON_ERROR_STOP 1
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant usage on all sequences in schema storage to authenticated;
-- Invitaciones: u1 invitado, u2 no
insert into fit_invites (email, role) values ('u1@test.com', 'admin');
set role anon;
select 'anon_can_check_invite', fit_can_sign_in('U1@test.com') and not fit_can_sign_in('u2@test.com') as ok;
reset role;
-- u2 sin membresía no puede escribir datos
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"email":"u2@test.com"}';
select 'u2_claim_denied', fit_claim() is null as ok;
do $$ begin
  insert into fit_measurements (id, created_at, updated_at, date, kind, value, source) values (gen_random_uuid(), now(), now(), '2026-10-17', 'weight', 80, 'manual');
  raise exception 'FALLO: u2 sin membresía pudo insertar';
exception when insufficient_privilege then raise notice 'u2_without_membership_denied ok';
end $$;
-- Usuario 1 reclama su invitación e inserta
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"email":"u1@test.com"}';
select 'u1_claim_admin', fit_claim() ->> 'role' = 'admin' as ok;
select 'invite_used_once', not fit_can_sign_in('nadie@test.com') and (select count(*) from fit_invites where used_at is null) = 0 as ok;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into fit_measurements (id, created_at, updated_at, date, kind, value, source)
  values ('aaaaaaaa-0000-0000-0000-000000000001', now(), '2026-10-17T10:00:00Z', '2026-10-17', 'weight', 105.4, 'manual');
insert into fit_plan_days (id, created_at, updated_at, plan_id, name, "order", weekday, items)
  values ('aaaaaaaa-0000-0000-0000-000000000002', now(), now(), gen_random_uuid(), 'A', 0, 1, '[{"sets":3}]');
-- LWW: una escritura más vieja se ignora (upsert como lo hace supabase-js)
insert into fit_measurements (id, created_at, updated_at, date, kind, value, source)
  values ('aaaaaaaa-0000-0000-0000-000000000001', now(), '2026-10-17T09:00:00Z', '2026-10-17', 'weight', 999, 'manual')
  on conflict (id) do update set value = excluded.value, updated_at = excluded.updated_at;
select 'lww_old_ignored', value = 105.4 as ok from fit_measurements;
insert into fit_measurements (id, created_at, updated_at, date, kind, value, source)
  values ('aaaaaaaa-0000-0000-0000-000000000001', now(), '2026-10-17T11:00:00Z', '2026-10-17', 'weight', 105.0, 'manual')
  on conflict (id) do update set value = excluded.value, updated_at = excluded.updated_at;
select 'lww_new_applied', value = 105.0 as ok from fit_measurements;
insert into storage.objects (bucket_id, name) values ('fit-private', '11111111-1111-1111-1111-111111111111/foto.jpg');
-- Usuario 2 no ve nada del usuario 1
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'u2_cannot_read', count(*) = 0 as ok from fit_measurements;
select 'u2_cannot_read_photo', count(*) = 0 as ok from storage.objects;
update fit_measurements set value = 1;
select 'u2_update_noop', true as ok;
do $$ begin
  begin
    insert into fit_measurements (id, owner_id, created_at, updated_at, date, kind, value, source)
      values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', now(), now(), '2026-10-17', 'weight', 80, 'manual');
    raise exception 'FALLO: u2 pudo insertar a nombre de u1';
  exception when insufficient_privilege then raise notice 'u2_cannot_impersonate ok';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('fit-private', '11111111-1111-1111-1111-111111111111/x.jpg');
    raise exception 'FALLO: u2 pudo subir a carpeta de u1';
  exception when insufficient_privilege then raise notice 'u2_cannot_write_other_folder ok';
  end;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'u1_value_intact', value = 105.0 as ok from fit_measurements;
-- Anónimo no ve nada
reset role; set role anon;
do $$ begin
  perform 1 from fit_measurements;
  raise exception 'FALLO: anon pudo leer';
exception when insufficient_privilege then raise notice 'anon_denied ok';
end $$;
-- Ingreso desde Atajos (u1 es miembro activo)
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"email":"u1@test.com"}';
create temp table _tok as select fit_create_ingest_token() t;
reset role; grant select on _tok to anon; set role anon;
select 'ingest_ok', (fit_ingest_health((select t from _tok), current_date - 1, 8123, 410, null, 61,
  '[{"type":"Walking","start":"2026-10-16T08:10:00-03:00","minutes":42,"km":3.4}]'::jsonb) ->> 'actividades_nuevas') = '1' as ok;
select 'ingest_retry_no_dup', (fit_ingest_health((select t from _tok), current_date - 1, 9000, null, null, null,
  '[{"type":"Walking","start":"2026-10-16T08:10:00-03:00","minutes":42,"km":3.4}]'::jsonb) ->> 'actividades_nuevas') = '0' as ok;
do $$ begin
  perform fit_ingest_health('token-falso', current_date, 1);
  raise exception 'FALLO: token falso aceptado';
exception when invalid_authorization_specification then raise notice 'fake_token_rejected ok';
end $$;
do $$ begin
  perform 1 from fit_ingest_tokens;
  raise exception 'FALLO: anon leyó tokens';
exception when insufficient_privilege then raise notice 'anon_cannot_read_tokens ok';
end $$;
reset role;
select 'steps_updated_not_duplicated', (select count(*) from fit_daily_metrics where kind = 'steps' and source = 'shortcut') = 1
  and (select value from fit_daily_metrics where kind = 'steps' and source = 'shortcut') = 9000 as ok;
