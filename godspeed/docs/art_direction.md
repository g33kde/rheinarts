# Art Direction

- HD pixel art
- Top-down perspective
- Full-maze camera
- Dynamic lighting
- Ancient architecture fused with forgotten technology

## Palette

Dark stone, obsidian, gold, sapphire blue, violet, white. Red reserved for danger.

## Current implementation (v0.1)

- **The player character is "the Warden"** - a hooded, gold-and-sapphire
  robed figure, the first real (non-placeholder) sprite in the game.
  Source art: `godspeed/artwork/warden-sprite-sheet.png`, generated via an
  AI sprite tool (see `CHANGELOG.md` for how the frames were verified and
  wired in). Animated states in use: idle, walk, shoot, hurt, die. The
  sheet also has attack/jump/fall/land rows, unused - this is a top-down
  maze shooter with no melee/jumping.
- **Pickups also have real art now**: animated icons (boot/bullet/heart/
  shield, one looping animation per `UpgradeType`) from a user-provided
  sheet, `godspeed/artwork/powerups-sprite-sheet.png` - see
  `src/config/PowerupFrames.ts` and the CHANGELOG's "Real pickup sprite
  art" entry for how frames were measured.
- **The Boss has real art too** - a dark stone-and-gold guardian construct
  with sapphire/violet energy accents, matching the palette above. Source:
  `godspeed/artwork/boss-sprite-sheet.png`, user-provided, generated from a
  prompt grounded in this doc plus `docs/vision.md`/`docs/enemy_design.md`.
  See `src/config/BossFrames.ts` and the CHANGELOG's "Boss sprite art"
  entry. It's the first *enemy* with real art - every regular enemy
  (Drone/Sentinel/Seeker/Bulwark/Skirmisher) is still a flat primitive
  circle, along with projectiles and maze walls.
- The Warden, the pickups, and the Boss together are the proof that
  swapping primitives for sprites is a contained, per-entity change (see
  `docs/gameplay.md`) - not yet done for the regular enemy roster.
