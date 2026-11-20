import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Square, Volume2 } from 'lucide-react';
import { StudioVoiceId, ToneToggleId, VOICES } from '../data/voices';

interface VoicesGalleryViewProps {
  selectedVoiceId: StudioVoiceId;
  onUseVoiceInStudio: (
    voiceId: StudioVoiceId,
    defaultTones: ToneToggleId[],
    sampleText: string,
  ) => void;
}

export function VoicesGalleryView({
  selectedVoiceId,
  onUseVoiceInStudio,
}: VoicesGalleryViewProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<StudioVoiceId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const toggleReferenceClip = (voiceId: StudioVoiceId, url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
      return;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);
    audio.onended = () => {
      setPlayingVoiceId((prev) => (prev === voiceId ? null : prev));
    };
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => setPlayingVoiceId(null));
    }
  };

  return (
    <section aria-label="Voice directory" className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#111418]">
          Studio Voices
        </h1>
        <p className="text-sm sm:text-base text-[#4B5563] mt-1">
          Two custom-directed Hinglish &amp; English voices modeled on your reference clips, ready to synthesize with zero third-party keys.
        </p>
      </div>

      <div className="bg-white border border-[#E2E6EC] rounded-xl divide-y divide-[#E2E6EC]">
        {VOICES.map((voice) => {
          const isCurrent = selectedVoiceId === voice.id;
          const isPlayingRef = playingVoiceId === voice.id;
          return (
            <div
              key={voice.id}
              className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                  <h2 className="font-display text-lg font-semibold text-[#111418]">
                    {voice.name}
                  </h2>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#111418] font-medium">{voice.tagline}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Ref {voice.referenceId}</span>
                  {isCurrent && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#D94826]">Selected in Studio</span>
                    </>
                  )}
                </div>

                <p className="text-sm text-[#4B5563] mt-1.5">
                  {voice.timbre} — ideal for {voice.bestFor.toLowerCase()}.
                </p>

                <p className="text-sm text-[#6B7280] italic mt-2.5">“{voice.sampleLine}”</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleReferenceClip(voice.id, voice.referenceAudioUrl)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#111418] bg-white hover:bg-[#F3F5F8] border border-[#E2E6EC] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isPlayingRef ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current text-[#D94826]" aria-hidden="true" />
                      <span>Stop Reference</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-[#4B5563]" aria-hidden="true" />
                      <span>Hear Reference Clip</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUseVoiceInStudio(voice.id, voice.defaultTones, voice.sampleLine)
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#111418] bg-[#F3F5F8] hover:bg-[#111418] hover:text-white border border-[#E2E6EC] rounded-lg transition-colors duration-150 whitespace-nowrap cursor-pointer"
                >
                  <span>Use {voice.name} in Studio</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
