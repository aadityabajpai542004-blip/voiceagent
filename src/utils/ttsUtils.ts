import {
  EXPRESSIVENESS_OPTIONS,
  ExpressivenessLevel,
  GeminiPrebuiltVoiceName,
  PacingOption,
  StudioVoiceId,
  TONE_TOGGLES,
  ToneToggleId,
  VALID_VOICE_IDS,
  getVoiceById,
} from '../data/voices';

export const MAX_SCRIPT_CHARS = 3000;
export const MIN_PAUSE_SECONDS = 0.2;
export const MAX_PAUSE_SECONDS = 10;
export const HARD_SPLIT_PAUSE_THRESHOLD = 1.0;

export type ScriptSegment =
  | { type: 'speech'; text: string }
  | { type: 'pause'; durationSeconds: number };

export interface ScriptMetrics {
  charCount: number;
  wordCount: number;
  pauseCount: number;
  pauseSeconds: number;
  cueCount: number;
  estimatedSeconds: number;
  exceedsLimit: boolean;
}

export interface TtsRequestInput {
  text: string;
  voiceId: string;
  activeTones: ToneToggleId[];
  expressiveness: ExpressivenessLevel;
  pacing: PacingOption;
  customDirection?: string;
}

export interface TtsValidationResult {
  valid: boolean;
  error?: string;
  trimmedText: string;
  segments: ScriptSegment[];
  voiceId: StudioVoiceId;
  voiceName: string;
  geminiVoice: GeminiPrebuiltVoiceName;
  styleDirective: string;
  styleLabel: string;
  model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
}

const WORDS_PER_MINUTE: Record<PacingOption, number> = {
  slow: 125,
  standard: 160,
  brisk: 190,
};

const PACING_MODIFIER: Record<PacingOption, string> = {
  slow: 'relaxed unhurried pace',
  standard: '',
  brisk: 'brisk conversational pace',
};

// Matches <2 second pause>, <0.5 seconds pause>, <1.5s pause>, <2 sec pause>, <pause 2s>, <pause 1.5 seconds>
const PAUSE_TAG_REGEX =
  /<\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\s*pause|pause\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)?)\s*>/gi;

const VOCAL_CUE_REGEX = /<(laugh|chuckle|breath|sigh|gasp|whisper|hmm)>/gi;

/**
 * Splits a script into ordered speech and pause segments.
 * Short beats (< 1.0s) stay inside one continuous speech segment using natural ellipsis punctuation
 * so the voice sounds completely continuous and unedited; longer pauses (>= 1.0s) emit exact silence segments.
 */
export function parseScriptSegments(text: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  if (!text) return segments;

  const regex = new RegExp(PAUSE_TAG_REGEX.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let speechBuffer = '';

  const flushSpeech = () => {
    const cleaned = speechBuffer.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      segments.push({ type: 'speech', text: cleaned });
    }
    speechBuffer = '';
  };

  const pushPause = (rawSeconds: number) => {
    if (!Number.isFinite(rawSeconds)) return;
    const clamped = Number(
      Math.max(MIN_PAUSE_SECONDS, Math.min(MAX_PAUSE_SECONDS, rawSeconds)).toFixed(2),
    );

    if (clamped < HARD_SPLIT_PAUSE_THRESHOLD) {
      // Keep short beats inside one continuous take so prosody never sounds spliced/edited
      if (speechBuffer.trim().length > 0) {
        speechBuffer = `${speechBuffer.trimEnd()} ... `;
      }
      return;
    }

    flushSpeech();
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'pause') {
      prev.durationSeconds = Number(
        Math.min(MAX_PAUSE_SECONDS, prev.durationSeconds + clamped).toFixed(2),
      );
    } else {
      segments.push({ type: 'pause', durationSeconds: clamped });
    }
  };

  while ((match = regex.exec(text)) !== null) {
    const chunk = text.slice(lastIndex, match.index);
    if (chunk.length > 0) {
      speechBuffer += chunk;
    }
    const numeric = Number(match[1] ?? match[2]);
    pushPause(numeric);
    lastIndex = regex.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (tail.length > 0) {
    speechBuffer += tail;
  }
  flushSpeech();

  return segments;
}

