-- Lovely Fit: esquema inicial. Todas las tablas con prefijo fit_ para poder
-- convivir en un proyecto existente sin chocar con otras tablas.
-- Cada fila pertenece a owner_id = auth.uid(); RLS impide ver datos ajenos.

create or replace function public.fit_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Last-write-wins: si llega una versión más vieja que la guardada, se ignora.
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner_id no se puede cambiar';
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

-- Tablas fit_* con columnas comunes, RLS por dueño, índice de sync y trigger LWW
do $$
declare
  base text := 'id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz, server_updated_at timestamptz not null default now(), ';
  r record;
begin
  for r in select * from (values
    ('fit_profiles', $c$display_name text not null default '', age_declared int, age_declared_on date, height_cm numeric, declared_weight_kg numeric, declared_weight_note text not null default '', goal_weight_kg numeric, weekly_session_goal int not null default 4, weigh_in_every_days int not null default 14, training_weekdays int[] not null default '{}', preferred_training_time text, fallback_training_time text, work_start text, work_end text, timezone text not null default 'America/Argentina/Buenos_Aires', health_notes text not null default '', weekday_step_goal int$c$),
    ('fit_exercises', $c$name text not null, "group" text not null, equipment text not null default '', instructions text not null default '', increment_kg numeric not null default 2.5, photo_id uuid, is_custom boolean not null default false$c$),
    ('fit_plans', $c$name text not null, active boolean not null default false, started_on date, notes text not null default ''$c$),
    ('fit_plan_days', $c$plan_id uuid not null, name text not null, "order" int not null default 0, weekday int, items jsonb not null default '[]'$c$),
    ('fit_sessions', $c$plan_day_id uuid, name text not null, date date not null, started_at timestamptz not null, ended_at timestamptz, status text not null check (status in ('in_progress','done','discarded')), feeling int, notes text not null default ''$c$),
    ('fit_session_exercises', $c$session_id uuid not null, exercise_id uuid not null, "order" int not null default 0, status text not null, substituted_from_id uuid, rep_min int, rep_max int, rest_sec int, minutes numeric, feel text, note text not null default ''$c$),
    ('fit_sets', $c$session_id uuid not null, session_exercise_id uuid not null, exercise_id uuid not null, "order" int not null default 0, kind text not null default 'work', weight_kg numeric, reps int, rir int, done boolean not null default false, done_at timestamptz$c$),
    ('fit_activities', $c$date date not null, type text not null, started_at timestamptz, duration_min numeric, distance_km numeric, avg_hr int, source text not null, external_id text, route jsonb, notes text not null default ''$c$),
    ('fit_meal_templates', $c$title text not null, slot text not null, kcal_normal int, notes text not null default ''$c$),
    ('fit_meals', $c$date date not null, time text, slot text not null, template_id uuid, title text not null, portion text not null, kcal_estimate int, is_free boolean not null default false, photo_id uuid, note text not null default ''$c$),
    ('fit_measurements', $c$date date not null, kind text not null check (kind in ('weight','waist')), value numeric not null check (value > 0), note text not null default '', source text not null$c$),
    ('fit_daily_metrics', $c$date date not null, kind text not null, value numeric not null check (value >= 0), source text not null, dedupe_key text not null$c$),
    ('fit_habits', $c$name text not null, target_per_day int not null default 1, active boolean not null default true$c$),
    ('fit_habit_logs', $c$habit_id uuid not null, date date not null, count int not null default 0$c$),
    ('fit_photos', $c$kind text not null, date date not null, mime text not null, width int, height int, bytes int, storage_path text, note text not null default ''$c$),
    ('fit_reminders', $c$kind text not null, label text not null, enabled boolean not null default false, time text not null, weekdays int[] not null default '{}', message text not null default ''$c$)
  ) v(t, cols) loop
    execute format('create table if not exists public.%I (%s%s)', r.t, base, r.cols);
    execute format('create index if not exists %1$s_owner_sync_idx on public.%1$I (owner_id, server_updated_at)', r.t);
    execute format('alter table public.%I enable row level security', r.t);
    execute format('drop policy if exists %I on public.%I', r.t || '_select_own', r.t);
    execute format('create policy %1$I on public.%2$I for select to authenticated using ((select auth.uid()) = owner_id)', r.t || '_select_own', r.t);
    execute format('drop policy if exists %I on public.%I', r.t || '_insert_own', r.t);
    execute format('create policy %1$I on public.%2$I for insert to authenticated with check ((select auth.uid()) = owner_id)', r.t || '_insert_own', r.t);
    execute format('drop policy if exists %I on public.%I', r.t || '_update_own', r.t);
    execute format('create policy %1$I on public.%2$I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', r.t || '_update_own', r.t);
    execute format('drop policy if exists %I on public.%I', r.t || '_delete_own', r.t);
    execute format('create policy %1$I on public.%2$I for delete to authenticated using ((select auth.uid()) = owner_id)', r.t || '_delete_own', r.t);
    execute format('drop trigger if exists %I on public.%I', r.t || '_lww', r.t);
    execute format('create trigger %1$I before insert or update on public.%2$I for each row execute function public.fit_lww()', r.t || '_lww', r.t);
  end loop;
end $$;

-- Índices de deduplicación (no únicos a propósito: si dos dispositivos importan
-- lo mismo sin conexión, un índice único trabaría la sincronización; el cliente
-- deduplica al leer).
create index if not exists fit_daily_metrics_dedupe on public.fit_daily_metrics (owner_id, dedupe_key);
create index if not exists fit_activities_external on public.fit_activities (owner_id, source, external_id);

-- Fotos: bucket privado; cada usuario solo accede a su carpeta {uid}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fit-private', 'fit-private', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "fit_photos_read_own" on storage.objects;
create policy "fit_photos_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fit_photos_insert_own" on storage.objects;
create policy "fit_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fit_photos_update_own" on storage.objects;
create policy "fit_photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fit_photos_delete_own" on storage.objects;
create policy "fit_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
