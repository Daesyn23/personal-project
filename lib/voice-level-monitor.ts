/**
 * Real-time mic level from getUserMedia (for "you are speaking" visuals).
 */

export type VoiceLevelMonitor = {
  stop: () => void;
};

export type VoiceLevelMonitorOptions = {
  /** Reuse an existing noise-cancelled stream (e.g. from `acquirePracticeMic`). */
  stream?: MediaStream;
  /** Stop mic tracks when the monitor stops (default true if no stream was passed in). */
  stopTracksOnRelease?: boolean;
  /** Per-tick noise floor (higher = less sensitive). */
  noiseFloor?: number | (() => number);
};

export async function startVoiceLevelMonitor(
  onLevel: (level: number) => void,
  options?: VoiceLevelMonitorOptions
): Promise<VoiceLevelMonitor | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const ownsStream = !options?.stream;
  const stopTracksOnRelease = options?.stopTracksOnRelease ?? ownsStream;

  let stream: MediaStream | undefined = options?.stream;
  if (!stream) {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
        },
      });
    } catch {
      return null;
    }
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.88;
  source.connect(analyser);

  const timeDomain = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;
  let lastEmit = 0;
  let lastLevel = 0;
  const EMIT_MS = 140;
  const DEFAULT_NOISE_FLOOR = 0.032;
  const LEVEL_STEP = 0.08;

  const readNoiseFloor = () => {
    const raw = options?.noiseFloor;
    if (typeof raw === "function") return raw();
    return raw ?? DEFAULT_NOISE_FLOOR;
  };

  const quantizeLevel = (level: number) => Math.round(level / LEVEL_STEP) * LEVEL_STEP;

  const tick = async () => {
    if (stopped) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    analyser.getByteTimeDomainData(timeDomain);
    let sumSq = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const sample = (timeDomain[i]! - 128) / 128;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / timeDomain.length);
    const level = quantizeLevel(Math.min(1, Math.max(0, rms * 4.8 - readNoiseFloor())));
    const now = performance.now();
    if (
      now - lastEmit >= EMIT_MS ||
      Math.abs(level - lastLevel) >= LEVEL_STEP ||
      (lastLevel > 0.06 && level <= 0.02)
    ) {
      lastEmit = now;
      lastLevel = level;
      onLevel(level);
    }

    raf = requestAnimationFrame(() => {
      void tick();
    });
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      if (stopTracksOnRelease) stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
