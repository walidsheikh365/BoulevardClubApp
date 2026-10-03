begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 1 and 100),
  role text not null default 'family_member' check (role in ('admin', 'facility_manager', 'family_member')),
  is_active boolean not null default true
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sport text not null check (sport in ('padel', 'football')),
  is_active boolean not null default true
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  created_by uuid not null references public.profiles(id),
  responsible_member_id uuid not null references public.profiles(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  guest_notes text not null default '' check (char_length(guest_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  local_day date generated always as ((start_time at time zone 'Asia/Karachi')::date) stored,
  is_premium boolean generated always as (
    (start_time at time zone 'Asia/Karachi')::time in ('17:30'::time, '19:00'::time, '20:30'::time)
  ) stored,
  constraint fixed_duration check (end_time = start_time + interval '90 minutes'),
  constraint fixed_slot_grid check (
    (start_time at time zone 'Asia/Karachi')::time in
    ('08:30'::time, '10:00'::time, '11:30'::time, '13:00'::time, '14:30'::time,
     '16:00'::time, '17:30'::time, '19:00'::time, '20:30'::time, '22:00'::time)
  )
);

-- Aligned, fixed-duration slots cannot overlap unless their start times match.
create unique index one_booking_per_slot on public.bookings (facility_id, start_time) where status = 'confirmed';
create unique index one_daily_premium on public.bookings (responsible_member_id, local_day)
  where status = 'confirmed' and is_premium;
create index bookings_start on public.bookings (start_time);

create table public.booking_players (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  primary key (booking_id, user_id)
);

create table public.facility_blocks (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  created_by uuid not null references public.profiles(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text not null check (char_length(reason) between 1 and 300),
  check (end_time > start_time)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action_by uuid not null references public.profiles(id),
  action_type text not null,
  details text not null,
  created_at timestamptz not null default now()
);

insert into public.facilities (id, name, sport) values
  ('10000000-0000-4000-8000-000000000001', 'Padel Court 1', 'padel'),
  ('10000000-0000-4000-8000-000000000002', 'Padel Court 2', 'padel'),
  ('10000000-0000-4000-8000-000000000003', 'Football Field', 'football');

create function public.active_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create function public.handle_invited_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.invited_at is not null then
    insert into public.profiles(id, full_name)
    values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)), 100));
  end if;
  return new;
end;
$$;
create trigger create_invited_profile after insert on auth.users
for each row execute function public.handle_invited_user();

alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_players enable row level security;
alter table public.facility_blocks enable row level security;
alter table public.audit_logs enable row level security;

create policy read_profiles on public.profiles for select to authenticated using (
  public.active_role() is not null or id = auth.uid()
);
create policy read_facilities on public.facilities for select to authenticated using (
  public.active_role() is not null and (is_active or public.active_role() in ('admin', 'facility_manager'))
);
create policy read_bookings on public.bookings for select to authenticated using (
  public.active_role() is not null and exists (select 1 from public.facilities f where f.id = facility_id)
);
create policy read_players on public.booking_players for select to authenticated using (
  public.active_role() is not null and exists (select 1 from public.bookings b where b.id = booking_id)
);
create policy read_blocks on public.facility_blocks for select to authenticated using (
  public.active_role() is not null and exists (select 1 from public.facilities f where f.id = facility_id)
);
create policy read_audit on public.audit_logs for select to authenticated using (public.active_role() = 'admin');

revoke all on public.profiles, public.facilities, public.bookings, public.booking_players, public.facility_blocks, public.audit_logs
  from anon, authenticated;
grant select on public.profiles, public.facilities, public.bookings, public.booking_players, public.facility_blocks, public.audit_logs
  to authenticated;
grant all on public.profiles, public.facilities, public.bookings, public.booking_players, public.facility_blocks, public.audit_logs
  to service_role;

