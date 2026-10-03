"use client";

import { useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { browserClient, supabaseConfigured } from "@/lib/supabase/browser";
import { useClub } from "./club-provider";

export function AuthPanel({ setup = false, onComplete }: { setup?: boolean; onComplete?: () => void }) {
  const { refresh } = useClub();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recover, setRecover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (setup && password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const client = browserClient();
      if (setup) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState({}, "", "/");
        onComplete?.();
        await refresh();
      } else if (recover) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm` });
        if (error) throw error;
        setMessage("If that email belongs to a club account, a password reset link is on its way.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refresh();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark-light.svg" alt="The Boulevard Club" width={280} height={135} />
      <div><span className="eyebrow">A PLACE FOR OUR PEOPLE</span><h1>Good games.<br />Even better company.</h1><p>Our courts. Our family. A little time together.</p></div>
      <span className="auth-location">PADEL &nbsp; / &nbsp; FOOTBALL &nbsp; / &nbsp; FAMILY</span>
    </section>
    <section className="auth-form-wrap">
      <div className="auth-form">
        <LockKeyhole size={23} strokeWidth={1.5} />
        <h2>{setup ? "Make yourself at home." : recover ? "Back in the game." : "Welcome to the club."}</h2>
        <p className="muted">{setup ? "Set a password of at least 12 characters for your private club account." : recover ? "Enter your invited email to request a password reset." : "A private space for the family. Sign in with your invited email to book your next game."}</p>
        {!supabaseConfigured && <div className="alert error">Live sign-in is not configured. Add your Supabase project settings to enable invitations and bookings.</div>}
        {error && <div role="alert" className="alert error">{error}</div>}
        {message && <div role="status" className="alert success">{message}</div>}
        <form onSubmit={submit} className="stack-form">
          {!setup && <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
          {!recover && <label>{setup ? "New password" : "Password"}<input type="password" required minLength={setup ? 12 : undefined}
            autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
          {setup && <label>Confirm password<input type="password" required minLength={12} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>}
          <button className="button primary full" disabled={busy || !supabaseConfigured}>{busy ? "One moment…" : setup ? "Set password & enter" : recover ? "Send reset link" : "Sign in"}<ArrowUpRight size={17} /></button>
        </form>
        {!setup && <button className="text-button" onClick={() => { setRecover(!recover); setError(""); setMessage(""); }}>{recover ? "Back to sign in" : "Forgot your password?"}</button>}
        <div className="auth-note">Invite-only, always.<br />Need access? Ask your club administrator.</div>
      </div>
    </section>
  </main>;
}
