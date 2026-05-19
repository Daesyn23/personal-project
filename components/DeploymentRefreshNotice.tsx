"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "development";

type VersionPayload = { buildId?: string };

export function DeploymentRefreshNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dismissedRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (dismissedRef.current || CLIENT_BUILD_ID === "development") return;

    try {
      const res = await fetch(`/api/app-version?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as VersionPayload;
      const serverId = (data.buildId ?? "").trim();
      if (!serverId || serverId === "development" || serverId === "unknown") return;
      if (serverId !== CLIENT_BUILD_ID) {
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore network errors — user may be offline.
    }
  }, []);

  useEffect(() => {
    if (CLIENT_BUILD_ID === "development") return;

    void checkForUpdate();

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => void checkForUpdate(), POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [checkForUpdate]);

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-200 bg-white px-4 py-3 shadow-lg shadow-pink-200/50 ring-1 ring-pink-100">
        <p className="min-w-0 flex-1 text-sm text-neutral-800">
          <span className="font-semibold text-pink-900">Update available.</span> Refresh the page to load the latest
          version.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              dismissedRef.current = true;
              setUpdateAvailable(false);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
