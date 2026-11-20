export type StudioVoiceId = 'bunty' | 'jessica';

export type GeminiPrebuiltVoiceName = 'Puck' | 'Zephyr';

export type ToneToggleId =
  | 'hinglish'
  | 'warm'
  | 'playful'
  | 'energetic'
  | 'sarcastic'
  | 'dramatic';

export type ExpressivenessLevel = 'natural' | 'conversational' | 'expressive';

export type PacingOption = 'slow' | 'standard' | 'brisk';

export interface StudioVoiceProfile {
  id: StudioVoiceId;
  name: string;
  tagline: string;
  referenceId: string;
  geminiVoice: GeminiPrebuiltVoiceName;
  register: string;
  timbre: string;
  bestFor: string;
  personaPrompt: string;
  referenceAudioUrl: string;
  defaultTones: ToneToggleId[];
  sampleLine: string;
}

export interface ToneToggleOption {
  id: ToneToggleId;
  label: string;
  shortNote: string;
  promptDirective: string;
}

export interface SampleScript {
  id: string;
  label: string;
  recommendedVoiceId: StudioVoiceId;
  recommendedTones: ToneToggleId[];
  text: string;
}

export interface VocalCue {
  tag: string;
  label: string;
  description: string;
}

export interface PausePreset {
  seconds: number;
  tag: string;
  label: string;
}

export const VOICES: StudioVoiceProfile[] = [
  {
    id: 'bunty',
    name: 'Bunty',
    tagline: 'Natural Hinglish Male',
    referenceId: '7b9mYhmnp0y2qSH1FnBL',
    geminiVoice: 'Puck',
    register: 'Natural Mid-Range Male',
    timbre: 'Light, easygoing North-Indian Hinglish everyday voice',
    bestFor: 'Natural Hinglish reels, casual explainers, everyday commentary',
    personaPrompt:
      'Natural, relaxed young North Indian male speaking everyday conversational Hinglish calmly to a friend',
    referenceAudioUrl: '/assets/aistudio/day_12__mp3cut.net___1__6d60000f.mp3',
    defaultTones: ['hinglish'],
    sampleLine:
      'Hum 3,000 rupaye ke pamphlets chapwa ke newspaper mein dalwate hain, aur agle din usme bhelpuri bik rahi hoti hai. Par jo customer pehle se aapki dukaan ke andar khada hai, usko wapas laane ke system pe hum sochte hain... yaar, digital loyalty toh bada mehenga hoga. Sach batao, ek naye anjaan bande ko dhoondhna sasta hai, ya aaj ke customer ko agle hafte wapas bulana?',
  },
  {
    id: 'jessica',
    name: 'Jessica',
    tagline: 'Playful, Bright, Warm',
    referenceId: 'r1KmysJdVYZjJCm4mL3b',
    geminiVoice: 'Zephyr',
    register: 'Bright Upbeat Female',
    timbre: 'Crisp, smiling, energetic storyteller with warm clarity',
    bestFor: 'Short-form stories, playful Hinglish & English hooks, fast facts',
    personaPrompt:
      'Playful, bright, warm young female narrator speaking with clear, upbeat rhythm',
    referenceAudioUrl:
      '/assets/aistudio/ElevenLabs_2026-11-16T05_40_18_Hope_-_upbeat_and_clear_pvc_s50_sim75_v4__mp3cut.net__15aeb862.mp3',
    defaultTones: ['warm', 'playful'],
    sampleLine:
      'If you put a bucket on a rope, you have an elevator. But your friend gets tired, fast. So you add a pulley and a counterweight. Now the stone does half the work, until the rope snaps and you fall four floors.',
  },
];

export const VALID_VOICE_IDS: readonly StudioVoiceId[] = VOICES.map((v) => v.id);

export const TONE_TOGGLES: ToneToggleOption[] = [
  {
    id: 'hinglish',
    label: 'Hinglish Natural',
    shortNote: 'Authentic Hindi-English flow',
    promptDirective: 'authentic Indian Hinglish pronunciation and everyday Hindi-English cadence',
  },
  {
    id: 'warm',
    label: 'Warm',
    shortNote: 'Friendly & grounded',
    promptDirective: 'warm friendly tone',
  },
  {
    id: 'playful',
    label: 'Playful',
    shortNote: 'Light, dry wit',
    promptDirective: 'subtle playful smile',
  },
  {
    id: 'energetic',
    label: 'Energetic',
    shortNote: 'Crisp forward momentum',
    promptDirective: 'crisp lively pace',
  },
  {
    id: 'sarcastic',
    label: 'Sarcastic',
    shortNote: 'Subtle knowing irony',
    promptDirective: 'understated dry irony',
  },
  {
    id: 'dramatic',
    label: 'Dramatic',
    shortNote: 'Measured serious emphasis',
    promptDirective: 'measured serious emphasis',
  },
];

