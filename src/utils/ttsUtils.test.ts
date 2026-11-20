import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCRIPT_CHARS,
  analyzeScriptText,
  buildStyleDirective,
  extractWaveformPeaks,
  formatPauseTag,
  formatTimecode,
  parseScriptSegments,
  selectTtsModel,
  validateTtsRequest,
} from './ttsUtils';
import {
  DEFAULT_SAMPLE_RATE,
  createSilencePcm,
  encodePcmToMp3,
  stripWavHeader,
  trimSilenceEdges,
} from './audioCodec';

test('parseScriptSegments keeps short beats continuous and splits long pauses (>= 1s)', () => {
  const segs = parseScriptSegments(
    'Hello yaar! <0.4 second pause> Yeh dekho <2s pause> kamaal ho gaya.',
  );
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0], { type: 'speech', text: 'Hello yaar! ... Yeh dekho' });
  assert.deepEqual(segs[1], { type: 'pause', durationSeconds: 2 });
  assert.deepEqual(segs[2], { type: 'speech', text: 'kamaal ho gaya.' });
});

test('parseScriptSegments merges consecutive long pauses and clamps bounds', () => {
  const segs = parseScriptSegments('Start <1 second pause> <2s pause> End <45 second pause>');
  assert.deepEqual(segs, [
    { type: 'speech', text: 'Start' },
    { type: 'pause', durationSeconds: 3 },
    { type: 'speech', text: 'End' },
    { type: 'pause', durationSeconds: 10 },
  ]);
});

test('formatPauseTag formats integer and fractional seconds cleanly', () => {
  assert.equal(formatPauseTag(2), '<2 second pause>');
  assert.equal(formatPauseTag(0.4), '<0.4 second pause>');
  assert.equal(formatPauseTag(0.05), '<0.2 second pause>');
});

test('analyzeScriptText excludes tags from words and adds pause durations', () => {
  const metrics = analyzeScriptText('Ek minute ruko <breath> <0.5 second pause> ab suno.', 'standard');
  assert.equal(metrics.wordCount, 5);
  assert.equal(metrics.pauseCount, 1);
  assert.equal(metrics.pauseSeconds, 0.5);
  assert.equal(metrics.cueCount, 1);
  assert.ok(metrics.estimatedSeconds >= 2);
});

test('selectTtsModel uses flash-lite-tts for clean natural speech and flash-tts for cues/expressive', () => {
  assert.equal(selectTtsModel('Namaste yaar, sab badhiya?', 'natural'), 'gemini-3.8-flash-lite-tts');
  assert.equal(selectTtsModel('Namaste yaar <breath> sab badhiya?', 'natural'), 'gemini-3.8-flash-tts');
  assert.equal(selectTtsModel('Namaste yaar', 'expressive'), 'gemini-3.8-flash-tts');
  assert.equal(selectTtsModel('Namaste yaar', 'natural', 'Delhi podcast host'), 'gemini-3.8-flash-tts');
});

test('buildStyleDirective creates concise natural Hinglish prompt for Bunty', () => {
  const bunty = buildStyleDirective('bunty', ['hinglish'], 'natural', 'standard');
  assert.match(bunty.directive, /Hinglish/i);
  assert.match(bunty.directive, /natural/i);
  assert.ok(bunty.directive.length < 260, 'Directive should stay concise for natural delivery');
  assert.equal(bunty.label, 'Hinglish Natural');
});

