/* ============================================================
   HYPEROUT — Tron-style two-player light cycle racer
   Absolute steering. Best-of-N. Canvas 2D + fixed timestep.
   Modes: VS PLAYER / VS CPU. Boost = 2x speed + phase through trails.
   ============================================================ */

(() => {
  "use strict";

  // ---------- Config ----------
  const COLS = 120;
  const ROWS = 90;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const CELL = canvas.width / COLS; // 8px

  // Offscreen buffer for the emissive layer (trails/heads/particles) → bloom.
  const glow = document.createElement("canvas");
  glow.width = canvas.width;
  glow.height = canvas.height;
  const gctx = glow.getContext("2d");

  const BASE_TICK_MS = 90;     // starting ms-per-move (lower = faster)
  const MIN_TICK_MS = 45;      // fastest the speed-ramp will go
  const RAMP_EVERY_MS = 3000;  // ramp interval
  const RAMP_STEP_MS = 4;      // ms shaved off each ramp
  const SHRINK_EVERY_TICKS = 60; // shrink one ring every N ticks (shrink mode)

  // Boost — 3 discrete charges per round. Each press-and-hold is one boost that
  // lasts as long as the button is held, capped at 1s; releasing (or hitting the
  // cap) ends it and spends the charge. No recharge. While boosting: 2x speed,
  // no trail painted, and phases through trails.
  const BOOST_CHARGES = 3;        // boosts available each round
  const MAX_BOOST_MS = 1000;      // hard cap per boost (1 second)

  // AI
  const AI_FLOOD_LIMIT = 180;  // cap on space-fill evaluation
  const AI_TRAP_SPACE = 14;    // open space below this = CPU is nearly trapped (boosts to escape)
  const AI_PHASE_REACH = 6;    // cells the CPU will phase across to escape a trap
  const AI_PHASE_GAIN = 30;    // phasing must open at least this much extra space

  // Honor the OS "reduce motion" setting (skips screen shake + decorative CSS animation)
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const COLORS = {
    1: { head: "#eaffff", trail: "#00e5ff" },
    2: { head: "#fff2e0", trail: "#ff9d00" },
  };

  // Occupancy codes: 0 empty, 1/2 = player trail, 3 = wall (shrink)
  const EMPTY = 0, WALL = 3;

  const DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  const LEFT_OF  = { up: "left", left: "down", down: "right", right: "up" };
  const RIGHT_OF = { up: "right", right: "down", down: "left", left: "up" };

  // Turn keys -> [player, direction]
  const KEYMAP = {
    KeyW: [1, "up"], KeyS: [1, "down"], KeyA: [1, "left"], KeyD: [1, "right"],
    ArrowUp: [2, "up"], ArrowDown: [2, "down"], ArrowLeft: [2, "left"], ArrowRight: [2, "right"],
  };
  // Boost keys -> player
  const BOOSTMAP = { ShiftLeft: 1, ShiftRight: 2 };
  const boostHeld = { 1: false, 2: false };

  // ---------- DOM ----------
  const el = {
    menu: document.getElementById("menu"),
    hud: document.getElementById("hud"),
    banner: document.getElementById("banner"),
    bannerTitle: document.getElementById("bannerTitle"),
    bannerSub: document.getElementById("bannerSub"),
    countdown: document.getElementById("countdown"),
    cdNum: document.getElementById("cdNum"),
    s1: document.getElementById("s1"),
    s2: document.getElementById("s2"),
    roundNum: document.getElementById("roundNum"),
    startBtn: document.getElementById("startBtn"),
    rematchBtn: document.getElementById("rematchBtn"),
    targetVal: document.getElementById("targetVal"),
    shrinkMode: document.getElementById("shrinkMode"),
    boost1: document.getElementById("boost1"),
    boost2: document.getElementById("boost2"),
    p2who: document.getElementById("p2who"),
    modeSeg: document.getElementById("modeSeg"),
    musicVolMenu: document.getElementById("musicVolMenu"),
    sfxVolMenu: document.getElementById("sfxVolMenu"),
    musicVolPause: document.getElementById("musicVolPause"),
    sfxVolPause: document.getElementById("sfxVolPause"),
    pauseMenu: document.getElementById("pauseMenu"),
    pauseContinue: document.getElementById("pauseContinue"),
    pauseRestart: document.getElementById("pauseRestart"),
    pauseMainMenu: document.getElementById("pauseMainMenu"),
    quitMenu: document.getElementById("quitMenu"),
    quitYes: document.getElementById("quitYes"),
    quitNo: document.getElementById("quitNo"),
    stage: document.getElementById("stage"),
    fsBtn: document.getElementById("fsBtn"),
    splash: document.getElementById("splash"),
  };

  // ---------- Viewport scaling (fit the fixed 960x720 stage to any screen) ----------
  function fitStage() {
    const s = Math.min(window.innerWidth / 960, window.innerHeight / 720);
    el.stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", fitStage);
  fitStage();

  // Shrink any wide overlay text so it can't overflow the 960px stage and get
  // clipped — font metrics vary across browsers, so measure and adjust.
  function fitOverlayText() {
    const MAXW = 960 * 0.9;
    document.querySelectorAll(".title, .tagline, .banner-title, .pause-title").forEach((n) => {
      n.style.whiteSpace = "nowrap";
      if (!n.dataset.base) {
        n.dataset.base = parseFloat(getComputedStyle(n).fontSize) || 16;
        n.dataset.baseLs = parseFloat(getComputedStyle(n).letterSpacing) || 0;
      }
      const base = parseFloat(n.dataset.base), baseLs = parseFloat(n.dataset.baseLs);
      n.style.fontSize = base + "px";
      n.style.letterSpacing = baseLs + "px";
      const w = n.scrollWidth;
      if (w > MAXW) {
        const r = MAXW / w; // scale font AND letter-spacing so width tracks linearly
        n.style.fontSize = (base * r).toFixed(1) + "px";
        n.style.letterSpacing = (baseLs * r).toFixed(2) + "px";
      }
    });
  }
  fitOverlayText();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitOverlayText);

  function toggleFullscreen() {
    const d = document, root = d.documentElement;
    try {
      let p;
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        p = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      } else {
        p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      }
      if (p && p.catch) p.catch(() => {}); // ignore rejections (e.g. blocked)
    } catch (e) {}
  }
  document.addEventListener("fullscreenchange", fitStage);
  document.addEventListener("webkitfullscreenchange", fitStage);
  el.fsBtn.addEventListener("click", toggleFullscreen);

  // ---------- Audio (WebAudio SFX + HTMLAudio music) ----------
  let musicVol = 0.5;                 // 0..1
  let sfxVol = 0.7;                   // 0..1
  let lastMusicVol = 0.5;             // for M-key mute toggle

  let audioCtx = null, sfxGain = null;
  function audio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = sfxVol;   // master SFX volume
        sfxGain.connect(audioCtx.destination);
        decodeExplosionsIfReady();     // decode crash .wavs once we have a context
      } catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }
  // ---------- Racer engines: one spatialized synth voice per bike ----------
  // Detuned saws + square + sub sine → resonant lowpass → gain → stereo pan.
  // Pitch/filter/gain track the speed-ramp and boost; panned by grid position.
  const engines = { 1: null, 2: null };

  function makeEngine(id) {
    const ac = audio(); if (!ac) return null;
    const base = id === 1 ? 58 : 64;                 // distinct pitch per bike
    const mix = ac.createGain(); mix.gain.value = 0.22;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 300; filter.Q.value = 7;
    const voice = ac.createGain(); voice.gain.value = 0.0001;
    const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;

    const oscs = [];
    const mk = (type, freq, detune) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      o.connect(mix); o.start(); oscs.push(o); return o;
    };
    mk("sawtooth", base, -8);
    mk("sawtooth", base, +8);
    mk("square", base, 0);
    const sub = mk("sine", base / 2, 0);             // octave-down body

    // Living idle: slow vibrato on detune
    const lfo = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 4.5 + id * 0.7;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 5;
    lfo.connect(lfoGain); oscs.forEach((o) => lfoGain.connect(o.detune)); lfo.start();

    mix.connect(filter);
    if (panner) filter.connect(voice).connect(panner).connect(sfxGain);
    else filter.connect(voice).connect(sfxGain);

    // Rev-up: pitch sweep from low → base + gain fade-in
    const now = ac.currentTime;
    oscs.forEach((o) => {
      const target = o === sub ? base / 2 : base;
      o.frequency.setValueAtTime(target * 0.5, now);
      o.frequency.exponentialRampToValueAtTime(target, now + 0.45);
    });
    voice.gain.exponentialRampToValueAtTime(0.05, now + 0.4);

    return { id, oscs, sub, mix, filter, voice, panner, base, lfo, alive: true };
  }

  function startEngines() {
    if (!audio()) return;
    stopEngines();
    engines[1] = makeEngine(1);
    engines[2] = makeEngine(2);
  }
  function stopEngines() {
    [1, 2].forEach((id) => {
      const e = engines[id]; if (!e) return;
      try { e.oscs.forEach((o) => o.stop()); e.lfo.stop(); } catch (x) {}
      engines[id] = null;
    });
  }
  function muteEngines() {
    const ac = audio(); if (!ac) return;
    [1, 2].forEach((id) => { const e = engines[id]; if (e) e.voice.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); });
  }
  function enginePowerDown(id) {
    const e = engines[id], ac = audio();
    if (!e || !ac) return;
    e.alive = false;
    const now = ac.currentTime;
    e.oscs.forEach((o) => { o.frequency.cancelScheduledValues(now); o.frequency.setTargetAtTime(Math.max(20, o.frequency.value * 0.3), now, 0.12); });
    e.filter.frequency.setTargetAtTime(120, now, 0.12);
    e.voice.gain.setTargetAtTime(0.0001, now, 0.16);
  }
  function updateEngines() {
    const ac = audio(); if (!ac) return;
    const now = ac.currentTime;
    const speedT = 1 - (game.tickMs - MIN_TICK_MS) / (BASE_TICK_MS - MIN_TICK_MS); // 0..1
    for (const p of game.players) {
      const e = engines[p.id];
      if (!e || !e.alive) continue;
      const boost = p.boosting ? 1 : 0;
      const pitchMul = 1 + speedT * 0.85 + boost * 0.5;
      e.oscs.forEach((o) => {
        const t = (o === e.sub ? e.base / 2 : e.base) * pitchMul;
        o.frequency.setTargetAtTime(t, now, 0.08);
      });
      e.filter.frequency.setTargetAtTime(300 + speedT * 2600 + boost * 1500, now, 0.08);
      e.voice.gain.setTargetAtTime(0.045 + speedT * 0.04 + boost * 0.03, now, 0.06);
      if (e.panner) e.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, (p.x / COLS - 0.5) * 1.3)), now, 0.1);
    }
  }
  // Crash explosion — rendered from an exported jsfxr/sfxr preset.
  const EXPLOSION_PARAMS = {
    wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.39115385027676763,
    p_env_punch: 0.277017058433186, p_env_decay: 0.19625615059852286,
    p_base_freq: 0.06256030754006334, p_freq_limit: 0,
    p_freq_ramp: -0.04582317276326253, p_freq_dramp: 0,
    p_vib_strength: 0.2703588155652318, p_vib_speed: 0.47709358398962454,
    p_arp_mod: -0.35756980179750864, p_arp_speed: 0.8288629319847101,
    p_duty: 0, p_duty_ramp: 0, p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.25, sample_rate: 44100, sample_size: 16,
  };

  // Faithful port of the sfxr synth (Thomas Vian / grumdrig jsfxr, public domain).
  // Renders a preset to a Float32 sample array, peak-normalized for a consistent
  // level (the SFX slider scales it from there).
  function renderSfxr(ps) {
    let fperiod = 100 / (ps.p_base_freq * ps.p_base_freq + 0.001);
    let period = Math.floor(fperiod);
    const fmaxperiod = 100 / (ps.p_freq_limit * ps.p_freq_limit + 0.001);
    let fslide = 1 - Math.pow(ps.p_freq_ramp, 3) * 0.01;
    const fdslide = -Math.pow(ps.p_freq_dramp, 3) * 0.000001;
    let square_duty = 0.5 - ps.p_duty * 0.5;
    const square_slide = -ps.p_duty_ramp * 0.00005;
    const arp_mod = ps.p_arp_mod >= 0
      ? 1 - Math.pow(ps.p_arp_mod, 2) * 0.9
      : 1 + Math.pow(ps.p_arp_mod, 2) * 10;
    let arp_time = 0;
    let arp_limit = ps.p_arp_speed === 1 ? 0 : Math.floor(Math.pow(1 - ps.p_arp_speed, 2) * 20000 + 32);

    let fphase = Math.pow(ps.p_pha_offset, 2) * 1020 * (ps.p_pha_offset < 0 ? -1 : 1);
    const fdphase = Math.pow(ps.p_pha_ramp, 2) * (ps.p_pha_ramp < 0 ? -1 : 1);
    let iphase = Math.abs(Math.floor(fphase)), ipp = 0;
    const phaser_buffer = new Float32Array(1024);
    const noise_buffer = new Float32Array(32);
    for (let i = 0; i < 32; i++) noise_buffer[i] = Math.random() * 2 - 1;

    let fltp = 0, fltdp = 0;
    let fltw = Math.pow(ps.p_lpf_freq, 3) * 0.1;
    const fltw_d = 1 + ps.p_lpf_ramp * 0.0001;
    let fltdmp = 5 / (1 + Math.pow(ps.p_lpf_resonance, 2) * 20) * (0.01 + fltw);
    if (fltdmp > 0.8) fltdmp = 0.8;
    let fltphp = 0;
    let flthp = Math.pow(ps.p_hpf_freq, 2) * 0.1;
    const flthp_d = 1 + ps.p_hpf_ramp * 0.0003;

    let vib_phase = 0;
    const vib_speed = Math.pow(ps.p_vib_speed, 2) * 0.01;
    const vib_amp = ps.p_vib_strength * 0.5;

    let env_vol = 0, env_stage = 0, env_time = 0;
    const env_length = [
      Math.floor(ps.p_env_attack * ps.p_env_attack * 100000),
      Math.floor(ps.p_env_sustain * ps.p_env_sustain * 100000),
      Math.floor(ps.p_env_decay * ps.p_env_decay * 100000),
    ];
    const env_punch = ps.p_env_punch;

    let rep_time = 0;
    const rep_limit = ps.p_repeat_speed === 0 ? 0 : Math.floor(Math.pow(1 - ps.p_repeat_speed, 2) * 20000 + 32);

    let phase = 0;
    const out = [];
    const MAX = 44100 * 3; // safety cap

    for (;;) {
      rep_time++;
      if (rep_limit !== 0 && rep_time >= rep_limit) {
        rep_time = 0;
        fperiod = 100 / (ps.p_base_freq * ps.p_base_freq + 0.001);
        period = Math.floor(fperiod);
      }
      arp_time++;
      if (arp_limit !== 0 && arp_time >= arp_limit) { arp_limit = 0; fperiod *= arp_mod; }

      fslide += fdslide;
      fperiod *= fslide;
      if (fperiod > fmaxperiod) { fperiod = fmaxperiod; if (ps.p_freq_limit > 0) break; }

      let rfperiod = fperiod;
      if (vib_amp > 0) { vib_phase += vib_speed; rfperiod = fperiod * (1 + Math.sin(vib_phase) * vib_amp); }
      period = Math.floor(rfperiod);
      if (period < 8) period = 8;

      square_duty += square_slide;
      if (square_duty < 0) square_duty = 0;
      if (square_duty > 0.5) square_duty = 0.5;

      env_time++;
      if (env_time > env_length[env_stage]) { env_time = 0; if (++env_stage === 3) break; }
      if (env_stage === 0) env_vol = env_length[0] ? env_time / env_length[0] : 1;
      else if (env_stage === 1) env_vol = 1 + (1 - env_time / env_length[1]) * 2 * env_punch;
      else env_vol = 1 - env_time / env_length[2];

      fphase += fdphase;
      iphase = Math.min(1023, Math.abs(Math.floor(fphase)));
      if (flthp_d !== 0) { flthp *= flthp_d; if (flthp < 0.00001) flthp = 0.00001; if (flthp > 0.1) flthp = 0.1; }

      let sample = 0;
      for (let si = 0; si < 8; si++) {
        phase++;
        if (phase >= period) {
          phase %= period;
          if (ps.wave_type === 3) for (let i = 0; i < 32; i++) noise_buffer[i] = Math.random() * 2 - 1;
        }
        const fp = phase / period;
        let sub;
        if (ps.wave_type === 0) sub = fp < square_duty ? 0.5 : -0.5;
        else if (ps.wave_type === 1) sub = 1 - fp * 2;
        else if (ps.wave_type === 2) sub = Math.sin(fp * 2 * Math.PI);
        else sub = noise_buffer[Math.floor(phase * 32 / period)];

        const pp = fltp;
        fltw *= fltw_d;
        if (fltw < 0) fltw = 0; if (fltw > 0.1) fltw = 0.1;
        if (ps.p_lpf_freq !== 1) { fltdp += (sub - fltp) * fltw; fltdp -= fltdp * fltdmp; }
        else { fltp = sub; fltdp = 0; }
        fltp += fltdp;
        fltphp += fltp - pp;
        fltphp -= fltphp * flthp;
        sub = fltphp;

        phaser_buffer[ipp & 1023] = sub;
        sub += phaser_buffer[(ipp - iphase + 1024) & 1023];
        ipp = (ipp + 1) & 1023;

        sample += sub * env_vol;
      }
      out.push(sample / 8);
      if (out.length >= MAX) break;
    }

    const data = Float32Array.from(out);
    let peak = 0;
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
    if (peak > 0) { const g = 0.85 / peak; for (let i = 0; i < data.length; i++) data[i] *= g; }
    return data;
  }

  let explosionBuf = null;
  function getExplosionBuffer(ac) {
    if (explosionBuf) return explosionBuf;
    const data = renderSfxr(EXPLOSION_PARAMS);
    explosionBuf = ac.createBuffer(1, data.length || 1, EXPLOSION_PARAMS.sample_rate);
    explosionBuf.getChannelData(0).set(data);
    return explosionBuf;
  }

  // Recorded crash explosions — 4 .wav files played at random. Bytes are
  // prefetched at load; decoded once the AudioContext exists.
  const EXPLOSION_FILES = ["explosion1.wav", "explosion2.wav", "explosion3.wav", "explosion4.wav"];
  let explosionSamples = [], lastExplosionIdx = -1, explosionRaw = null, explosionsDecoded = false;

  Promise.all(EXPLOSION_FILES.map((f) =>
    fetch("music/sfx/" + f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  )).then((list) => { explosionRaw = list.filter(Boolean); decodeExplosionsIfReady(); });

  function decodeExplosionsIfReady() {
    if (explosionsDecoded || !explosionRaw || !audioCtx) return;
    explosionsDecoded = true;
    explosionRaw.forEach((buf) => {
      try {
        audioCtx.decodeAudioData(buf.slice(0)).then((b) => explosionSamples.push(b)).catch(() => {});
      } catch (e) {} // ancient callback-only API — skip (sfxr fallback still plays)
    });
  }

  // Crash sound: play a random explosion .wav (sfxr synth as fallback until the
  // wavs are decoded) and duck the music.
  function derez() {
    const ac = audio(); if (!ac) return;
    duckMusic();
    if (explosionSamples.length) {
      let i = Math.floor(Math.random() * explosionSamples.length);
      if (explosionSamples.length > 1 && i === lastExplosionIdx) i = (i + 1) % explosionSamples.length;
      lastExplosionIdx = i;
      const src = ac.createBufferSource();
      src.buffer = explosionSamples[i];
      src.connect(sfxGain);
      src.start();
    } else {
      const src = ac.createBufferSource(); // fallback: rendered sfxr explosion
      src.buffer = getExplosionBuffer(ac);
      src.connect(sfxGain);
      src.start();
    }
  }
  function blip(freq) {
    const ac = audio(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    o.connect(g).connect(sfxGain);
    o.start();
    o.stop(ac.currentTime + 0.2);
  }

  // ---------- Music (menu track + random in-game playlist) ----------
  //  music/menu.mp3        → title-screen loop
  //  music/game/*.mp3      → played at random during matches
  // In-game tracks are discovered from music/game/tracks.json (a JSON array of
  // filenames) or, failing that, from the dev server's directory listing.
  const menuMusic = new Audio("music/menu.mp3");
  menuMusic.loop = true;
  menuMusic.volume = musicVol;
  menuMusic.addEventListener("error", () => {}); // absent file → silent, no crash

  const gameMusic = new Audio();     // not looped: 'ended' picks the next track
  gameMusic.volume = musicVol;
  gameMusic.addEventListener("error", () => {});
  gameMusic.addEventListener("ended", () => { if (game.state !== STATE.MENU) playRandomGameTrack(); });

  let gameTracks = [], lastTrackIdx = -1;
  async function loadGameTracks() {
    try { // 1) explicit manifest (works on any host)
      const r = await fetch("music/game/tracks.json", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) { gameTracks = j; return; } }
    } catch (e) {}
    try { // 2) fallback: parse a directory listing (e.g. `python -m http.server`)
      const r = await fetch("music/game/", { cache: "no-store" });
      if (r.ok) {
        const html = await r.text();
        gameTracks = [...html.matchAll(/href="([^"]+\.mp3)"/gi)]
          .map((m) => decodeURIComponent(m[1].split("/").pop()));
      }
    } catch (e) {}
  }
  loadGameTracks();

  function safePlay(a) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }

  // Fade + duck envelopes (0..1 multipliers applied on top of musicVol).
  const FADE_MS = 700, DUCK_MS = 700, DUCK_LEVEL = 0.35;
  let musicDuck = 1;                       // dips on a crash, recovers to 1
  let gameFade = 1, gameTarget = 1;        // in-game track fade
  let menuFade = 1, menuTarget = 1;        // menu track fade

  function playRandomGameTrack() {
    if (!gameTracks.length) return;
    let i = Math.floor(Math.random() * gameTracks.length);
    if (gameTracks.length > 1 && i === lastTrackIdx) i = (i + 1) % gameTracks.length;
    lastTrackIdx = i;
    gameMusic.src = "music/game/" + gameTracks[i];
    try { gameMusic.currentTime = 0; } catch (e) {}
    gameFade = 0; gameTarget = 1;           // fade the new track in
    applyMusicVol();
    safePlay(gameMusic);
  }

  function startGameMusic() { menuTarget = 0; playRandomGameTrack(); } // crossfade menu→game
  function playMenuMusic() {                                           // crossfade game→menu
    gameTarget = 0;
    menuFade = 0; menuTarget = 1;
    applyMusicVol();
    safePlay(menuMusic);
  }
  function pauseGameMusic() { gameMusic.pause(); }
  function resumeGameMusic() { if (gameMusic.src) safePlay(gameMusic); else playRandomGameTrack(); }
  function duckMusic() { musicDuck = Math.min(musicDuck, DUCK_LEVEL); applyMusicVol(); }

  // Advance fades/duck each frame; pause a track once it has fully faded out.
  function updateMusicAudio(dt) {
    let ch = false;
    if (musicDuck < 1) { musicDuck = Math.min(1, musicDuck + dt / DUCK_MS); ch = true; }
    if (gameFade !== gameTarget) {
      const s = dt / FADE_MS;
      gameFade = gameFade < gameTarget ? Math.min(gameTarget, gameFade + s) : Math.max(gameTarget, gameFade - s);
      if (gameFade === 0 && gameTarget === 0) gameMusic.pause();
      ch = true;
    }
    if (menuFade !== menuTarget) {
      const s = dt / FADE_MS;
      menuFade = menuFade < menuTarget ? Math.min(menuTarget, menuFade + s) : Math.max(menuTarget, menuFade - s);
      if (menuFade === 0 && menuTarget === 0) menuMusic.pause();
      ch = true;
    }
    if (ch) applyMusicVol();
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function applyMusicVol() {
    gameMusic.volume = clamp01(musicVol * musicDuck * gameFade);
    menuMusic.volume = clamp01(musicVol * menuFade);
  }
  function setMusicVol(v) { musicVol = Math.max(0, Math.min(1, v)); applyMusicVol(); syncAudioSliders(); saveSettings(); }
  function setSfxVol(v) { sfxVol = Math.max(0, Math.min(1, v)); if (sfxGain) sfxGain.gain.value = sfxVol; syncAudioSliders(); saveSettings(); }
  function toggleMusicMute() {
    if (musicVol > 0) { lastMusicVol = musicVol; setMusicVol(0); }
    else { setMusicVol(lastMusicVol || 0.5); }
  }
  function syncAudioSliders() {
    [el.musicVolMenu, el.musicVolPause].forEach((s) => { if (s) s.value = Math.round(musicVol * 100); });
    [el.sfxVolMenu, el.sfxVolPause].forEach((s) => { if (s) s.value = Math.round(sfxVol * 100); });
  }

  // ---------- Persisted settings (localStorage) ----------
  const SETTINGS_KEY = "rheinarts.hyperout.v1";
  function saveSettings() {
    try {
      const active = el.modeSeg && el.modeSeg.querySelector(".active");
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        musicVol, sfxVol,
        target: el.targetVal ? parseInt(el.targetVal.textContent, 10) : 5,
        shrink: el.shrinkMode ? el.shrinkMode.checked : false,
        mode: active ? active.dataset.mode : "2p",
      }));
    } catch (e) {}
  }
  function loadSettings() {
    let s;
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (e) { s = null; }
    if (!s) return;
    if (typeof s.musicVol === "number") musicVol = s.musicVol;
    if (typeof s.sfxVol === "number") sfxVol = s.sfxVol;
    if (el.targetVal && s.target) el.targetVal.textContent = Math.max(1, Math.min(15, s.target));
    if (el.shrinkMode && typeof s.shrink === "boolean") el.shrinkMode.checked = s.shrink;
    if (el.modeSeg && s.mode) {
      el.modeSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === s.mode));
    }
  }

  // ---------- Game state ----------
  const STATE = { SPLASH: "splash", MENU: "menu", QUIT_CONFIRM: "quitConfirm", COUNTDOWN: "countdown", PLAYING: "playing", PAUSED: "paused", ROUND_OVER: "roundOver", MATCH_OVER: "matchOver" };

  const game = {
    state: STATE.SPLASH,
    grid: new Uint8Array(COLS * ROWS),
    players: [],
    scores: { 1: 0, 2: 0 },
    round: 1,
    target: 5,
    shrink: false,
    vsCPU: false,
    particles: [],
    shrinkRing: 0,
    tickMs: BASE_TICK_MS,
    acc: 0,
    lastTs: 0,
    playMs: 0,
    ticks: 0,
    shake: 0,
    countdownTimer: 0,
    countdownVal: 3,
    bannerTimer: 0,
  };

  function idx(x, y) { return y * COLS + x; }

  function makePlayer(id, x, y, dir) {
    return { id, x, y, dir, alive: true, queue: [], trail: [],
             boostCharges: BOOST_CHARGES, boostElapsed: 0, boosting: false,
             boostLatch: false, aiBoost: false };
  }

  function resetRound() {
    game.grid.fill(EMPTY);
    game.particles = [];
    game.shrinkRing = 0;
    game.tickMs = BASE_TICK_MS;
    game.acc = 0;
    game.playMs = 0;
    game.ticks = 0;
    game.shake = 0;

    // P1 starts left heading right, P2 starts right heading left.
    // Offset the rows so a do-nothing game isn't an instant head-on draw.
    const p1 = makePlayer(1, Math.floor(COLS * 0.2), Math.floor(ROWS * 0.35), "right");
    const p2 = makePlayer(2, Math.floor(COLS * 0.8), Math.floor(ROWS * 0.65), "left");
    game.grid[idx(p1.x, p1.y)] = 1;
    game.grid[idx(p2.x, p2.y)] = 2;
    p1.trail.push([p1.x, p1.y]);
    p2.trail.push([p2.x, p2.y]);
    game.players = [p1, p2];
    updateBoostUI();
  }

  // ---------- Input ----------
  window.addEventListener("keydown", (e) => {
    if (game.state === STATE.SPLASH) { e.preventDefault(); dismissSplash(); return; }
    const map = KEYMAP[e.code];
    if (map) {
      e.preventDefault();
      if (game.state === STATE.PLAYING) {
        if (map[0] === 2 && game.vsCPU) return; // CPU owns P2
        queueTurn(map[0], map[1]);
      }
      return;
    }
    if (e.code in BOOSTMAP) {
      const pid = BOOSTMAP[e.code];
      if (game.state === STATE.PLAYING && !(pid === 2 && game.vsCPU)) boostHeld[pid] = true;
      e.preventDefault();
      return;
    }
    if (e.code === "Escape") {
      if (game.state === STATE.PLAYING) pauseGame();
      else if (game.state === STATE.PAUSED) resumeGame();
      else if (game.state === STATE.MENU) openQuitConfirm();
      else if (game.state === STATE.QUIT_CONFIRM) closeQuitConfirm();
      return;
    }
    if (e.code === "KeyM") { toggleMusicMute(); return; }
    if (e.code === "KeyF") { toggleFullscreen(); return; }
    if (e.code === "Space" || e.code === "Enter") {
      if (game.state === STATE.MENU) startMatch();
      else if (game.state === STATE.MATCH_OVER) backToMenu();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code in BOOSTMAP) boostHeld[BOOSTMAP[e.code]] = false;
  });

  function queueTurn(playerId, dir) {
    const p = game.players.find((pl) => pl.id === playerId);
    if (!p || !p.alive) return;
    const base = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (dir === OPPOSITE[base] || dir === base) return; // no 180s, no dupes
    if (p.queue.length < 2) p.queue.push(dir);
  }

  // ---------- AI (space-filling greedy) ----------
  const visited = new Int32Array(COLS * ROWS);
  let visitGen = 0;
  const bfsStack = new Int32Array(COLS * ROWS);

  function floodFill(sx, sy, limit) {
    if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS) return 0;
    if (game.grid[idx(sx, sy)] !== EMPTY) return 0;
    visitGen++;
    let top = 0, count = 0;
    const start = idx(sx, sy);
    visited[start] = visitGen;
    bfsStack[top++] = start;
    while (top > 0 && count < limit) {
      const c = bfsStack[--top];
      count++;
      const cx = c % COLS, cy = (c / COLS) | 0;
      const nb = [
        cx > 0 ? c - 1 : -1,
        cx < COLS - 1 ? c + 1 : -1,
        cy > 0 ? c - COLS : -1,
        cy < ROWS - 1 ? c + COLS : -1,
      ];
      for (const n of nb) {
        if (n < 0) continue;
        if (visited[n] === visitGen) continue;
        if (game.grid[n] !== EMPTY) continue;
        visited[n] = visitGen;
        bfsStack[top++] = n;
      }
    }
    return count;
  }

  function clearAhead(p) {
    const d = DIRS[p.dir];
    let n = 0, x = p.x, y = p.y;
    while (n < 60) {
      x += d.x; y += d.y;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || game.grid[idx(x, y)] !== EMPTY) break;
      n++;
    }
    return n;
  }

  // First open cell reachable by phasing straight through trails in `dir`, or
  // null if bounds / a shrink-wall block the way or there's no wall to phase.
  function phaseExitCell(p, dir) {
    const d = DIRS[dir];
    let x = p.x, y = p.y, passedTrail = false;
    for (let step = 1; step <= AI_PHASE_REACH; step++) {
      x += d.x; y += d.y;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
      const cell = game.grid[idx(x, y)];
      if (cell === WALL) return null;                 // can't phase shrink-walls
      if (cell === EMPTY) return passedTrail ? { x, y } : null;
      passedTrail = true;                             // a trail we'd phase through
    }
    return null;
  }

  function aiDecide(p) {
    // Mid-phase safety: if boosting while sitting inside a trail, keep boosting
    // straight — de-phasing inside a wall would crash (materialize check).
    if (p.boosting && game.grid[idx(p.x, p.y)] !== EMPTY) {
      p.queue = []; p.aiBoost = true; return;
    }

    // Evaluate straight / left / right (never reverse) by open space.
    const opts = [p.dir, LEFT_OF[p.dir], RIGHT_OF[p.dir]];
    let best = null, bestScore = -1;
    for (const dir of opts) {
      const d = DIRS[dir];
      const nx = p.x + d.x, ny = p.y + d.y;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (game.grid[idx(nx, ny)] !== EMPTY) continue;
      let score = floodFill(nx, ny, AI_FLOOD_LIMIT);
      if (dir === p.dir) score += 3;                 // prefer committing straight
      if (dir !== p.dir && (game.ticks & 7) === 0) score += 1; // occasional nudge to turn
      if (score > bestScore) { bestScore = score; best = dir; }
    }

    // Boosts are held in reserve — the CPU never boosts offensively. It only
    // boosts to escape an otherwise-certain crash (the defensive phase below).
    let boost = false;

    // Defensive phase: nearly trapped → look for a thin wall to boost through
    // into open space on the far side.
    if (bestScore < AI_TRAP_SPACE && p.boostCharges > 0 && !p.boostLatch) {
      let phaseDir = null, phaseScore = bestScore + AI_PHASE_GAIN;
      for (const dir of opts) {
        const exit = phaseExitCell(p, dir);
        if (!exit) continue;
        const sp = floodFill(exit.x, exit.y, AI_FLOOD_LIMIT);
        if (sp > phaseScore) { phaseScore = sp; phaseDir = dir; }
      }
      if (phaseDir) {
        p.queue = phaseDir === p.dir ? [] : [phaseDir];
        p.aiBoost = true;
        return;
      }
    }

    if (best && best !== p.dir) p.queue = [best];
    p.aiBoost = boost;
  }

  // ---------- Simulation ----------
  function tick() {
    game.ticks++;

    // Speed ramp
    const targetMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - Math.floor(game.playMs / RAMP_EVERY_MS) * RAMP_STEP_MS);
    game.tickMs = targetMs;

    // Shrinking arena
    if (game.shrink && game.ticks % SHRINK_EVERY_TICKS === 0) addShrinkRing();

    // Snapshot liveness so we can detect deaths (incl. boost-landing) this tick.
    const preAlive = game.players.map((p) => p.alive);

    // Boost / AI intent. Hold-to-use ms pool: drains while boosting (1s max),
    // refills at 1/3 rate. Depleting fully locks it until a full recharge.
    for (const p of game.players) {
      if (!p.alive) continue;
      if (p.id === 2 && game.vsCPU) aiDecide(p);
      const want = (p.id === 2 && game.vsCPU) ? p.aiBoost : boostHeld[p.id];
      const wasBoosting = p.boosting;
      // Start a new boost on a fresh press if a charge is available. The latch
      // blocks auto-restart while the button stays held after a boost ends.
      if (!p.boosting) {
        if (want && !p.boostLatch && p.boostCharges > 0) {
          p.boosting = true; p.boostElapsed = 0;
        } else if (!want) {
          p.boostLatch = false;                 // released → re-arm for next press
        }
      }
      // Continue the boost until released or the 1s cap (strict: only a whole
      // tick within the cap keeps it active → total boost time never exceeds 1s).
      if (p.boosting) {
        if (!want) {                            // released early → end, spend charge
          p.boosting = false; p.boostCharges--;
        } else if (p.boostElapsed + game.tickMs > MAX_BOOST_MS) {
          p.boosting = false; p.boostCharges--; p.boostLatch = true; // hit cap while held
        } else {
          p.boostElapsed += game.tickMs;
        }
      }
      // Boost just ended this tick → materialize. If the bike is sitting inside
      // a trail (phased in) it crashes; else resume its trail on open ground.
      if (wasBoosting && !p.boosting) {
        if (game.grid[idx(p.x, p.y)] !== EMPTY) p.alive = false;
        else { game.grid[idx(p.x, p.y)] = p.id; p.trail.push([p.x, p.y]); }
      }
    }

    // Substep 1: everyone alive moves one cell
    stepPlayers(game.players.filter((p) => p.alive));
    // Substep 2: boosters move a second cell (double speed)
    stepPlayers(game.players.filter((p) => p.alive && p.boosting));

    // Deaths this tick → crash burst + derez + shake
    let died = false;
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      if (preAlive[i] && !p.alive) {
        died = true;
        spawnBurst(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, COLORS[p.id].trail);
        enginePowerDown(p.id); // that bike's engine winds down
      }
    }
    if (died) { derez(); game.shake = reduceMotion ? 0 : 16; }

    const survivors = game.players.filter((p) => p.alive);
    updateBoostUI();
    if (survivors.length <= 1) endRound(survivors);
  }

  // Advance a set of players by one cell, resolving collisions together.
  // While boosting a player leaves NO trail — a passable gap.
  function stepPlayers(movers) {
    if (!movers.length) return;
    const intents = movers.map((p) => {
      if (p.queue.length) p.dir = p.queue.shift();
      const d = DIRS[p.dir];
      return { p, nx: p.x + d.x, ny: p.y + d.y, headon: false };
    });

    // Head-on kills only when BOTH bikes are solid — a phasing bike has no body.
    for (let i = 0; i < intents.length; i++) {
      for (let j = i + 1; j < intents.length; j++) {
        if (intents[i].nx === intents[j].nx && intents[i].ny === intents[j].ny) {
          if (!intents[i].p.boosting && !intents[j].p.boosting) {
            intents[i].headon = intents[j].headon = true;
          }
        }
      }
    }

    // Resolve. Boosting = phase: only bounds and shrink-walls are lethal, trails
    // are passed through. Solid bikes die on any occupied cell or a head-on.
    for (const it of intents) {
      const { nx, ny } = it;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { it.p.alive = false; continue; }
      const cell = game.grid[idx(nx, ny)];
      if (it.p.boosting) {
        if (cell === WALL) it.p.alive = false;
      } else if (cell !== EMPTY || it.headon) {
        it.p.alive = false;
      }
    }

    // Move survivors, paint trail (unless boosting → phasing leaves no trail)
    for (const it of intents) {
      if (!it.p.alive) continue;
      const { p, nx, ny } = it;
      p.x = nx; p.y = ny;
      if (!p.boosting) {
        game.grid[idx(nx, ny)] = p.id;
        p.trail.push([nx, ny]);
      }
    }
  }

  function addShrinkRing() {
    const r = game.shrinkRing;
    if (r * 2 >= Math.min(COLS, ROWS) - 4) return;
    for (let x = r; x < COLS - r; x++) { killCellOrEnd(x, r); killCellOrEnd(x, ROWS - 1 - r); }
    for (let y = r; y < ROWS - r; y++) { killCellOrEnd(r, y); killCellOrEnd(COLS - 1 - r, y); }
    game.shrinkRing++;
  }
  function killCellOrEnd(x, y) {
    if (game.grid[idx(x, y)] === EMPTY) game.grid[idx(x, y)] = WALL;
  }

  function endRound(survivors) {
    game.state = STATE.ROUND_OVER;
    muteEngines(); // fade engines out; torn down when the next round starts
    let title, sub;
    if (survivors.length === 1) {
      const w = survivors[0].id;
      game.scores[w]++;
      title = winnerName(w) + " WINS";
      sub = "THE ROUND";
      blip(w === 1 ? 660 : 520);
    } else {
      title = "DOUBLE KO";
      sub = "NO POINT AWARDED";
    }
    updateScoreUI();

    if (game.scores[1] >= game.target || game.scores[2] >= game.target) {
      const champ = game.scores[1] > game.scores[2] ? 1 : 2;
      showBanner(winnerName(champ) + " WINS THE MATCH", `${game.scores[1]} — ${game.scores[2]}`, true);
      game.state = STATE.MATCH_OVER;
      return;
    }

    showBanner(title, sub, false);
    game.bannerTimer = 1600;
  }

  function winnerName(id) {
    if (id === 2 && game.vsCPU) return "CPU";
    return "PLAYER " + id;
  }

  // ---------- Rendering ----------
  // Pipeline: draw the non-emissive base (bg + grid + shrink-walls) on the main
  // context, render the emissive layer (trails/heads/particles) to an offscreen
  // buffer, then composite two additive blurred copies (bloom) + one sharp copy.
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (game.shake > 0) {
      sx = (Math.random() - 0.5) * game.shake;
      sy = (Math.random() - 0.5) * game.shake;
      game.shake *= 0.85;
      if (game.shake < 0.4) game.shake = 0;
    }
    ctx.setTransform(1, 0, 0, 1, sx, sy);

    ctx.fillStyle = "#05060a";
    ctx.fillRect(-40, -40, canvas.width + 80, canvas.height + 80);
    drawGrid(ctx);
    drawWalls(ctx);

    // Emissive layer → offscreen buffer (flat colors; bloom supplies the glow)
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, glow.width, glow.height);
    drawTrails(gctx);
    drawParticles(gctx);
    drawHeads(gctx);

    // Bloom: additive blurred copies, then the crisp layer on top
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(6px)";  ctx.globalAlpha = 0.85; ctx.drawImage(glow, 0, 0);
    ctx.filter = "blur(15px)"; ctx.globalAlpha = 0.5;  ctx.drawImage(glow, 0, 0);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(glow, 0, 0);
  }

  function drawGrid(c) {
    c.lineWidth = 1;
    c.strokeStyle = "rgba(60,120,160,0.10)";
    c.beginPath();
    const step = CELL * 5;
    for (let x = 0; x <= canvas.width; x += step) { c.moveTo(x, 0); c.lineTo(x, canvas.height); }
    for (let y = 0; y <= canvas.height; y += step) { c.moveTo(0, y); c.lineTo(canvas.width, y); }
    c.stroke();
  }

  function drawWalls(c) {
    if (!game.shrink) return;
    c.fillStyle = "rgba(150,50,70,0.6)";
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (game.grid[idx(x, y)] === WALL) c.fillRect(x * CELL, y * CELL, CELL, CELL);
  }

  // Tapered "ribbon" trail: dim/aged tail -> bright leading edge, with a
  // hot white core crown on the newest cells. Drawn to the emissive buffer.
  function drawTrails(c) {
    for (const p of game.players) {
      const col = COLORS[p.id];
      const n = p.trail.length;
      for (let i = 0; i < n; i++) {
        const [x, y] = p.trail[i];
        const age = (i + 1) / n;               // ~1 near the head
        c.globalAlpha = 0.35 + 0.65 * age;
        c.fillStyle = col.trail;
        c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      const start = Math.max(0, n - 14);       // hot core crown near the head
      c.fillStyle = col.head;
      for (let i = start; i < n; i++) {
        const [x, y] = p.trail[i];
        c.globalAlpha = 0.2 + 0.6 * ((i - start + 1) / (n - start));
        c.fillRect(x * CELL + CELL * 0.28, y * CELL + CELL * 0.28, CELL * 0.44, CELL * 0.44);
      }
    }
    c.globalAlpha = 1;
  }

  const HEAD_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }

  // Directional light-cycle: elongated body aligned to travel (body -> white
  // nose), plus a jet streak while boosting. Bloom adds the glow.
  function drawHeads(c) {
    for (const p of game.players) {
      if (!p.alive) continue;
      const col = COLORS[p.id];
      const cx = p.x * CELL + CELL / 2, cy = p.y * CELL + CELL / 2;
      const boost = p.boosting;
      const len = (boost ? 4.4 : 2.7) * CELL;   // along direction of travel
      const wid = 1.35 * CELL;

      c.save();
      c.translate(cx, cy);
      c.rotate(HEAD_ANGLE[p.dir]);

      if (boost) {                               // jet streak trailing the bike
        c.globalAlpha = 0.5;
        c.fillStyle = col.trail;
        rr(c, -len * 0.5 - 3.6 * CELL, -0.3 * CELL, 3.6 * CELL, 0.6 * CELL, 2);
        c.globalAlpha = 1;
      }

      c.fillStyle = col.trail;                   // colored body
      rr(c, -len * 0.5, -wid * 0.5, len, wid, 3);
      c.fillStyle = col.head;                    // bright inner body
      rr(c, -len * 0.5 + 1.2, -wid * 0.5 + 1.2, len - 2.4, wid - 2.4, 2.5);
      c.fillStyle = "#ffffff";                   // white-hot nose
      rr(c, len * 0.5 - CELL, -0.5 * CELL, CELL, CELL, 2);

      c.restore();
    }
    c.globalAlpha = 1;
  }

  // ---------- Crash particles (emissive) ----------
  function spawnBurst(px, py, color) {
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.03 + Math.random() * 0.11;    // px per ms
      game.particles.push({
        x: px, y: py,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 380 + Math.random() * 420,
        size: 1 + Math.random() * 2.4, color,
      });
    }
  }
  function updateParticles(dt) {
    const ps = game.particles;
    const decay = Math.exp(-dt * 0.004);         // frame-rate independent friction
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life += dt;
      if (q.life >= q.max) { ps.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= decay; q.vy *= decay;
    }
  }
  function drawParticles(c) {
    for (const q of game.particles) {
      c.globalAlpha = Math.max(0, 1 - q.life / q.max);
      c.fillStyle = q.color;
      c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    c.globalAlpha = 1;
  }

  // ---------- Main loop (fixed timestep) ----------
  function loop(ts) {
    if (!game.lastTs) game.lastTs = ts;
    let dt = ts - game.lastTs;
    game.lastTs = ts;
    if (dt > 250) dt = 250;

    if (game.state !== STATE.PAUSED) updateParticles(dt); // frozen while paused
    updateMusicAudio(dt); // fades + crash duck

    if (game.state === STATE.PLAYING) {
      game.playMs += dt;
      game.acc += dt;
      while (game.acc >= game.tickMs && game.state === STATE.PLAYING) {
        game.acc -= game.tickMs;
        tick();
      }
      updateEngines();
      render();
    } else if (game.state === STATE.COUNTDOWN) {
      game.countdownTimer -= dt;
      render();
      if (game.countdownTimer <= 0) {
        game.countdownVal--;
        if (game.countdownVal <= 0) {
          hide(el.countdown);
          game.state = STATE.PLAYING;
          startEngines();
        } else {
          setCountdown(game.countdownVal);
          game.countdownTimer = 800;
        }
      }
    } else if (game.state === STATE.ROUND_OVER) {
      render();
      game.bannerTimer -= dt;
      if (game.bannerTimer <= 0) startCountdown();
    }

    requestAnimationFrame(loop);
  }

  // ---------- Flow / screens ----------
  function show(node) { node.classList.remove("hidden"); }
  function hide(node) { node.classList.add("hidden"); }

  function setCountdown(v) {
    el.cdNum.textContent = v;
    el.cdNum.style.animation = "none";
    void el.cdNum.offsetWidth;
    el.cdNum.style.animation = "";
    blip(300 + (3 - v) * 120);
  }

  function updateScoreUI() {
    el.s1.textContent = game.scores[1];
    el.s2.textContent = game.scores[2];
    el.roundNum.textContent = game.round;
  }

  function updateBoostUI() {
    if (!el.boost1 || !game.players.length) return;
    setBoostPips(el.boost1, game.players[0]);
    setBoostPips(el.boost2, game.players[1]);
  }
  function setBoostPips(container, p) {
    const pips = container.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle("filled", i < p.boostCharges);
      // the charge currently draining is the top remaining one while boosting
      pips[i].classList.toggle("active", p.boosting && i === p.boostCharges - 1);
    }
  }

  function showBanner(title, sub, isMatch) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub;
    if (isMatch) show(el.rematchBtn); else hide(el.rematchBtn);
    show(el.banner);
    fitOverlayText(); // refit now the dynamic title text is visible
  }

  function startMatch() {
    audio(); // unlock on user gesture
    game.scores = { 1: 0, 2: 0 };
    game.round = 1;
    game.target = parseInt(el.targetVal.textContent, 10);
    game.shrink = el.shrinkMode.checked;
    game.vsCPU = el.modeSeg.querySelector(".active").dataset.mode === "cpu";
    boostHeld[1] = boostHeld[2] = false;
    hide(el.menu);
    show(el.hud);
    updateScoreUI();
    startGameMusic();
    startCountdown();
  }

  function startCountdown() {
    hide(el.banner);
    if (game.state === STATE.ROUND_OVER) game.round++;
    resetRound();
    updateScoreUI();
    game.countdownVal = 3;
    setCountdown(3);
    game.countdownTimer = 800;
    game.state = STATE.COUNTDOWN;
    show(el.countdown);
  }

  function dismissSplash() {
    if (game.state !== STATE.SPLASH) return;
    hide(el.splash);
    game.state = STATE.MENU;
    show(el.menu);
    fitOverlayText();     // menu was hidden at boot; measure now it's visible
    playMenuMusic();      // this input is the user gesture that unlocks audio
  }

  function backToMenu() {
    hide(el.banner);
    hide(el.pauseMenu);
    hide(el.hud);
    stopEngines();
    game.state = STATE.MENU;
    resetRound();
    render();
    show(el.menu);
    playMenuMusic();
  }

  function pauseGame() {
    game.state = STATE.PAUSED;
    muteEngines(); // silenced; updateEngines() brings them back on resume
    pauseGameMusic();
    boostHeld[1] = boostHeld[2] = false; // don't resume into a stuck boost
    show(el.pauseMenu);
    fitOverlayText();
  }

  function resumeGame() {
    hide(el.pauseMenu);
    game.state = STATE.PLAYING;
    resumeGameMusic();
  }

  function openQuitConfirm() {
    game.state = STATE.QUIT_CONFIRM;
    hide(el.menu);
    show(el.quitMenu);
    fitOverlayText();
  }

  function closeQuitConfirm() {
    hide(el.quitMenu);
    game.state = STATE.MENU;
    show(el.menu);
  }

  // Absolute path: correct once deployed (portal always serves from site
  // root, this game from /hyperout/ - see root DEPLOYMENT.md). In a bare
  // local dev server (e.g. `python3 -m http.server` from the repo root)
  // there's no portal at "/", so this only resolves correctly in prod.
  function quitToPortal() {
    window.location.href = "/";
  }

  function restartMatch() {
    hide(el.pauseMenu);
    game.scores = { 1: 0, 2: 0 };
    game.round = 1;
    updateScoreUI();
    startGameMusic(); // fresh random track
    startCountdown(); // state is PAUSED (not ROUND_OVER) → round stays 1
  }

  function applyModeLabel() {
    const cpu = el.modeSeg.querySelector(".active").dataset.mode === "cpu";
    el.p2who.textContent = cpu ? "CPU" : "PLAYER 2";
  }

  // ---------- Menu wiring ----------
  el.startBtn.addEventListener("click", startMatch);
  el.rematchBtn.addEventListener("click", backToMenu);
  el.pauseContinue.addEventListener("click", resumeGame);
  el.pauseRestart.addEventListener("click", restartMatch);
  el.pauseMainMenu.addEventListener("click", backToMenu);
  el.quitYes.addEventListener("click", quitToPortal);
  el.quitNo.addEventListener("click", closeQuitConfirm);
  document.querySelectorAll(".target-btn").forEach((b) => {
    b.addEventListener("click", () => {
      let v = parseInt(el.targetVal.textContent, 10) + parseInt(b.dataset.d, 10);
      v = Math.max(1, Math.min(15, v));
      el.targetVal.textContent = v;
      saveSettings();
    });
  });
  el.modeSeg.querySelectorAll(".seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      el.modeSeg.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      applyModeLabel();
      saveSettings();
    });
  });
  if (el.shrinkMode) el.shrinkMode.addEventListener("change", saveSettings);

  // Volume sliders (menu + pause menu share the same state)
  function bindVol(elm, setter) { if (elm) elm.addEventListener("input", () => setter(elm.value / 100)); }
  bindVol(el.musicVolMenu, setMusicVol);
  bindVol(el.musicVolPause, setMusicVol);
  bindVol(el.sfxVolMenu, setSfxVol);
  bindVol(el.sfxVolPause, setSfxVol);
  loadSettings();    // restore saved prefs before first paint
  applyMusicVol();   // apply loaded music volume to the audio elements
  syncAudioSliders();

  // Retro "press any key" — a click/tap also dismisses the splash.
  window.addEventListener("pointerdown", () => { if (game.state === STATE.SPLASH) dismissSplash(); });

  // ---------- Boot ----------
  applyModeLabel();
  resetRound();
  render();
  requestAnimationFrame(loop);

  // Hash-gated test hook — only active when the URL ends with #debug.
  // Lets a headless harness step the fixed-timestep sim without relying on
  // requestAnimationFrame (which browsers pause for backgrounded tabs).
  if (location.hash === "#debug") {
    window.__ho = {
      game, STATE, tick, render, resetRound, boostHeld, spawnBurst,
      menuMusic, gameMusic, startGameMusic, playMenuMusic, updateMusicAudio, derez,
      getGameTracks: () => gameTracks, getVols: () => ({ musicVol, sfxVol }),
      getMusicEnv: () => ({ musicDuck, gameFade, menuFade, gameTarget, menuTarget }),
      renderExplosion: () => renderSfxr(EXPLOSION_PARAMS),
      fitOverlayText, fitStage, derez,
      explosionInfo: () => ({ decoded: explosionSamples.length, lastIdx: lastExplosionIdx }),
      startEngines, stopEngines, updateEngines, enginePowerDown,
      engineInfo: () => [1, 2].map((id) => {
        const e = engines[id]; if (!e) return null;
        return { id, alive: e.alive, oscs: e.oscs.length, hasPanner: !!e.panner,
                 pan: e.panner ? +e.panner.pan.value.toFixed(2) : null,
                 baseFreq: +e.oscs[0].frequency.value.toFixed(1),
                 cutoff: Math.round(e.filter.frequency.value), gain: +e.voice.gain.value.toFixed(4) };
      }),
      play(vsCPU) { game.vsCPU = !!vsCPU; resetRound(); game.state = STATE.PLAYING; },
    };
  }
})();
