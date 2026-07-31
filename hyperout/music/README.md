# Soundtrack

MP3 is the format to use (download MP3 from Suno — universal browser support, small files).

## Menu music
Put a single file here:

    music/menu.mp3

Loops on the title screen.

## In-game music (random playlist)
Drop any number of MP3s in:

    music/game/

During a match the game picks one at random; when it ends, another random
track plays. Filenames don't matter.

### How the game finds them
Browsers can't list a folder, so the game discovers tracks two ways:
1. **`music/game/tracks.json`** — a JSON array of filenames (authoritative,
   works on any web host). Example:

       ["neon-run.mp3", "grid-chase.mp3", "derez.mp3"]

2. **Directory listing fallback** — if that file is missing/empty, the game
   reads the dev server's folder listing (works with `python -m http.server`),
   so locally you can just drop files in and they play.

For a production host (e.g. nginx with directory listing off), fill in
`tracks.json`. Locally you can ignore it.

Controls: **M** mutes music; volume sliders for MUSIC and SFX are on the title
screen and the pause menu.
