import Phaser from 'phaser';

/**
 * A procedural speech synthesizer - the game's own voice, generated
 * from formants rather than played back from audio files.
 *
 * **Why not the browser's `speechSynthesis`?** Because the request was
 * specifically for *always the same voice*, and that API cannot give
 * it: the installed voice list differs by OS, by browser, and by the
 * player's own settings, so a cabinet would sound like a different
 * machine depending on where it was running. It also sounds like a
 * screen reader rather than a hostile object in space.
 *
 * This is the route the hardware of the era actually took - the TI
 * speech chips in Berzerk and its contemporaries built speech from
 * filtered oscillators, not samples. Everything here is deterministic
 * arithmetic, so the voice is bit-identical on a Raspberry Pi, a Mac
 * and a phone, and it costs nothing to download.
 *
 * ## How it works
 *
 * A classic source-filter model:
 *
 * - a **source** - a sawtooth oscillator at the speaker's pitch for
 *   voiced sounds (vowels, M, Z...), white noise for unvoiced ones
 *   (S, T, SH...);
 * - three parallel **bandpass filters** tuned to the first three
 *   formants, which is essentially what distinguishes one vowel from
 *   another in a human vocal tract;
 * - per-phoneme **envelopes**, with the formant frequencies *ramped*
 *   rather than stepped between phonemes. That ramping is what makes
 *   it intelligible instead of a string of disconnected beeps, and is
 *   the single most important detail in here.
 *
 * Everything is scheduled ahead on Phaser's own `AudioContext`, the
 * same one `ProceduralSfx.ts` uses, so browser autoplay unlocking is
 * already handled and there's no second context.
 */

export interface VoiceProfile {
  /** Glottal pitch in Hz. Low reads as big and slow; the Assembler wants to sound like something large. */
  readonly pitchHz: number;
  /** Pitch drift across an utterance, as a multiplier on the end pitch - a flat line sounds dead, a falling one sounds like a statement. */
  readonly pitchFallRatio: number;
  /** Scales every phoneme's duration. Above 1 is slower and more deliberate. */
  readonly rate: number;
  /** Multiplies all three formants. Below 1 lengthens the apparent vocal tract - bigger speaker. */
  readonly formantScale: number;
  /** 0 = clean, higher = more waveshaper drive. The "machine" in the voice. */
  readonly growl: number;
  /** Ring-modulation depth, 0-1 - the classic robot buzz. A little goes a long way. */
  readonly ringModDepth: number;
  readonly ringModHz: number;
  readonly gain: number;
}

/**
 * The game's canonical voice. One profile, used for everything that
 * speaks, so the game has *a* voice rather than a collection of them -
 * which is the whole point of the request.
 */
export const GAME_VOICE: VoiceProfile = {
  pitchHz: 74,
  pitchFallRatio: 0.88,
  rate: 1.18,
  formantScale: 0.92,
  growl: 6,
  ringModDepth: 0.22,
  ringModHz: 47,
  gain: 0.5,
};

interface PhonemeSpec {
  /** First three formants in Hz. Vowel identity lives almost entirely in F1/F2. */
  readonly f: readonly [number, number, number];
  /** Voiced sounds use the oscillator; unvoiced ones use noise. */
  readonly voiced: boolean;
  /** Relative duration, scaled by the profile's rate. */
  readonly ms: number;
  /** Plosives (T, K, B...) need a beat of silence before the burst or they don't read as stops. */
  readonly stopMs?: number;
  /** Overrides how open the filters are - fricatives want a wide, hissy band. */
  readonly q?: number;
  readonly amp?: number;
}

/**
 * Formant table. Vowel values are the standard measured averages for
 * an adult male speaker; consonants are approximations chosen to be
 * *distinguishable* rather than strictly accurate, which is the right
 * trade for short shouted arcade lines.
 */
