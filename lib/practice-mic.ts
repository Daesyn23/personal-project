/**
 * Shared practice microphone with browser noise suppression / echo cancellation.
 * One stream per voice session — used for level meters and (when supported) SpeechRecognition.
 */

export type PracticeMicSession = {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
};

/** Chromium still honors these for stronger software noise handling. */
type ChromiumAudioConstraints = MediaTrackConstraints & {
  googEchoCancellation?: boolean;
  googNoiseSuppression?: boolean;
  googAutoGainControl?: boolean;
  googHighpassFilter?: boolean;
};

function buildAudioConstraints(strict: boolean): ChromiumAudioConstraints {
  return {
    echoCancellation: strict ? { ideal: true } : true,
    noiseSuppression: strict ? { ideal: true } : true,
    autoGainControl: strict ? { ideal: true } : true,
    channelCount: { ideal: 1 },
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
  };
}

async function getUserMediaWithConstraints(
  strict: boolean
): Promise<MediaStream | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(strict),
      video: false,
    });
  } catch {
    return null;
  }
}

/**
 * Open a single noise-cancelled mic for the practice voice session.
 * Tries ideal processing constraints first, then falls back to basic flags.
 */
export async function acquirePracticeMic(): Promise<PracticeMicSession | null> {
  let stream =
    (await getUserMediaWithConstraints(true)) ??
    (await getUserMediaWithConstraints(false));
  if (!stream) return null;

  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  // Re-apply processing if the browser allows live constraint updates.
  try {
    await track.applyConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  } catch {
    /* ignore — initial getUserMedia constraints still apply */
  }

  return {
    stream,
    track,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