/**
 * Formats a clean pause cue tag like "<2 second pause>" or "<0.5 second pause>".
 */
export function formatPauseTag(seconds: number): string {
  const clamped = Math.max(MIN_PAUSE_SECONDS, Math.min(MAX_PAUSE_SECONDS, seconds));
  const cleanNum = Number.isInteger(clamped) ? String(clamped) : String(Number(clamped.toFixed(1)));
  return `<${cleanNum} second pause>`;
}

/**
 * Computes word count (excluding cue/pause tags), cue counts, pause duration, and estimated audio length.
 */
export function analyzeScriptText(text: string, pacing: PacingOption = 'standard'): ScriptMetrics {
  const regex = new RegExp(PAUSE_TAG_REGEX.source, 'gi');
  let pauseCount = 0;
  let pauseSecondsRaw = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    const numeric = Number(m[1] ?? m[2]);
    if (Number.isFinite(numeric)) {
      pauseCount += 1;
      pauseSecondsRaw += Math.max(MIN_PAUSE_SECONDS, Math.min(MAX_PAUSE_SECONDS, numeric));
    }
  }

  const pauseSeconds = Number(pauseSecondsRaw.toFixed(1));
  const cueMatches = text.match(VOCAL_CUE_REGEX);
  const cueCount = cueMatches ? cueMatches.length : 0;

  const spokenOnly = text
    .replace(PAUSE_TAG_REGEX, ' ')
    .replace(VOCAL_CUE_REGEX, ' ')
    .trim();

  const wordCount = spokenOnly.length === 0 ? 0 : spokenOnly.split(/\s+/).length;
  const wpm = WORDS_PER_MINUTE[pacing] ?? WORDS_PER_MINUTE.standard;
  const speechSeconds = wordCount === 0 ? 0 : (wordCount / wpm) * 60;
  const totalSeconds = speechSeconds + pauseSeconds;
  const estimatedSeconds =
    wordCount === 0 && pauseSeconds === 0 ? 0 : Math.max(1, Math.round(totalSeconds));

  return {
    charCount: text.length,
    wordCount,
    pauseCount,
    pauseSeconds,
    cueCount,
    estimatedSeconds,
    exceedsLimit: text.length > MAX_SCRIPT_CHARS,
  };
}

/**
 * Routes clean everyday reading to gemini-3.8-flash-lite-tts (most natural, least acted),
 * and routes vocal burst tags, expressive mode, or custom persona prompts to gemini-3.8-flash-tts.
 */
export function selectTtsModel(
  text: string,
  expressiveness: ExpressivenessLevel,
  customDirection?: string,
): 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts' {
  if (
    VOCAL_CUE_REGEX.test(text) ||
    expressiveness === 'expressive' ||
    (customDirection ?? '').trim().length > 0
  ) {
    return 'gemini-3.8-flash-tts';
  }
  return 'gemini-3.8-flash-lite-tts';
}

/**
 * Composes a concise, natural style directive for Gemini 3.8 TTS.
 * Short, human-phrased directives sound far more natural than long rulebooks.
 */
export function buildStyleDirective(
  voiceId: StudioVoiceId,
  activeTones: ToneToggleId[],
  expressiveness: ExpressivenessLevel,
  pacing: PacingOption,
  customDirection?: string,
): { directive: string; label: string } {
  const voice = getVoiceById(voiceId);
  const validTones = TONE_TOGGLES.filter((t) => activeTones.includes(t.id));
  const exprOption =
    EXPRESSIVENESS_OPTIONS.find((e) => e.id === expressiveness) ?? EXPRESSIVENESS_OPTIONS[0];
  const paceNote = PACING_MODIFIER[pacing] ?? '';
  const custom = (customDirection ?? '').trim();

  const modifiers: string[] = [exprOption.directive];
  if (paceNote) modifiers.push(paceNote);
  for (const tone of validTones) {
    modifiers.push(tone.promptDirective);
  }

  let directive = `${voice.personaPrompt}; ${modifiers.join(', ')}.`;
  if (custom.length > 0) {
    directive = `${directive} ${custom}.`;
  }

  const toneLabels = validTones.map((t) => t.label);
  const label =
    custom.length > 0
      ? 'Custom Direction'
      : toneLabels.length > 0
        ? toneLabels.slice(0, 3).join(' · ')
        : voice.tagline;

  return {
    directive,
    label,
  };
}