export const EXPRESSIVENESS_OPTIONS: {
  id: ExpressivenessLevel;
  label: string;
  directive: string;
}[] = [
  {
    id: 'natural',
    label: 'Natural',
    directive: 'calm, unforced, completely natural everyday speech',
  },
  {
    id: 'conversational',
    label: 'Conversational',
    directive: 'relaxed conversational inflection with gentle emphasis',
  },
  {
    id: 'expressive',
    label: 'Expressive',
    directive: 'lively storytelling inflection and clear punchline emphasis',
  },
];

export const VOCAL_CUES: VocalCue[] = [
  { tag: '<breath>', label: 'Breath', description: 'Insert a subtle natural intake breath' },
  { tag: '<sigh>', label: 'Sigh', description: 'Insert a quiet relatable sigh' },
  { tag: '<chuckle>', label: 'Chuckle', description: 'Insert a brief, understated chuckle' },
  { tag: '<laugh>', label: 'Laugh', description: 'Insert a natural laugh' },
  { tag: '<gasp>', label: 'Gasp', description: 'Insert a quick surprised intake' },
  { tag: '<whisper>', label: 'Whisper', description: 'Drop to a soft aside' },
  { tag: '<hmm>', label: 'Hmm', description: 'Insert a brief thoughtful hum' },
];

export const PAUSE_PRESETS: PausePreset[] = [
  { seconds: 0.3, tag: '<0.3 second pause>', label: '0.3s beat' },
  { seconds: 0.5, tag: '<0.5 second pause>', label: '0.5s pause' },
  { seconds: 1, tag: '<1 second pause>', label: '1s pause' },
  { seconds: 2, tag: '<2 second pause>', label: '2s pause' },
];

export const SAMPLE_SCRIPTS: SampleScript[] = [
  {
    id: 'hinglish-reel',
    label: 'Hinglish Business',
    recommendedVoiceId: 'bunty',
    recommendedTones: ['hinglish'],
    text: 'Hum 3,000 rupaye ke pamphlets chapwa ke newspaper mein dalwate hain, aur agle din usme bhelpuri bik rahi hoti hai. Par jo customer pehle se aapki dukaan ke andar khada hai, usko wapas laane ke system pe hum sochte hain... yaar, digital loyalty toh bada mehenga hoga. Sach batao, ek naye anjaan bande ko dhoondhna sasta hai, ya aaj ke customer ko agle hafte wapas bulana?',
  },
  {
    id: 'chai-banter',
    label: 'Everyday Hinglish',
    recommendedVoiceId: 'bunty',
    recommendedTones: ['hinglish', 'warm'],
    text: 'Monday subah 7 baje gym jaane ka plan sab banate hain, par alarm bajte hi snooze button ka asli power samajh aata hai. Phir hum khud ko bolte hain, chalo aaj shaam pakka jaayenge, aur shaam ko garam chai pee lete hain.',
  },
  {
    id: 'hinglish-cta',
    label: 'Clean Product Pitch',
    recommendedVoiceId: 'bunty',
    recommendedTones: ['hinglish', 'warm'],
    text: 'Loyalty QR code pe aapko pehle 30 din ka free trial milta hai, bina kisi credit card ke. Aur uske baad starter plan sirf 10 dollar per month hai, jisme unlimited QR scans aur printable posters sab shaamil hain. Pamphlets pe paisa jalane se pehle ek baar free trial check karo.',
  },
  {
    id: 'fast-story',
    label: 'Fast Fact Story',
    recommendedVoiceId: 'jessica',
    recommendedTones: ['warm', 'playful'],
    text: 'If you put a bucket on a rope, you have an elevator. But your friend gets tired, fast. So you add a pulley and a counterweight. Now the stone does half the work, until the rope snaps and you fall four floors.',
  },
];

export function getVoiceById(id: string): StudioVoiceProfile {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}
