import { describe, expect, it } from 'vitest';
import {
  GAME_VOICE,
  isKnownPhoneme,
  knownPhonemes,
  textToPhonemes,
  utteranceDurationMs,
  VOICE_LINES,
} from '../src/systems/VoiceSynth';

describe('textToPhonemes', () => {
  it('maps a simple word to phonemes', () => {
    expect(textToPhonemes('MASS')).toEqual(['M', 'AE', 'S', 'S']);
  });

  it('prefers digraphs over their individual letters', () => {
    expect(textToPhonemes('SHIP')).toEqual(['SH', 'IH', 'P']);
    expect(textToPhonemes('THE')).toEqual(['TH', 'EH']);
    expect(textToPhonemes('ROCK')).toEqual(['R', 'AA', 'K']);
  });

  it('inserts a pause between words', () => {
    // NOW picks up the OW digraph rather than spelling out O + W
    expect(textToPhonemes('GO NOW')).toEqual(['G', 'AA', '_', 'N', 'OW']);
  });

  it('is case insensitive and tolerates extra whitespace', () => {
    expect(textToPhonemes('  go   now ')).toEqual(textToPhonemes('GO NOW'));
  });

  it('produces only phonemes the synthesizer actually knows', () => {
    const sample = 'THE ASSEMBLER HUNGERS FOR ROCK AND SHIP ALIKE';
    for (const phoneme of textToPhonemes(sample)) {
      expect(isKnownPhoneme(phoneme)).toBe(true);
    }
  });

  it('drops characters it has no mapping for rather than emitting junk', () => {
    for (const phoneme of textToPhonemes('GO! 42 NOW?')) {
      expect(isKnownPhoneme(phoneme)).toBe(true);
    }
  });

  it('returns nothing for empty input', () => {
    expect(textToPhonemes('')).toEqual([]);
    expect(textToPhonemes('   ')).toEqual([]);
  });
});

describe('VOICE_LINES', () => {
  it('only uses phonemes the synthesizer knows', () => {
    for (const [name, line] of Object.entries(VOICE_LINES)) {
      for (const phoneme of line) {
        expect(isKnownPhoneme(phoneme), `${name} uses unknown phoneme ${phoneme}`).toBe(true);
      }
    }
  });

  it('gives every line a sensible arcade-bark length', () => {
    for (const [name, line] of Object.entries(VOICE_LINES)) {
      const ms = utteranceDurationMs(line);
      expect(ms, `${name} too short`).toBeGreaterThan(200);
      expect(ms, `${name} too long for a bark`).toBeLessThan(2500);
    }
  });
});

describe('utteranceDurationMs', () => {
  it('is zero for nothing to say', () => {
    expect(utteranceDurationMs([])).toBe(0);
  });

  it('grows with the number of phonemes', () => {
    const short = utteranceDurationMs(['AA']);
    const long = utteranceDurationMs(['AA', 'AA', 'AA']);
    expect(long).toBeGreaterThan(short);
  });

  it('shortens as the voice rate increases', () => {
    const normal = utteranceDurationMs(VOICE_LINES.assemblerComplete, GAME_VOICE);
    const fast = utteranceDurationMs(VOICE_LINES.assemblerComplete, { ...GAME_VOICE, rate: GAME_VOICE.rate * 2 });
    expect(fast).toBeLessThan(normal);
  });

  it('counts the silent beat of a plosive as part of its duration', () => {
    // T carries a stopMs; a bare vowel of the same nominal length does not
    expect(utteranceDurationMs(['T'])).toBeGreaterThan(0);
  });

  it('ignores unknown symbols instead of throwing', () => {
    expect(utteranceDurationMs(['AA', 'NOT_A_PHONEME', 'AA'])).toBe(utteranceDurationMs(['AA', 'AA']));
  });
});

describe('knownPhonemes', () => {
  it('covers the vowels and consonants the line table depends on', () => {
    const known = knownPhonemes();
    for (const required of ['AA', 'IY', 'AE', 'OW', 'EY', 'M', 'N', 'S', 'T', 'K', 'HH', 'L', '_']) {
      expect(known).toContain(required);
    }
  });
});
