"use client";

import { useCallback, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function WorkspaceSheetsAccountBar({ user }: { user: User | null }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sendOtp = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setMsg("Enter your email.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/`,
      },
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg("Check your email for the sign-in link.");
  }, [email]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMsg(null);
    await supabase.auth.signOut();
  }, []);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
        Add <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to sync saved sheets across
        devices.
      </p>
    );
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pink-100/90 bg-pink-50/40 px-3 py-2 text-[11px]">
        <span className="min-w-0 truncate text-neutral-700">
          Signed in as <span className="font-semibold text-neutral-900">{user.email}</span>
          <span className="ml-1.5 text-neutral-500">
            · Saved sheet links, tab choice, zoom, column widths, and freeze row sync to this account
          </span>
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 rounded-md border border-pink-200 bg-white px-2 py-1 font-medium text-pink-800 transition hover:bg-pink-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-pink-100/90 bg-white px-3 py-2 text-[11px] shadow-sm">
      <p className="font-medium text-neutral-800">Sync saved sheets on every device</p>
      <p className="mt-0.5 text-neutral-500">
        Sign in with email (magic link). Enable Email auth in your Supabase project (Authentication → Providers).
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="min-w-[12rem] flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-pink-400"
          autoComplete="email"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendOtp()}
          className="rounded-md bg-pink-600 px-3 py-1.5 font-semibold text-white transition hover:bg-pink-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Email link"}
        </button>
      </div>
      {msg && <p className="mt-2 text-neutral-600">{msg}</p>}
    </div>
  );
}
