import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, clubDate, slotTime } from "../src/lib/rules";

const ids = {
  admin: "20000000-0000-4000-8000-000000000001",
  manager: "20000000-0000-4000-8000-000000000002",
  alice: "20000000-0000-4000-8000-000000000003",
  bob: "20000000-0000-4000-8000-000000000004",
  outsider: "20000000-0000-4000-8000-000000000005",
  court: "10000000-0000-4000-8000-000000000001",
  otherCourt: "10000000-0000-4000-8000-000000000002"
};
const tomorrow = addDays(clubDate(), 1);
let db: PGlite;
async function asUser(id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}
async function save({
  id = null as string | null, facility = ids.court, responsible = ids.alice,
  start = slotTime(tomorrow, 870), players = [] as string[], attendance = true
} = {}) {
  return db.query<{ save_booking: string }>("select public.save_booking($1,$2,$3,$4,$5,$6,$7)",
    [id, facility, responsible, start, "", players, attendance]);
}
async function create(options?: Parameters<typeof save>[0]) {
  const result = await save(options);
  return result.rows[0].save_booking;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, invited_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/001_club.sql", import.meta.url), "utf8"));
  for (const [name, id] of Object.entries(ids).filter(([key]) => !["court", "otherCourt"].includes(key))) {
    await db.query("insert into auth.users(id,email,invited_at,raw_user_meta_data) values ($1,$2,$3,$4)",
      [id, `${name}@example.com`, name === "outsider" ? null : new Date().toISOString(), JSON.stringify({ full_name: name })]);
  }
  await db.query("update public.profiles set role = 'admin' where id = $1", [ids.admin]);
  await db.query("update public.profiles set role = 'facility_manager' where id = $1", [ids.manager]);
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.bookings, public.booking_players, public.facility_blocks, public.audit_logs; update public.facilities set is_active = true; update public.profiles set is_active = true;");
  await asUser(ids.alice);
});
afterAll(async () => { await db?.close(); });

