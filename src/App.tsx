import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Clock, Loader2, Play, Undo2, Volume2 } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { WaveformPlayer } from './components/WaveformPlayer';
import { VoiceStyleRack } from './components/VoiceStyleRack';
import { VoicesGalleryView } from './components/VoicesGalleryView';
import { HistoryView } from './components/HistoryView';
import {
  ExpressivenessLevel,
  PAUSE_PRESETS,
  PacingOption,
  SAMPLE_SCRIPTS,
  StudioVoiceId,
  ToneToggleId,
  VOCAL_CUES,
  getVoiceById,
} from './data/voices';
import type { ActiveTab, SpeechTake } from './types/tts';
import {
  MAX_SCRIPT_CHARS,
  analyzeScriptText,
  base64ToAudioBlob,
  buildStyleDirective,
  extractWaveformPeaks,
  formatPauseTag,
  formatTimecode,
  validateTtsRequest,
} from './utils/ttsUtils';

const STORAGE_KEY = 'cadence_history_v2';

interface StoredTake {
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
  durationSeconds?: number;
}

function loadSavedHistory(): SpeechTake[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTake[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.voiceId === 'bunty' || item.voiceId === 'jessica'))
      .map((item) => ({
        ...item,
        expressiveness: (['natural', 'conversational', 'expressive'].includes(item.expressiveness)
          ? item.expressiveness
          : 'natural') as ExpressivenessLevel,
      }))
      .slice(0, 25);
  } catch {
    return [];
  }
}