const PHONEMES: Record<string, PhonemeSpec> = {
  // --- vowels ---
  IY: { f: [270, 2290, 3010], voiced: true, ms: 140 }, // bEAt
  IH: { f: [390, 1990, 2550], voiced: true, ms: 110 }, // bIt
  EY: { f: [476, 2089, 2691], voiced: true, ms: 150 }, // bAIt
  EH: { f: [530, 1840, 2480], voiced: true, ms: 120 }, // bEt
  AE: { f: [660, 1720, 2410], voiced: true, ms: 140 }, // bAt
  AA: { f: [730, 1090, 2440], voiced: true, ms: 150 }, // fAther
  AO: { f: [570, 840, 2410], voiced: true, ms: 150 }, // bOUght
  OW: { f: [500, 900, 2300], voiced: true, ms: 150 }, // bOAt
  UH: { f: [440, 1020, 2240], voiced: true, ms: 110 }, // bOOk
  UW: { f: [300, 870, 2240], voiced: true, ms: 140 }, // bOOt
  AH: { f: [640, 1190, 2390], voiced: true, ms: 110 }, // bUt
  ER: { f: [490, 1350, 1690], voiced: true, ms: 150 }, // bIRd

  // --- nasals: low, damped, strongly voiced ---
  M: { f: [280, 900, 2200], voiced: true, ms: 90, amp: 0.7 },
  N: { f: [280, 1700, 2600], voiced: true, ms: 90, amp: 0.7 },
  NG: { f: [280, 2300, 2750], voiced: true, ms: 100, amp: 0.7 },

  // --- liquids and glides ---
  L: { f: [360, 1300, 2700], voiced: true, ms: 90 },
  R: { f: [420, 1300, 1600], voiced: true, ms: 95 },
  W: { f: [300, 610, 2200], voiced: true, ms: 85 },
  Y: { f: [290, 2070, 2960], voiced: true, ms: 80 },

  // --- voiced fricatives ---
  V: { f: [350, 1100, 2400], voiced: true, ms: 80, q: 3, amp: 0.65 },
  DH: { f: [300, 1400, 2500], voiced: true, ms: 75, q: 3, amp: 0.6 },
  Z: { f: [320, 1900, 4500], voiced: true, ms: 95, q: 3, amp: 0.7 },
  JH: { f: [300, 1800, 2600], voiced: true, ms: 90, stopMs: 25, q: 3 },

  // --- unvoiced fricatives: noise-driven ---
  F: { f: [400, 1400, 2400], voiced: false, ms: 95, q: 1.6, amp: 0.5 },
  TH: { f: [400, 1600, 2600], voiced: false, ms: 85, q: 1.6, amp: 0.45 },
  S: { f: [1200, 5200, 7000], voiced: false, ms: 110, q: 2.2, amp: 0.6 },
  SH: { f: [1000, 2600, 3600], voiced: false, ms: 115, q: 2.0, amp: 0.65 },
  HH: { f: [500, 1500, 2500], voiced: false, ms: 70, q: 1.2, amp: 0.35 },
  CH: { f: [1000, 2400, 3500], voiced: false, ms: 95, stopMs: 30, q: 2.0 },

  // --- plosives: a beat of silence, then a burst ---
  P: { f: [400, 1100, 2200], voiced: false, ms: 35, stopMs: 45, q: 1.4, amp: 0.55 },
  T: { f: [600, 1800, 3400], voiced: false, ms: 35, stopMs: 40, q: 1.6, amp: 0.6 },
  K: { f: [500, 1600, 2500], voiced: false, ms: 40, stopMs: 45, q: 1.5, amp: 0.6 },
  B: { f: [350, 1100, 2200], voiced: true, ms: 45, stopMs: 35, amp: 0.7 },
  D: { f: [400, 1700, 2600], voiced: true, ms: 45, stopMs: 30, amp: 0.7 },
  G: { f: [350, 1600, 2400], voiced: true, ms: 50, stopMs: 35, amp: 0.7 },

  /** Silence - sentence pacing. */
  _: { f: [400, 1200, 2400], voiced: false, ms: 130, amp: 0 },
};

export function isKnownPhoneme(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(PHONEMES, symbol);
}

/** Every phoneme this synthesizer knows - handy for tests and for validating hand-written lines. */
export function knownPhonemes(): string[] {
  return Object.keys(PHONEMES);
}

// Letter groups checked longest-first, so 'SH' wins over 'S' + 'H'.
const DIGRAPHS: readonly (readonly [string, string[]])[] = [
  ['OO', ['UW']],
  ['EE', ['IY']],
  ['EA', ['IY']],
  ['OU', ['AA', 'UW']],
  ['OW', ['OW']],
  ['AI', ['EY']],
  ['AY', ['EY']],
  ['OA', ['OW']],
  ['IE', ['IY']],
  ['SH', ['SH']],
  ['CH', ['CH']],
  ['TH', ['TH']],
  ['PH', ['F']],
  ['CK', ['K']],
  ['NG', ['NG']],
  ['QU', ['K', 'W']],
  ['ER', ['ER']],
  ['IR', ['ER']],
  ['UR', ['ER']],
  ['AR', ['AA', 'R']],
  ['OR', ['AO', 'R']],
];

