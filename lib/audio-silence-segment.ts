/**
 * Client-side segmentation: RMS + silence merge, optional pitch-based splits
 * (k-means on log-F0 into 2–4 bands — rough proxy for multiple speakers).
 */

export type AudioSegmentRange = { startSec: number; endSec: number };

/**
 * Removes sample-level overlap between adjacent phrase segments (common with Whisper timestamps).
 * Produces boundaries so `floor(start*sr)` / `ceil(end*sr)` in {@link sliceAudioBuffer} never assign
 * the same sample to two clips. Times are encoded so existing floor/ceil slicing round-trips:
 * start uses (sample + 0.5)/sr, end uses (exclusiveEndSample - 0.5)/sr.
 *
 * @param maxSampleExclusive — total PCM frames in the buffer (e.g. `audioBuffer.length`).
 */
export function snapSegmentsToNonOverlappingSlices(
  segments: AudioSegmentRange[],
  sampleRate: number,
  maxSampleExclusive: number
): AudioSegmentRange[] {
  if (segments.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return segments;
  const maxEx = Math.max(0, Math.floor(maxSampleExclusive));
  if (maxEx === 0) return segments;

  const minSamples = Math.max(1, Math.floor(sampleRate * 0.02));
  let prevEndExclusive = 0;
  const out: AudioSegmentRange[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const rawStart = Math.max(0, Math.min(maxEx, Math.floor(seg.startSec * sampleRate)));
    const rawEndExclusive = Math.max(0, Math.min(maxEx, Math.ceil(seg.endSec * sampleRate)));

    const startSample = Math.max(rawStart, prevEndExclusive);

    let endExclusive: number;
    if (i + 1 < segments.length) {
      const nextStartFloor = Math.max(
        0,
        Math.min(maxEx, Math.floor(segments[i + 1]!.startSec * sampleRate))
      );
      endExclusive = Math.min(rawEndExclusive, Math.max(startSample + 1, nextStartFloor));
    } else {
      endExclusive = Math.min(maxEx, Math.max(startSample + 1, rawEndExclusive));
    }

    if (endExclusive <= startSample) {
      endExclusive = Math.min(maxEx, startSample + minSamples);
      if (i + 1 < segments.length) {
        const nextStartFloor = Math.max(
          0,
          Math.min(maxEx, Math.floor(segments[i + 1]!.startSec * sampleRate))
        );
        endExclusive = Math.min(endExclusive, Math.max(startSample + 1, nextStartFloor));
      }
    }

    if (endExclusive <= startSample) {
      endExclusive = Math.min(maxEx, startSample + 1);
    }

    out.push({
      startSec: (startSample + 0.5) / sampleRate,
      endSec: (endExclusive - 0.5) / sampleRate,
    });
    prevEndExclusive = endExclusive;
  }

  return out;
}

export type SilenceSegmentOptions = {
  /** Minimum gap between utterances (ms). Silence shorter than this is ignored. */
  minSilenceMs: number;
  /** Multiplier on estimated noise floor. Higher = quieter sounds count as silence. */
  sensitivity: number;
  /** Drop segments shorter than this (ms). */
  minSegmentMs: number;
  /** RMS analysis window (ms). Default 12. */
  frameMs?: number;
  /**
   * Subdivide long speech runs when estimated pitch cluster changes (see `pitchClusters`).
   */
  pitchSplit?: boolean;
  /** New pitch cluster must stay stable this long before we start a new clip. Default 85 ms. */
  pitchHoldMs?: number;
  /** How many pitch groups to separate (2–4). Default 3 for typical 3-person dialogue. */
  pitchClusters?: 2 | 3 | 4;
};

const DEFAULT_FRAME_MS = 12;

/** Mix all channels to mono for analysis. */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = buffer;
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const out = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += ch[i];
  }
  const scale = 1 / numberOfChannels;
  for (let i = 0; i < length; i++) out[i] *= scale;
  return out;
}

