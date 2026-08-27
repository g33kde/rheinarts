export const MENU_MUSIC_KEY = 'menuMusic';
export const MENU_MUSIC_URL = 'asteroid-field.mp3'; // was 'menu.mp3', decided

export const GAMEPLAY_MUSIC_KEY = 'gameplayMusic';
export const GAMEPLAY_MUSIC_URL = 'neon-horizon.mp3';

// Boss-stage music - "all bosses, current and future, get their own
// track, looped, swapping back to GAMEPLAY_MUSIC_KEY for normal
// stages," decided (GameScene.ts's playStageMusic()).
export const FRACTURE_MUSIC_KEY = 'fractureMusic';
export const FRACTURE_MUSIC_URL = 'the-fractured.mp3';

export const CARDINAL_MUSIC_KEY = 'cardinalMusic';
export const CARDINAL_MUSIC_URL = 'the-cardinal.mp3';

// A one-shot warning SFX, not a looping track - lives here anyway
// (rather than systems/Sfx.ts) because the file sits in debris/music/
// (Vite's publicDir), not bundled via ES import like Sfx.ts's own keys
// - same loading mechanism as everything else in this file, just played
// once (`this.sound.play(...)`, not `playLoopingSound`) at the call site.
export const BLACK_HOLE_APPROACHING_SFX_KEY = 'blackHoleApproachingSfx';
export const BLACK_HOLE_APPROACHING_SFX_URL = 'black-hole-approaching.mp3';
