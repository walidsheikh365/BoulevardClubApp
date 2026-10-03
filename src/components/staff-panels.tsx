"use client";

import { useState } from "react";
import { CalendarDays, Copy, MailPlus, Printer, Share2, ShieldCheck, Wrench } from "lucide-react";
import { useClub } from "./club-provider";
import { addDays, clubDate, formatDate, formatTime, isStaff, scheduleText } from "@/lib/rules";
import { demoMode } from "@/lib/supabase/browser";
import type { BookingSelection } from "./booking-dialog";
import type { Role } from "@/lib/types";

export function Agenda({ date, setDate, onSelect }: { date: string; setDate: (date: string) => void; onSelect: (selection: BookingSelection) => void }) {
  const { data, user, notify } = useClub();
  const [error, setError] = useState("");
  if (!user || !isStaff(user)) return null;
  const bookings = data.bookings.filter((b) => b.status === "confirmed" && clubDate(b.start_time) === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const text = scheduleText(data, date);
  async function share(copy = false) {
    setError("");
    try {
      if (!copy && navigator.share) await navigator.share({ title: "The Boulevard Club daily schedule", text });
      else {
        await navigator.clipboard.writeText(text);
        notify("Schedule copied. Paste it into WhatsApp or SMS for the guards.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setError("Sharing is unavailable here. Select and copy the schedule preview below.");
    }
  }
  return <section className="staff-section">
    <div className="section-heading"><div><span className="eyebrow">EVERYTHING IN GOOD ORDER</span><h2>The daily agenda.</h2></div><CalendarDays size={26} strokeWidth={1.3} /></div>
    <p className="muted">A clear game plan for Ghulam Rasool, Ameen Khan, and Nawab Khan.</p>
    <div className="agenda-toolbar"><label>Date <span className="field-hint">PKT</span><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      <div className="button-row"><button className="button primary" onClick={() => share()}><Share2 size={16} />Share schedule</button>
        <button className="button secondary" onClick={() => share(true)}><Copy size={16} />Copy</button>
        <button className="button secondary" onClick={() => window.print()}><Printer size={16} />Print</button></div>
    </div>
    {error && <div role="alert" className="alert error">{error}</div>}
    <div className="agenda-list">
      {!bookings.length && <div className="empty-state"><CalendarDays /><h3>A clear calendar.</h3><p>No sessions scheduled for this day.</p></div>}
      {bookings.map((b) => <button key={b.id} className="agenda-row" onClick={() => onSelect({ booking: b, facilityId: b.facility_id, start: b.start_time })}>
        <span className="agenda-time">{formatTime(b.start_time)}<small>{formatTime(b.end_time)}</small></span>
        <span><strong>{data.facilities.find((f) => f.id === b.facility_id)?.name}</strong><small>{data.profiles.find((p) => p.id === b.responsible_member_id)?.full_name}{b.guest_notes && ` · ${b.guest_notes}`}</small></span>
        <span className="badge">Confirmed</span>
      </button>)}
    </div>
    <details className="schedule-preview" open><summary>Guard schedule preview</summary><pre>{text}</pre></details>
    <div className="print-schedule"><pre>{text}</pre></div>
  </section>;
}

export function Admin() {
  const { data, user, setFacility, setMember, addBlock, removeBlock, notify, refresh } = useClub();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [facility, setFacilityId] = useState(data.facilities[0]?.id ?? "");
  const [start, setStart] = useState(`${addDays(clubDate(), 1)}T08:30`);
  const [end, setEnd] = useState(`${addDays(clubDate(), 1)}T10:00`);
  const [reason, setReason] = useState("");
  if (user?.role !== "admin") return null;
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The change could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    await act(async () => {
      if (demoMode) throw new Error("Email invitations are disabled in demo mode. Connect Supabase to invite real members.");
      const response = await fetch("/api/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, full_name: name })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(typeof result === "object" && result && "error" in result && typeof result.error === "string" ? result.error : "Invitation failed.");
      notify("Invitation sent. The new member can set a password from their email.");
      setName(""); setEmail("");
      await refresh();
    });
  }
  return <section className="staff-section">
    <div className="section-heading"><div><span className="eyebrow">BEHIND THE GOOD TIMES</span><h2>Club management.</h2></div><ShieldCheck size={26} strokeWidth={1.3} /></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="admin-grid">
      <section className="panel"><div className="panel-title"><MailPlus size={19} /><h3>A place in the family.</h3></div><p className="muted">Invite a member by email. New accounts start with family member access.</p>
        {demoMode && <p className="help-box">Demo preview: email invitations are not sent.</p>}
        <form onSubmit={invite} className="stack-form">
          <label>Full name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Family member's name" /></label>
          <label>Email<input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" /></label>
          <button className="button primary" disabled={busy || demoMode}>Send invitation</button>
        </form>
      </section>
      <section className="panel"><div className="panel-title"><CalendarDays size={19} /><h3>Open for play.</h3></div><p className="muted">Inactive facilities are hidden from family members. Cancel upcoming bookings before closing a facility.</p>
        {data.facilities.map((f) => <div className="management-row" key={f.id}><span><strong>{f.name}</strong><small>{f.is_active ? "Active · 8:30 am – 11:30 pm" : "Inactive · Hidden from members"}</small></span>
          <button className={`toggle ${f.is_active ? "on" : ""}`} role="switch" aria-checked={f.is_active} aria-label={`Activate ${f.name}`} disabled={busy} onClick={() => act(() => setFacility(f.id, !f.is_active))}><span /></button>
        </div>)}
      </section>
      <section className="panel wide"><h3>Our people.</h3><p className="muted">Manage access and staff roles. Another admin must change your own access.</p>
        <div className="members-list">{data.profiles.map((p) => <div className="member-row" key={p.id}><span className="avatar">{p.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span>
          <span className="member-name"><strong>{p.full_name}{p.id === user.id ? " (you)" : ""}</strong><small>{p.is_active ? "Active member" : "Access disabled"}</small></span>
          <select aria-label={`Role for ${p.full_name}`} value={p.role} disabled={busy || p.id === user.id} onChange={(e) => act(() => setMember(p.id, p.is_active, e.target.value as Role))}>
            <option value="family_member">Family member</option><option value="facility_manager">Facility manager</option><option value="admin">Admin</option>
          </select>
          <button className="button secondary small" disabled={busy || p.id === user.id} onClick={() => act(() => setMember(p.id, !p.is_active, p.role))}>{p.is_active ? "Deactivate" : "Activate"}</button>
        </div>)}</div>
      </section>
      <section className="panel wide"><div className="panel-title"><Wrench size={19} /><h3>A little care for the courts.</h3></div>
        <p className="muted">Block time for maintenance or private family events. Existing bookings must be cancelled first.</p>
        <form className="stack-form" onSubmit={(e) => { e.preventDefault(); void act(async () => { await addBlock(facility, new Date(`${start}:00+05:00`).toISOString(), new Date(`${end}:00+05:00`).toISOString(), reason); setReason(""); }); }}>
          <div className="form-grid three"><label>Facility<select value={facility} onChange={(e) => setFacilityId(e.target.value)}>{data.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <label>From (PKT)<input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Until (PKT)<input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label>Reason<input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Court surface maintenance" /></label>
          <button className="button primary" disabled={busy}>Add maintenance block</button>
        </form>
        <div className="block-list">{data.facility_blocks.map((b) => <div className="management-row" key={b.id}><span><strong>{data.facilities.find((f) => f.id === b.facility_id)?.name} · {b.reason}</strong>
          <small>{formatDate(b.start_time)} {formatTime(b.start_time)} – {formatDate(b.end_time)} {formatTime(b.end_time)}</small></span>
          <button className="button secondary small" disabled={busy} onClick={() => act(() => removeBlock(b.id))}>Remove</button></div>)}</div>
      </section>
      <section className="panel wide"><h3>The club record.</h3><p className="muted">Latest 100 actions. Full booking before/after details remain in the database.</p>
        {data.audit_logs.length === 0 ? <p className="help-box">No actions recorded yet.</p> : <div className="audit-list">{data.audit_logs.slice(0, 100).map((log) => <details key={log.id}>
          <summary><span>{log.action_type.toLowerCase().replaceAll("_", " ")}</span><small>{data.profiles.find((p) => p.id === log.action_by)?.full_name} · {formatDate(log.created_at)} {formatTime(log.created_at)}</small></summary>
          <pre>{log.details}</pre>
        </details>)}</div>}
      </section>
    </div>
  </section>;
}
