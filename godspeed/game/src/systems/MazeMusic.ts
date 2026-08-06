export const MENU_MUSIC_KEY = 'menuMusic';
export const MENU_MUSIC_URL = 'menu/godspeed_intro.mp3';

// More stage tracks land in godspeed/music/maze/ over time - add their
// filenames here (in play order) and floors cycle through the list.
export const MAZE_MUSIC_FILES: readonly string[] = ['godspeed_maze1.mp3'];
export const MAZE_MUSIC_URL_PREFIX = 'maze/';

export function mazeTrackKey(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

export function mazeTrackForFloor(floor: number): string {
  const index = Math.max(0, floor - 1) % MAZE_MUSIC_FILES.length;
  return mazeTrackKey(MAZE_MUSIC_FILES[index]!);
}