describe("actual PostgreSQL migration and booking RPCs", () => {
  it("creates a 90-minute booking, deduplicated players and an immutable audit", async () => {
    const id = await create({ players: [ids.bob, ids.bob] });
    const result = await db.query<{ minutes: number }>("select extract(epoch from (end_time-start_time))/60 as minutes from public.bookings where id=$1", [id]);
    expect(Number(result.rows[0].minutes)).toBe(90);
    expect((await db.query("select * from public.booking_players")).rows).toHaveLength(1);
    await asUser(ids.admin);
    expect((await db.query("select * from public.audit_logs")).rows).toHaveLength(1);
    await expect(db.exec("delete from public.audit_logs")).rejects.toThrow(/permission denied/);
  });
  it("rejects windows below 2 and above 72 hours for members AND admins", async () => {
    for (const actor of [ids.alice, ids.admin]) {
      await asUser(actor);
      await expect(save({ start: new Date(Date.now() + 3_600_000).toISOString() })).rejects.toThrow(/between 2 and 72/);
      await expect(save({ start: new Date(Date.now() + 73 * 3_600_000).toISOString() })).rejects.toThrow(/between 2 and 72/);
    }
  });
  it("accepts the exact inclusive window endpoints before applying the independent slot-grid rule", async () => {
    for (const hours of [2, 72]) {
      // An arbitrary transaction start is off-grid; reaching that error proves the endpoint passed the window check.
      await db.exec(`do $$
        begin
          perform public.save_booking(null, '${ids.court}', '${ids.alice}', now() + interval '${hours} hours', '', '{}', true);
        exception when raise_exception then
          if sqlerrm not like 'Choose a fixed 90-minute slot%' then raise; end if;
        end;
      $$;`);
    }
    for (const interval of ["2 hours - 1 millisecond", "72 hours 1 millisecond"]) {
      await expect(db.exec(`select public.save_booking(null, '${ids.court}', '${ids.alice}', now() + interval '${interval}', '', '{}', true)`)).rejects.toThrow(/between 2 and 72/);
    }
  });
  it.each([510, 600, 690, 780, 870, 960, 1050, 1140, 1230, 1320])("accepts scheduled start minute %i", async (minute) => {
    expect(await create({ start: slotTime(tomorrow, minute) })).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("rejects off-grid and fractional starts", async () => {
    await expect(save({ start: slotTime(tomorrow, 900) })).rejects.toThrow(/fixed 90/);
    await expect(save({ start: slotTime(tomorrow, 870).replace(".000Z", ".001Z") })).rejects.toThrow(/fixed 90/);
  });
  it("does not trust a caller-supplied responsible member or missing attendance", async () => {
    await expect(save({ responsible: ids.bob })).rejects.toThrow(/own name/);
    await expect(save({ attendance: false })).rejects.toThrow(/Confirm attendance/);
    await expect(save({ players: [ids.outsider] })).rejects.toThrow(/active family/);
  });
  it("rejects duplicate simultaneous submissions with exactly one stored booking", async () => {
    const results = await Promise.allSettled([save(), save()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.query("select * from public.bookings")).rows).toHaveLength(1);
  });
  it("enforces one premium across all courts and all three premium start times", async () => {
    const first = await create({ start: slotTime(tomorrow, 1050) });
    await expect(save({ facility: ids.otherCourt, start: slotTime(tomorrow, 1140) })).rejects.toThrow(/One premium/);
    await asUser(ids.manager);
    await expect(save({ facility: ids.otherCourt, start: slotTime(tomorrow, 1230) })).rejects.toThrow(/One premium/);
    await db.query("select public.cancel_booking($1)", [first]);
    expect(await create({ facility: ids.otherCourt, start: slotTime(tomorrow, 1230) })).toBeTruthy();
  });
  it("updates atomically without counting the existing premium twice", async () => {
    const id = await create({ start: slotTime(tomorrow, 1050) });
    expect(await create({ id, start: slotTime(tomorrow, 1230), players: [ids.bob] })).toBe(id);
    expect((await db.query("select * from public.bookings")).rows).toHaveLength(1);
    await expect(save({ id, start: slotTime(tomorrow, 900) })).rejects.toThrow(/fixed/);
    const remaining = await db.query<{ start_time: Date }>("select start_time from public.bookings where id=$1", [id]);
    expect(new Date(remaining.rows[0].start_time).toISOString()).toBe(slotTime(tomorrow, 1230));
  });
  it("allows the responsible member to manage a staff-created booking, not another member", async () => {
    await asUser(ids.manager);
    const id = await create();
    await asUser(ids.bob);
    await expect(save({ id, responsible: ids.bob })).rejects.toThrow(/own bookings/);
    await expect(db.query("select public.cancel_booking($1)", [id])).rejects.toThrow(/own bookings/);
    await asUser(ids.alice);
    await db.query("select public.cancel_booking($1)", [id]);
    expect(await create()).toBeTruthy();
  });
  it("honours the two-hour member cutoff but allows manager cancellation", async () => {
    await db.exec("reset role");
    const day = clubDate();
    const starts = [510, 600, 690, 780, 870, 960, 1050, 1140, 1230, 1320].map((minute) => slotTime(day, minute));
    const imminent = starts.find((start) => Date.parse(start) > Date.now() && Date.parse(start) < Date.now() + 2 * 3_600_000);
    if (!imminent) {
      // Between closing and opening there is no legal imminent slot; test an ongoing previous slot instead.
      const last = [...starts].reverse().find((start) => Date.parse(start) <= Date.now()) ?? slotTime(addDays(day, -1), 1320);
      await db.query("insert into public.bookings(facility_id,created_by,responsible_member_id,start_time,end_time) values ($1,$2,$2,$3,$3::timestamptz+interval '90 minutes')", [ids.court, ids.alice, last]);
    } else {
      await db.query("insert into public.bookings(facility_id,created_by,responsible_member_id,start_time,end_time) values ($1,$2,$2,$3,$3::timestamptz+interval '90 minutes')", [ids.court, ids.alice, imminent]);
    }
    const { rows } = await db.query<{ id: string; end_time: Date }>("select id,end_time from public.bookings");
    await asUser(ids.alice);
    await expect(db.query("select public.cancel_booking($1)", [rows[0].id])).rejects.toThrow(/Within 2 hours|completed/);
    await asUser(ids.manager);
    if (new Date(rows[0].end_time) > new Date()) await db.query("select public.cancel_booking($1)", [rows[0].id]);
    else await expect(db.query("select public.cancel_booking($1)", [rows[0].id])).rejects.toThrow(/completed/);
  });
  it("prevents both maintenance-on-booking and booking-on-maintenance conflicts", async () => {
    const id = await create();
    await asUser(ids.admin);
    const args = [ids.court, slotTime(tomorrow, 880), slotTime(tomorrow, 920), "Care"];
    await expect(db.query("select public.add_facility_block($1,$2,$3,$4)", args)).rejects.toThrow(/Cancel overlapping/);
    await db.query("select public.cancel_booking($1)", [id]);
    const result = await db.query<{ add_facility_block: string }>("select public.add_facility_block($1,$2,$3,$4)", args);
    await asUser(ids.alice);
    await expect(save()).rejects.toThrow(/maintenance/);
    await expect(db.query("select public.remove_facility_block($1)", [result.rows[0].add_facility_block])).rejects.toThrow(/Admin/);
    await asUser(ids.admin);
    await db.query("select public.remove_facility_block($1)", [result.rows[0].add_facility_block]);
    expect(await create()).toBeTruthy();
  });
});
describe("invite-only access and visibility", () => {
  it("creates profiles only for invited users and blocks unapproved authenticated users", async () => {
    await db.exec("reset role");
    expect((await db.query("select * from public.profiles where id=$1", [ids.outsider])).rows).toHaveLength(0);
    await asUser(ids.outsider);
    expect((await db.query("select * from public.bookings")).rows).toHaveLength(0);
    expect((await db.query("select * from public.facilities")).rows).toHaveLength(0);
    await expect(save()).rejects.toThrow(/invited/);
  });
  it("blocks anonymous reads and RPC execution", async () => {
    await asUser("", "anon");
    await expect(db.exec("select * from public.facilities")).rejects.toThrow(/permission denied/);
    await expect(save()).rejects.toThrow(/permission denied/);
  });
  it("blocks all direct client writes, even as admin", async () => {
    for (const actor of [ids.alice, ids.admin]) {
      await asUser(actor);
      await expect(db.exec("update public.profiles set role='admin'")).rejects.toThrow(/permission denied/);
      await expect(db.exec("delete from public.bookings")).rejects.toThrow(/permission denied/);
      await expect(db.exec("delete from public.facility_blocks")).rejects.toThrow(/permission denied/);
    }
  });
  it("hides inactive facilities and denies their bookings", async () => {
    await asUser(ids.admin);
    await db.query("select public.set_facility_active($1,false)", [ids.court]);
    await asUser(ids.alice);
    expect((await db.query("select * from public.facilities where id=$1", [ids.court])).rows).toHaveLength(0);
    await expect(save()).rejects.toThrow(/not available/);
  });
  it("does not strand future bookings by disabling a facility or member", async () => {
    await create();
    await asUser(ids.admin);
    await expect(db.query("select public.set_facility_active($1,false)", [ids.court])).rejects.toThrow(/Cancel upcoming/);
    await expect(db.query("select public.set_member_access($1,false,'family_member')", [ids.alice])).rejects.toThrow(/upcoming bookings/);
    await expect(db.query("select public.set_member_access($1,false,'family_member')", [ids.admin])).rejects.toThrow(/Another admin/);
  });
  it("blocks inactive accounts from reading club data or writing via RPC", async () => {
    await asUser(ids.admin);
    await db.query("select public.set_member_access($1,false,'family_member')", [ids.alice]);
    await asUser(ids.alice);
    expect((await db.query("select * from public.facilities")).rows).toHaveLength(0);
    await expect(save()).rejects.toThrow(/active, invited/);
  });
});
