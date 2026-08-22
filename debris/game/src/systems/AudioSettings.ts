/**
 * Shared volume state, set from `MenuScene`'s sliders and read by every
 * scene that plays a sound. A plain module-level singleton, not a class -
 * there's exactly one audio session per page load, nothing to construct.
 *
 * Persisted to `localStorage`, same pattern as HyperOut's own
 * `saveSettings`/`loadSettings` (see `hyperout/game.js`): one JSON blob
 * under a namespaced key, loaded once at module init, saved on every
 * change, wrapped in try/catch so a disabled/unavailable localStorage
 * (private browsing, quota, non-browser test environment) degrades to
 * session-only instead of throwing.
 */

interface AudioSettingsState {
  musicVolume: number;
  sfxVolume: number;
}

// Matches HyperOut's own settings-key naming convention (see SETTINGS_KEY in hyperout/game.js).
const STORAGE_KEY = 'rheinarts.debris.v1';

// Defaults match HyperOut's own pause-menu slider defaults (music 50%, SFX 70%).
const DEFAULTS: AudioSettingsState = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function loadPersisted(): AudioSettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioSettingsState>;
    return {
      musicVolume: typeof parsed.musicVolume === 'number' ? clamp01(parsed.musicVolume) : DEFAULTS.musicVolume,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? clamp01(parsed.sfxVolume) : DEFAULTS.sfxVolume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, storage disabled, quota exceeded, or no
    // localStorage at all (e.g. this file's own test environment) -
    // settings just stop persisting, same graceful degrade as HyperOut's.
  }
}

const state: AudioSettingsState = loadPersisted();

export function getMusicVolume(): number {
  return state.musicVolume;
}

export function setMusicVolume(value: number): void {
  state.musicVolume = clamp01(value);
  persist();
}

export function getSfxVolume(): number {
  return state.sfxVolume;
}

export function setSfxVolume(value: number): void {
  state.sfxVolume = clamp01(value);
  persist();
}
