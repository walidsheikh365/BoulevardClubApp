import { describe, expect, it } from "vitest";
import { createDemoData } from "../src/lib/demo";
import {
  addDays, changeReason, clubDate, endTime, formatTime, isPremium, overlaps,
  scheduleText, slotsForDay, slotTime, validateBooking, windowReason
} from "../src/lib/rules";
import type { Booking, BookingInput } from "../src/lib/types";

const now = new Date("2026-10-03T06:30:00.000Z"); // 11:30 am PKT
const data = () => ({ ...createDemoData(now), bookings: [], booking_players: [] });
const user = createDemoData(now).profiles[2];
const input = (overrides: Partial<BookingInput> = {}): BookingInput => ({
  facility_id: data().facilities[0].id, responsible_member_id: user.id,
  start_time: slotTime("2026-10-03", 870), player_ids: [], guest_notes: "", attendance_confirmed: true, ...overrides
});
const booking = (overrides: Partial<Booking> = {}): Booking => ({
  ...input(), id: "booking-1", created_by: user.id, end_time: endTime(input().start_time),
  status: "confirmed", created_at: now.toISOString(), updated_at: now.toISOString(), ...overrides
});
describe("rolling 1–72 hour booking window", () => {
  it.each([
    [-1, false], [0, false], [3_600_000 - 1, false], [3_600_000, true],
    [3_600_000 + 1, true], [72 * 3_600_000 - 1, true], [72 * 3_600_000, true], [72 * 3_600_000 + 1, false]
  ])("enforces the exact boundary at offset %i ms", (offset, allowed) => {
    expect(windowReason(new Date(now.getTime() + offset).toISOString(), now) === null).toBe(allowed);
  });
  it("rejects invalid date input explicitly", () => expect(windowReason("bad", now)).toMatch(/valid/));
});
describe("club time and slot grid", () => {
  it("generates exactly 10 adjacent 90-minute sessions", () => {
    const slots = slotsForDay("2026-10-03");
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe("2026-10-03T03:30:00.000Z");
    expect(endTime(slots[9])).toBe("2026-10-03T18:30:00.000Z");
    slots.slice(1).forEach((slot, i) => expect(endTime(slots[i])).toBe(slot));
  });
  it("has precisely the three agreed premium slots", () => {
    expect(slotsForDay("2026-10-03").filter(isPremium).map(formatTime)).toEqual(["5:30 pm", "7:00 pm", "8:30 pm"]);
  });
  it("uses the Pakistan calendar day across midnight and month boundaries", () => {
    expect(clubDate("2026-10-03T19:00:00Z")).toBe("2026-10-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("treats adjacent bookings as non-overlapping", () => {
    expect(overlaps(slotTime("2026-10-03", 870), slotTime("2026-10-03", 960), slotTime("2026-10-03", 960), slotTime("2026-10-03", 1050))).toBe(false);
  });
  it.each([510, 600, 690, 780, 870, 960, 1050, 1140, 1230, 1320])("accepts fixed start minute %i", (minute) => {
    expect(validateBooking(input({ start_time: slotTime("2026-10-04", minute) }), data(), user, now)).toBeNull();
  });
  it.each([500, 520, 1350, 1410])("rejects off-grid start minute %i", (minute) => {
    expect(validateBooking(input({ start_time: slotTime("2026-10-04", minute) }), data(), user, now)).toMatch(/fixed/);
  });
});
describe("responsibility, conflicts and premium allowance", () => {
  it("requires an active member and an attendance acknowledgement", () => {
    expect(validateBooking(input({ attendance_confirmed: false }), data(), user, now)).toMatch(/Confirm/);
    expect(validateBooking(input(), data(), { ...user, is_active: false }, now)).toMatch(/inactive/);
  });
  it("prevents members booking for someone else but allows staff", () => {
    const other = input({ responsible_member_id: "demo-ali" });
    expect(validateBooking(other, data(), user, now)).toMatch(/own name/);
    expect(validateBooking(other, data(), data().profiles[1], now)).toBeNull();
  });
  it("rejects inactive facilities and players", () => {
    const snapshot = data();
    snapshot.facilities[0].is_active = false;
    expect(validateBooking(input(), snapshot, user, now)).toMatch(/facility/);
    expect(validateBooking(input({ player_ids: ["missing"] }), data(), user, now)).toMatch(/active family/);
  });
  it("blocks overlapping bookings but releases cancelled slots", () => {
    const snapshot = { ...data(), bookings: [booking()] };
    expect(validateBooking(input(), snapshot, user, now)).toMatch(/just been booked/);
    snapshot.bookings[0].status = "cancelled";
    expect(validateBooking(input(), snapshot, user, now)).toBeNull();
  });
  it("blocks maintenance overlap including partial slots", () => {
    const snapshot = { ...data(), facility_blocks: [{ id: "block", facility_id: input().facility_id, created_by: "demo-walid", start_time: slotTime("2026-10-03", 900), end_time: slotTime("2026-10-03", 920), reason: "Care" }] };
    expect(validateBooking(input(), snapshot, user, now)).toMatch(/maintenance/);
  });
  it("limits the responsible member to one premium booking across facilities, not each time band", () => {
    const snapshot = { ...data(), bookings: [booking({ start_time: slotTime("2026-10-03", 1050), end_time: slotTime("2026-10-03", 1140) })] };
    const second = input({ facility_id: data().facilities[1].id, start_time: slotTime("2026-10-03", 1230) });
    expect(validateBooking(second, snapshot, user, now)).toMatch(/One premium/);
    expect(validateBooking(second, snapshot, snapshot.profiles[1], now)).toMatch(/One premium/);
    expect(validateBooking({ ...second, start_time: slotTime("2026-10-04", 1230) }, snapshot, user, now)).toBeNull();
    snapshot.bookings[0].status = "cancelled";
    expect(validateBooking(second, snapshot, user, now)).toBeNull();
  });
  it("allows moving your existing premium booking without counting it twice", () => {
    const snapshot = { ...data(), bookings: [booking({ start_time: slotTime("2026-10-03", 1050), end_time: slotTime("2026-10-03", 1140) })] };
    expect(validateBooking(input({ id: "booking-1", start_time: slotTime("2026-10-03", 1230) }), snapshot, user, now)).toBeNull();
  });
  it("allows multiple non-premium bookings", () => {
    expect(validateBooking(input({ start_time: slotTime("2026-10-03", 960) }), { ...data(), bookings: [booking()] }, user, now)).toBeNull();
  });
});
describe("changes and schedule", () => {
  it("accepts cancellation exactly 2 hours ahead and rejects one millisecond later", () => {
    const start = new Date(now.getTime() + 2 * 3_600_000).toISOString();
    const b = booking({ start_time: start, end_time: endTime(start) });
    expect(changeReason(b, user, now)).toBeNull();
    expect(changeReason(b, user, new Date(now.getTime() + 1))).toMatch(/Within 2 hours/);
    expect(changeReason(b, data().profiles[1], new Date(now.getTime() + 1))).toBeNull();
  });
  it("lets the responsible member manage bookings made on their behalf", () => {
    expect(changeReason(booking({ created_by: "demo-manager" }), user, now)).toBeNull();
    expect(changeReason(booking(), data().profiles[3], now)).toMatch(/own bookings/);
  });
  it("does not let staff change completed bookings or create short-notice bookings", () => {
    expect(changeReason(booking({ end_time: now.toISOString() }), data().profiles[1], now)).toMatch(/Completed/);
    expect(validateBooking(input({ start_time: slotTime("2026-10-03", 690) }), data(), data().profiles[1], now)).toMatch(/1 hour/);
  });
  it("produces a complete, sorted guard summary in club time", () => {
    const summary = scheduleText(createDemoData(now), "2026-10-03");
    expect(summary).toContain("For Ameen Khan & Nawab Khan");
    expect(summary).toContain("4:00 pm - 5:30 pm | Football Field");
    expect(summary).toContain("Responsible: Sara");
    expect(summary).toContain("Family players: Ali");
    expect(summary).toContain("2 guests joining");
    expect(summary.indexOf("Football Field")).toBeLessThan(summary.indexOf("Padel Court 1"));
  });
});
