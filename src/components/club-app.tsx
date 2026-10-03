"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, Download, LogOut, RefreshCw, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import { ClubProvider, useClub } from "./club-provider";
import { AuthPanel } from "./auth-panel";
import { BookingDialog, type BookingSelection } from "./booking-dialog";
import { Calendar, CourtIllustration } from "./calendar";
import { Admin, Agenda } from "./staff-panels";
import { addDays, clubDate, formatDate, formatTime, isPremium, isStaff } from "@/lib/rules";
import { demoMode } from "@/lib/supabase/browser";

type Tab = "calendar" | "bookings" | "agenda" | "admin" | "guide";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export function ClubApp({ setupRequested, authError }: { setupRequested: boolean; authError: boolean }) {
  return <ClubProvider><ClubShell setupRequested={setupRequested} authError={authError} /></ClubProvider>;
}
function ClubShell({ setupRequested, authError }: { setupRequested: boolean; authError: boolean }) {
  const { user, data, loading, error, notice, connected, refresh, notify, clearError, switchDemoUser, resetDemo, signOut } = useClub();
  const [tab, setTab] = useState<Tab>("calendar");
  const [date, setDate] = useState(() => clubDate());
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  const [localError, setLocalError] = useState(authError ? "That invitation or reset link is invalid or expired. Ask the admin for a new invitation, or request a password reset." : "");
  const [setup, setSetup] = useState(setupRequested);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    const onInstall = (event: Event) => {
      event.preventDefault();
      if ("prompt" in event && "userChoice" in event) setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((reason: Error) => setLocalError(`Home-screen offline support could not be enabled: ${reason.message}`));
    }
    return () => { window.clearInterval(interval); window.removeEventListener("beforeinstallprompt", onInstall); };
  }, []);
  async function attempt(action: () => Promise<void>) {
    setLocalError("");
    try { await action(); }
    catch (reason) { setLocalError(reason instanceof Error ? reason.message : "The action failed. Please try again."); }
  }
  const banner = (error || localError) && <div className="global-alert alert error" role="alert"><span>{localError || error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => { setLocalError(""); clearError(); }}><X size={16} /></button></div>;
  if (loading) return <main className="loading-page"><img src="/brand/wordmark.svg" alt="The Boulevard Club" width={240} height={116} /><p>Opening the club…</p></main>; // eslint-disable-line @next/next/no-img-element
  if (!user || setup) return <>{banner}{demoMode && <div className="demo-banner">Demo data unavailable.<button onClick={resetDemo}>Reset demo</button></div>}<AuthPanel setup={setup} onComplete={() => setSetup(false)} /></>;
  const activeTab = (tab === "admin" && user.role !== "admin") || (tab === "agenda" && !isStaff(user)) ? "calendar" : tab;
  const upcoming = data.bookings.filter((b) => b.status === "confirmed" && b.responsible_member_id === user.id && Date.parse(b.end_time) > now).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const next = upcoming[0];
  const nav = [
    { id: "calendar" as const, label: "Book a court", icon: CalendarDays },
    { id: "bookings" as const, label: "My bookings", icon: ClipboardList },
    ...(isStaff(user) ? [{ id: "agenda" as const, label: "Daily agenda", icon: BookOpen }] : []),
    ...(user.role === "admin" ? [{ id: "admin" as const, label: "Manage club", icon: Settings2 }] : [])
  ];
  const select = (value: BookingSelection) => setSelection(value);
  return <div className="app-layout">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="The Boulevard Club home"><img src="/brand/wordmark.svg" width={174} height={84} alt="The Boulevard Club" /></Link>{/* eslint-disable-line @next/next/no-img-element */}
      <span className="sidebar-caption">A PRIVATE FAMILY CLUB</span>
      <nav aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeTab === id ? "active" : ""}`} onClick={() => { setTab(id); setSelection(null); }}><Icon size={19} strokeWidth={1.6} />{label}{activeTab === id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="tiny-star">✳</span><p>A little play.<br />A lot of belonging.</p><button onClick={() => setTab("guide")}>The club guide <ArrowUpRight size={14} /></button></div>
        <button className={`nav-item ${activeTab === "guide" ? "active" : ""}`} onClick={() => setTab("guide")}><ShieldCheck size={18} />Rules & essentials</button>
        <div className="member-profile"><span className="avatar">{user.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span><div><strong>{user.full_name}</strong><small>{user.role.replaceAll("_", " ")}</small></div>
          {!demoMode && <button className="icon-button" aria-label="Sign out" onClick={() => attempt(signOut)}><LogOut size={16} /></button>}
        </div>
      </div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><span className="topbar-title">The good times start here.</span><Link className="mobile-brand" href="/" aria-label="The Boulevard Club home"><img src="/brand/wordmark.svg" alt="The Boulevard Club" width={110} height={62} /></Link>{/* eslint-disable-line @next/next/no-img-element */}
        <div className="topbar-right"><span className="connection"><i className={`status-dot ${connected || demoMode ? "" : "disconnected"}`} />{demoMode ? "Demo preview" : connected ? "Live calendar" : "Connecting"}</span>
          <button className="icon-button" aria-label="Refresh calendar" onClick={() => attempt(refresh)}><RefreshCw size={17} /></button><span className="avatar mobile-avatar">{user.full_name[0]}</span></div>
      </header>
      {demoMode && <div className="demo-banner"><span><strong>Demo</strong> Sample data only. Nothing reserves a real court.</span><div><label>Preview as <select aria-label="Demo role" value={user.id} onChange={(e) => { switchDemoUser(e.target.value); setSelection(null); }}>
        {data.profiles.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.role.replaceAll("_", " ")}</option>)}
      </select></label><button onClick={resetDemo}>Reset demo</button></div></div>}
      {banner}
      {notice && <div className="global-alert alert success" role="status"><Check size={17} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => notify("")}><X size={16} /></button></div>}
      <main className="main-content">
        {activeTab === "calendar" && <>
          <section className="welcome"><div className="welcome-copy"><span className="eyebrow">YOUR CLUB. YOUR PEOPLE.</span><h1>Make time<br />for a good game<span>.</span></h1><p>Welcome back, {user.full_name.split(" ")[0]}.<br />The courts are calling. Bring the family.</p><button className="hero-link" onClick={() => { setDate(addDays(clubDate(), 1)); document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth" }); }}>Find your next game <ArrowUpRight size={18} /></button></div>
            <div className="welcome-art"><span className="art-label">LESS SCROLLING.<br />MORE PLAYING.</span><CourtIllustration /><div className="art-bottom"><span>THE BOULEVARD<br />WAY OF LIFE</span><span className="art-star">✳</span></div></div>
          </section>
          <div className="quick-facts">
            <button className="fact next-booking" onClick={() => next ? select({ booking: next, facilityId: next.facility_id, start: next.start_time }) : setTab("bookings")}><span className="fact-icon"><CalendarDays size={19} /></span><div><span className="eyebrow">YOUR NEXT GAME</span><strong>{next ? data.facilities.find((f) => f.id === next.facility_id)?.name : "Something to look forward to"}</strong><small>{next ? `${formatDate(next.start_time)} · ${formatTime(next.start_time)}` : "Your next booking will appear here"}</small></div><ChevronRight size={17} /></button>
            <div className="fact"><span className="fact-icon"><Clock3 size={19} /></span><div><span className="eyebrow">OPEN FOR GOOD TIMES</span><strong>8:30 am – 11:30 pm</strong><small>Every day · Pakistan time</small></div></div>
            <div className="fact"><span className="fact-icon"><Sparkles size={19} /></span><div><span className="eyebrow">THE GOLDEN HOURS</span><strong>5:30 pm – 10:00 pm</strong><small>One premium slot per day</small></div></div>
          </div>
          <div id="calendar"><Calendar date={date} setDate={setDate} onSelect={select} now={now} /></div>
          <div className="club-reminder"><ShieldCheck size={19} /><p>A booking is a promise to be there.<span> Please play yourself and stay for the full session.</span></p><button className="text-button" onClick={() => setTab("guide")}>Club rules <ArrowRight size={15} /></button></div>
        </>}
        {activeTab === "bookings" && <section><div className="section-heading"><div><span className="eyebrow">A LITTLE TIME, WELL SPENT</span><h2>Your game plan.</h2></div><span className="badge">{upcoming.length} upcoming</span></div>
          <div className="my-bookings">{upcoming.length === 0 && <div className="empty-state"><CalendarDays /><h3>Your next good game awaits.</h3><p>No upcoming bookings yet. Make a little time for the club.</p><button className="button primary" onClick={() => setTab("calendar")}>Find a slot <ArrowUpRight size={16} /></button></div>}
            {upcoming.map((b) => <button key={b.id} className="my-booking-card" onClick={() => select({ booking: b, facilityId: b.facility_id, start: b.start_time })}><div className="booking-date"><strong>{formatDate(b.start_time, { day: "2-digit", month: undefined })}</strong><span>{formatDate(b.start_time, { month: "short", day: undefined })}</span></div><div><span className="eyebrow">{isPremium(b.start_time) ? "PREMIUM SESSION" : "TIME TO PLAY"}</span><h3>{data.facilities.find((f) => f.id === b.facility_id)?.name}</h3><p>{formatTime(b.start_time)} – {formatTime(b.end_time)} <small>PKT</small></p></div><ArrowUpRight size={20} /></button>)}
          </div><h3 className="history-title">Recent history</h3><p className="muted">Completed and cancelled sessions from the last 31 days.</p>
          {data.bookings.filter((b) => b.responsible_member_id === user.id && (b.status === "cancelled" || Date.parse(b.end_time) <= now)).sort((a, b) => b.start_time.localeCompare(a.start_time)).map((b) => <button key={b.id} className="history-row" onClick={() => select({ booking: b, facilityId: b.facility_id, start: b.start_time })}><span>{data.facilities.find((f) => f.id === b.facility_id)?.name}<small>{formatDate(b.start_time)} · {formatTime(b.start_time)}</small></span><span className="badge">{b.status === "cancelled" ? "Cancelled" : "Played"}</span></button>)}
        </section>}
        {activeTab === "agenda" && <Agenda date={date} setDate={setDate} onSelect={select} />}
        {activeTab === "admin" && <Admin />}
        {activeTab === "guide" && <section className="guide"><div className="section-heading"><div><span className="eyebrow">A FEW THINGS WE PLAY BY</span><h2>The club guide.</h2></div><ShieldCheck size={27} strokeWidth={1.3} /></div>
          <p className="guide-intro">A private club, shared by family. These small courtesies keep it fair, welcoming, and easy for everyone.</p>
          <div className="rules-grid">{[
            ["01", "A little time to play.", "Every session is 90 minutes. Our day runs from 8:30 am to 11:30 pm, in fixed slots, on every court and the football field."],
            ["02", "Plan a little ahead.", "Book or reschedule from 2 to 72 hours before your session starts. The window rolls forward in real time, not at midnight."],
            ["03", "Share the golden hours.", "Premium sessions are 5:30–7 pm, 7–8:30 pm, and 8:30–10 pm. One premium booking total per responsible member per Pakistan calendar day, across all facilities."],
            ["04", "Be there. Be part of it.", "Book in your own name, play yourself, and attend the entire session. Guests are welcome only with you. Courts cannot be offered to other people."],
            ["05", "Plans change. Let us know.", "Cancel or edit at least 2 hours before play. After that, contact Ghulam Rasool or an admin. Cancelling releases the slot and restores your premium allowance immediately."],
            ["06", "A helping hand.", "The manager or admin can book for a named, attending member. The premium allowance belongs to that responsible member. Staff can handle late cancellations, but cannot bypass booking windows or daily limits."]
          ].map(([num, title, body]) => <article key={num} className="rule-card"><span>{num}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
          <section className="install-card"><Download size={26} /><div><h3>A little closer to hand.</h3><p>Install the club on your phone. On iPhone, open in Safari, tap Share, then Add to Home Screen. On Android, use your browser&apos;s Install app or Add to Home Screen option.</p><small>Booking requires an internet connection. No private calendars are stored for offline access.</small></div>
            {install && <button className="button primary" onClick={() => attempt(async () => { await install.prompt(); const choice = await install.userChoice; if (choice.outcome === "accepted") notify("The club is ready on your home screen."); setInstall(null); })}>Install app</button>}
          </section>
          {!demoMode && <button className="button secondary mobile-signout" onClick={() => attempt(signOut)}><LogOut size={16} />Sign out</button>}
        </section>}
        <footer className="page-footer"><span>THE BOULEVARD CLUB</span><span>Good games. Better company.</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? "active" : ""} onClick={() => { setTab(id); setSelection(null); window.scrollTo({ top: 0 }); }}><Icon size={20} /><span>{label}</span></button>)}<button className={activeTab === "guide" ? "active" : ""} onClick={() => setTab("guide")}><ShieldCheck size={20} /><span>Club guide</span></button></nav>
    {selection && <BookingDialog key={`${selection.booking?.id ?? selection.start}-${user.id}`} selection={selection} onClose={() => setSelection(null)} />}
  </div>;
}