const SINGLES: Record<string, string[]> = {
  A: ['AE'],
  B: ['B'],
  C: ['K'],
  D: ['D'],
  E: ['EH'],
  F: ['F'],
  G: ['G'],
  H: ['HH'],
  I: ['IH'],
  J: ['JH'],
  K: ['K'],
  L: ['L'],
  M: ['M'],
  N: ['N'],
  O: ['AA'],
  P: ['P'],
  Q: ['K'],
  R: ['R'],
  S: ['S'],
  T: ['T'],
  U: ['AH'],
  V: ['V'],
  W: ['W'],
  X: ['K', 'S'],
  Y: ['IY'],
  Z: ['Z'],
};

/**
 * A deliberately crude English speller-to-phoneme pass. It is *not* a
 * general TTS front end and doesn't try to be - English spelling is
 * far too irregular for a rule set this size.
 *
 * It exists so a caller can write a throwaway line as plain text and
 * get something intelligible. Anything the game says often enough to
 * matter should be written as explicit phonemes instead (see
 * `VOICE_LINES`), which is exactly how the allophone speech chips of
 * the era were driven.
 */
export function textToPhonemes(text: string): string[] {
  const out: string[] = [];
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);

  words.forEach((word, wordIndex) => {
    if (wordIndex > 0) out.push('_');
    let i = 0;
    while (i < word.length) {
      const pair = word.slice(i, i + 2);
      const digraph = DIGRAPHS.find(([key]) => key === pair);
      if (digraph) {
        out.push(...digraph[1].filter(isKnownPhoneme));
        i += 2;
        continue;
      }
      const single = SINGLES[word[i]!];
      if (single) out.push(...single);
      i += 1;
    }
  });

  return out;
}

/** Total speaking time for a phoneme sequence, in ms - lets callers time captions or delays against speech without guessing. */
export function utteranceDurationMs(phonemes: readonly string[], voice: VoiceProfile = GAME_VOICE): number {
  return phonemes.reduce((total, symbol) => {
    const spec = PHONEMES[symbol];
    if (!spec) return total;
    return total + ((spec.stopMs ?? 0) + spec.ms) / voice.rate;
  }, 0);
}