function saveHistory(takes: SpeechTake[]) {
  try {
    const serializable: StoredTake[] = takes.slice(0, 25).map((t) => ({
      id: t.id,
      text: t.text,
      voiceId: t.voiceId,
      voiceName: t.voiceName,
      activeTones: t.activeTones,
      expressiveness: t.expressiveness,
      styleLabel: t.styleLabel,
      styleDirective: t.styleDirective,
      pacing: t.pacing,
      customDirection: t.customDirection,
      createdAt: t.createdAt,
      durationSeconds: t.durationSeconds,
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }
}

async function decodeAudioMetrics(blob: Blob): Promise<{ duration: number; peaks: number[] }> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { duration: 0, peaks: extractWaveformPeaks([], 64) };
    }
    const ctx = new AudioCtx();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channel = decoded.getChannelData(0);
      return {
        duration: decoded.duration,
        peaks: extractWaveformPeaks(channel, 64),
      };
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch {
    return { duration: 0, peaks: extractWaveformPeaks([], 64) };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [scriptText, setScriptText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [selectedVoiceId, setSelectedVoiceId] = useState<StudioVoiceId>(
    SAMPLE_SCRIPTS[0].recommendedVoiceId,
  );
  const [activeTones, setActiveTones] = useState<ToneToggleId[]>(
    SAMPLE_SCRIPTS[0].recommendedTones,
  );
  const [expressiveness, setExpressiveness] = useState<ExpressivenessLevel>('natural');
  const [pacing, setPacing] = useState<PacingOption>('standard');
  const [customDirection, setCustomDirection] = useState<string>('');
  const [customPauseSec, setCustomPauseSec] = useState<string>('0.5');

  const [takes, setTakes] = useState<SpeechTake[]>(() => loadSavedHistory());
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [autoplayToken, setAutoplayToken] = useState<number>(0);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isDirecting, setIsDirecting] = useState<boolean>(false);
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [directorNote, setDirectorNote] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    saveHistory(takes);
  }, [takes]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  const selectedVoice = useMemo(() => getVoiceById(selectedVoiceId), [selectedVoiceId]);
  const metrics = useMemo(() => analyzeScriptText(scriptText, pacing), [scriptText, pacing]);
  const styleSummary = useMemo(
    () => buildStyleDirective(selectedVoiceId, activeTones, expressiveness, pacing, customDirection),
    [selectedVoiceId, activeTones, expressiveness, pacing, customDirection],
  );

  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? null,
    [takes, activeTakeId],
  );

  const sessionPlayableTakes = useMemo(
    () => takes.filter((t) => Boolean(t.audioUrl)).slice(0, 4),
    [takes],
  );

  const handleToggleTone = (toneId: ToneToggleId) => {
    setActiveTones((prev) =>
      prev.includes(toneId) ? prev.filter((id) => id !== toneId) : [...prev, toneId],
    );
  };

  const handleAutoDirect = useCallback(async () => {
    if (isDirecting || isGenerating) return;
    const trimmed = scriptText.trim();
    if (!trimmed) {
      setValidationError('Enter a script first so Auto-Direct can add pauses and vocal cues.');
      textareaRef.current?.focus();
      return;
    }

    setValidationError(null);
    setApiError(null);
    setDirectorNote(null);
    setIsDirecting(true);

    try {
      const response = await fetch('/api/enhance-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          voiceId: selectedVoiceId,
          activeTones,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        enhancedText?: string;
        notes?: string;
        error?: string;
      };

      if (!response.ok || !payload.enhancedText) {
        throw new Error(payload.error || `Auto-Direct failed with status ${response.status}`);
      }

      setPreviousDraft(scriptText);
      setScriptText(payload.enhancedText);
      setDirectorNote(payload.notes || 'Added natural pauses and expressive vocal cues.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach the script director service.';
      setApiError(message);
    } finally {
      setIsDirecting(false);
    }
  }, [isDirecting, isGenerating, scriptText, selectedVoiceId, activeTones]);

  const handleSynthesize = useCallback(async () => {
    if (isGenerating || isDirecting) return;

    const validation = validateTtsRequest({
      text: scriptText,
      voiceId: selectedVoiceId,
      activeTones,
      expressiveness,
      pacing,
      customDirection,
    });

    if (!validation.valid) {
      setValidationError(validation.error ?? 'Please check your script before generating speech.');
      textareaRef.current?.focus();
      return;
    }

    setValidationError(null);
    setApiError(null);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: validation.trimmedText,
          voiceId: validation.voiceId,
          activeTones,
          expressiveness,
          pacing,
          customDirection,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        audioBase64?: string;
        mimeType?: string;
        voiceId?: StudioVoiceId;
        voiceName?: string;
        styleLabel?: string;
        styleDirective?: string;
        durationSeconds?: number;
        error?: string;
      };

      if (!response.ok || !payload.audioBase64) {
        throw new Error(payload.error || `Request failed with status ${response.status}`);
      }

      const mimeType = payload.mimeType || 'audio/mpeg';
      const audioBlob = base64ToAudioBlob(payload.audioBase64, mimeType);
      const audioUrl = URL.createObjectURL(audioBlob);
      blobUrlsRef.current.add(audioUrl);

      const decoded = await decodeAudioMetrics(audioBlob);
      const finalDuration =
        decoded.duration > 0
          ? decoded.duration
          : payload.durationSeconds && payload.durationSeconds > 0
            ? payload.durationSeconds
            : metrics.estimatedSeconds;

      const newTake: SpeechTake = {
        id: `take-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: validation.trimmedText,
        voiceId: payload.voiceId ?? validation.voiceId,
        voiceName: payload.voiceName ?? validation.voiceName,
        activeTones: [...activeTones],
        expressiveness,
        styleLabel: payload.styleLabel ?? validation.styleLabel,
        styleDirective: payload.styleDirective ?? validation.styleDirective,
        pacing,
        customDirection: customDirection.trim(),
        createdAt: new Date().toISOString(),
        audioUrl,
        mimeType,
        durationSeconds: finalDuration,
        waveformPeaks: decoded.peaks,
      };

      setTakes((prev) => [newTake, ...prev].slice(0, 25));
      setActiveTakeId(newTake.id);
      setAutoplayToken((n) => n + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to reach the speech synthesis service.';
      setApiError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    isDirecting,
    scriptText,
    selectedVoiceId,
    activeTones,
    expressiveness,
    pacing,
    customDirection,
    metrics.estimatedSeconds,
  ]);

  const handleInsertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setScriptText((prev) => `${prev}${prev.endsWith(' ') || prev.length === 0 ? '' : ' '}${tag} `);
      return;
    }

    const start = el.selectionStart ?? scriptText.length;
    const end = el.selectionEnd ?? scriptText.length;
    const before = scriptText.slice(0, start);
    const after = scriptText.slice(end);
    const prefix = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const suffix = after.length > 0 && !after.startsWith(' ') ? ' ' : ' ';
    const inserted = `${prefix}${tag}${suffix}`;
    const next = `${before}${inserted}${after}`;

    setScriptText(next);
    setValidationError(null);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = before.length + inserted.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleInsertCustomPause = () => {
    const parsed = Number(customPauseSec);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    handleInsertTag(formatPauseTag(parsed));
  };

  const handleNewScript = () => {
    setActiveTab('studio');
    setScriptText('');
    setPreviousDraft(null);
    setDirectorNote(null);
    setValidationError(null);
    setApiError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleApplySample = (sampleId: string) => {
    const found = SAMPLE_SCRIPTS.find((s) => s.id === sampleId);
    if (!found) return;
    setScriptText(found.text);
    setSelectedVoiceId(found.recommendedVoiceId);
    setActiveTones(found.recommendedTones);
    setCustomDirection('');
    setPreviousDraft(null);
    setDirectorNote(null);
    setValidationError(null);
    setApiError(null);
  };

  const handleUseVoiceInStudio = (
    voiceId: StudioVoiceId,
    defaultTones: ToneToggleId[],
    sampleText: string,
  ) => {
    setSelectedVoiceId(voiceId);
    setActiveTones(defaultTones);
    setCustomDirection('');
    setScriptText(sampleText);
    setPreviousDraft(null);
    setDirectorNote(null);
    setValidationError(null);
    setApiError(null);
    setActiveTab('studio');
  };

  const handlePlayTakeFromHistory = (take: SpeechTake) => {
    setActiveTakeId(take.id);
    setScriptText(take.text);
    setSelectedVoiceId(take.voiceId);
    setActiveTones(take.activeTones);
    setExpressiveness(take.expressiveness);
    setPacing(take.pacing);
    setCustomDirection(take.customDirection);
    setApiError(null);
    setValidationError(null);
    setActiveTab('studio');
    setAutoplayToken((n) => n + 1);
  };

  const handleReloadTake = (take: SpeechTake) => {
    setScriptText(take.text);
    setSelectedVoiceId(take.voiceId);
    setActiveTones(take.activeTones);
    setExpressiveness(take.expressiveness);
    setPacing(take.pacing);
    setCustomDirection(take.customDirection);
    setApiError(null);
    setValidationError(null);
    setActiveTab('studio');
  };

  const handleDeleteTake = (id: string) => {
    setTakes((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target?.audioUrl) {
        URL.revokeObjectURL(target.audioUrl);
        blobUrlsRef.current.delete(target.audioUrl);
      }
      return prev.filter((t) => t.id !== id);
    });
    if (activeTakeId === id) {
      setActiveTakeId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA] text-[#111418]">
      <TopBar
        activeTab={activeTab}
        historyCount={takes.length}
        onSelectTab={setActiveTab}
        onNewScript={handleNewScript}
      />

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'studio' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#111418] [text-wrap:balance]">
                  Voice Studio
                </h1>
                <p className="text-sm sm:text-base text-[#4B5563] mt-1">
                  Write in Hinglish or English, auto-direct pauses and vocal cues, and download studio MP3 audio.
                </p>
              </div>
              <div className="text-xs sm:text-sm text-[#4B5563] flex flex-wrap items-center gap-2 shrink-0">
                <span className="font-semibold text-[#111418]">{selectedVoice.name}</span>
                <span aria-hidden="true">·</span>
                <span>{styleSummary.label}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{expressiveness}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 min-w-0 flex flex-col gap-6">
                <section
                  aria-label="Script composer"
                  className="bg-white border border-[#E2E6EC] rounded-xl overflow-hidden"
                >
                  <div className="px-5 sm:px-6 py-3.5 border-b border-[#EEF0F4] flex flex-wrap items-center justify-between gap-3">
                    <label
                      htmlFor="script-editor"
                      className="font-display text-sm font-semibold text-[#111418]"
                    >
                      Script
                    </label>

                    <div
                      role="group"
                      aria-label="Sample scripts"
                      className="flex items-center gap-1.5 overflow-x-auto max-w-full"
                    >
                      {SAMPLE_SCRIPTS.map((sample) => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => handleApplySample(sample.id)}
                          className="px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {sample.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <textarea
                      ref={textareaRef}
                      id="script-editor"
                      rows={8}
                      value={scriptText}
                      onChange={(e) => {
                        setScriptText(e.target.value);
                        if (validationError) setValidationError(null);
                      }}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          void handleSynthesize();
                        }
                      }}
                      placeholder="Type Hinglish or English text… add cues like <laugh> or <2 second pause>, or click Auto-Direct Script."
                      aria-invalid={Boolean(validationError || metrics.exceedsLimit)}
                      aria-describedby={validationError ? 'script-validation-error' : undefined}
                      className="w-full resize-y min-h-[200px] text-base sm:text-[17px] leading-relaxed text-[#111418] placeholder:text-[#9CA3AF] bg-transparent border-0 focus:outline-none"
                    />

                    {validationError && (
                      <p
                        id="script-validation-error"
                        role="alert"
                        className="mt-2 text-sm font-medium text-[#DC2626]"
                      >
                        {validationError}
                      </p>
                    )}

                    {directorNote && (
                      <div
                        role="status"
                        className="mt-3 px-3.5 py-2.5 rounded-lg bg-[#F7F8FA] border border-[#E2E6EC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#4B5563]"
                      >
                        <span>{directorNote}</span>
                        {previousDraft !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              setScriptText(previousDraft);
                              setPreviousDraft(null);
                              setDirectorNote(null);
                            }}
                            className="inline-flex items-center gap-1 font-semibold text-[#111418] hover:text-[#D94826] whitespace-nowrap cursor-pointer"
                          >
                            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Revert Draft</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-3.5 border-t border-[#EEF0F4] flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-[#6B7280] mr-1">Vocal cues:</span>
                          {VOCAL_CUES.map((cue) => (
                            <button
                              key={cue.tag}
                              type="button"
                              title={cue.description}
                              onClick={() => handleInsertTag(cue.tag)}
                              className="px-2.5 py-1 font-mono text-xs text-[#4B5563] hover:text-[#111418] bg-[#F7F8FA] hover:bg-[#EEF0F4] border border-[#E2E6EC] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              {cue.tag}
                            </button>
                          ))}
                        </div>

                        {scriptText.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setScriptText('');
                              setPreviousDraft(null);
                              setDirectorNote(null);
                              setValidationError(null);
                              textareaRef.current?.focus();
                            }}
                            className="text-xs font-medium text-[#6B7280] hover:text-[#111418] transition-colors cursor-pointer"
                          >
                            Clear text
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] mr-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Pauses:</span>
                          </span>
                          {PAUSE_PRESETS.map((preset) => (
                            <button
                              key={preset.tag}
                              type="button"
                              onClick={() => handleInsertTag(preset.tag)}
                              className="px-2.5 py-1 font-mono text-xs text-[#4B5563] hover:text-[#111418] bg-[#F7F8FA] hover:bg-[#EEF0F4] border border-[#E2E6EC] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}

                          <div className="inline-flex items-center gap-1 ml-1">
                            <input
                              type="number"
                              min={0.2}
                              max={10}
                              step={0.5}
                              value={customPauseSec}
                              onChange={(e) => setCustomPauseSec(e.target.value)}
                              aria-label="Custom pause duration in seconds"
                              className="w-14 px-2 py-1 font-mono text-xs tabular-nums text-[#111418] bg-white border border-[#E2E6EC] rounded-md"
                            />
                            <button
                              type="button"
                              onClick={handleInsertCustomPause}
                              className="px-2.5 py-1 text-xs font-medium text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Insert Pause
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 sm:px-6 py-4 bg-[#FAFBFD] border-t border-[#E2E6EC] flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-[#6B7280]">
                      <span>{metrics.wordCount} words</span>
                      <span aria-hidden="true">·</span>
                      <span className={metrics.exceedsLimit ? 'text-[#DC2626] font-semibold' : ''}>
                        {metrics.charCount.toLocaleString()} / {MAX_SCRIPT_CHARS.toLocaleString()} chars
                      </span>
                      {metrics.pauseCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {metrics.pauseCount} {metrics.pauseCount === 1 ? 'pause' : 'pauses'} ({metrics.pauseSeconds}s)
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>~{formatTimecode(metrics.estimatedSeconds)} est.</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void handleAutoDirect()}
                        disabled={isDirecting || isGenerating}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-[#111418] bg-white hover:bg-[#F3F5F8] disabled:opacity-60 disabled:cursor-not-allowed border border-[#D0D6DF] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isDirecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Directing...</span>
                          </>
                        ) : (
                          <>
                            <AudioLines className="w-4 h-4 text-[#D94826]" aria-hidden="true" />
                            <span>Auto-Direct Script</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSynthesize()}
                        disabled={isGenerating || isDirecting}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D94826] hover:bg-[#BF3A1C] disabled:opacity-65 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Generating MP3...</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4" aria-hidden="true" />
                            <span>Speak Aloud</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>

                <WaveformPlayer
                  activeTake={activeTake}
                  isGenerating={isGenerating}
                  generatingLabel={`Synthesizing MP3 with ${selectedVoice.name} · ${styleSummary.label}...`}
                  errorMessage={apiError}
                  autoplayToken={autoplayToken}
                  onRetry={() => void handleSynthesize()}
                />

                {sessionPlayableTakes.length > 1 && (
                  <section
                    aria-label="Recent session takes"
                    className="bg-white border border-[#E2E6EC] rounded-xl overflow-hidden"
                  >
                    <div className="px-5 sm:px-6 py-3.5 border-b border-[#EEF0F4] flex items-center justify-between gap-2">
                      <h2 className="font-display text-sm font-semibold text-[#111418]">
                        Compare Recent Takes
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className="text-xs font-medium text-[#4B5563] hover:text-[#111418] cursor-pointer"
                      >
                        View all history
                      </button>
                    </div>
                    <div className="divide-y divide-[#EEF0F4]">
                      {sessionPlayableTakes.map((take) => {
                        const isSelected = take.id === activeTakeId;
                        return (
                          <button
                            key={take.id}
                            type="button"
                            onClick={() => {
                              setActiveTakeId(take.id);
                              setAutoplayToken((n) => n + 1);
                            }}
                            className={`w-full text-left px-5 sm:px-6 py-3 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                              isSelected ? 'bg-[#FDF4F2]' : 'hover:bg-[#F7F8FA]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                                <span className="font-semibold text-[#111418]">{take.voiceName}</span>
                                <span aria-hidden="true">·</span>
                                <span>{take.styleLabel}</span>
                                {take.durationSeconds ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">
                                      {formatTimecode(take.durationSeconds)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              <p className="text-xs text-[#4B5563] truncate mt-0.5">{take.text}</p>
                            </div>
                            <Play
                              className={`w-4 h-4 shrink-0 ${
                                isSelected ? 'text-[#D94826] fill-current' : 'text-[#6B7280]'
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              <div className="lg:col-span-4 min-w-0">
                <VoiceStyleRack
                  selectedVoiceId={selectedVoiceId}
                  activeTones={activeTones}
                  expressiveness={expressiveness}
                  pacing={pacing}
                  customDirection={customDirection}
                  onSelectVoice={setSelectedVoiceId}
                  onToggleTone={handleToggleTone}
                  onSelectExpressiveness={setExpressiveness}
                  onSelectPacing={setPacing}
                  onChangeCustomDirection={setCustomDirection}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'voices' && (
          <VoicesGalleryView
            selectedVoiceId={selectedVoiceId}
            onUseVoiceInStudio={handleUseVoiceInStudio}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            takes={takes}
            activeTakeId={activeTakeId}
            onPlayTake={handlePlayTakeFromHistory}
            onLoadTake={handleReloadTake}
            onDeleteTake={handleDeleteTake}
            onOpenStudio={() => setActiveTab('studio')}
          />
        )}
      </main>
    </div>
  );
}
