import {
  ASSEMBLER,
  COMBO,
  COMMANDER,
  CREW_SCALING,
  EFFECTS,
  HULLS,
  HYPERSPACE,
  STAGE_RANK,
  TERRAIN,
  TETHER,
} from '../config/GameConfig';
import { GAME_VOICE } from './VoiceSynth';

/**
 * A live tuning overlay for the v2 balance pass - **dev-only, gated
 * behind `?tune=1`**, and never present in normal play.
 *
 * ## Why this exists
 *
 * Roughly forty constants across the v2 feature set are marked
 * "starting guess, not playtested", and this environment can build and
 * verify them but cannot *feel* them. Tuning by editing
 * `GameConfig.ts` costs a rebuild, a restart and a flight back to
 * whatever situation you were judging - a couple of minutes per
 * constant, times forty. This turns that loop into dragging a slider
 * mid-fight.
 *
 * ## How it can possibly work
 *
 * `as const` is a *compile-time* annotation: at runtime those config
 * exports are ordinary mutable objects, and nothing freezes them. Every
 * consumer reads `SOME_CONFIG.someKey` at call time rather than
 * capturing the number at module load, so writing to the object is
 * picked up on the next frame. The `readonly` types are the only thing
 * in the way, hence the single cast in `setValue` - which is contained
 * to this file precisely so the rest of the codebase keeps its
 * immutable view of config.
 *
 * ## Deliberately HTML, not Phaser
 *
 * Real range inputs beat anything hand-drawn on the canvas for this
 * job, and a dev tool has no reason to pay for canvas UI. It also keeps
 * every line of this file out of the game's own render path.
 *
 * ## Before tagging 2.0.0
 *
 * This is the same category of thing as the dev stage timer that was
 * just removed for release. It stays gated behind a query parameter so
 * it can't surface by accident, but it is not part of the shipped
 * experience and should be reviewed (kept gated, or removed) at
 * release time.
 */

interface TuningField {
  readonly label: string;
  /** The live config object to mutate - a reference, not a copy. */
  readonly target: Record<string, unknown>;
  readonly key: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Shown beside the field when a change doesn't apply to what's already on screen. */
  readonly note?: string;
  /** Fully-qualified name used by the export, e.g. `COMBO.windowMs`. */
  readonly path: string;
}

interface TuningGroup {
  readonly title: string;
  readonly fields: readonly TuningField[];
}

function field(
  path: string,
  target: unknown,
  key: string,
  min: number,
  max: number,
  step: number,
  note?: string,
): TuningField {
  return { label: key, target: target as Record<string, unknown>, key, min, max, step, note, path };
}

/**
 * What's worth a slider. Not every constant in the game - only the ones
 * whose *feel* is genuinely unresolved, which is what this pass is for.
 */