/** Phaser's Web Audio context, or undefined under NoAudio - same guard ProceduralSfx uses. */
function audioContext(scene: Phaser.Scene): AudioContext | undefined {
  const manager = scene.sound as Phaser.Sound.WebAudioSoundManager;
  return manager.context instanceof AudioContext ? manager.context : undefined;
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Soft-clipping curve for the `growl` - what gives the voice its metallic edge instead of sounding like a flute. */
function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Speaks a phoneme sequence. Returns the utterance's duration in ms (0
 * if there's no audio context), so callers can line captions up with
 * it.
 *
 * The whole utterance is scheduled up front on the audio clock rather
 * than driven frame by frame - speech timing has to be sample-accurate,
 * and a dropped frame mid-word would be audible.
 */
export function speakPhonemes(
  scene: Phaser.Scene,
  phonemes: readonly string[],
  volume: number,
  voice: VoiceProfile = GAME_VOICE,
): number {
  const ctx = audioContext(scene);
  const totalMs = utteranceDurationMs(phonemes, voice);
  if (!ctx || volume <= 0 || phonemes.length === 0) return totalMs;

  const start = ctx.currentTime + 0.02; // a beat of lead-in so the first phoneme isn't clipped
  const totalSeconds = totalMs / 1000;

  // --- output chain: formants -> drive -> master -> destination ---
  const master = ctx.createGain();
  master.gain.value = volume * voice.gain;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDriveCurve(voice.growl);
  shaper.connect(master);
  master.connect(ctx.destination);

  // Ring modulation: multiply the voice by a low sine. Implemented as a
  // gain node whose gain *is* an oscillator, which is the standard Web
  // Audio way to multiply two signals.
  let voiceSink: AudioNode = shaper;
  if (voice.ringModDepth > 0) {
    const ring = ctx.createGain();
    ring.gain.value = 1 - voice.ringModDepth;
    const ringOsc = ctx.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.value = voice.ringModHz;
    const ringDepth = ctx.createGain();
    ringDepth.gain.value = voice.ringModDepth;
    ringOsc.connect(ringDepth).connect(ring.gain);
    ring.connect(shaper);
    ringOsc.start(start);
    ringOsc.stop(start + totalSeconds + 0.1);
    voiceSink = ring;
  }

  // --- sources ---
  const glottis = ctx.createOscillator();
  glottis.type = 'sawtooth';
  glottis.frequency.setValueAtTime(voice.pitchHz, start);
  glottis.frequency.linearRampToValueAtTime(voice.pitchHz * voice.pitchFallRatio, start + totalSeconds);

  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx);
  noise.loop = true;

  // Each source gets its own gate, opened per phoneme by whether that
  // phoneme is voiced. Both run continuously; the gates do the work.
  const voicedGate = ctx.createGain();
  const noiseGate = ctx.createGain();
  voicedGate.gain.value = 0;
  noiseGate.gain.value = 0;
  glottis.connect(voicedGate);
  noise.connect(noiseGate);

  // --- three parallel formant bandpasses ---
  const formants = [0, 1, 2].map((index) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 8 - index * 2; // higher formants are broader
    const level = ctx.createGain();
    level.gain.value = [1, 0.7, 0.35][index]!; // upper formants sit lower in the mix
    filter.connect(level).connect(voiceSink);
    voicedGate.connect(filter);
    noiseGate.connect(filter);
    return filter;
  });

  // --- schedule every phoneme ---
  let t = start;
  for (const symbol of phonemes) {
    const spec = PHONEMES[symbol];
    if (!spec) continue;

    // A plosive's silent beat: both gates shut, which is what makes a
    // stop consonant read as a stop rather than a hum.
    if (spec.stopMs) {
      const stopSeconds = spec.stopMs / 1000 / voice.rate;
      voicedGate.gain.setTargetAtTime(0, t, 0.008);
      noiseGate.gain.setTargetAtTime(0, t, 0.008);
      t += stopSeconds;
    }

    const seconds = spec.ms / 1000 / voice.rate;
    const amp = spec.amp ?? 1;

    // Formants glide rather than jump - the single most important
    // detail for intelligibility.
    formants.forEach((filter, index) => {
      const target = spec.f[index]! * voice.formantScale;
      filter.frequency.linearRampToValueAtTime(target, t + seconds * 0.45);
      if (spec.q !== undefined) filter.Q.linearRampToValueAtTime(spec.q, t + seconds * 0.45);
      else filter.Q.linearRampToValueAtTime(8 - index * 2, t + seconds * 0.45);
    });

    voicedGate.gain.setTargetAtTime(spec.voiced ? amp : 0, t, 0.012);
    noiseGate.gain.setTargetAtTime(spec.voiced ? 0 : amp * 0.7, t, 0.012);

    t += seconds;
  }

  // Close out cleanly so the tail doesn't click.
  voicedGate.gain.setTargetAtTime(0, t, 0.02);
  noiseGate.gain.setTargetAtTime(0, t, 0.02);
  master.gain.setTargetAtTime(0, t + 0.05, 0.03);

  glottis.start(start);
  noise.start(start);
  glottis.stop(t + 0.25);
  noise.stop(t + 0.25);

  return totalMs;
}

/** Speaks plain text, via the crude speller above. Prefer explicit phonemes for anything the game says often - see `textToPhonemes`. */
export function speak(
  scene: Phaser.Scene,
  text: string,
  volume: number,
  voice: VoiceProfile = GAME_VOICE,
): number {
  return speakPhonemes(scene, textToPhonemes(text), volume, voice);
}

/**
 * The lines the game actually speaks, written as explicit phonemes
 * rather than run through `textToPhonemes`.
 *
 * This is how the allophone speech chips of the era were driven, and
 * the reason is the same now as it was then: English spelling is far
 * too irregular for a rule set this small, so anything the game says
 * often enough to matter gets hand-tuned until it's clearly
 * intelligible over a noisy arcade mix. The plain-text path stays for
 * one-offs and debugging.
 *
 * The Assembler's barks are deliberately **original** rather than
 * Sinistar's own famous ones - the homage is in building a taunting,
 * self-assembling boss at all, not in reciting another game's script.
 *
 * ("I" is a diphthong this table has no single symbol for; AA->IY is
 * the standard way to build it out of two monophthongs, and it reads
 * correctly at speaking speed.)
 */
export const VOICE_LINES = {
  /** Seeding - still just a nucleus, dragging the field toward itself. "MORE MASS" */
  assemblerSeed: ['M', 'AO', 'R', '_', 'M', 'AE', 'S'],
  /** Completion - it is alive now. "I AM WHOLE" */
  assemblerComplete: ['AA', 'IY', '_', 'AE', 'M', '_', 'HH', 'OW', 'L'],
  /** Starved out before it ever finished. "NOT ENOUGH" */
  assemblerStarved: ['N', 'AA', 'T', '_', 'IH', 'N', 'AH', 'F'],
  /** Destroyed after waking up. "UNMADE" */
  assemblerKilled: ['AH', 'N', '_', 'M', 'EY', 'D'],
} as const satisfies Record<string, readonly string[]>;
