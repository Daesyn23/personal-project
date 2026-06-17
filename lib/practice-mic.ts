/**
 * Shared practice microphone with browser noise suppression / echo cancellation
 * plus a light Web Audio cleanup chain (high-pass + compressor).
 * One stream per voice session — used for level meters and SpeechRecognition.
 */

export type PracticeMicSession = {
  /** Processed stream for meters and speech recognition. */
  stream: MediaStream;
  track: MediaStreamTrack;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  stop: () => void;
};

/** Chromium still honors these for stronger software noise handling. */
type ChromiumAudioConstraints = MediaTrackConstraints & {
  googEchoCancellation?: boolean;
  googNoiseSuppression?: boolean;
  googAutoGainControl?: boolean;
  googHighpassFilter?: boolean;
  googTypingNoiseDetection?: boolean;
  googAudioMirroring?: boolean;
};

function buildAudioConstraints(mode: "exact" | "ideal" | "basic"): ChromiumAudioConstraints {
  if (mode === "basic") {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
  }
  const on = mode === "exact" ? ({ exact: true } as const) : ({ ideal: true } as const);
  return {
    echoCancellation: on,
    noiseSuppression: on,
    autoGainControl: on,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    googAudioMirroring: false,
  };
}

async function getUserMediaWithConstraints(
  mode: "exact" | "ideal" | "basic"
): Promise<MediaStream | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(mode),
      video: false,
    });
  } catch {
    return null;
  }
}

function buildProcessedMic(
  rawStream: MediaStream,
  rawTrack: MediaStreamTrack
): { stream: MediaStream; track: MediaStreamTrack; audioCtx: AudioContext | null } {
  if (typeof window === "undefined") {
    return { stream: rawStream, track: rawTrack, audioCtx: null };
  }

  try {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(rawStream);

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 185;
    highpass.Q.value = 1.1;

    const rumbleCut = audioCtx.createBiquadFilter();
    rumbleCut.type = "lowshelf";
    rumbleCut.frequency.value = 220;
    rumbleCut.gain.value = -9;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-38, audioCtx.currentTime);
    compressor.knee.setValueAtTime(18, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.12, audioCtx.currentTime);

    const makeup = audioCtx.createGain();
    makeup.gain.value = 1.12;

    const destination = audioCtx.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(rumbleCut);
    rumbleCut.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(destination);

    const processedTrack = destination.stream.getAudioTracks()[0];
    if (!processedTrack) {
      void audioCtx.close();
      return { stream: rawStream, track: rawTrack, audioCtx: null };
    }

    void audioCtx.resume();
    return { stream: destination.stream, track: processedTrack, audioCtx };
  } catch {
    return { stream: rawStream, track: rawTrack, audioCtx: null };
  }
}

/**
 * Open a single noise-cancelled mic for the practice voice session.
 * Tries ideal processing constraints first, then falls back to basic flags.
 */
export async function acquirePracticeMic(): Promise<PracticeMicSession | null> {
  const rawStream =
    (await getUserMediaWithConstraints("exact")) ??
    (await getUserMediaWithConstraints("ideal")) ??
    (await getUserMediaWithConstraints("basic"));
  if (!rawStream) return null;

  const rawTrack = rawStream.getAudioTracks()[0];
  if (!rawTrack) {
    rawStream.getTracks().forEach((t) => t.stop());
    return null;
  }

  try {
    await rawTrack.applyConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  } catch {
    /* initial getUserMedia constraints still apply */
  }

  const { stream, track, audioCtx } = buildProcessedMic(rawStream, rawTrack);
  let muted = false;

  return {
    stream,
    track,
    setMuted: (next) => {
      muted = next;
      rawTrack.enabled = !next;
      track.enabled = !next;
    },
    isMuted: () => muted,
    stop: () => {
      rawStream.getTracks().forEach((t) => t.stop());
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) void audioCtx.close();
    },
  };
}
