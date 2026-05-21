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
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  const timeDomain = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;

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
    const level = Math.min(1, rms * 5.5);
    onLevel(level);

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
