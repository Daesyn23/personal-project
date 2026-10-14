"use client";

import { useId, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useKanjiProgress } from "@/hooks/useKanjiProgress";

export function KanjiProgressAccount() {
  const snapshot = useKanjiProgress();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Cloud sync isn’t configured yet."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn’t send the sign-in link. Please try again.";
      setError(message);
    } finally { setBusy(false); }
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setSent(false);
    } catch { setError("Couldn’t sign out. Please try again."); }
    finally { setBusy(false); }
  }

  if (snapshot.accountId) return <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600"><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-all">Private progress · {snapshot.accountEmail || "Signed in"}</p><button type="button" disabled={busy || snapshot.pendingCount > 0} onClick={() => void signOut()} className="min-h-11 px-2 font-semibold underline underline-offset-4 disabled:opacity-40">Sign out on this device</button></div>{snapshot.pendingCount > 0 && <p className="pb-2">Waiting to sync {snapshot.pendingCount} saved {snapshot.pendingCount === 1 ? "round" : "rounds"} before signing out.</p>}{error && <p role="alert">{error}</p>}</div>;

  return <div className="mt-3 rounded-xl border border-pink-100 bg-pink-50/40 p-4">
    <p className="text-sm font-semibold text-neutral-800">Continue on your phone or laptop</p>
    <p className="mt-1 text-xs leading-5 text-neutral-600">Sign in with the same email on both devices. Your existing progress on this device will be added to that account.</p>
    {sent ? <div className="mt-3"><p role="status" className="text-sm leading-6 text-pink-800">Check your email and open the sign-in link on this device. Then return to Learning Hub or Games.</p><button type="button" onClick={() => { setSent(false); setError(""); }} className="mt-2 min-h-11 text-xs font-semibold text-pink-700 underline underline-offset-4">Use another email or resend</button></div> : <form onSubmit={sendLink} className="mt-3 space-y-2"><label htmlFor={emailId} className="block text-xs font-semibold text-neutral-600">Email for progress sync</label><div className="flex flex-col gap-2 sm:flex-row"><input id={emailId} type="email" required autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} className="min-h-12 min-w-0 flex-1 rounded-xl border border-pink-200 bg-white px-3 text-base outline-pink-500" /><button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-pink-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Email me a sign-in link"}</button></div></form>}
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p>}
  </div>;
}
