-- Acceso por invitación: miembros (admin/member) y datos fit_* solo con membresía activa.
-- Las invitaciones usadas se marcan (used_at) en lugar de borrarse.

create table if not exists public.fit_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member')),
  status text not null default 'active' check (status in ('active','disabled')),
  plan text not null default 'personal', -- reservado para suscripciones futuras
  created_at timestamptz not null default now()
);
create table if not exists public.fit_invites (
  email text primary key check (email = lower(email)),
  role text not null default 'member' check (role in ('admin','member')),
  profile jsonb, -- datos iniciales opcionales del perfil (nunca en el repo)
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.fit_members enable row level security;
alter table public.fit_invites enable row level security;

create or replace function public.fit_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fit_members m where m.user_id = auth.uid() and m.status = 'active')
$$;
create or replace function public.fit_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fit_members m where m.user_id = auth.uid() and m.status = 'active' and m.role = 'admin')
$$;
create or replace function public.fit_can_sign_in(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fit_invites i where i.email = lower(trim(p_email)) and i.used_at is null)
      or exists (select 1 from public.fit_members m where lower(m.email) = lower(trim(p_email)) and m.status = 'active')
$$;
create or replace function public.fit_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() #>> '{email}');
  v_inv public.fit_invites;
  v_mem public.fit_members;
begin
  if v_uid is null then return null; end if;
  select * into v_mem from public.fit_members where user_id = v_uid;
  if found then
    return jsonb_build_object('role', v_mem.role, 'status', v_mem.status, 'plan', v_mem.plan, 'profile', null);
  end if;
  select * into v_inv from public.fit_invites where email = v_email and used_at is null;
  if not found then return null; end if;
  insert into public.fit_members (user_id, email, role) values (v_uid, v_email, v_inv.role);
  update public.fit_invites set used_at = now() where email = v_email;
  return jsonb_build_object('role', v_inv.role, 'status', 'active', 'plan', 'personal', 'profile', v_inv.profile);
end $$;

revoke execute on function public.fit_is_active(), public.fit_is_admin(), public.fit_claim() from public, anon;
grant execute on function public.fit_is_active(), public.fit_is_admin(), public.fit_claim() to authenticated;
revoke execute on function public.fit_can_sign_in(text) from public;
grant execute on function public.fit_can_sign_in(text) to anon, authenticated;

create policy fit_members_select on public.fit_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fit_is_admin()));
create policy fit_members_update_admin on public.fit_members for update to authenticated
  using ((select public.fit_is_admin())) with check ((select public.fit_is_admin()));
create policy fit_invites_admin_select on public.fit_invites for select to authenticated using ((select public.fit_is_admin()));
create policy fit_invites_admin_insert on public.fit_invites for insert to authenticated with check ((select public.fit_is_admin()));
create policy fit_invites_admin_delete on public.fit_invites for delete to authenticated using ((select public.fit_is_admin()));

do $$
declare t text;
begin
  foreach t in array array['fit_profiles','fit_exercises','fit_plans','fit_plan_days','fit_sessions','fit_session_exercises','fit_sets','fit_activities','fit_meal_templates','fit_meals','fit_measurements','fit_daily_metrics','fit_habits','fit_habit_logs','fit_photos','fit_reminders'] loop
    execute format('alter policy %I on public.%I using ((select auth.uid()) = owner_id and (select public.fit_is_active()))', t || '_select_own', t);
    execute format('alter policy %I on public.%I with check ((select auth.uid()) = owner_id and (select public.fit_is_active()))', t || '_insert_own', t);
    execute format('alter policy %I on public.%I using ((select auth.uid()) = owner_id and (select public.fit_is_active())) with check ((select auth.uid()) = owner_id)', t || '_update_own', t);
    execute format('alter policy %I on public.%I using ((select auth.uid()) = owner_id and (select public.fit_is_active()))', t || '_delete_own', t);
  end loop;
end $$;
alter policy "fit_photos_read_own" on storage.objects using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.fit_is_active()));
alter policy "fit_photos_insert_own" on storage.objects with check (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.fit_is_active()));
alter policy "fit_photos_update_own" on storage.objects using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.fit_is_active()));
alter policy "fit_photos_delete_own" on storage.objects using (bucket_id = 'fit-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.fit_is_active()));

-- Primer admin (ejecutar a mano, con tu email):
-- insert into public.fit_invites (email, role) values ('tu@email.com', 'admin');
