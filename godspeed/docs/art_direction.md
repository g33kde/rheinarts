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
- Every other entity (enemies, boss, projectiles, pickups, maze walls) is
  still a flat Phaser primitive shape, not real art. The Warden is the
  proof that swapping primitives for sprites is a contained, per-entity
  change (see `docs/gameplay.md`) - not yet done for anything else.
