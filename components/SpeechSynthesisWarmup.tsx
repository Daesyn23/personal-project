"use client";

import { useEffect } from "react";

/**
 * Primes `speechSynthesis.getVoices()` as soon as the app loads so Chrome can populate the
 * voice list before the first Speak click (better voice match; no user gesture required).
 */
export function SpeechSynthesisWarmup() {
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const kick = () => {
      void synth.getVoices();
    };
    kick();
    synth.addEventListener("voiceschanged", kick);
    return () => synth.removeEventListener("voiceschanged", kick);
  }, []);

  return null;
}
