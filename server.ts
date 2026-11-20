import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { validateTtsRequest } from './src/utils/ttsUtils.ts';
import {
  DEFAULT_SAMPLE_RATE,
  createSilencePcm,
  encodePcmToMp3,
  stripWavHeader,
  trimSilenceEdges,
} from './src/utils/audioCodec.ts';
import {
  ExpressivenessLevel,
  PacingOption,
  TONE_TOGGLES,
  ToneToggleId,
  getVoiceById,
} from './src/data/voices.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractReadableError(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    } catch {
      // Fallback to raw string
    }
  }
  return raw;
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const readable = extractReadableError(raw);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 503,
      message:
        'Voice synthesis is unavailable because the Gemini API key is not configured. Check your API key in Settings > Secrets.',
    };
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(raw)) {
    return {
      status: 403,
      message:
        'The configured Gemini API key was rejected. Please verify your API key in Settings > Secrets.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return {
      status: 429,
      message:
        'Speech generation rate limit reached. Wait a moment and try again, or select a higher-quota key in Settings > Secrets.',
    };
  }
  return {
    status: 502,
    message: `Speech generation failed: ${readable}`,
  };
}

async function generateWavSegmentWithRetry(
  ai: GoogleGenAI,
  params: {
    model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
    text: string;
    voiceName: string;
    styleDirective: string;
  },
): Promise<Buffer> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: params.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: params.text,
                speechMetadata: {
                  style: params.styleDirective,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: params.voiceName,
              },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((part) => part.inlineData?.data);
      const base64Audio = audioPart?.inlineData?.data;

      if (!base64Audio) {
        throw new Error('The speech model returned an empty audio response.');
      }

      return Buffer.from(base64Audio, 'base64');
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isRetryable = /503|500|UNAVAILABLE|ECONNRESET|ETIMEDOUT/i.test(msg);
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/enhance-script', async (req, res) => {
    const body = req.body ?? {};
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    if (!rawText) {
      res.status(400).json({ error: 'Enter a script first before running Auto-Direct.' });
      return;
    }

    const voice = getVoiceById(typeof body.voiceId === 'string' ? body.voiceId : 'bunty');
    const activeTones: ToneToggleId[] = Array.isArray(body.activeTones)
      ? body.activeTones.filter((t: unknown): t is ToneToggleId =>
          TONE_TOGGLES.some((opt) => opt.id === t),
        )
      : voice.defaultTones;
    const hinglishOn = activeTones.includes('hinglish');

    const toneSummary = TONE_TOGGLES.filter((t) => activeTones.includes(t.id))
      .map((t) => t.label)
      .join(', ');

    const systemInstruction = [
      'You are a restrained, natural Hinglish and English voiceover director crafting scripts that sound like a real human talking effortlessly—never over-acted, never robotic, and never stuffed with pauses.',
      `Target voice persona: ${voice.name} (${voice.tagline}) — ${voice.personaPrompt}`,
      `Active tone settings: ${toneSummary || voice.tagline}.`,
      hinglishOn
        ? 'Hinglish optimization is ON: smooth any stiff phrasing into natural everyday spoken Indian Hinglish (keep the user’s script style—Romanized Hinglish, Devanagari Hindi, or English—consistent with what they wrote while making spoken rhythm feel effortless and genuine).'
        : 'Preserve the user’s language while making spoken pacing crisp and natural.',
      'Preserve EVERY fact, number, brand name, URL, and core meaning from the user’s draft while keeping pacing smooth and unedited:',
      '- Prefer natural commas, periods, and brief ellipsis (...) for everyday speech rhythm so the audio stays one seamless take.',
      '- Only add explicit pause tags (<0.5 second pause> or <1 second pause>) at 1 to 2 truly important turning points.',
      '- Allowed vocal cues: <breath>, <sigh>, <chuckle>, <laugh>, <gasp>, <whisper>, <hmm>. Use 0 to 1 subtle cue ONLY if it genuinely fits—never force laughs or theatrical sounds.',
      '- Never add stage directions outside those exact angle-bracket tags, and never add speaker labels or markdown.',
    ].join('\n');

    try {
      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Direct this voiceover script with natural pauses and vocal cues:\n\n${rawText}`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              enhancedText: {
                type: Type.STRING,
                description: 'The directed script containing natural pause tags and vocal cues.',
              },
              notes: {
                type: Type.STRING,
                description: 'One concise sentence summarizing the pacing and expression cues added.',
              },
            },
            required: ['enhancedText', 'notes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        enhancedText?: string;
        notes?: string;
      };

      if (!parsed.enhancedText || parsed.enhancedText.trim().length === 0) {
        throw new Error('The script director returned an empty script.');
      }

      res.json({
        enhancedText: parsed.enhancedText.trim(),
        notes: parsed.notes?.trim() || 'Added natural pauses and expressive vocal cues.',
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/tts', async (req, res) => {
    const body = req.body ?? {};
    const validation = validateTtsRequest({
      text: typeof body.text === 'string' ? body.text : '',
      voiceId: typeof body.voiceId === 'string' ? body.voiceId : 'bunty',
      activeTones: Array.isArray(body.activeTones) ? body.activeTones : ['hinglish'],
      expressiveness: (['natural', 'conversational', 'expressive'].includes(body.expressiveness)
        ? body.expressiveness
        : 'natural') as ExpressivenessLevel,
      pacing: (['slow', 'standard', 'brisk'].includes(body.pacing)
        ? body.pacing
        : 'standard') as PacingOption,
      customDirection: typeof body.customDirection === 'string' ? body.customDirection : '',
    });

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const ai = createGeminiClient();
      const speechIndices: number[] = [];
      const speechPromises: Promise<Buffer>[] = [];

      validation.segments.forEach((segment, index) => {
        if (segment.type === 'speech') {
          speechIndices.push(index);
          speechPromises.push(
            generateWavSegmentWithRetry(ai, {
              model: validation.model,
              text: segment.text,
              voiceName: validation.geminiVoice,
              styleDirective: validation.styleDirective,
            }),
          );
        }
      });

      const wavBuffers = await Promise.all(speechPromises);
      const parsedByIndex = new Map<number, { pcm: Buffer; sampleRate: number }>();
      let detectedSampleRate = DEFAULT_SAMPLE_RATE;

      const hasMultipleSegments = validation.segments.length > 1;

      wavBuffers.forEach((wavBuffer, i) => {
        const parsed = stripWavHeader(wavBuffer);
        if (parsed.sampleRate) {
          detectedSampleRate = parsed.sampleRate;
        }
        const cleanedPcm = hasMultipleSegments
          ? trimSilenceEdges(parsed.pcm, parsed.sampleRate || DEFAULT_SAMPLE_RATE)
          : parsed.pcm;
        parsedByIndex.set(speechIndices[i], {
          pcm: cleanedPcm,
          sampleRate: parsed.sampleRate || DEFAULT_SAMPLE_RATE,
        });
      });

      const pcmParts: Buffer[] = [];
      let totalPauseSeconds = 0;

      validation.segments.forEach((segment, index) => {
        if (segment.type === 'pause') {
          totalPauseSeconds += segment.durationSeconds;
          pcmParts.push(createSilencePcm(segment.durationSeconds, detectedSampleRate));
        } else {
          const parsed = parsedByIndex.get(index);
          if (parsed && parsed.pcm.length > 0) {
            pcmParts.push(parsed.pcm);
          }
        }
      });

      const fullPcm = Buffer.concat(pcmParts);
      if (fullPcm.length === 0) {
        throw new Error('Synthesized audio was empty.');
      }

      const durationSeconds = Number((fullPcm.length / (detectedSampleRate * 2)).toFixed(2));
      const mp3Buffer = encodePcmToMp3(fullPcm, detectedSampleRate, 160);

      res.json({
        audioBase64: mp3Buffer.toString('base64'),
        mimeType: 'audio/mpeg',
        voiceId: validation.voiceId,
        voiceName: validation.voiceName,
        styleLabel: validation.styleLabel,
        styleDirective: validation.styleDirective,
        modelUsed: validation.model,
        durationSeconds,
        pauseSeconds: Number(totalPauseSeconds.toFixed(1)),
        charCount: validation.trimmedText.length,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