/** Lower percentile of RMS values as noise floor (robust to speech outliers). */
export function estimateNoiseFloor(rmsFrames: Float32Array, percentile = 0.12): number {
  if (rmsFrames.length === 0) return 1e-8;
  const sorted = Array.from(rmsFrames).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(percentile * sorted.length)));
  return Math.max(sorted[idx] ?? 0, 1e-8);
}

export function computeFrameRms(mono: Float32Array, sampleRate: number, frameMs: number): {
  rms: Float32Array;
  frameSamples: number;
} {
  const frameSamples = Math.max(256, Math.floor((sampleRate * frameMs) / 1000));
  const nFrames = Math.ceil(mono.length / frameSamples);
  const rms = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    const start = i * frameSamples;
    const end = Math.min(start + frameSamples, mono.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = mono[j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return { rms, frameSamples };
}

/** Autocorrelation peak in voiced-speech lag range → Hz. NaN if unclear. */
export function estimateF0Autocorr(
  mono: Float32Array,
  centerSample: number,
  sampleRate: number,
  windowSamples: number
): number {
  const half = Math.floor(windowSamples / 2);
  let start = Math.floor(centerSample - half);
  if (start < 0) start = 0;
  let end = start + windowSamples;
  if (end > mono.length) {
    end = mono.length;
    start = Math.max(0, end - windowSamples);
  }
  const n = end - start;
  if (n < 512) return NaN;

  const wbuf = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const wi = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
    const v = mono[start + i]! * wi;
    wbuf[i] = v;
    energy += v * v;
  }
  if (energy < 1e-14) return NaN;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += wbuf[i]!;
  mean /= n;
  for (let i = 0; i < n; i++) wbuf[i]! -= mean;

  const minLag = Math.max(2, Math.floor(sampleRate / 550));
  const maxLag = Math.min(Math.floor(n / 2) - 1, Math.ceil(sampleRate / 65));

  let bestLag = -1;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const upto = n - lag;
    for (let i = 0; i < upto; i++) sum += wbuf[i]! * wbuf[i + lag]!;
    const norm = sum / upto;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < 0.15) return NaN;
  const f0 = sampleRate / bestLag;
  if (f0 < 65 || f0 > 520) return NaN;
  return f0;
}

/** Majority vote among class ids 0..maxClass; -1 if window has no confident frames. */
function majorityFilterClassAt(raw: Int8Array, i: number, radius: number, maxClass: number): number {
  const counts = new Int32Array(maxClass + 1);
  let any = false;
  for (let k = -radius; k <= radius; k++) {
    const j = i + k;
    if (j >= 0 && j < raw.length) {
      const v = raw[j]!;
      if (v >= 0 && v <= maxClass) {
        counts[v]++;
        any = true;
      }
    }
  }
  if (!any) return -1;
  let best = 0;
  for (let c = 1; c <= maxClass; c++) {
    if (counts[c]! > counts[best]!) best = c;
  }
  return best;
}

/** Merge silence runs shorter than minSilenceFrames into speech (short gaps stay in one utterance). */
function mergeShortSilence(speech: Uint8Array, minSilenceFrames: number): void {
  const n = speech.length;
  let i = 0;
  while (i < n) {
    if (speech[i]) {
      i++;
      continue;
    }
    const silenceStart = i;
    while (i < n && !speech[i]) i++;
    const silenceLen = i - silenceStart;
    if (silenceLen < minSilenceFrames) {
      for (let k = silenceStart; k < i; k++) speech[k] = 1;
    }
  }
}

const PITCH_WINDOW_SAMPLES = 4096;

function minPitchSamplesForK(k: number): number {
  return Math.max(8, k * 4);
}

/**
 * 1D k-means on log-pitch samples. Labels remapped so 0 = lowest centroid … k-1 = highest.
 */
