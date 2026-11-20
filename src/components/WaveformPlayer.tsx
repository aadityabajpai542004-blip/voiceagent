import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { SpeechTake } from '../types/tts';
import { formatTimecode } from '../utils/ttsUtils';

interface WaveformPlayerProps {
  activeTake: SpeechTake | null;
  isGenerating: boolean;
  generatingLabel: string;
  errorMessage: string | null;
  autoplayToken: number;
  onRetry: () => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.3] as const;

const DEFAULT_IDLE_BARS = [
  0.14, 0.22, 0.18, 0.34, 0.42, 0.26, 0.16, 0.38, 0.56, 0.48, 0.3, 0.2, 0.44, 0.62, 0.5, 0.36,
  0.22, 0.4, 0.54, 0.42, 0.28, 0.18, 0.32, 0.46, 0.38, 0.24, 0.18, 0.36, 0.48, 0.34, 0.2, 0.14,
];

export function WaveformPlayer({
  activeTake,
  isGenerating,
  generatingLabel,
  errorMessage,
  autoplayToken,
  onRetry,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);

  const hasAudio = Boolean(activeTake?.audioUrl);
  const peaks = activeTake?.waveformPeaks?.length ? activeTake.waveformPeaks : DEFAULT_IDLE_BARS;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTake?.audioUrl) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(activeTake?.durationSeconds ?? 0);
      return;
    }

    audio.playbackRate = playbackRate;
    audio.muted = isMuted;
    setCurrentTime(0);
    setDuration(activeTake.durationSeconds ?? 0);

    if (autoplayToken > 0) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, [activeTake?.id, activeTake?.audioUrl, autoplayToken]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, rect.width);
    const height = Math.max(64, rect.height);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const gap = Math.max(2, Math.min(4, width / (barCount * 3.2)));
    const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const playheadX = progress * width;
    const centerY = height / 2;

    for (let i = 0; i < barCount; i++) {
      const amp = peaks[i] ?? 0.12;
      const barHeight = Math.max(4, amp * (height - 14));
      const x = i * (barWidth + gap);
      const y = centerY - barHeight / 2;

      if (!hasAudio) {
        ctx.fillStyle = '#E2E6EC';
      } else if (x + barWidth / 2 <= playheadX) {
        ctx.fillStyle = '#D94826';
      } else {
        ctx.fillStyle = '#C9D0DB';
      }

      const radius = Math.min(2, barWidth / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, radius);
      ctx.fill();
    }

    if (hasAudio && duration > 0) {
      ctx.fillStyle = '#111418';
      ctx.fillRect(Math.min(width - 2, Math.max(0, playheadX - 1)), 4, 2, height - 8);
    }

    ctx.restore();
  }, [peaks, currentTime, duration, hasAudio]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    if (audio.paused) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => setIsPlaying(false));
      }
    } else {
      audio.pause();
    }
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    const clamped = Math.max(0, Math.min(duration || 0, nextTime));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hasAudio || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  const handleDownload = () => {
    if (!activeTake?.audioUrl) return;
    const link = document.createElement('a');
    link.href = activeTake.audioUrl;
    const slug = `${activeTake.voiceName}-${activeTake.styleLabel}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    link.download = `cadence-${slug}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section
      aria-label="Audio playback deck"
      data-testid="waveform-player"
      data-state={isGenerating ? 'loading' : errorMessage ? 'error' : hasAudio ? 'ready' : 'idle'}
      className="bg-white border border-[#E2E6EC] rounded-xl p-5 sm:p-6"
    >
      <audio
        ref={audioRef}
        src={activeTake?.audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(duration);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
      />

      {errorMessage ? (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2 min-w-0"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#111418]">Could not synthesize audio</p>
              <p className="text-sm text-[#4B5563] mt-0.5 break-words">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-xs font-semibold text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
          >
            Try Again
          </button>
        </div>
      ) : isGenerating ? (
        <div role="status" aria-live="polite" className="py-4 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center justify-center gap-1.5 h-10" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, idx) => (
              <span
                key={idx}
                className="studio-meter-bar w-1.5 h-8 rounded-full bg-[#D94826]"
                style={{ animationDelay: `${idx * 75}ms` }}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-[#111418]">{generatingLabel}</p>
        </div>
      ) : !hasAudio ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-[#111418]">Playback Deck</h2>
            <span className="font-mono text-xs tabular-nums text-[#6B7280]">0:00 / 0:00</span>
          </div>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="w-full h-16 block rounded-md bg-[#F7F8FA]"
          />
          <p className="text-sm text-[#6B7280]">
            Choose a voice and delivery style, then select Speak Aloud to listen and scrub through the waveform.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#4B5563]">
              <span className="font-semibold text-[#111418] text-sm">{activeTake?.voiceName}</span>
              <span aria-hidden="true">·</span>
              <span>{activeTake?.styleLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">MP3 · 160 kbps</span>
            </div>
            <div className="font-mono text-xs tabular-nums text-[#111418]">
              {formatTimecode(currentTime)} <span className="text-[#6B7280]">/ {formatTimecode(duration)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              data-testid="waveform-canvas"
              className="w-full h-[76px] block rounded-lg bg-[#F7F8FA] cursor-pointer"
            />
            <input
              type="range"
              aria-label="Audio playback position"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.05}
              value={Math.min(currentTime, duration > 0 ? duration : 1)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="w-full accent-[#D94826] h-1.5 bg-[#E2E6EC] rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-[#EEF0F4]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#111418] hover:bg-[#272D35] text-white transition-colors duration-150 cursor-pointer shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime - 5)}
                aria-label="Rewind 5 seconds"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#4B5563] hover:text-[#111418] hover:bg-[#F3F5F8] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime + 5)}
                aria-label="Forward 5 seconds"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#4B5563] hover:text-[#111418] hover:bg-[#F3F5F8] transition-colors cursor-pointer"
              >
                <RotateCw className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#4B5563] hover:text-[#111418] hover:bg-[#F3F5F8] transition-colors cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label="Playback speed"
                className="inline-flex items-center p-0.5 bg-[#F3F5F8] rounded-lg border border-[#E2E6EC]"
              >
                {SPEED_OPTIONS.map((rate) => {
                  const active = playbackRate === rate;
                  return (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      aria-pressed={active}
                      className={`px-2.5 py-1.5 font-mono text-xs tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-white text-[#111418] font-medium shadow-2xs'
                          : 'text-[#6B7280] hover:text-[#111418]'
                      }`}
                    >
                      {rate}x
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download MP3</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