create function public.save_booking(
  p_id uuid,
  p_facility_id uuid,
  p_responsible_member_id uuid,
  p_start_time timestamptz,
  p_guest_notes text,
  p_player_ids uuid[],
  p_attendance_confirmed boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text;
  v_existing public.bookings;
  v_id uuid;
  v_end timestamptz := p_start_time + interval '90 minutes';
  v_local time := (p_start_time at time zone 'Asia/Karachi')::time;
  v_before jsonb;
begin
  -- One shared transaction lock also serializes maintenance, deactivation and cancellation.
  perform pg_advisory_xact_lock(8642026);
  v_role := public.active_role();
  if v_role is null then raise exception 'An active, invited account is required.'; end if;
  if p_attendance_confirmed is distinct from true then
    raise exception 'Confirm attendance for the entire session.';
  end if;
  if not exists (select 1 from public.facilities where id = p_facility_id and is_active) then
    raise exception 'This facility is not available for bookings.';
  end if;
  if not exists (select 1 from public.profiles where id = p_responsible_member_id and is_active) then
    raise exception 'Choose an active responsible member.';
  end if;
  if v_role = 'family_member' and p_responsible_member_id <> auth.uid() then
    raise exception 'Book in your own name. You must attend the whole session.';
  end if;
  if p_start_time is null or not isfinite(p_start_time)
    or p_start_time < now() + interval '2 hours' or p_start_time > now() + interval '72 hours' then
    raise exception 'Bookings must start between 2 and 72 hours from now.';
  end if;
  if v_local not in ('08:30'::time, '10:00'::time, '11:30'::time, '13:00'::time, '14:30'::time,
    '16:00'::time, '17:30'::time, '19:00'::time, '20:30'::time, '22:00'::time) then
    raise exception 'Choose a fixed 90-minute slot between 8:30 am and 11:30 pm.';
  end if;
  if p_guest_notes is null or char_length(p_guest_notes) > 500 then
    raise exception 'Keep guest notes to 500 characters.';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) > 30 or exists (
    select 1 from unnest(p_player_ids) player
    where not exists (select 1 from public.profiles where id = player and is_active)
  ) then raise exception 'Choose up to 30 active family members.'; end if;

  if p_id is not null then
    select * into v_existing from public.bookings where id = p_id for update;
    if not found then raise exception 'Booking not found.'; end if;
    if v_role = 'family_member' and v_existing.responsible_member_id <> auth.uid() then
      raise exception 'You can only change your own bookings.';
    end if;
    if v_existing.status <> 'confirmed' or v_existing.end_time <= now() then
      raise exception 'Cancelled or completed bookings cannot be changed.';
    end if;
    if v_role = 'family_member' and v_existing.start_time < now() + interval '2 hours' then
      raise exception 'Within 2 hours of play, contact the manager to change or cancel.';
    end if;
    v_before := to_jsonb(v_existing) || jsonb_build_object('player_ids',
      (select coalesce(jsonb_agg(user_id), '[]'::jsonb) from public.booking_players where booking_id = p_id));
  end if;

  if exists (select 1 from public.bookings where facility_id = p_facility_id and status = 'confirmed'
    and id is distinct from p_id and start_time < v_end and end_time > p_start_time) then
    raise exception 'That slot has just been booked. Please choose another.';
  end if;
  if exists (select 1 from public.facility_blocks where facility_id = p_facility_id
    and start_time < v_end and end_time > p_start_time) then
    raise exception 'This slot is reserved for maintenance or a club event.';
  end if;
  if v_local in ('17:30'::time, '19:00'::time, '20:30'::time) and exists (
    select 1 from public.bookings where responsible_member_id = p_responsible_member_id and status = 'confirmed'
    and id is distinct from p_id and is_premium and local_day = (p_start_time at time zone 'Asia/Karachi')::date
  ) then raise exception 'One premium booking per member per day, across all facilities.'; end if;

  if p_id is null then
    insert into public.bookings (facility_id, created_by, responsible_member_id, start_time, end_time, guest_notes)
    values (p_facility_id, auth.uid(), p_responsible_member_id, p_start_time, v_end, p_guest_notes) returning id into v_id;
  else
    update public.bookings set facility_id = p_facility_id, responsible_member_id = p_responsible_member_id,
      start_time = p_start_time, end_time = v_end, guest_notes = p_guest_notes, updated_at = now()
    where id = p_id returning id into v_id;
    delete from public.booking_players where booking_id = v_id;
  end if;
  insert into public.booking_players (booking_id, user_id)
    select v_id, player from (select distinct unnest(p_player_ids) as player) players;
  insert into public.audit_logs(action_by, action_type, details)
  values (auth.uid(), case when p_id is null then 'BOOKING_CREATED' else 'BOOKING_UPDATED' end,
    jsonb_build_object('booking_id', v_id, 'before', v_before, 'after',
      jsonb_build_object('facility_id', p_facility_id, 'responsible_member_id', p_responsible_member_id,
        'start_time', p_start_time, 'end_time', v_end, 'guest_notes', p_guest_notes,
        'player_ids', p_player_ids, 'attendance_confirmed', true))::text);
  return v_id;
end;
$$;

create function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_booking public.bookings;
begin
  perform pg_advisory_xact_lock(8642026);
  v_role := public.active_role();
  if v_role is null then raise exception 'An active, invited account is required.'; end if;
  select * into v_booking from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if v_role = 'family_member' and v_booking.responsible_member_id <> auth.uid() then
    raise exception 'You can only cancel your own bookings.';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.end_time <= now() then
    raise exception 'Cancelled or completed bookings cannot be changed.';
  end if;
  if v_role = 'family_member' and v_booking.start_time < now() + interval '2 hours' then
    raise exception 'Within 2 hours of play, contact the manager to change or cancel.';
  end if;
  update public.bookings set status = 'cancelled', updated_at = now() where id = p_id;
  insert into public.audit_logs(action_by, action_type, details)
    values (auth.uid(), 'BOOKING_CANCELLED', to_jsonb(v_booking)::text);
end;
$$;

