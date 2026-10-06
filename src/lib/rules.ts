import type { Booking, BookingInput, ClubData, Profile } from "./types";

export const CLUB_TIMEZONE = "Asia/Karachi";
export const SLOT_MINUTES = 90;
export const MIN_ADVANCE_HOURS = 1;
export const MAX_ADVANCE_HOURS = 72;
export const CANCELLATION_HOURS = 2;
export const OPEN_MINUTE = 8 * 60 + 30;
export const CLOSE_MINUTE = 23 * 60 + 30;
export const PREMIUM_STARTS = [17 * 60 + 30, 19 * 60, 20 * 60 + 30];
const HOUR = 3_600_000;

export const isStaff = (profile: Profile) => profile.role !== "family_member";
export function clubDate(date: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(date));
}
export function localMinute(date: Date | string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(date));
  return Number(parts.find((p) => p.type === "hour")?.value) * 60
    + Number(parts.find((p) => p.type === "minute")?.value);
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00+05:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return clubDate(value);
}
export function slotTime(date: string, minute: number): string {
  return new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+05:00`).toISOString();
}
export function slotsForDay(date: string): string[] {
  return Array.from({ length: 10 }, (_, index) => slotTime(date, OPEN_MINUTE + index * SLOT_MINUTES));
}
export function endTime(start: string): string {
  return new Date(new Date(start).getTime() + SLOT_MINUTES * 60_000).toISOString();
}
export const isPremium = (start: string) => PREMIUM_STARTS.includes(localMinute(start));
export const formatTime = (date: string) => new Intl.DateTimeFormat("en-PK", {
  timeZone: CLUB_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true
}).format(new Date(date));
export const formatDate = (date: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: CLUB_TIMEZONE, day: "numeric", month: "short", ...options })
    .format(new Date(date.length === 10 ? `${date}T12:00:00+05:00` : date));
export const overlaps = (a: string, b: string, c: string, d: string) =>
  new Date(a) < new Date(d) && new Date(c) < new Date(b);

export function windowReason(start: string, now = new Date()): string | null {
  const diff = new Date(start).getTime() - now.getTime();
  if (!Number.isFinite(diff)) return "Choose a valid start time.";
  if (diff < MIN_ADVANCE_HOURS * HOUR) return "Bookings need at least 1 hour's notice.";
  if (diff > MAX_ADVANCE_HOURS * HOUR) return "This slot opens for booking 72 hours before it starts.";
  return null;
}
export function canManageBooking(booking: Booking, user: Profile): boolean {
  return isStaff(user) || booking.responsible_member_id === user.id;
}
export function changeReason(booking: Booking, user: Profile, now = new Date()): string | null {
  if (!user.is_active) return "Your account is inactive. Please contact the club admin.";
  if (!canManageBooking(booking, user)) return "You can only change your own bookings.";
  if (booking.status !== "confirmed") return "This booking has already been cancelled.";
  if (new Date(booking.end_time) <= now) return "Completed bookings cannot be changed.";
  if (!isStaff(user) && new Date(booking.start_time).getTime() - now.getTime() < CANCELLATION_HOURS * HOUR) {
    return "Within 2 hours of play, contact the manager to change or cancel.";
  }
  return null;
}
export function validateBooking(input: BookingInput, data: ClubData, user: Profile, now = new Date()): string | null {
  if (!user.is_active) return "Your account is inactive. Please contact the club admin.";
  const facility = data.facilities.find((f) => f.id === input.facility_id);
  if (!facility?.is_active) return "This facility is not available for bookings.";
  const responsible = data.profiles.find((p) => p.id === input.responsible_member_id);
  if (!responsible?.is_active) return "Choose an active responsible member.";
  if (!isStaff(user) && responsible.id !== user.id) return "Book in your own name. You must attend the whole session.";
  if (!input.attendance_confirmed) return "Confirm that the responsible member will attend the entire session.";
  if (input.guest_notes.length > 500) return "Keep guest notes to 500 characters.";
  if (input.player_ids.length > 30 || input.player_ids.some((id) => !data.profiles.some((p) => p.id === id && p.is_active))) {
    return "Choose up to 30 active family members.";
  }
  if (input.id) {
    const existing = data.bookings.find((b) => b.id === input.id);
    if (!existing) return "Booking not found.";
    const reason = changeReason(existing, user, now);
    if (reason) return reason;
  }
  const window = windowReason(input.start_time, now);
  if (window) return window;
  const minute = localMinute(input.start_time);
  const start = new Date(input.start_time);
  if (minute < OPEN_MINUTE || minute + SLOT_MINUTES > CLOSE_MINUTE
    || (minute - OPEN_MINUTE) % SLOT_MINUTES !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return "Choose a fixed 90-minute slot between 8:30 am and 11:30 pm.";
  }
  if (data.bookings.some((b) => b.id !== input.id && b.status === "confirmed"
    && b.facility_id === input.facility_id && overlaps(b.start_time, b.end_time, input.start_time, endTime(input.start_time)))) {
    return "That slot has just been booked. Please choose another.";
  }
  if (data.facility_blocks.some((b) => b.facility_id === input.facility_id
    && overlaps(b.start_time, b.end_time, input.start_time, endTime(input.start_time)))) {
    return "This slot is reserved for maintenance or a club event.";
  }
  if (isPremium(input.start_time) && data.bookings.some((b) => b.id !== input.id && b.status === "confirmed"
    && b.responsible_member_id === responsible.id && clubDate(b.start_time) === clubDate(input.start_time) && isPremium(b.start_time))) {
    return "One premium booking per member per day, across all facilities.";
  }
  return null;
}

export function scheduleText(data: ClubData, date: string): string {
  const bookings = data.bookings.filter((b) => b.status === "confirmed" && clubDate(b.start_time) === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const blocks = data.facility_blocks.filter((b) => clubDate(b.start_time) <= date && clubDate(b.end_time) >= date);
  return [
    `THE BOULEVARD CLUB`,
    `${formatDate(date, { weekday: "long", year: "numeric" })} | Pakistan time`,
    "For Ameen Khan & Nawab Khan",
    "",
    ...(bookings.length ? bookings.flatMap((b) => [
      `${formatTime(b.start_time)} - ${formatTime(b.end_time)} | ${data.facilities.find((f) => f.id === b.facility_id)?.name}`,
      `Responsible: ${data.profiles.find((p) => p.id === b.responsible_member_id)?.full_name}`,
      `Family players: ${data.booking_players.filter((p) => p.booking_id === b.id).map((p) => data.profiles.find((m) => m.id === p.user_id)?.full_name).join(", ") || "Responsible member only"}`,
      ...(b.guest_notes ? [`Guests / notes: ${b.guest_notes}`] : []), ""
    ]) : ["No bookings scheduled.", ""]),
    ...blocks.map((b) => `BLOCKED: ${data.facilities.find((f) => f.id === b.facility_id)?.name} | ${formatDate(b.start_time)} ${formatTime(b.start_time)} - ${formatDate(b.end_time)} ${formatTime(b.end_time)} | ${b.reason}`),
    "",
    "The responsible family member must be present for the entire session. No independent guest use."
  ].join("\n");
}
