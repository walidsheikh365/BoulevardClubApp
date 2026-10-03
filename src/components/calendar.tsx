"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Plus, Sparkles } from "lucide-react";
import { useClub } from "./club-provider";
import { addDays, clubDate, endTime, formatDate, formatTime, isPremium, overlaps, slotsForDay, windowReason } from "@/lib/rules";
import type { BookingSelection } from "./booking-dialog";
import type { Facility } from "@/lib/types";

export function CourtIllustration({ sport = "padel" }: { sport?: Facility["sport"] }) {
  return <svg viewBox="0 0 340 210" fill="none" aria-hidden="true" className="court-illustration">
    <defs><pattern id={`grid-${sport}`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" stroke="currentColor" strokeOpacity=".13" strokeWidth=".7" /></pattern></defs>
    <path d="M24 157 119 24 323 68 228 201Z" fill={`url(#grid-${sport})`} />
    <g stroke="currentColor" strokeWidth="1.3">
      <path d="M26 148 116 25 316 68 227 192Z" />
      <path d="M41 141 122 40 297 77 220 177Z" />
      <path d="m82 91 178 39M170 51l-81 101M256 69l-80 99" opacity=".65" />
      <path d="m83 91 2-38 178 39-3 38M83 75l178 39M84 64l178 40M84 85l177 39" />
      <path d="M26 148V93l90-123M316 68V14M227 192v-54L316 14M26 93l201 45" opacity=".3" />
      <circle cx="248" cy="156" r="5" fill="#c8d4a7" stroke="none" />
      {sport === "football" && <ellipse cx="175" cy="110" rx="23" ry="15" transform="rotate(-20 175 110)" />}
    </g>
  </svg>;
}

export function Calendar({ date, setDate, onSelect, now }: { date: string; setDate: (date: string) => void; onSelect: (selection: BookingSelection) => void; now: number }) {
  const { data, user } = useClub();
  const facilities = data.facilities.filter((f) => f.is_active);
  const [facilityId, setFacilityId] = useState("");
  const facility = facilities.find((f) => f.id === facilityId) ?? facilities[0];
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const today = clubDate(new Date(now));
  const booked = data.bookings.filter((b) => b.status === "confirmed" && b.facility_id === facility?.id);
  const blocks = data.facility_blocks.filter((b) => b.facility_id === facility?.id);
  function move(direction: number) {
    if (view === "month") {
      const d = new Date(`${date.slice(0, 7)}-01T12:00:00+05:00`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(clubDate(d));
    } else setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  }
  let dates: string[] = [];
  if (view !== "day") {
    const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
    const weekday = (new Date(`${first}T12:00:00+05:00`).getUTCDay() + 6) % 7;
    const beginning = addDays(first, -weekday);
    dates = Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => addDays(beginning, i));
  }
  return <section className="calendar-section">
    <div className="section-heading"><div><span className="eyebrow">THE NEXT GOOD GAME</span><h2>Find your time.</h2></div><span className="timezone"><span className="status-dot" /> All times in Pakistan (PKT)</span></div>
    <div className="facility-picker" aria-label="Choose a facility">
      {facilities.map((f, i) => <button key={f.id} className={`facility-tile ${facility?.id === f.id ? "selected" : ""}`} onClick={() => setFacilityId(f.id)} aria-pressed={facility?.id === f.id}>
        <span className="facility-number">0{i + 1}</span><span><strong>{f.name}</strong><small>{f.sport === "padel" ? "A game for four. A place for all." : "Room for the whole family."}</small></span>
        <ArrowUpRight size={18} />
      </button>)}
    </div>
    {!facility ? <div className="empty-state"><LockKeyhole /><h3>A little pause in play.</h3><p>No facilities are currently open for booking. Please check with the manager.</p></div> : <div className="calendar-card">
      <div className="calendar-toolbar">
        <div className="calendar-date"><button className="icon-button" aria-label="Previous period" onClick={() => move(-1)}><ChevronLeft size={19} /></button>
          <label className="date-label"><span>{formatDate(date, view === "month" ? { month: "long", year: "numeric", day: undefined } : { weekday: "short" })}</span><input aria-label="Calendar date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <button className="icon-button" aria-label="Next period" onClick={() => move(1)}><ChevronRight size={19} /></button>
          <button className="text-button today-button" onClick={() => setDate(today)}>Today</button>
        </div>
        <div className="segmented" aria-label="Calendar view">{(["day", "week", "month"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={view === v ? "active" : ""}>{v}</button>)}</div>
      </div>
      <div className="calendar-legend"><span><i className="legend-dot available" />Available</span><span><i className="legend-dot booked" />Booked</span><span><Sparkles size={12} />Premium</span><small>90 minutes, just for you.</small></div>
      {view === "day" ? <div className="slot-list">
        {slotsForDay(date).map((start, index) => {
          const booking = booked.find((b) => b.start_time === start || Date.parse(b.start_time) === Date.parse(start));
          const block = blocks.find((b) => overlaps(b.start_time, b.end_time, start, endTime(start)));
          const reason = windowReason(start, new Date(now));
          const premium = isPremium(start);
          const mine = booking?.responsible_member_id === user?.id;
          return <button key={start} className={`slot ${booking ? mine ? "mine" : "taken" : block ? "blocked" : reason ? "unavailable" : "available"} ${premium ? "premium-slot" : ""}`}
            disabled={!booking && Boolean(block || reason)}
            title={block?.reason ?? (!booking ? reason ?? "Book this slot" : "View booking")}
            onClick={() => onSelect({ facilityId: facility.id, start, booking })}>
            <span className="slot-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="slot-time"><strong>{formatTime(start)} <span>–</span> {formatTime(endTime(start))}</strong>
              <small>{booking ? `${mine ? "Your booking" : data.profiles.find((p) => p.id === booking.responsible_member_id)?.full_name}${booking.guest_notes ? " · Guests joining" : ""}` : block ? block.reason : reason ? Date.parse(start) < now ? "This session has passed" : reason : "Available for a good game"}</small>
            </span>
            {premium && <span className="badge premium"><Sparkles size={11} /><span>Premium</span></span>}
            <span className="slot-action">{booking ? <ArrowUpRight size={17} /> : block || reason ? <LockKeyhole size={15} /> : <Plus size={19} />}</span>
          </button>;
        })}
      </div> : <div className={`period-calendar ${view}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="weekday" key={day}>{day}</div>)}
        {dates.map((day) => {
          const count = booked.filter((b) => clubDate(b.start_time) === day).length;
          const available = slotsForDay(day).filter((s) => !windowReason(s, new Date(now)) && !booked.some((b) => Date.parse(b.start_time) === Date.parse(s)) && !blocks.some((b) => overlaps(b.start_time, b.end_time, s, endTime(s)))).length;
          return <button key={day} className={`period-day ${day === today ? "is-today" : ""} ${view === "month" && day.slice(0, 7) !== date.slice(0, 7) ? "outside-month" : ""}`} onClick={() => { setDate(day); setView("day"); }}>
            <strong>{Number(day.slice(-2))}</strong><span>{count ? `${count} booked` : "No bookings"}</span>
            {available > 0 && <small>{available} open</small>}
          </button>;
        })}
      </div>}
      <div className="calendar-footnote"><Clock3 size={15} /><span>Reservations open 72 hours ahead and close 2 hours before play.</span></div>
    </div>}
  </section>;
}
