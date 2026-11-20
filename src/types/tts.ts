import type {
  ExpressivenessLevel,
  PacingOption,
  StudioVoiceId,
  ToneToggleId,
} from '../data/voices';

export interface SpeechTake {
  id: string;
  text: string;
  voiceId: StudioVoiceId;
  voiceName: string;
  activeTones: ToneToggleId[];
  expressiveness: ExpressivenessLevel;
  styleLabel: string;
  styleDirective: string;
  pacing: PacingOption;
  customDirection: string;
  createdAt: string;
  audioUrl?: string;
  mimeType?: string;
  durationSeconds?: number;
  waveformPeaks?: number[];
}

export type ActiveTab = 'studio' | 'voices' | 'history';
