# Controls

Every player, regardless of input device, controls the same three things
(see `docs/gameplay.md`): **turn**, **thrust**, **shoot**. Only the mapping
differs.

## Player slots

- **Player 1 and Player 2 default to keyboard, but can switch to a
  gamepad.** Same key split HyperOut already uses (a left-hand zone and
  an arrow-key zone) as the default, so returning players don't have to
  relearn a layout — but each of their menu cards has a toggle (see
  `docs/art_direction.md`'s Start screen section) to switch that slot to
  a gamepad instead, decided in v1 rather than deferred.
- **Player 3 and Player 4 are gamepad-only, no choice.** Their slots
  simply don't activate until a gamepad is connected — there's still no
  attempt to fit a 3rd/4th player onto the keyboard (four players sharing
  one keyboard is unusably cramped regardless of what P1/P2 do).
- **Gamepad assignment is connection order, not manual picking.** With
  up to 4 gamepads potentially in play now (not just 2), there's no UI
  for "which physical controller is mine" — connected gamepads are
  claimed in slot priority order (P1 → P2 → P3 → P4) by whichever slots
  currently want one. E.g. if P1 and P3 are both set to gamepad and two
  controllers are connected, P1 gets the first, P3 gets the second; a
  P4 also set to gamepad would stay in "waiting" until a third controller
  shows up. Simple, but means unplugging/replugging mid-session could
  reshuffle who's "controller #1" — acceptable for v1, not addressed
  further here.

## Keyboard

| | Turn left / right | Thrust | Shoot |
| --- | --- | --- | --- |
| **Player 1** | `A` / `D` | `W` | `Space` |
| **Player 2** | `←` / `→` | `↑` | `Right Ctrl` |

`W` / `↑` for thrust (not a 4-directional move) is deliberate — see
`docs/gameplay.md`'s note on momentum-based movement. There is no
"backward" key; you turn and thrust, you don't reverse.

`Right Ctrl` for Player 2's shoot avoids colliding with `Space` (Player 1)
and with the arrow-key turn/thrust keys themselves. Revisit if playtesting
finds it awkward — this is the one keyboard mapping choice made without a
hardware controller in hand to test it on.

## Gamepad (any slot)

Using the standard [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
mapping (works across Xbox/PlayStation/generic controllers without
per-brand special-casing):

| Action | Input |
| --- | --- |
| Turn left / right | Left stick X-axis, **or** D-pad left/right |
| Thrust | Right trigger (`R2` / `RT`) |
| Shoot | Bottom face button (`A` on Xbox, `Cross` on PlayStation) |

Both a stick and the D-pad are accepted for turning so it works equally
well on a controller someone's holding loosely (stick) or one they're
thumbing precisely (D-pad) — this needs real hardware testing once
implementation starts, not just a docs decision.

## Menu / system

`Esc` navigation replicates HyperOut's convention exactly (see
`hyperout/game.js`'s Escape handler and `hyperout/index.html`'s
`pauseMenu`/`quitMenu` panels) rather than inventing a new one:

| Screen | `Esc` does |
| --- | --- |
| Start menu (`MenuScene`) | Opens "QUIT GAME?" (YES navigates to `/`, the shared portal root; NO or `Esc` again closes it) |
| Playing (`GameScene`) | Pauses - shows "PAUSED" with Continue / Restart / Main Menu |
| Paused | `Esc` again resumes (same toggle as opening it) |
| Stage cleared / Game over | No special handling - these screens already advance on *any* key/button/click, `Esc` included |

Continue/Restart/Main Menu are click-only (touch/mouse), matching
HyperOut, which has no keyboard shortcuts for them either - only Escape
itself is keyboard-bound on these screens. Splash screen `Esc` behavior
needs no special case: it already advances on *any* key, same as
HyperOut's splash dismissal.

Mode selection itself (Cooperative/Competitive) has no dedicated key -
it's mouse/touch-only on the mode toggle, unlike HyperOut's numbered/
lettered mode key idea floated here previously; revisit if that's missed
once this is actually played.