function buildSchema(): TuningGroup[] {
  return [
    {
      title: 'Combo',
      fields: [
        field('COMBO.windowMs', COMBO, 'windowMs', 500, 6000, 100),
        field('COMBO.killsPerStep', COMBO, 'killsPerStep', 1, 6, 1),
        field('COMBO.maxMultiplier', COMBO, 'maxMultiplier', 2, 16, 1),
      ],
    },
    {
      title: 'Stage rank',
      fields: [
        field('STAGE_RANK.parTimeMs', STAGE_RANK, 'parTimeMs', 15000, 180000, 5000),
        field('STAGE_RANK.cleanlinessPenaltyPerHit', STAGE_RANK, 'cleanlinessPenaltyPerHit', 0.05, 1, 0.01),
        field('STAGE_RANK.accuracyWeight', STAGE_RANK, 'accuracyWeight', 0, 3, 0.1),
        field('STAGE_RANK.cleanlinessWeight', STAGE_RANK, 'cleanlinessWeight', 0, 3, 0.1),
        field('STAGE_RANK.speedWeight', STAGE_RANK, 'speedWeight', 0, 3, 0.1),
        field('STAGE_RANK.thresholds.s', STAGE_RANK.thresholds, 's', 0.5, 1, 0.01),
        field('STAGE_RANK.thresholds.a', STAGE_RANK.thresholds, 'a', 0.3, 1, 0.01),
        field('STAGE_RANK.thresholds.b', STAGE_RANK.thresholds, 'b', 0.1, 1, 0.01),
      ],
    },
    {
      title: 'Crew scaling',
      fields: [field('CREW_SCALING.perExtraPlayer', CREW_SCALING, 'perExtraPlayer', 0, 1.5, 0.05, 'next stage')],
    },
    {
      title: 'Hyperspace',
      fields: [
        field('HYPERSPACE.deathChance', HYPERSPACE, 'deathChance', 0, 0.6, 0.01),
        field('HYPERSPACE.cooldownMs', HYPERSPACE, 'cooldownMs', 0, 10000, 250),
      ],
    },
    {
      title: 'Commander puff',
      fields: [
        field('COMMANDER.puffFuelSeconds', COMMANDER, 'puffFuelSeconds', 0, 10, 0.25, 'next eject'),
        field('COMMANDER.puffAccelPerSec', COMMANDER, 'puffAccelPerSec', 0.1, 5, 0.1),
        field('COMMANDER.puffMaxSpeed', COMMANDER, 'puffMaxSpeed', 0.2, 6, 0.1),
        field('COMMANDER.puffTurnRateRadPerSec', COMMANDER, 'puffTurnRateRadPerSec', 0.5, 8, 0.1),
      ],
    },
    {
      title: 'Slow-motion',
      fields: [
        field('EFFECTS.slowMo.timeScale', EFFECTS.slowMo, 'timeScale', 0.05, 1, 0.05),
        field('EFFECTS.slowMo.durationMs', EFFECTS.slowMo, 'durationMs', 100, 2000, 50),
      ],
    },
    {
      title: 'Tether',
      fields: [
        field('TETHER.attachDistancePx', TETHER, 'attachDistancePx', 20, 400, 10),
        field('TETHER.restLengthPx', TETHER, 'restLengthPx', 40, 600, 10),
        field('TETHER.breakDistancePx', TETHER, 'breakDistancePx', 150, 1200, 10),
        field('TETHER.stiffness', TETHER, 'stiffness', 0.00000002, 0.000002, 0.00000002),
        field('TETHER.maxForce', TETHER, 'maxForce', 0.000005, 0.0003, 0.000005),
      ],
    },
    {
      title: 'The Assembler',
      fields: [
        field('ASSEMBLER.platesToComplete', ASSEMBLER, 'platesToComplete', 2, 16, 1),
        field('ASSEMBLER.hpPerPlate', ASSEMBLER, 'hpPerPlate', 1, 12, 1),
        field('ASSEMBLER.pullRadius', ASSEMBLER, 'pullRadius', 80, 700, 10),
        field('ASSEMBLER.pullForce', ASSEMBLER, 'pullForce', 0.000001, 0.00005, 0.000001),
        field('ASSEMBLER.huntSpeed', ASSEMBLER, 'huntSpeed', 0.1, 3, 0.05),
        field('ASSEMBLER.shardCooldownMs', ASSEMBLER, 'shardCooldownMs', 500, 8000, 100),
        field('ASSEMBLER.minStageElapsedMs', ASSEMBLER, 'minStageElapsedMs', 0, 120000, 5000, 'next stage'),
        field('ASSEMBLER.spawnChance', ASSEMBLER, 'spawnChance', 0, 1, 0.05, 'next stage'),
      ],
    },
    {
      title: 'Terrain',
      fields: [
        field('TERRAIN.minCount', TERRAIN, 'minCount', 0, 8, 1, 'next stage'),
        field('TERRAIN.maxCount', TERRAIN, 'maxCount', 0, 10, 1, 'next stage'),
        field('TERRAIN.minRadius', TERRAIN, 'minRadius', 20, 150, 5, 'next stage'),
        field('TERRAIN.maxRadius', TERRAIN, 'maxRadius', 30, 220, 5, 'next stage'),
        field('TERRAIN.spawnChance', TERRAIN, 'spawnChance', 0, 1, 0.05, 'next stage'),
      ],
    },
    {
      title: 'Hull: Interceptor',
      fields: hullFields('interceptor'),
    },
    { title: 'Hull: Gunship', fields: hullFields('gunship') },
    { title: 'Hull: Rescue', fields: hullFields('rescue') },
    {
      title: 'Voice',
      fields: [
        field('GAME_VOICE.pitchHz', GAME_VOICE, 'pitchHz', 40, 220, 1),
        field('GAME_VOICE.rate', GAME_VOICE, 'rate', 0.5, 2.5, 0.02),
        field('GAME_VOICE.formantScale', GAME_VOICE, 'formantScale', 0.6, 1.6, 0.01),
        field('GAME_VOICE.growl', GAME_VOICE, 'growl', 0, 30, 0.5),
        field('GAME_VOICE.ringModDepth', GAME_VOICE, 'ringModDepth', 0, 1, 0.02),
        field('GAME_VOICE.ringModHz', GAME_VOICE, 'ringModHz', 10, 200, 1),
        field('GAME_VOICE.gain', GAME_VOICE, 'gain', 0, 1, 0.05),
      ],
    },
  ];
}

function hullFields(id: 'interceptor' | 'gunship' | 'rescue'): TuningField[] {
  const hull = HULLS[id];
  return [
    field(`HULLS.${id}.thrustForce`, hull, 'thrustForce', 0.000005, 0.0001, 0.000002),
    field(`HULLS.${id}.maxSpeed`, hull, 'maxSpeed', 2, 12, 0.25),
    field(`HULLS.${id}.turnRateRadPerSec`, hull, 'turnRateRadPerSec', 1, 7, 0.05),
    field(`HULLS.${id}.fireCooldownMs`, hull, 'fireCooldownMs', 60, 700, 10),
    field(`HULLS.${id}.maxOnScreenShots`, hull, 'maxOnScreenShots', 1, 12, 1),
    field(`HULLS.${id}.maxShieldCharges`, hull, 'maxShieldCharges', 1, 5, 1),
  ];
}

