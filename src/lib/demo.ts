import { addDays, clubDate, endTime, slotTime } from "./rules";
import type { Booking, ClubData } from "./types";

export const DEMO_KEY = "boulevard-demo-v1";
export function createDemoData(now = new Date()): ClubData {
  const today = clubDate(now);
  const profiles: ClubData["profiles"] = [
    { id: "demo-walid", full_name: "Walid Sheikh", role: "admin", is_active: true },
    { id: "demo-manager", full_name: "Ghulam Rasool", role: "facility_manager", is_active: true },
    { id: "demo-sara", full_name: "Sara", role: "family_member", is_active: true },
    { id: "demo-ali", full_name: "Ali", role: "family_member", is_active: true },
    { id: "demo-omar", full_name: "Omar", role: "family_member", is_active: true }
  ];
  const facilities: ClubData["facilities"] = [
    { id: "10000000-0000-4000-8000-000000000001", name: "Padel Court 1", sport: "padel", is_active: true },
    { id: "10000000-0000-4000-8000-000000000002", name: "Padel Court 2", sport: "padel", is_active: true },
    { id: "10000000-0000-4000-8000-000000000003", name: "Football Field", sport: "football", is_active: true }
  ];
  const booking = (id: string, facility: number, member: number, date: string, minute: number): Booking => ({
    id, facility_id: facilities[facility].id, created_by: profiles[member].id,
    responsible_member_id: profiles[member].id, start_time: slotTime(date, minute),
    end_time: endTime(slotTime(date, minute)), status: "confirmed",
    guest_notes: member === 3 ? "2 guests joining" : "", created_at: now.toISOString(), updated_at: now.toISOString()
  });
  return {
    profiles, facilities,
    bookings: [
      booking("demo-b1", 0, 2, today, 1050),
      booking("demo-b2", 1, 3, today, 1140),
      booking("demo-b3", 2, 4, today, 960),
      booking("demo-b4", 0, 0, addDays(today, 1), 1140)
    ],
    booking_players: [{ booking_id: "demo-b1", user_id: "demo-ali" }, { booking_id: "demo-b4", user_id: "demo-omar" }],
    facility_blocks: [], audit_logs: []
  };
}

export function loadDemo(): ClubData {
  const saved = localStorage.getItem(DEMO_KEY);
  if (!saved) return createDemoData();
  const data: unknown = JSON.parse(saved);
  if (!isClubData(data)) throw new Error("Saved demo data is invalid. Use Reset demo to restore the sample.");
  return data;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function hasStrings(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === "string");
}
function isClubData(value: unknown): value is ClubData {
  if (!isRecord(value)) return false;
  const shapes = {
    profiles: ["id", "full_name", "role"],
    facilities: ["id", "name", "sport"],
    bookings: ["id", "facility_id", "created_by", "responsible_member_id", "start_time", "end_time", "status", "guest_notes", "created_at", "updated_at"],
    booking_players: ["booking_id", "user_id"],
    facility_blocks: ["id", "facility_id", "created_by", "start_time", "end_time", "reason"],
    audit_logs: ["id", "action_by", "action_type", "details", "created_at"]
  };
  if (!Object.entries(shapes).every(([key, fields]) => Array.isArray(value[key]) && value[key].every((item: unknown) => hasStrings(item, fields)))) return false;
  const profiles = value.profiles as Record<string, unknown>[];
  const facilities = value.facilities as Record<string, unknown>[];
  const bookings = value.bookings as Record<string, unknown>[];
  return profiles.every((p) => typeof p.is_active === "boolean" && ["admin", "facility_manager", "family_member"].includes(String(p.role)))
    && facilities.every((f) => typeof f.is_active === "boolean" && ["padel", "football"].includes(String(f.sport)))
    && bookings.every((b) => ["confirmed", "cancelled"].includes(String(b.status))
      && Number.isFinite(Date.parse(String(b.start_time))) && Number.isFinite(Date.parse(String(b.end_time))));
}
