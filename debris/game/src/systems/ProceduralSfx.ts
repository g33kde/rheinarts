import Phaser from 'phaser';

/**
 * The UFO's three sounds (spawn, its own shot, its own destruction) -
 * `docs/roadmap.md`'s last remaining SFX gap, which until now left a UFO
 * silent on arrival and reusing the *ship's* explosion when it died.
 *
 * **Synthesized in code rather than loaded as .wav files, decided.** Every
 * other sound in this game is a bundled asset (`systems/Sfx.ts`), so this
 * is a deliberate departure with two reasons behind it: real 1979-era
 * arcade hardware generated exactly these noises with analog oscillators
 * and noise sources rather than sampling them, so synthesis is the more
 * faithful route; and it matches how this project already handles its
 * *visuals* - procedural shapes in `AsteroidShape.ts`, no art assets.
 *
 * Built on Phaser's own `AudioContext` rather than a second one of our
 * own: the browser only unlocks audio after a user gesture, and Phaser's
 * sound manager already owns that unlocking. Everything here no-ops
 * safely if the game is running under `NoAudioSoundManager` (audio
 * disabled, or a browser that refused a context), so a missing context
 * is never an error - just silence, exactly like a missing asset would be.
 */

/** Phaser's Web Audio context, or undefined under NoAudio/HTML5 audio - callers treat undefined as "no sound, carry on". */
function audioContext(scene: Phaser.Scene): AudioContext | undefined {
  const manager = scene.sound as Phaser.Sound.WebAudioSoundManager;
  return manager.context instanceof AudioContext ? manager.context : undefined;
}

/**
 * One short burst of filtered white noise - the building block for both
 * explosion-flavored sounds below. Generated per call rather than cached:
 * a fresh random buffer each time means two UFOs dying together don't
 * phase into one obviously-identical sound.
 */
function playNoiseBurst(
  ctx: AudioContext,
  volume: number,
  durationSeconds: number,
  startFrequency: number,
  endFrequency: number,
): void {
  const sampleCount = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // A falling low-pass sweep is what makes noise read as "explosion"
  // rather than "static" - the brightness decaying is the whole effect.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(startFrequency, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + durationSeconds);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + durationSeconds);
}

/**
 * Arrival: a two-oscillator warble, deliberately dissonant (a slightly
 * detuned pair beating against each other) - the "something is out there
 * and it isn't a rock" cue. Descends in pitch so it reads as approaching
 * rather than departing.
 */
export function playUfoSpawnSfx(scene: Phaser.Scene, volume: number): void {
  const ctx = audioContext(scene);
  if (!ctx || volume <= 0) return;

  const duration = 0.85;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume * 0.22, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gain.connect(ctx.destination);

  // Two saw oscillators a few Hz apart - the beating between them is the
  // "warble", no LFO needed.
  [220, 227].forEach((startHz, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(startHz * 0.55, now + duration);
    // Slight stagger so they don't start perfectly phase-locked.
    osc.connect(gain);
    osc.start(now + index * 0.01);
    osc.stop(now + duration);
  });
}

/**
 * Its shot: a fast downward square-wave chirp. Deliberately lower and
 * buzzier than the player's own `laser2.wav`, so a shot you need to dodge
 * never sounds like a shot you just fired - the one property that
 * actually matters in a four-player scramble.
 */
export function playUfoShotSfx(scene: Phaser.Scene, volume: number): void {
  const ctx = audioContext(scene);
  if (!ctx || volume <= 0) return;

  const duration = 0.22;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(680, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + duration);

  // Louder and slower-decaying than the first pass, which measured about
  // 6x quieter than the spawn/death sounds - this is the one cue that's
  // actually load-bearing (it means "dodge now"), so it can't be the
  // faintest thing the UFO does.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.34, now);
  gain.gain.setValueAtTime(volume * 0.34, now + 0.04); // brief hold before the decay starts
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Its death: a noise burst with a short descending tone under it, so it
 * lands as mechanical wreckage rather than the ship's own explosion -
 * which is literally what it used to reuse.
 */
export function playUfoDestroyedSfx(scene: Phaser.Scene, volume: number): void {
  const ctx = audioContext(scene);
  if (!ctx || volume <= 0) return;

  playNoiseBurst(ctx, volume * 0.5, 0.55, 2400, 180);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.45);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}
