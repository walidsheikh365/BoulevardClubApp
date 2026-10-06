create or replace function public.save_booking(
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
    or p_start_time < now() + interval '1 hour' or p_start_time > now() + interval '72 hours' then
    raise exception 'Bookings must start between 1 and 72 hours from now.';
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
