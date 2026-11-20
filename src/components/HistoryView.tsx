import { useMemo, useState } from 'react';
import { Download, Play, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { SpeechTake } from '../types/tts';
import { formatTimecode } from '../utils/ttsUtils';

interface HistoryViewProps {
  takes: SpeechTake[];
  activeTakeId: string | null;
  onPlayTake: (take: SpeechTake) => void;
  onLoadTake: (take: SpeechTake) => void;
  onDeleteTake: (id: string) => void;
  onOpenStudio: () => void;
}

export function HistoryView({
  takes,
  activeTakeId,
  onPlayTake,
  onLoadTake,
  onDeleteTake,
  onOpenStudio,
}: HistoryViewProps) {
  const [query, setQuery] = useState('');

  const filteredTakes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return takes;
    return takes.filter(
      (take) =>
        take.text.toLowerCase().includes(q) ||
        take.voiceName.toLowerCase().includes(q) ||
        take.styleLabel.toLowerCase().includes(q),
    );
  }, [takes, query]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleDownloadTake = (take: SpeechTake) => {
    if (!take.audioUrl) return;
    const link = document.createElement('a');
    link.href = take.audioUrl;
    const slug = `${take.voiceName}-${take.styleLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `cadence-${slug}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section aria-label="Speech history" className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#111418]">
            Take History
          </h1>
          <p className="text-sm sm:text-base text-[#4B5563] mt-1">
            Replay takes from this session or reload earlier scripts and voice configurations back into the composer.
          </p>
        </div>

        {takes.length > 0 && (
          <div className="relative">
            <Search
              className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search history takes"
              placeholder="Search scripts or voices..."
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-white border border-[#E2E6EC] rounded-lg text-[#111418] placeholder:text-[#9CA3AF] focus:border-[#D94826]"
            />
          </div>
        )}
      </div>

      {takes.length === 0 ? (
        <div className="bg-white border border-[#E2E6EC] rounded-xl p-10 sm:p-14 text-center">
          <h2 className="font-display text-lg font-semibold text-[#111418]">No takes recorded yet</h2>
          <p className="text-sm text-[#6B7280] max-w-md mx-auto mt-1.5">
            Every script you synthesize in the studio appears here so you can replay audio, download MP3 files, or reuse settings.
          </p>
          <button
            type="button"
            onClick={onOpenStudio}
            className="mt-5 px-5 py-2.5 text-sm font-semibold text-white bg-[#D94826] hover:bg-[#BF3A1C] rounded-lg transition-colors cursor-pointer"
          >
            Open Studio
          </button>
        </div>
      ) : filteredTakes.length === 0 ? (
        <div className="bg-white border border-[#E2E6EC] rounded-xl p-10 text-center">
          <p className="text-base font-semibold text-[#111418]">No takes match “{query}”</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 px-4 py-2 text-sm font-medium text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E6EC] rounded-xl divide-y divide-[#E2E6EC]">
          {filteredTakes.map((take) => {
            const isActive = take.id === activeTakeId;
            return (
              <article
                key={take.id}
                className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isActive ? 'bg-[#FDF4F2]/50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                    <span className="font-semibold text-[#111418] text-sm">{take.voiceName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{take.styleLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{take.pacing} pace</span>
                    {typeof take.durationSeconds === 'number' && take.durationSeconds > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatTimecode(take.durationSeconds)}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(take.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#111418] mt-1.5 line-clamp-2">{take.text}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {take.audioUrl ? (
                    <button
                      type="button"
                      onClick={() => onPlayTake(take)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111418] hover:bg-[#272D35] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                      <span>Play in Studio</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onLoadTake(take)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reload & Synthesize</span>
                    </button>
                  )}

                  {take.audioUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownloadTake(take)}
                      aria-label={`Download MP3 for ${take.voiceName} take`}
                      className="inline-flex items-center justify-center w-9 h-9 text-[#4B5563] hover:text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteTake(take.id)}
                    aria-label={`Delete take "${take.text.slice(0, 24)}"`}
                    className="inline-flex items-center justify-center w-9 h-9 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
