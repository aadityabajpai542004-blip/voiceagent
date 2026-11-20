import { useEffect, useRef, useState } from 'react';
import { Check, Square, Volume2, X } from 'lucide-react';
import {
  EXPRESSIVENESS_OPTIONS,
  ExpressivenessLevel,
  PacingOption,
  StudioVoiceId,
  TONE_TOGGLES,
  ToneToggleId,
  VOICES,
} from '../data/voices';

interface VoiceStyleRackProps {
  selectedVoiceId: StudioVoiceId;
  activeTones: ToneToggleId[];
  expressiveness: ExpressivenessLevel;
  pacing: PacingOption;
  customDirection: string;
  onSelectVoice: (voiceId: StudioVoiceId) => void;
  onToggleTone: (toneId: ToneToggleId) => void;
  onSelectExpressiveness: (level: ExpressivenessLevel) => void;
  onSelectPacing: (pacing: PacingOption) => void;
  onChangeCustomDirection: (value: string) => void;
}

const PACING_ITEMS: { id: PacingOption; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'standard', label: 'Standard' },
  { id: 'brisk', label: 'Brisk' },
];

export function VoiceStyleRack({
  selectedVoiceId,
  activeTones,
  expressiveness,
  pacing,
  customDirection,
  onSelectVoice,
  onToggleTone,
  onSelectExpressiveness,
  onSelectPacing,
  onChangeCustomDirection,
}: VoiceStyleRackProps) {
  const [previewVoiceId, setPreviewVoiceId] = useState<StudioVoiceId | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleToggleReference = (voiceId: StudioVoiceId, audioUrl: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (previewVoiceId === voiceId) {
      setPreviewVoiceId(null);
      return;
    }

    const audio = new Audio(audioUrl);
    previewAudioRef.current = audio;
    setPreviewVoiceId(voiceId);

    audio.onended = () => {
      setPreviewVoiceId((current) => (current === voiceId ? null : current));
    };

    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => setPreviewVoiceId(null));
    }
  };

  return (
    <aside
      aria-label="Voice and tone controls"
      className="bg-white border border-[#E2E6EC] rounded-xl divide-y divide-[#E2E6EC]"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-2 mb-3.5">
          <h2 className="font-display text-base font-semibold text-[#111418]">Voice</h2>
          <span className="text-xs text-[#6B7280]">2 custom-matched voices</span>
        </div>

        <div className="flex flex-col gap-2.5" role="group" aria-label="Voice selection">
          {VOICES.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            const isPreviewing = previewVoiceId === voice.id;
            return (
              <div
                key={voice.id}
                className={`rounded-lg border transition-colors duration-150 ${
                  isSelected
                    ? 'bg-[#FDF4F2] border-[#D94826]'
                    : 'bg-[#F7F8FA] border-transparent hover:border-[#D0D6DF]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 p-3.5">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectVoice(voice.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#111418]">{voice.name}</span>
                      <span className="text-xs text-[#6B7280]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs font-medium text-[#4B5563]">{voice.tagline}</span>
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 text-[#D94826] shrink-0 ml-auto"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1">{voice.timbre}</p>
                    <p className="font-mono text-[11px] text-[#6B7280] mt-1 truncate">
                      Ref {voice.referenceId}
                    </p>
                  </button>
                </div>

                <div className="px-3.5 pb-3 pt-0 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleReference(voice.id, voice.referenceAudioUrl)}
                    aria-label={
                      isPreviewing
                        ? `Stop ${voice.name} reference sample`
                        : `Play ${voice.name} reference sample`
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111418] bg-white hover:bg-[#EEF0F4] border border-[#E2E6EC] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isPreviewing ? (
                      <>
                        <Square className="w-3 h-3 fill-current text-[#D94826]" aria-hidden="true" />
                        <span>Stop Reference</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-[#4B5563]" aria-hidden="true" />
                        <span>Hear Reference</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-[#6B7280]">{voice.register}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-2 mb-3.5">
          <h2 className="font-display text-base font-semibold text-[#111418]">Tone Toggles</h2>
          <span className="font-mono text-xs tabular-nums text-[#6B7280]">
            {activeTones.length} active
          </span>
        </div>

        <div className="flex flex-col gap-2" role="group" aria-label="Tone adjustments">
          {TONE_TOGGLES.map((tone) => {
            const isOn = activeTones.includes(tone.id);
            return (
              <button
                key={tone.id}
                type="button"
                role="switch"
                aria-checked={isOn}
                onClick={() => onToggleTone(tone.id)}
                className={`w-full px-3.5 py-2.5 rounded-lg border transition-colors duration-150 flex items-center justify-between gap-3 text-left cursor-pointer ${
                  isOn
                    ? 'bg-[#FDF4F2] border-[#D94826]/60'
                    : 'bg-[#F7F8FA] border-transparent hover:border-[#D0D6DF]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#111418] leading-snug">{tone.label}</div>
                  <div className="text-xs text-[#6B7280] truncate">{tone.shortNote}</div>
                </div>

                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
                    isOn ? 'bg-[#D94826]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-2xs transition-transform duration-150 ${
                      isOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <span className="block text-xs font-semibold text-[#111418] mb-2">Expressiveness</span>
          <div
            role="group"
            aria-label="Expressiveness level"
            className="grid grid-cols-3 gap-1 p-1 bg-[#F3F5F8] rounded-lg border border-[#E2E6EC]"
          >
            {EXPRESSIVENESS_OPTIONS.map((item) => {
              const active = expressiveness === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectExpressiveness(item.id)}
                  className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-[#111418] font-semibold shadow-2xs'
                      : 'text-[#6B7280] hover:text-[#111418]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold text-[#111418] mb-2">Pacing</span>
          <div
            role="group"
            aria-label="Speaking pace"
            className="grid grid-cols-3 gap-1 p-1 bg-[#F3F5F8] rounded-lg border border-[#E2E6EC]"
          >
            {PACING_ITEMS.map((item) => {
              const active = pacing === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectPacing(item.id)}
                  className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-[#111418] font-semibold shadow-2xs'
                      : 'text-[#6B7280] hover:text-[#111418]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="custom-style-direction" className="text-xs font-semibold text-[#111418]">
              Custom Voice Direction
            </label>
            <span className="text-xs text-[#6B7280]">Optional</span>
          </div>
          <div className="relative">
            <input
              id="custom-style-direction"
              type="text"
              value={customDirection}
              onChange={(e) => onChangeCustomDirection(e.target.value)}
              placeholder="e.g. Delhi best friend cracking a joke on a reel"
              maxLength={160}
              className="w-full px-3 py-2.5 pr-9 text-sm text-[#111418] placeholder:text-[#9CA3AF] bg-[#F7F8FA] border border-[#E2E6EC] rounded-lg focus:bg-white focus:border-[#D94826] transition-colors"
            />
            {customDirection.trim().length > 0 && (
              <button
                type="button"
                aria-label="Clear custom voice direction"
                onClick={() => onChangeCustomDirection('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#6B7280] hover:text-[#111418] cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-xs text-[#6B7280] mt-1.5">
            Layers extra delivery notes on top of {selectedVoiceId === 'bunty' ? 'Bunty' : 'Jessica'} and your active tone toggles.
          </p>
        </div>
      </div>
    </aside>
  );
}
