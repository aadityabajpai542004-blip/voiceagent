import { Mp3Encoder } from '@breezystack/lamejs';

export const DEFAULT_SAMPLE_RATE = 24000;

export interface ParsedWavPcm {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
}

/**
 * Extracts raw 16-bit little-endian PCM bytes and sample rate from a RIFF WAV buffer.
 */
export function stripWavHeader(wavBuffer: Buffer): ParsedWavPcm {
  if (
    wavBuffer.length >= 44 &&
    wavBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    wavBuffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    let sampleRate = DEFAULT_SAMPLE_RATE;
    let channels = 1;
    let offset = 12;

    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      const dataStart = offset + 8;

      if (chunkId === 'fmt ' && dataStart + 12 <= wavBuffer.length) {
        channels = wavBuffer.readUInt16LE(dataStart + 2) || 1;
        sampleRate = wavBuffer.readUInt32LE(dataStart + 4) || DEFAULT_SAMPLE_RATE;
      } else if (chunkId === 'data') {
        const dataEnd = Math.min(wavBuffer.length, dataStart + chunkSize);
        const pcm = wavBuffer.subarray(dataStart, dataEnd);
        const evenLength = pcm.length - (pcm.length % 2);
        return {
          pcm: pcm.subarray(0, evenLength),
          sampleRate,
          channels,
        };
      }

      offset = dataStart + chunkSize + (chunkSize % 2);
    }

    const fallback = wavBuffer.subarray(44);
    const evenLength = fallback.length - (fallback.length % 2);
    return {
      pcm: fallback.subarray(0, evenLength),
      sampleRate,
      channels,
    };
  }

  const evenLength = wavBuffer.length - (wavBuffer.length % 2);
  return {
    pcm: wavBuffer.subarray(0, evenLength),
    sampleRate: DEFAULT_SAMPLE_RATE,
    channels: 1,
  };
}

/**
 * Trims excessive model-generated leading/trailing dead air from a 16-bit mono PCM clip
 * while preserving a soft natural breath cushion and applying a 10ms de-click fade ramp.
 */
export function trimSilenceEdges(
  pcmBuffer: Buffer,
  sampleRate = DEFAULT_SAMPLE_RATE,
  options?: { threshold?: number; leadMs?: number; trailMs?: number; fadeMs?: number },
): Buffer {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount === 0) return Buffer.alloc(0);

  const threshold = options?.threshold ?? 180;
  const leadSamples = Math.round(((options?.leadMs ?? 40) / 1000) * sampleRate);
  const trailSamples = Math.round(((options?.trailMs ?? 80) / 1000) * sampleRate);
  const fadeSamples = Math.round(((options?.fadeMs ?? 25) / 1000) * sampleRate);

  let firstActive = -1;
  let lastActive = -1;

  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.abs(pcmBuffer.readInt16LE(i * 2));
    if (sample > threshold) {
      if (firstActive === -1) firstActive = i;
      lastActive = i;
    }
  }

  if (firstActive === -1 || lastActive === -1) {
    return Buffer.from(pcmBuffer);
  }

  const startSample = Math.max(0, firstActive - leadSamples);
  const endSample = Math.min(sampleCount, lastActive + 1 + trailSamples);
  const trimmed = Buffer.from(pcmBuffer.subarray(startSample * 2, endSample * 2));
  const outSamples = Math.floor(trimmed.length / 2);

  const actualFade = Math.min(fadeSamples, Math.floor(outSamples / 4));
  for (let i = 0; i < actualFade; i++) {
    const gain = i / actualFade;
    const headVal = Math.round(trimmed.readInt16LE(i * 2) * gain);
    trimmed.writeInt16LE(headVal, i * 2);

    const tailIdx = outSamples - 1 - i;
    const tailVal = Math.round(trimmed.readInt16LE(tailIdx * 2) * gain);
    trimmed.writeInt16LE(tailVal, tailIdx * 2);
  }

  return trimmed;
}

/**
 * Creates a sample-accurate 16-bit mono silence PCM buffer for exact pause cues.
 */
export function createSilencePcm(
  durationSeconds: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Buffer {
  const safeSeconds = Math.max(0, durationSeconds);
  const sampleCount = Math.round(safeSeconds * sampleRate);
  return Buffer.alloc(sampleCount * 2);
}

/**
 * Encodes a 16-bit signed little-endian mono PCM buffer into a standards-compliant MP3 buffer.
 */
export function encodePcmToMp3(
  pcmBuffer: Buffer,
  sampleRate = DEFAULT_SAMPLE_RATE,
  kbps = 128,
): Buffer {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const samples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    samples[i] = pcmBuffer.readInt16LE(i * 2);
  }

  const mp3Chunks: Buffer[] = [];
  const blockSize = 1152;

  for (let i = 0; i < samples.length; i += blockSize) {
    const slice = samples.subarray(i, Math.min(samples.length, i + blockSize));
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) {
      mp3Chunks.push(Buffer.from(encoded));
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(Buffer.from(flushed));
  }

  return Buffer.concat(mp3Chunks);
}
