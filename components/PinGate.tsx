"use client";

import { useEffect, useRef, useState } from "react";
import { APP_PIN, APP_PIN_SESSION_KEY } from "@/lib/app-pin";

type Props = {
  children: React.ReactNode;
};

export function PinGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [shake, setShake] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(APP_PIN_SESSION_KEY) === "1");
  }, []);

  useEffect(() => {
    if (unlocked !== false) return;
    const id = window.setTimeout(() => inputsRef.current[0]?.focus(), 100);
    return () => window.clearTimeout(id);
  }, [unlocked]);

  useEffect(() => {
    if (unlocked !== false) return;
    const code = digits.join("");
    if (code.length !== 6) return;
    if (code === APP_PIN) {
      sessionStorage.setItem(APP_PIN_SESSION_KEY, "1");
      setUnlocked(true);
      return;
    }
    setShake(true);
    setDigits(Array(6).fill(""));
    window.setTimeout(() => setShake(false), 450);
    inputsRef.current[0]?.focus();
  }, [digits, unlocked]);

  const focusIndex = (i: number) => {
    inputsRef.current[i]?.focus();
    inputsRef.current[i]?.select();
  };

  const setAt = (index: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < 5) focusIndex(index + 1);
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      focusIndex(index - 1);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (raw.length === 0) return;
    const arr = raw.split("");
    while (arr.length < 6) arr.push("");
    setDigits(arr.slice(0, 6));
    focusIndex(Math.min(raw.length, 5));
  };

  if (unlocked === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-rose-50 to-pink-100/80" aria-hidden />
    );
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-rose-50 via-pink-50 to-rose-100/90 px-4">
      <div
        className={`w-full max-w-sm rounded-2xl border border-pink-200/90 bg-white/95 p-8 shadow-xl shadow-pink-200/30 ${shake ? "pin-gate-shake" : ""}`}
      >
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-pink-600">My Workspace</p>
        <h1 className="mt-2 text-center text-xl font-bold text-neutral-900">Enter PIN</h1>
        <p className="mt-1 text-center text-sm text-neutral-500">6-digit code to continue</p>

        <div className="mt-8 flex justify-center gap-2" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              value={d}
              aria-label={`Digit ${i + 1} of 6`}
              className="h-12 w-10 rounded-lg border border-pink-200 bg-pink-50/50 text-center text-lg font-semibold tabular-nums text-neutral-900 shadow-inner outline-none ring-pink-400 focus:border-pink-400 focus:ring-2 focus:ring-pink-400/80"
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
            />
          ))}
        </div>

        <p className={`mt-6 min-h-[1.25rem] text-center text-xs ${shake ? "font-medium text-red-600" : "text-transparent"}`} aria-live="polite">
          {shake ? "Incorrect PIN. Try again." : "\u00a0"}
        </p>
      </div>
    </div>
  );
}
