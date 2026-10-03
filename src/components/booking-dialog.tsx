"use client";

import { useState } from "react";
import { CalendarDays, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { useClub } from "./club-provider";
import { changeReason, clubDate, endTime, formatDate, formatTime, isPremium, isStaff, slotsForDay, validateBooking, windowReason } from "@/lib/rules";
import type { Booking } from "@/lib/types";

export type BookingSelection = { facilityId: string; start: string; booking?: Booking };
export function BookingDialog({ selection, onClose }: { selection: BookingSelection; onClose: () => void }) {
  const { user, data, saveBooking, cancelBooking } = useClub();
  const booking = selection.booking;
  const [editing, setEditing] = useState(!booking);
  const [date, setDate] = useState(clubDate(selection.start));
  const [start, setStart] = useState(selection.start);
  const [facilityId, setFacilityId] = useState(selection.facilityId);
  const [responsible, setResponsible] = useState(booking?.responsible_member_id ?? user!.id);
  const [notes, setNotes] = useState(booking?.guest_notes ?? "");
  const [players, setPlayers] = useState(data.booking_players.filter((p) => p.booking_id === booking?.id).map((p) => p.user_id));
  const [attendance, setAttendance] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!user) return null;
  const facility = data.facilities.find((f) => f.id === selection.facilityId);
  const member = data.profiles.find((p) => p.id === responsible);
  const restriction = booking ? changeReason(booking, user) : null;
  const input = {
    id: booking?.id, facility_id: facilityId, responsible_member_id: responsible,
    start_time: start, guest_notes: notes, player_ids: players, attendance_confirmed: attendance
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const reason = validateBooking(input, data, user!);
    if (reason) { setError(reason); return; }
    setBusy(true);
    try {
      await saveBooking(input);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The booking could not be saved. Please try again.");
    } finally { setBusy(false); }
  }
  async function cancel() {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      await cancelBooking(booking.id);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Cancellation failed. Your booking has not been released.");
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
      onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <div className="eyebrow">{booking ? "YOUR CLUB, YOUR TIME" : "MAKE TIME TO PLAY"}</div>
      <DialogTitle className="dialog-title">{booking ? editing ? "Edit your booking." : "The game plan." : "A court with your name on it."}</DialogTitle>
      <DialogDescription className="muted">{editing ? "A little friendly competition. A good time together." : "Your session details, all in one place."}</DialogDescription>
      {error && <div className="alert error" role="alert">{error}</div>}
      {!editing && booking ? <>
        <div className="booking-summary">
          <h3>{facility?.name}</h3>
          <p><CalendarDays size={17} />{formatDate(booking.start_time, { weekday: "long", year: "numeric" })}</p>
          <p><Clock3 size={17} />{formatTime(booking.start_time)} – {formatTime(booking.end_time)} <small>PKT</small></p>
          {isPremium(booking.start_time) && <span className="badge premium"><Sparkles size={12} /> Premium slot</span>}
        </div>
        <dl className="detail-list">
          <div><dt>Responsible member</dt><dd>{member?.full_name}</dd></div>
          <div><dt>Family players</dt><dd>{players.map((id) => data.profiles.find((p) => p.id === id)?.full_name).join(", ") || "Responsible member only"}</dd></div>
          {notes && <div><dt>Guest notes</dt><dd>{notes}</dd></div>}
          <div><dt>Status</dt><dd className="capitalize">{booking.status}</dd></div>
        </dl>
        {restriction ? <p className="help-box">{restriction}</p> : confirmCancel ? <div className="cancel-confirm">
          <p>Cancel this booking? The slot will be released immediately.</p>
          <div className="button-row">
            <button className="button danger" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Yes, cancel booking"}</button>
            <button className="button secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep booking</button>
          </div>
        </div> : <div className="button-row">
          <button className="button primary" onClick={() => setEditing(true)}>Edit booking</button>
          <button className="button secondary" onClick={() => setConfirmCancel(true)}>Cancel booking</button>
        </div>}
      </> : <form onSubmit={submit} className="stack-form">
        <label>Facility<select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          {data.facilities.filter((f) => f.is_active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select></label>
        <div className="form-grid">
          <label>Date <span className="field-hint">Pakistan time</span><input type="date" required value={date}
            onChange={(e) => { if (e.target.value) { setDate(e.target.value); setStart(slotsForDay(e.target.value)[0]); } }} /></label>
          <label>90-minute slot<select value={start} onChange={(e) => setStart(e.target.value)}>
            {slotsForDay(date).map((slot) => <option key={slot} value={slot} disabled={Boolean(windowReason(slot))}>
              {formatTime(slot)} – {formatTime(endTime(slot))}{isPremium(slot) ? " ★" : ""}{windowReason(slot) ? " (unavailable)" : ""}
            </option>)}
          </select></label>
        </div>
        <p className="field-hint">Book 2–72 hours before the start. Premium: 5:30–10 pm.</p>
        {isStaff(user) ? <label>Responsible family member<select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
          {data.profiles.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></label> : <div className="responsible"><ShieldCheck size={19} /><span>Booked in your name<strong>{user.full_name}</strong></span></div>}
        <fieldset className="players-field"><legend>Family playing <span className="field-hint">optional</span></legend>
          <div className="player-options">
            {data.profiles.filter((p) => p.is_active && p.id !== responsible).map((p) => <label key={p.id}>
              <input type="checkbox" checked={players.includes(p.id)} onChange={(e) => setPlayers(e.target.checked ? [...players, p.id] : players.filter((id) => id !== p.id))} />
              {p.full_name}
            </label>)}
          </div>
        </fieldset>
        <label>Guests or session notes <span className="field-hint">optional</span>
          <textarea maxLength={500} rows={2} placeholder="e.g. 2 guests joining us" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="checkbox-panel"><input type="checkbox" checked={attendance} onChange={(e) => setAttendance(e.target.checked)} />
          <span>{responsible === user.id ? "I will play and be present" : `${member?.full_name ?? "The responsible member"} will play and be present`} for the entire session. The booking is not being offered to others.</span>
        </label>
        <p className="field-hint">One premium booking per member per day across all facilities. Changes and cancellations close 2 hours before play; contact the manager after that.</p>
        <button className="button primary full" type="submit" disabled={busy}>{busy ? "Checking availability…" : booking ? "Save booking" : "Confirm booking"}<span>↗</span></button>
      </form>}
    </DialogContent>
  </Dialog>;
}