function getValue(f: TuningField): number {
  return Number(f.target[f.key]);
}

/** The one place the codebase's readonly view of config is deliberately bypassed - see this module's doc comment. */
function setValue(f: TuningField, value: number): void {
  (f.target as Record<string, number>)[f.key] = value;
}

/** True when the URL asks for it. Everything else in this module is inert unless this is. */
export function isTuningEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('tune') === '1';
}

/**
 * Builds and mounts the overlay. Safe to call unconditionally - it
 * no-ops unless `?tune=1` is present, and refuses to mount twice.
 */
export function mountTuningPanel(): void {
  if (!isTuningEnabled()) return;
  if (document.getElementById('debris-tuning')) return;

  const schema = buildSchema();
  // Snapshot before anything can be dragged, so the export can show
  // only what actually changed rather than all forty values.
  const defaults = new Map<string, number>();
  schema.forEach((group) => group.fields.forEach((f) => defaults.set(f.path, getValue(f))));

  const root = document.createElement('div');
  root.id = 'debris-tuning';
  root.innerHTML = `<style>
    #debris-tuning{position:fixed;top:0;right:0;width:330px;max-height:100vh;overflow-y:auto;
      z-index:99999;background:rgba(6,8,14,.94);color:#cfe8ff;font:12px/1.45 monospace;
      border-left:1px solid #1c2740;padding:8px 10px 40px}
    #debris-tuning h2{font-size:13px;margin:0 0 6px;color:#00e5ff;letter-spacing:.06em}
    #debris-tuning details{border-top:1px solid #16203a;padding:4px 0}
    #debris-tuning summary{cursor:pointer;color:#8fa6c8;padding:3px 0;user-select:none}
    #debris-tuning .row{display:grid;grid-template-columns:1fr 62px;gap:4px;align-items:center;margin:3px 0}
    #debris-tuning label{color:#9fb4d4;font-size:11px;overflow:hidden;text-overflow:ellipsis}
    #debris-tuning .note{color:#5a6b86;font-size:10px}
    #debris-tuning input[type=range]{width:100%}
    #debris-tuning .val{color:#fff;text-align:right;font-size:11px}
    #debris-tuning .changed label{color:#ffd166}
    #debris-tuning button{background:#12203a;color:#cfe8ff;border:1px solid #2a3b5c;
      padding:5px 8px;cursor:pointer;font:11px monospace;margin:2px 2px 6px 0}
    #debris-tuning textarea{width:100%;height:150px;background:#05070d;color:#8aff4d;
      border:1px solid #2a3b5c;font:11px monospace;display:none}
  </style>`;

  const header = document.createElement('h2');
  header.textContent = 'TUNING  (` to hide)';
  root.appendChild(header);

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'EXPORT CHANGED';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'RESET ALL';
  root.append(exportBtn, resetBtn);

  const out = document.createElement('textarea');
  out.readOnly = true;
  root.appendChild(out);

  const rows: { f: TuningField; row: HTMLElement; val: HTMLElement; input: HTMLInputElement }[] = [];

  schema.forEach((group) => {
    const box = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = group.title;
    box.appendChild(sum);

    group.fields.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'row';

      const label = document.createElement('label');
      label.textContent = f.note ? `${f.label} (${f.note})` : f.label;
      label.title = f.path;

      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = String(getValue(f));

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(f.min);
      input.max = String(f.max);
      input.step = String(f.step);
      input.value = String(getValue(f));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        setValue(f, v);
        val.textContent = String(v);
        row.classList.toggle('changed', v !== defaults.get(f.path));
      });

      const wrap = document.createElement('div');
      wrap.append(label, input);
      row.append(wrap, val);
      box.appendChild(row);
      rows.push({ f, row, val, input });
    });

    root.appendChild(box);
  });

  exportBtn.addEventListener('click', () => {
    const changed = rows
      .filter(({ f }) => getValue(f) !== defaults.get(f.path))
      .map(({ f }) => `${f.path}: ${defaults.get(f.path)} -> ${getValue(f)}`);
    out.style.display = 'block';
    out.value = changed.length
      ? `// Debris tuning - paste these into src/config/GameConfig.ts\n${changed.join('\n')}`
      : '// nothing changed yet';
    out.select();
  });

  resetBtn.addEventListener('click', () => {
    rows.forEach(({ f, row, val, input }) => {
      const d = defaults.get(f.path)!;
      setValue(f, d);
      input.value = String(d);
      val.textContent = String(d);
      row.classList.remove('changed');
    });
    out.value = '';
    out.style.display = 'none';
  });

  // Backtick hides the panel so it can be got out of the way mid-fight
  // without losing any of the values already dialled in.
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') root.style.display = root.style.display === 'none' ? 'block' : 'none';
  });

  document.body.appendChild(root);
}
