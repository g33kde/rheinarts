import { describe, expect, it } from 'vitest';
import { mazeTrackForFloor, mazeTrackKey } from '../src/systems/MazeMusic';

describe('mazeTrackKey', () => {
  it('strips the file extension', () => {
    expect(mazeTrackKey('godspeed_maze1.mp3')).toBe('godspeed_maze1');
  });
});

describe('mazeTrackForFloor', () => {
  it('picks the first track for floor 1', () => {
    expect(mazeTrackForFloor(1)).toBe('godspeed_maze1');
  });

  it('cycles back to the first track when there are more floors than tracks', () => {
    expect(mazeTrackForFloor(2)).toBe(mazeTrackForFloor(1));
  });

  it('treats floors below 1 the same as floor 1', () => {
    expect(mazeTrackForFloor(0)).toBe(mazeTrackForFloor(1));
  });
});