function kmeans1dLabels(points: number[], k: number): number[] {
  const n = points.length;
  const out: number[] = new Array(n).fill(0);
  if (n < k || k < 2) {
    return out;
  }

  const sorted = [...points].sort((a, b) => a - b);
  const centroids: number[] = [];
  for (let c = 0; c < k; c++) {
    const t = (c + 0.5) / k;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
    centroids.push(sorted[idx]!);
  }

  const labels = new Int32Array(n);
  for (let iter = 0; iter < 28; iter++) {
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(p - centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[i] = best;
    }

    const sum = new Float64Array(k);
    const cnt = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const l = labels[i]!;
      sum[l] += points[i]!;
      cnt[l]++;
    }

    for (let c = 0; c < k; c++) {
      if (cnt[c]! > 0) {
        centroids[c] = sum[c]! / cnt[c]!;
      } else {
        centroids[c] = sorted[Math.min(n - 1, c * Math.max(1, Math.floor(n / k)))]!;
      }
    }
  }

  const orderIdx = Array.from({ length: k }, (_, i) => i).sort((a, b) => centroids[a]! - centroids[b]!);
  const remap = new Int8Array(k);
  for (let rank = 0; rank < k; rank++) {
    remap[orderIdx[rank]!] = rank;
  }

  for (let i = 0; i < n; i++) {
    out[i] = remap[labels[i]!]!;
  }
  return out;
}

/**
 * Split one contiguous speech run when sustained pitch-cluster id changes.
 */
function subdivideSpeechRunByPitchClusters(
  runStart: number,
  runEnd: number,
  frameSpeaker: Int8Array,
  maxClass: number,
  pitchHoldFrames: number,
  minSegmentFrames: number
): { startFrame: number; endFrame: number }[] {
  const runLen = runEnd - runStart;
  if (runLen < 2) {
    return [{ startFrame: runStart, endFrame: runEnd }];
  }

  const rawClass = new Int8Array(runLen);
  let known = 0;
  for (let k = 0; k < runLen; k++) {
    const sid = frameSpeaker[runStart + k]!;
    if (sid < 0) {
      rawClass[k] = -1;
    } else {
      rawClass[k] = sid;
      known++;
    }
  }
  if (known < Math.min(6, maxClass + 3)) {
    return [{ startFrame: runStart, endFrame: runEnd }];
  }

  const smoothed = new Int8Array(runLen);
  for (let k = 0; k < runLen; k++) {
    smoothed[k] = majorityFilterClassAt(rawClass, k, 2, maxClass);
  }

  const pieces: { startFrame: number; endFrame: number }[] = [];
  let segStart = 0;
  for (let j = 1; j < runLen; j++) {
    const prev = smoothed[j - 1]!;
    const cur = smoothed[j]!;
    if (prev < 0 || cur < 0 || cur === prev) continue;

    let holdOk = true;
    for (let t = 0; t < pitchHoldFrames && j + t < runLen; t++) {
      const ct = smoothed[j + t]!;
      if (ct >= 0 && ct !== cur) {
        holdOk = false;
        break;
      }
    }
    if (!holdOk) continue;

    if (j - segStart >= minSegmentFrames) {
      pieces.push({ startFrame: runStart + segStart, endFrame: runStart + j });
    }
    segStart = j;
  }
  if (runLen - segStart >= minSegmentFrames) {
    pieces.push({ startFrame: runStart + segStart, endFrame: runEnd });
  }

  return pieces.length > 0 ? pieces : [{ startFrame: runStart, endFrame: runEnd }];
}

