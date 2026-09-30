import type { PlayerInput } from './PlayerInput';

/**
 * A `PlayerInput` nobody is holding - the attract-mode demo pilot
 * (docs/roadmap.md's "attract mode"). Deliberately a dumb mutable
 * holder: all the actual decision-making lives in
 * `systems/DemoBot.ts`'s pure `computeBotIntent`, which GameScene calls
 * once per frame and writes the result here. That split keeps the bot's
 * behavior unit-testable without a scene, and keeps this class the same
 * shape as every other adapter the ship logic already talks to.
 *
 * Never hyperspaces: a demo ship vanishing and reappearing across the
 * arena reads as a rendering glitch to someone walking past the cabinet,
 * which is the opposite of what an attract loop is for.
 */
export class AiInput implements PlayerInput {
  turnDirection: -1 | 0 | 1 = 0;
  isThrusting = false;
  isFiring = false;
  readonly isHyperspacing = false;
}