/**
 * Validates and normalizes a TTS synthesis request (shared between client and server).
 */
export function validateTtsRequest(input: TtsRequestInput): TtsValidationResult {
  const trimmedText = (input.text ?? '').trim();
  const validVoiceId = VALID_VOICE_IDS.includes(input.voiceId as StudioVoiceId)
    ? (input.voiceId as StudioVoiceId)
    : null;
  const voice = getVoiceById(validVoiceId ?? 'bunty');
  const segments = parseScriptSegments(trimmedText);
  const speechSegments = segments.filter((s) => s.type === 'speech');

  const activeTones = Array.isArray(input.activeTones)
    ? input.activeTones.filter((t) => TONE_TOGGLES.some((opt) => opt.id === t))
    : voice.defaultTones;

  const expressiveness = input.expressiveness ?? 'natural';
  const { directive, label } = buildStyleDirective(
    voice.id,
    activeTones,
    expressiveness,
    input.pacing ?? 'standard',
    input.customDirection,
  );
  const model = selectTtsModel(trimmedText, expressiveness, input.customDirection);

  if (trimmedText.length === 0 || speechSegments.length === 0) {
    return {
      valid: false,
      error: 'Enter some spoken text before generating audio.',
      trimmedText,
      segments,
      voiceId: voice.id,
      voiceName: voice.name,
      geminiVoice: voice.geminiVoice,
      styleDirective: directive,
      styleLabel: label,
      model,
    };
  }

  if (trimmedText.length > MAX_SCRIPT_CHARS) {
    return {
      valid: false,
      error: `Script must be ${MAX_SCRIPT_CHARS.toLocaleString()} characters or fewer.`,
      trimmedText,
      segments,
      voiceId: voice.id,
      voiceName: voice.name,
      geminiVoice: voice.geminiVoice,
      styleDirective: directive,
      styleLabel: label,
      model,
    };
  }

  if (!validVoiceId) {
    return {
      valid: false,
      error: `Unsupported voice "${input.voiceId}". Choose Bunty or Jessica.`,
      trimmedText,
      segments,
      voiceId: voice.id,
      voiceName: voice.name,
      geminiVoice: voice.geminiVoice,
      styleDirective: directive,
      styleLabel: label,
      model,
    };
  }

  return {
    valid: true,
    trimmedText,
    segments,
    voiceId: voice.id,
    voiceName: voice.name,
    geminiVoice: voice.geminiVoice,
    styleDirective: directive,
    styleLabel: label,
    model,
  };
}

/**
 * Downsamples decoded PCM Float32 audio channel samples into normalized waveform bars.
 */
export function extractWaveformPeaks(channelData: Float32Array | number[], barCount: number): number[] {
  const count = Math.max(1, Math.floor(barCount));
  if (!channelData || channelData.length === 0) {
    return Array.from({ length: count }, () => 0.12);
  }

  const blockSize = Math.max(1, Math.floor(channelData.length / count));
  const rawPeaks: number[] = [];
  let maxPeak = 0;

  for (let i = 0; i < count; i++) {
    const start = i * blockSize;
    const end = i === count - 1 ? channelData.length : Math.min(channelData.length, start + blockSize);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j] ?? 0);
      if (abs > peak) peak = abs;
    }
    rawPeaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  if (maxPeak === 0) {
    return Array.from({ length: count }, () => 0.12);
  }

  return rawPeaks.map((p) => {
    const normalized = p / maxPeak;
    return Number(Math.max(0.08, Math.min(1, normalized)).toFixed(3));
  });
}

/**
 * Formats seconds into tabular M:SS timecode.
 */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Converts a base64-encoded audio string into a browser Blob.
 */
export function base64ToAudioBlob(base64: string, mimeType = 'audio/mpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