test('validateTtsRequest maps Bunty to light-mid Puck voice and natural model', () => {
  const pauseOnly = validateTtsRequest({
    text: '<2 second pause>',
    voiceId: 'bunty',
    activeTones: ['hinglish'],
    expressiveness: 'natural',
    pacing: 'standard',
  });
  assert.equal(pauseOnly.valid, false);

  const badVoice = validateTtsRequest({
    text: 'Namaste dosto',
    voiceId: 'kore',
    activeTones: ['hinglish'],
    expressiveness: 'natural',
    pacing: 'standard',
  });
  assert.equal(badVoice.valid, false);

  const longScript = validateTtsRequest({
    text: 'a'.repeat(MAX_SCRIPT_CHARS + 1),
    voiceId: 'jessica',
    activeTones: ['warm'],
    expressiveness: 'natural',
    pacing: 'standard',
  });
  assert.equal(longScript.valid, false);

  const validBunty = validateTtsRequest({
    text: 'Arre suno, kya baat hai!',
    voiceId: 'bunty',
    activeTones: ['hinglish'],
    expressiveness: 'natural',
    pacing: 'standard',
  });
  assert.equal(validBunty.valid, true);
  assert.equal(validBunty.geminiVoice, 'Puck');
  assert.equal(validBunty.model, 'gemini-3.8-flash-lite-tts');
  assert.equal(validBunty.segments.length, 1);
});

test('trimSilenceEdges removes excessive dead air while preserving natural cushions and smooth fades', () => {
  const leadDeadAir = createSilencePcm(0.4, DEFAULT_SAMPLE_RATE);
  const trailDeadAir = createSilencePcm(0.5, DEFAULT_SAMPLE_RATE);
  const speechPcm = Buffer.alloc(Math.round(0.2 * DEFAULT_SAMPLE_RATE) * 2);
  for (let i = 0; i < speechPcm.length / 2; i++) {
    speechPcm.writeInt16LE(Math.round(Math.sin(i * 0.15) * 14000), i * 2);
  }
  const combined = Buffer.concat([leadDeadAir, speechPcm, trailDeadAir]);
  const trimmed = trimSilenceEdges(combined, DEFAULT_SAMPLE_RATE);

  assert.ok(trimmed.length < combined.length * 0.6, 'Excess leading/trailing silence should be removed');
  assert.ok(trimmed.length >= speechPcm.length, 'Active speech should not be cut short');
  assert.equal(trimmed.readInt16LE(0), 0, 'Fade-in should start cleanly at zero');
  assert.equal(trimmed.readInt16LE(trimmed.length - 2), 0, 'Fade-out should end cleanly at zero');
});

test('audioCodec creates exact silence PCM, strips WAV header, and encodes valid MP3', () => {
  const silence = createSilencePcm(1, DEFAULT_SAMPLE_RATE);
  assert.equal(silence.length, DEFAULT_SAMPLE_RATE * 2);

  const pcmTone = Buffer.alloc(2400 * 2);
  for (let i = 0; i < 2400; i++) {
    pcmTone.writeInt16LE(Math.round(Math.sin(i * 0.12) * 14000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmTone.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(DEFAULT_SAMPLE_RATE, 24);
  header.writeUInt32LE(DEFAULT_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmTone.length, 40);

  const parsed = stripWavHeader(Buffer.concat([header, pcmTone]));
  assert.equal(parsed.sampleRate, DEFAULT_SAMPLE_RATE);
  assert.equal(parsed.pcm.length, pcmTone.length);

  const mp3 = encodePcmToMp3(Buffer.concat([parsed.pcm, createSilencePcm(1)]), DEFAULT_SAMPLE_RATE, 160);
  assert.ok(mp3.length > 500, 'MP3 output should have real encoded frames');
  assert.equal(mp3[0], 0xff, 'MP3 frame must start with MPEG sync byte 0xFF');
  assert.equal((mp3[1] & 0xe0), 0xe0, 'MP3 second byte must have valid MPEG sync bits');
});

test('extractWaveformPeaks and formatTimecode handle edge cases', () => {
  const peaks = extractWaveformPeaks(new Float32Array([0.1, -1.0, 0.5, 0.0]), 2);
  assert.equal(peaks.length, 2);
  assert.equal(peaks[0], 1);
  assert.equal(formatTimecode(125.9), '2:05');
  assert.equal(formatTimecode(-1), '0:00');
});
