-- Ingreso de datos de Apple Salud vía Atajos, sin abrir la app.
-- El Atajo llama a fit_ingest_health con un token personal (solo puede ESCRIBIR métricas
-- del dueño del token; nunca leer). Se guarda solo el hash del token.

create table if not exists public.fit_ingest_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.fit_ingest_tokens enable row level security; -- sin políticas: solo vía funciones

create or replace function public.fit_create_ingest_token() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null or not public.fit_is_active() then raise exception 'sin acceso'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.fit_ingest_tokens (user_id, token_hash, created_at, last_used_at)
  values (auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now(), null)
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return v_token;
end $$;

create or replace function public.fit_revoke_ingest_token() returns void
language sql volatile security definer set search_path = '' as $$
  update public.fit_ingest_tokens set token_hash = null where user_id = auth.uid()
$$;

create or replace function public.fit_ingest_token_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('active', token_hash is not null, 'created_at', created_at, 'last_used_at', last_used_at)
  from public.fit_ingest_tokens where user_id = auth.uid()
$$;

create or replace function public.fit_ingest_health(
  p_token text, p_day date,
  p_steps numeric default null, p_active_kcal numeric default null,
  p_exercise_min numeric default null, p_resting_hr numeric default null,
  p_workouts jsonb default '[]'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid; v_kind text; v_val numeric; v_max numeric; v_key text; v_n int := 0;
  v_w jsonb; v_start timestamptz; v_ext text; v_type text; v_acts int := 0;
begin
  select t.user_id into v_uid from public.fit_ingest_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_uid is null then raise exception 'token inválido' using errcode = '28000'; end if;
  if not exists (select 1 from public.fit_members m where m.user_id = v_uid and m.status = 'active') then
    raise exception 'acceso pausado' using errcode = '28000';
  end if;
  if p_day is null or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1 or p_day < date '2020-01-01' then
    raise exception 'fecha inválida';
  end if;

  foreach v_kind in array array['steps','active_kcal','exercise_min','resting_hr'] loop
    v_val := (case v_kind when 'steps' then p_steps when 'active_kcal' then p_active_kcal when 'exercise_min' then p_exercise_min else p_resting_hr end);
    continue when v_val is null;
    v_max := (case v_kind when 'steps' then 100000 when 'active_kcal' then 10000 when 'exercise_min' then 1440 else 250 end);
    if v_val < 0 or v_val > v_max then raise exception 'valor fuera de rango: %', v_kind; end if;
    v_val := round(v_val);
    v_key := p_day::text || '|' || v_kind || '|shortcut';
    update public.fit_daily_metrics set value = v_val, updated_at = now()
     where owner_id = v_uid and dedupe_key = v_key and deleted_at is null and value <> v_val;
    if not exists (select 1 from public.fit_daily_metrics where owner_id = v_uid and dedupe_key = v_key and deleted_at is null) then
      insert into public.fit_daily_metrics (id, owner_id, created_at, updated_at, date, kind, value, source, dedupe_key)
      values (gen_random_uuid(), v_uid, now(), now(), p_day, v_kind, v_val, 'shortcut', v_key);
    end if;
    v_n := v_n + 1;
  end loop;

  for v_w in select * from jsonb_array_elements(coalesce(p_workouts, '[]'::jsonb)) limit 20 loop
    v_start := nullif(v_w ->> 'start', '')::timestamptz;
    continue when v_start is null;
    v_type := (case lower(coalesce(v_w ->> 'type', ''))
      when 'walking' then 'caminata' when 'caminata' then 'caminata' when 'hiking' then 'caminata'
      when 'running' then 'carrera' when 'carrera' then 'carrera'
      when 'cycling' then 'bicicleta' when 'ciclismo' then 'bicicleta' when 'bicicleta' then 'bicicleta'
      else 'otro' end);
    v_ext := 'health:' || to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || ':' || coalesce(v_w ->> 'type', '');
    if not exists (select 1 from public.fit_activities where owner_id = v_uid and source = 'shortcut' and external_id = v_ext and deleted_at is null) then
      insert into public.fit_activities (id, owner_id, created_at, updated_at, date, type, started_at, duration_min, distance_km, avg_hr, source, external_id, route, notes)
      values (gen_random_uuid(), v_uid, now(), now(), (v_start at time zone 'America/Argentina/Buenos_Aires')::date, v_type, v_start,
              least(greatest(nullif(v_w ->> 'minutes', '')::numeric, 0), 1440),
              least(greatest(nullif(v_w ->> 'km', '')::numeric, 0), 500),
              nullif(v_w ->> 'avg_hr', '')::int, 'shortcut', v_ext, null, coalesce(v_w ->> 'type', ''));
      v_acts := v_acts + 1;
    end if;
  end loop;

  update public.fit_ingest_tokens set last_used_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true, 'metricas', v_n, 'actividades_nuevas', v_acts);
end $$;

revoke execute on function public.fit_create_ingest_token(), public.fit_revoke_ingest_token(), public.fit_ingest_token_status() from public, anon;
grant execute on function public.fit_create_ingest_token(), public.fit_revoke_ingest_token(), public.fit_ingest_token_status() to authenticated;
revoke execute on function public.fit_ingest_health(text, date, numeric, numeric, numeric, numeric, jsonb) from public;
grant execute on function public.fit_ingest_health(text, date, numeric, numeric, numeric, numeric, jsonb) to anon, authenticated;