export function findSegmentsFromMono(
  mono: Float32Array,
  sampleRate: number,
  opts: SilenceSegmentOptions
): AudioSegmentRange[] {
  const frameMs = opts.frameMs ?? DEFAULT_FRAME_MS;
  const pitchSplit = opts.pitchSplit !== false;
  const pitchHoldMs = opts.pitchHoldMs ?? 85;
  const pitchClustersRaw = opts.pitchClusters ?? 3;
  const pitchK =
    pitchClustersRaw <= 2 ? 2 : pitchClustersRaw >= 4 ? 4 : 3;

  const { rms, frameSamples } = computeFrameRms(mono, sampleRate, frameMs);
  const noiseFloor = estimateNoiseFloor(rms);
  const threshold = noiseFloor * opts.sensitivity;

  const minSilenceFrames = Math.max(
    1,
    Math.ceil((opts.minSilenceMs / 1000) * (sampleRate / frameSamples))
  );

  const minSegmentFrames = Math.max(
    1,
    Math.ceil((opts.minSegmentMs / 1000) * (sampleRate / frameSamples))
  );

  const pitchHoldFrames = Math.max(1, Math.ceil((pitchHoldMs / 1000) * (sampleRate / frameSamples)));

  const n = rms.length;
  const speech = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    speech[i] = rms[i] > threshold ? 1 : 0;
  }

  mergeShortSilence(speech, minSilenceFrames);

  const logF0 = new Float32Array(n);
  logF0.fill(NaN);

  if (pitchSplit) {
    for (let i = 0; i < n; i++) {
      if (!speech[i] || rms[i]! <= threshold) continue;
      const center = i * frameSamples + frameSamples / 2;
      const f0 = estimateF0Autocorr(mono, center, sampleRate, PITCH_WINDOW_SAMPLES);
      if (Number.isFinite(f0) && f0 > 0) {
        logF0[i] = Math.log(f0);
      }
    }
  }

  const frameSpeaker = new Int8Array(n);
  frameSpeaker.fill(-1);

  const vals: number[] = [];
  const valFrames: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(logF0[i])) {
      vals.push(logF0[i]!);
      valFrames.push(i);
    }
  }

  const minPitchSamples = minPitchSamplesForK(pitchK);
  if (pitchSplit && vals.length >= minPitchSamples) {
    const labels = kmeans1dLabels(vals, pitchK);
    for (let j = 0; j < valFrames.length; j++) {
      frameSpeaker[valFrames[j]!] = labels[j]!;
    }
  }

  const maxClass = pitchK - 1;
  const usePitchSubdivide = pitchSplit && vals.length >= minPitchSamples;

  const totalSamples = mono.length;
  const segments: AudioSegmentRange[] = [];

  let i = 0;
  while (i < n) {
    while (i < n && !speech[i]) i++;
    if (i >= n) break;
    const startFrame = i;
    while (i < n && speech[i]) i++;
    const endFrame = i;

    const runs = usePitchSubdivide
      ? subdivideSpeechRunByPitchClusters(
          startFrame,
          endFrame,
          frameSpeaker,
          maxClass,
          pitchHoldFrames,
          minSegmentFrames
        )
      : [{ startFrame, endFrame }];

    for (const run of runs) {
      const startSample = run.startFrame * frameSamples;
      const endSample = Math.min(run.endFrame * frameSamples, totalSamples);
      const durationSec = (endSample - startSample) / sampleRate;
      if (durationSec * 1000 >= opts.minSegmentMs) {
        segments.push({
          startSec: startSample / sampleRate,
          endSec: endSample / sampleRate,
        });
      }
    }
  }

  return segments;
}

export function sliceAudioBuffer(source: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sr = source.sampleRate;
  const start = Math.min(Math.max(0, Math.floor(startSec * sr)), source.length);
  const end = Math.min(Math.max(start, Math.ceil(endSec * sr)), source.length);
  const len = end - start;
  const out = new AudioBuffer({
    length: len,
    numberOfChannels: source.numberOfChannels,
    sampleRate: sr,
  });
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c).subarray(start, end);
    out.copyToChannel(data, c);
  }
  return out;
}

/** 16-bit PCM little-endian WAV for broad player compatibility. */
export function encodeAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferOut = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufferOut);

  const writeStr = (pos: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(pos + j, s.charCodeAt(j));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]!));
      view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      offset += 2;
    }
  }
  return bufferOut;
}