create function public.set_facility_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(8642026);
  if public.active_role() is distinct from 'admin' then raise exception 'Admin access is required.'; end if;
  if p_active is null then raise exception 'Choose an active state.'; end if;
  if not p_active and exists (select 1 from public.bookings where facility_id = p_id and status = 'confirmed' and end_time > now()) then
    raise exception 'Cancel upcoming bookings before deactivating this facility.';
  end if;
  update public.facilities set is_active = p_active where id = p_id;
  if not found then raise exception 'Facility not found.'; end if;
  insert into public.audit_logs(action_by, action_type, details)
    values (auth.uid(), 'FACILITY_UPDATED', jsonb_build_object('facility_id', p_id, 'is_active', p_active)::text);
end;
$$;

create function public.set_member_access(p_id uuid, p_active boolean, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(8642026);
  if public.active_role() is distinct from 'admin' then raise exception 'Admin access is required.'; end if;
  if p_id = auth.uid() then raise exception 'Another admin must change your access.'; end if;
  if p_active is null or p_role is null or p_role not in ('admin', 'facility_manager', 'family_member') then
    raise exception 'Choose a valid role and active state.';
  end if;
  if not p_active and exists (select 1 from public.bookings where responsible_member_id = p_id and status = 'confirmed' and end_time > now()) then
    raise exception 'Cancel this member''s upcoming bookings before deactivating their account.';
  end if;
  update public.profiles set role = p_role, is_active = p_active where id = p_id;
  if not found then raise exception 'Member not found.'; end if;
  insert into public.audit_logs(action_by, action_type, details)
    values (auth.uid(), 'MEMBER_UPDATED', jsonb_build_object('member_id', p_id, 'role', p_role, 'is_active', p_active)::text);
end;
$$;

create function public.add_facility_block(p_facility_id uuid, p_start_time timestamptz, p_end_time timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(8642026);
  if public.active_role() is distinct from 'admin' then raise exception 'Admin access is required.'; end if;
  if p_start_time is null or p_end_time is null or not isfinite(p_start_time) or not isfinite(p_end_time)
    or p_end_time <= p_start_time or p_end_time <= now() or p_reason is null or char_length(trim(p_reason)) not between 1 and 300 then
    raise exception 'Provide a valid future block and a reason (up to 300 characters).';
  end if;
  if not exists (select 1 from public.facilities where id = p_facility_id) then raise exception 'Facility not found.'; end if;
  if exists (select 1 from public.bookings where facility_id = p_facility_id and status = 'confirmed'
    and start_time < p_end_time and end_time > p_start_time) then
    raise exception 'Cancel overlapping bookings before adding a maintenance block.';
  end if;
  if exists (select 1 from public.facility_blocks where facility_id = p_facility_id
    and start_time < p_end_time and end_time > p_start_time) then
    raise exception 'This period already has a maintenance block.';
  end if;
  insert into public.facility_blocks(facility_id, created_by, start_time, end_time, reason)
    values (p_facility_id, auth.uid(), p_start_time, p_end_time, trim(p_reason)) returning id into v_id;
  insert into public.audit_logs(action_by, action_type, details)
    values (auth.uid(), 'BLOCK_CREATED', jsonb_build_object('block_id', v_id, 'facility_id', p_facility_id,
      'start_time', p_start_time, 'end_time', p_end_time, 'reason', p_reason)::text);
  return v_id;
end;
$$;

create function public.remove_facility_block(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_block public.facility_blocks;
begin
  perform pg_advisory_xact_lock(8642026);
  if public.active_role() is distinct from 'admin' then raise exception 'Admin access is required.'; end if;
  delete from public.facility_blocks where id = p_id returning * into v_block;
  if not found then raise exception 'Maintenance block not found.'; end if;
  insert into public.audit_logs(action_by, action_type, details)
    values (auth.uid(), 'BLOCK_REMOVED', to_jsonb(v_block)::text);
end;
$$;

revoke execute on function public.active_role(), public.handle_invited_user(),
  public.save_booking(uuid, uuid, uuid, timestamptz, text, uuid[], boolean),
  public.cancel_booking(uuid), public.set_facility_active(uuid, boolean),
  public.set_member_access(uuid, boolean, text),
  public.add_facility_block(uuid, timestamptz, timestamptz, text), public.remove_facility_block(uuid)
  from public, anon;
grant execute on function public.active_role(),
  public.save_booking(uuid, uuid, uuid, timestamptz, text, uuid[], boolean),
  public.cancel_booking(uuid), public.set_facility_active(uuid, boolean),
  public.set_member_access(uuid, boolean, text),
  public.add_facility_block(uuid, timestamptz, timestamptz, text), public.remove_facility_block(uuid)
  to authenticated;

alter table public.profiles replica identity full;
alter table public.facilities replica identity full;
alter table public.bookings replica identity full;
alter table public.booking_players replica identity full;
alter table public.facility_blocks replica identity full;
alter publication supabase_realtime add table public.profiles, public.facilities, public.bookings, public.booking_players, public.facility_blocks;

commit;
