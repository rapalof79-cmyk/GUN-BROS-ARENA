import * as THREE from './vendor/three.module.js';

// ============================================================
//  GUN BROS 3D — Arena  (twin-stick survival shooter)
// ============================================================
const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const panel = document.getElementById('panel');

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Rebuild an array in place instead of allocating a new one every frame.
// At 60 fps the old filter() calls handed the garbage collector a steady
// stream of throwaway arrays, and those collections land as dropped frames.
function prune(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (keep(v)) arr[w++] = v;
  }
  arr.length = w;
  return arr;
}

// The battlefield is now much bigger than the original hand-placed compound.
// That compound is the DCW × DCH "core" in layout space; it sits in the middle
// of WORLD with room for outer districts on all four sides. Everything built
// from layout coordinates goes through coreX()/coreZ(), so props, roads and
// their colliders stay perfectly in step.
const WORLD = { w: 3200, h: 2300 };
const HX = WORLD.w / 2, HZ = WORLD.h / 2;
const DCW = 2100, DCH = 1500;
const DCX = DCW / 2, DCZ = DCH / 2;
const CX = (WORLD.w - DCW) / 2, CZ = (WORLD.h - DCH) / 2;
const coreX = x => x + CX - HX;
const coreZ = z => z + CZ - HZ;
const ROAD_NS = 230, ROAD_EW = 200;
const PLAYER_SPAWN = { x: DCX + CX, z: 1310 + CZ };
// gate approaches, in world coordinates
const ENEMY_LANES = [
  { x: HX, z: 190 }, { x: HX, z: WORLD.h - 190 },
  { x: 190, z: HZ }, { x: WORLD.w - 190, z: HZ }
];

let VW = 0, VH = 0, DPR = 1;

// ------------------------------------------------------------
//  Content
// ------------------------------------------------------------
const WEAPONS = [
  { id: 'pistol',  name: 'MK.1 SIDEARM',  cls: 'pistol',   dmg: 14,  rate: 5.4,  speed: 900,  spread: 0.03,  pellets: 1, color: '#efe9ff', cost: 0,    lvl: 1, desc: 'Standard issue. Never jams, never impresses.' },
  { id: 'smg',     name: 'RIPPER SMG',    cls: 'rifle',    dmg: 8,   rate: 11,   speed: 1020, spread: 0.115, pellets: 1, color: '#c9a8ff', cost: 250,  lvl: 1, desc: 'Spray and pray. Mostly spray.' },
  { id: 'shotgun', name: 'BOOMSTICK',     cls: 'shotgun',  dmg: 11,  rate: 1.95, speed: 840,  spread: 0.36,  pellets: 7, color: '#c9a8ff', cost: 450,  lvl: 2, desc: 'Seven pellets of close-range diplomacy.' },
  { id: 'rifle',   name: 'MARAUDER AR',   cls: 'rifle',    dmg: 19,  rate: 6.6,  speed: 1220, spread: 0.045, pellets: 1, color: '#b48cff', cost: 700,  lvl: 2, desc: 'Flat, fast and accurate. The all-rounder of the armoury.' },
  { id: 'laser',   name: 'PHOTON LANCE',  cls: 'energy',   dmg: 30,  rate: 4.1,  speed: 1500, spread: 0.012, pellets: 1, color: '#9d7aff', pierce: 2, cost: 800, lvl: 3, desc: 'Punches through the front rank and keeps going.' },
  { id: 'minigun', name: 'WIDOWMAKER',    cls: 'minigun',  dmg: 7.5, rate: 21,   speed: 1150, spread: 0.145, pellets: 1, color: '#d18cff', cost: 1300, lvl: 4, desc: 'A wall of lead. Accuracy sold separately.' },
  { id: 'plasma',  name: 'ION TEMPEST',   cls: 'energy',   dmg: 34,  rate: 5.6,  speed: 1380, spread: 0.02,  pellets: 1, color: '#e0d0ff', pierce: 1, cost: 1600, lvl: 5, desc: 'Superheated bolts that burn straight through armour plate.' },
  { id: 'rocket',  name: 'ANNIHILATOR',   cls: 'launcher', dmg: 55,  rate: 1.35, speed: 640,  spread: 0.02,  pellets: 1, color: '#b44dff', splash: 95, cost: 2000, lvl: 6, desc: 'Splash damage. Mind the eyebrows.' }
];
const WBY = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const WEAPON_RANK_MAX = 5;

// ------------------------------------------------------------
//  The roster is dinosaurs now — one entry per species, each with
//  its own model (kind), stats and attack behaviour.
// ------------------------------------------------------------
const ENEMIES = {
  raptor:   { name: 'VELOCIRAPTOR',      kind: 'raptor',    hp: 42,   speed: 168, r: 22, dmg: 8,  color: '#8a9455', crest: 0x9a5a2c, eye: 0xd9b8ff, xp: 10,  gems: 2,  raptor: true },
  dilo:     { name: 'DILOPHOSAURUS',     kind: 'dilo',      hp: 85,   speed: 116, r: 26, dmg: 15, color: '#5d7a48', crest: 0x8a3fd0, eye: 0xe8dcff, xp: 20,  gems: 3,  ranged: true, acid: true },
  anky:     { name: 'ANKYLOSAURUS',      kind: 'anky',      hp: 240,  speed: 58,  r: 34, dmg: 26, color: '#8a7a58', crest: 0xb8a888, eye: 0xd9b8ff, xp: 34,  gems: 5,  slam: true, noShot: true },
  spino:    { name: 'SPINOSAURUS',       kind: 'spino',     hp: 320,  speed: 96,  r: 40, dmg: 30, color: '#6a6252', crest: 0x7a3fb0, eye: 0xd9b8ff, xp: 48,  gems: 7,  raptor: true },
  trex:     { name: 'T-REX',             kind: 'trex',      hp: 1500, speed: 66,  r: 64, dmg: 48, color: '#7a5544', crest: 0x3a241c, eye: 0xb44dff, xp: 220, gems: 20, boss: true, slam: true, noShot: true, elite: true },
  nightmare:{ name: 'NIGHTMARE RAPTOR',  kind: 'nightmare', hp: 150,  speed: 200, r: 24, dmg: 18, color: '#4e3a6a', crest: 0xc04dff, eye: 0xff8ae0, xp: 26,  gems: 3,  raptor: true },
  nmElite:  { name: 'NIGHTMARE ALPHA',   kind: 'nightmare', hp: 340,  speed: 188, r: 29, dmg: 26, color: '#6a4a8a', crest: 0xc04dff, eye: 0xe0b8ff, xp: 55,  gems: 6,  raptor: true, elite: true },
  alpha:    { name: 'ALPHA VELOCIRAPTOR',kind: 'raptor',    hp: 5200, speed: 104, r: 50, dmg: 34, color: '#9aa06a', crest: 0xb44dff, eye: 0xffffff, xp: 900, gems: 55, boss: true, alpha: true, raptor: true }
};
const ENEMY_TYPES = Object.keys(ENEMIES);

const ARMOR = [
  { cost: 0,    hp: 100, name: 'FIELD FATIGUES' },
  { cost: 400,  hp: 140, name: 'FLAK VEST' },
  { cost: 850,  hp: 190, name: 'RIOT PLATING' },
  { cost: 1500, hp: 250, name: 'TITAN SHELL' },
  { cost: 2600, hp: 330, name: 'BROTHERHOOD EXO' }
];
const AIRSTRIKE_COST = 150;
const MEDKIT_COST = 110;
// War chest handed out at the start of a fresh run, and the top-up given to
// saves that were funded with the old 300-coin purse.
const START_COINS = 1000000;

const CHARACTERS = [
  { id: 'francis', name: 'FRANCIS', tag: 'ALL-ROUND', hp: 100, speed: 272, dmg: 1,    rate: 1,    r: 16,
    color: '#4ea8ff', dark: '#1b4f80', skin: '#f0d9b5',
    ability: { id: 'overdrive', name: 'OVERDRIVE', cd: 20, dur: 6, desc: '+70% fire rate and +25% speed for 6s.' },
    blurb: 'The original bro. No weaknesses, no excuses, no plan.' },
  { id: 'percy',   name: 'PERCY',   tag: 'TANK',      hp: 150, speed: 232, dmg: 0.9,  rate: 0.95, r: 19,
    color: '#ff9f43', dark: '#8a4a12', skin: '#e8c79a',
    ability: { id: 'bulwark', name: 'BULWARK', cd: 22, dur: 6, desc: 'Takes 70% less damage for 6s and blasts everything back.' },
    blurb: 'Slow, wide and impossible to knock over. Soaks the wave so you can shoot it.' },
  { id: 'jet',     name: 'JET',     tag: 'SCOUT',     hp: 80,  speed: 336, dmg: 0.85, rate: 1.3,  r: 14,
    color: '#5affa0', dark: '#12663f', skin: '#c9b193',
    ability: { id: 'blink', name: 'PHASE DASH', cd: 9, dur: 0.4, desc: 'Blinks forward untouchable, shredding anything on the line.' },
    blurb: 'Fastest legs in the brotherhood and a trigger finger to match.' },
  { id: 'dozer',   name: 'DOZER',   tag: 'HEAVY',     hp: 115, speed: 254, dmg: 1.4,  rate: 0.78, r: 18,
    color: '#ff5d6c', dark: '#7a1b28', skin: '#d9a06f',
    ability: { id: 'quake', name: 'GROUND QUAKE', cd: 18, dur: 0.5, desc: 'Seismic slam that stuns and shreds everything nearby.' },
    blurb: 'Every shot hits like a truck. Every trigger pull is a small commitment.' }
];
const CBY = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
const CHAR_RANK_MAX = 4;

// ------------------------------------------------------------
//  Weapon ranks, bro ranks, achievements
// ------------------------------------------------------------
function gunLevel(id) { return clamp((G.gunLvl && G.gunLvl[id]) | 0, 0, WEAPON_RANK_MAX); }

function gunStats(id) {
  const base = WBY[id] || WBY.pistol;
  const lv = gunLevel(base.id);
  return Object.assign({}, base, {
    dmg: base.dmg * (1 + lv * 0.16),
    rate: base.rate * (1 + lv * 0.04),
    spread: base.spread * Math.pow(0.94, lv),
    rank: lv
  });
}

function gunUpgradeCost(w) {
  return Math.round(((w.cost || 320) * 0.26 + 160) * (1 + gunLevel(w.id) * 0.55));
}

function charRank(id) { return clamp((G.charLvl && G.charLvl[id]) | 0, 0, CHAR_RANK_MAX); }
function charUpCost(c) { return Math.round(340 * Math.pow(1.75, charRank(c.id)) * (1 + CHARACTERS.indexOf(c) * 0.1)); }
function charStatMul(id) { return 1 + charRank(id) * 0.05; }

const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'FIRST BLOOD',   desc: 'Splatter your first alien.',              reward: 50,   test: () => G.totalKills >= 1 },
  { id: 'wave5',       name: 'HOLDING ON',    desc: 'Clear wave 5.',                           reward: 100,  test: () => G.bestWave >= 5 },
  { id: 'wave10',      name: 'BATTLE HARDENED', desc: 'Clear wave 10.',                        reward: 250,  test: () => G.bestWave >= 10 },
  { id: 'wave25',      name: 'SECTOR VETERAN', desc: 'Clear wave 25.',                         reward: 800,  test: () => G.bestWave >= 25 },
  { id: 'wave50',      name: 'SECTOR SAVED',  desc: 'Clear all 50 waves of the campaign.',     reward: 2500, test: () => G.bestWave >= 50 },
  { id: 'alpha',       name: 'APEX PREDATOR', desc: 'Put down the Alpha Velociraptor.',        reward: 1000, test: () => (G.alphaKills || 0) >= 1 },
  { id: 'boss1',       name: 'WARLORD DOWN',  desc: 'Kill your first T.O.O.L. boss.',          reward: 150,  test: () => G.bossKills >= 1 },
  { id: 'boss5',       name: 'XENO HUNTER',   desc: 'Kill 5 bosses.',                          reward: 300,  test: () => G.bossKills >= 5 },
  { id: 'gunsmith',    name: 'GUNSMITH',      desc: 'Own 4 different weapons.',                reward: 200,  test: () => G.owned.size >= 4 },
  { id: 'arsenal',     name: 'FULL ARSENAL',  desc: 'Own every weapon in the armoury.',        reward: 900,  test: () => G.owned.size >= WEAPONS.length },
  { id: 'maxgun',      name: 'TUNED TO KILL', desc: 'Fully upgrade any weapon.',               reward: 400,  test: () => Object.keys(G.gunLvl).some(k => G.gunLvl[k] >= WEAPON_RANK_MAX) },
  { id: 'armored',     name: 'WALKING TANK',  desc: 'Buy the Brotherhood Exo armour.',         reward: 600,  test: () => G.armorTier >= ARMOR.length - 1 },
  { id: 'bro',         name: 'BROTHERHOOD',   desc: 'Upgrade any bro.',                        reward: 150,  test: () => Object.keys(G.charLvl).some(k => G.charLvl[k] > 0) },
  { id: 'maxbro',      name: 'BRO FOR LIFE',  desc: 'Max out a bro.',                          reward: 600,  test: () => Object.keys(G.charLvl).some(k => G.charLvl[k] >= CHAR_RANK_MAX) },
  { id: 'rich',        name: 'WAR PROFITEER', desc: 'Bank 5,000 coins.',                       reward: 250,  test: () => G.coins >= 5000 },
  { id: 'butcher',     name: 'EXTERMINATOR',  desc: 'Reach 1,000 lifetime kills.',             reward: 500,  test: () => G.totalKills >= 1000 },
  { id: 'flawless',    name: 'UNTOUCHABLE',   desc: 'Clear a wave without taking a hit.',      reward: 150,  test: () => G.perfectWaves >= 1 },
  { id: 'veteran',     name: 'SEASONED',      desc: 'Reach level 20.',                         reward: 300,  test: () => G.level >= 20 }
];
const ABY = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

function checkAchievements() {
  if (!G.ach) G.ach = new Set();
  for (const a of ACHIEVEMENTS) {
    if (G.ach.has(a.id) || !a.test()) continue;
    G.ach.add(a.id);
    G.coins += a.reward;
    G.toast = { text: 'ACHIEVEMENT — ' + a.name, sub: a.desc + '  +' + a.reward + ' ◈', t: 3.6, color: '#ffd75e' };
    Sound.level();
    saveProgress();
  }
}

function weaponArt(id, color) {
  const c = color || '#ffd75e';
  const gid = 'wg_' + id.replace(/[^a-z0-9]/gi, '');
  const defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    '<stop offset="0" stop-color="#f4f9ff"/><stop offset=".4" stop-color="#aabfd8"/>' +
    '<stop offset=".66" stop-color="#5c6f89"/><stop offset="1" stop-color="#232c3a"/></linearGradient></defs>';
  const M = 'url(#' + gid + ')';
  const dark = '#1a232f';
  const shapes = {
    pistol: `<rect x="34" y="21" width="56" height="13" rx="2.5" fill="${M}"/><rect x="88" y="24" width="18" height="7" rx="1.5" fill="${dark}"/><path d="M48 34h18l-5 22H43z" fill="${M}"/><path d="M56 39h10l-2 6H54z" fill="${dark}"/><rect x="60" y="34" width="12" height="3" fill="${c}" opacity=".85"/>`,
    smg: `<rect x="26" y="24" width="58" height="15" rx="3" fill="${M}"/><rect x="84" y="27" width="24" height="7" rx="2" fill="${dark}"/><rect x="48" y="38" width="12" height="19" rx="2" fill="${dark}"/><rect x="30" y="30" width="8" height="14" rx="2" fill="${M}"/><path d="M26 28h-12v5h12z" fill="${dark}"/><rect x="62" y="28" width="14" height="3" fill="${c}"/>`,
    rifle: `<path d="M14 28h18v14H14z" fill="${M}"/><rect x="32" y="25" width="54" height="13" rx="2" fill="${M}"/><rect x="86" y="27" width="40" height="5" rx="1" fill="${dark}"/><rect x="112" y="25" width="9" height="9" rx="1" fill="${M}"/><path d="M56 38h12l-3 18h-9z" fill="${dark}"/><rect x="50" y="15" width="26" height="8" rx="2" fill="${dark}"/><rect x="66" y="30" width="20" height="3" fill="${c}"/>`,
    shotgun: `<path d="M16 28h20v14H16z" fill="${M}"/><rect x="36" y="25" width="40" height="13" rx="2" fill="${M}"/><rect x="74" y="25" width="50" height="6" rx="2" fill="${M}"/><rect x="74" y="33" width="50" height="6" rx="2" fill="${dark}"/><rect x="80" y="40" width="24" height="8" rx="3" fill="${M}"/><path d="M44 38h10l-3 16h-7z" fill="${dark}"/><rect x="98" y="22" width="6" height="4" fill="${c}"/>`,
    minigun: `<circle cx="44" cy="33" r="16" fill="${M}"/><circle cx="44" cy="33" r="7" fill="${dark}"/><rect x="58" y="22" width="58" height="5" rx="2" fill="${dark}"/><rect x="58" y="30" width="58" height="5" rx="2" fill="${dark}"/><rect x="58" y="38" width="58" height="5" rx="2" fill="${dark}"/><rect x="112" y="20" width="7" height="26" rx="3" fill="${M}"/><path d="M30 46h12v16H30z" fill="${dark}"/><path d="M22 44h8v6h-8z" fill="${c}"/>`,
    laser: `<path d="M18 26h60l16 7-16 7H18z" fill="${M}"/><rect x="78" y="29" width="40" height="7" rx="3" fill="${dark}"/><rect x="82" y="31" width="30" height="3" rx="1.5" fill="${c}"/><path d="M40 40h14l-4 18H36z" fill="${dark}"/><rect x="24" y="20" width="30" height="5" rx="2" fill="${c}" opacity=".6"/><circle cx="30" cy="34" r="7" fill="${c}" opacity=".55"/>`,
    plasma: `<path d="M20 24h58l20 9-20 9H20z" fill="${M}"/><circle cx="34" cy="33" r="12" fill="${dark}"/><circle cx="34" cy="33" r="7" fill="${c}" opacity=".9"/><circle cx="34" cy="33" r="3" fill="#fff"/><rect x="80" y="28" width="36" height="10" rx="5" fill="${dark}"/><circle cx="94" cy="33" r="4" fill="${c}"/><circle cx="106" cy="33" r="4" fill="${c}"/><path d="M44 42h14l-3 17h-9z" fill="${dark}"/>`,
    rocket: `<rect x="20" y="25" width="82" height="17" rx="8" fill="${M}"/><path d="M100 25l24 8-24 9z" fill="${c}"/><path d="M100 25l24 8-24 9z" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="30" y="30" width="20" height="7" rx="3" fill="${dark}"/><path d="M52 42h13l-3 17h-9z" fill="${dark}"/><rect x="70" y="18" width="18" height="7" rx="2" fill="${dark}"/><rect x="14" y="29" width="8" height="9" fill="${dark}"/>`
  };
  return `<svg class="gunart" viewBox="0 0 140 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${defs}${shapes[id] || shapes.pistol}</svg>`;
}

const Sound = (() => {
  let ac = null, master = null, muted = false, lastShot = 0, lastHit = 0;
  function ctxOn() {
    if (!ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.22;
        master.connect(ac.destination);
      } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, to) {
    if (muted) return;
    const a = ctxOn(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(24, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.22 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, cutoff) {
    if (muted) return;
    const a = ctxOn(); if (!a) return;
    const t = a.currentTime;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
    const g = a.createGain(); g.gain.value = vol == null ? 0.28 : vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  return {
    warm() { ctxOn(); },
    shoot(id, ai) {
      const now = performance.now();
      if (now - lastShot < 28) return;
      lastShot = now;
      const v = ai ? 0.09 : 0.17;
      if (id === 'shotgun') { noise(0.16, v * 1.5, 1600); tone(180, 0.1, 'square', v, 60); }
      else if (id === 'laser') tone(1300, 0.09, 'sawtooth', v * 0.7, 420);
      else if (id === 'rocket') { noise(0.22, v * 1.3, 900); tone(120, 0.18, 'square', v * 0.7, 50); }
      else if (id === 'minigun') tone(240, 0.045, 'square', v * 0.7, 120);
      else if (id === 'smg') tone(360, 0.05, 'square', v * 0.8, 150);
      else tone(520, 0.06, 'triangle', v, 170);
    },
    hit() {
      const now = performance.now();
      if (now - lastHit < 34) return;
      lastHit = now;
      tone(200, 0.045, 'square', 0.075, 110);
    },
    kill() { tone(300, 0.13, 'sawtooth', 0.13, 70); },
    boom() { noise(0.42, 0.32, 700); tone(90, 0.35, 'sine', 0.36, 30); },
    gem() { tone(880, 0.07, 'sine', 0.1, 1500); },
    hurt() { tone(150, 0.18, 'sawtooth', 0.2, 55); },
    level() { tone(660, 0.1, 'sine', 0.18, 990); setTimeout(() => tone(990, 0.16, 'sine', 0.18, 1320), 90); },
    ui() { tone(560, 0.05, 'sine', 0.12, 760); },
    toggle() { muted = !muted; if (!muted) { tone(700, 0.06, 'sine', 0.12, 900); } return muted; },
    get muted() { return muted; }
  };
})();

// ------------------------------------------------------------
//  State
// ------------------------------------------------------------
const G = {
  state: 'menu',
  wave: 0, coins: START_COINS, xp: 0, level: 1, xpNext: 100, kills: 0,
  waveLen: 0, waveT: 0, waveTotal: 0, waveInterval: 0, waveMode: null, lastWaveBonus: null,
  alphaTrophy: false, alphaKills: 0,
  enemies: [], bullets: [], gems: [], parts: [], rings: [], floats: [], corpses: [], booms: [], decals: [],
  player: null, bro: null,
  shake: 0, flash: 0, time: 0,
  spawnQueue: [], spawnTimer: 0,
  cleared: false, clearTimer: 0, damageTaken: false,
  airstrikes: 1, medkits: 1,
  owned: new Set(['pistol']),
  slots: ['pistol', 'pistol'], slot: 0,
  gunLvl: {}, charLvl: {},
  charId: 'francis', partnerId: 'percy', coop: false, mapId: 'wasteland', mapBag: [],
  armorTier: 0, banner: null, bestWave: 0,
  ach: new Set(), toast: null, totalKills: 0, bossKills: 0, perfectWaves: 0,
  shopFromMenu: false, campaign: 50
};

// ------------------------------------------------------------
//  Saved progress (per browser, survives reloads)
// ------------------------------------------------------------
const SAVE_KEY = 'gunbros3d.save.v1';
const SAVE_VERSION = 2;
// Stamped into the menu and the diagnostics panel so a phone can prove
// which build it is actually running.
const BUILD = 'v18 · OUTLANDS';

// the Alpha trophy hands out one extra strike + medkit slot for good
function kitMax() { return G.alphaTrophy ? 4 : 3; }

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    // v1 saves (before armory/achievements) load as-is and are upgraded on next save
    if (!d || (d.v !== 1 && d.v !== SAVE_VERSION)) return false;
    if (typeof d.coins === 'number') G.coins = Math.max(0, Math.floor(d.coins));
    // Existing saves top up to the war chest once; after that they spend normally.
    if (!d.cashGrant) G.coins = Math.max(G.coins, START_COINS);
    if (typeof d.level === 'number') G.level = Math.max(1, Math.floor(d.level));
    if (typeof d.xp === 'number') G.xp = Math.max(0, d.xp);
    if (typeof d.xpNext === 'number' && d.xpNext > 0) G.xpNext = Math.round(d.xpNext);
    if (Array.isArray(d.owned)) {
      const owned = d.owned.filter(id => WBY[id]);
      G.owned = new Set(owned.length ? owned : ['pistol']);
      G.owned.add('pistol');
    }
    if (Array.isArray(d.slots) && d.slots.length === 2) {
      G.slots = d.slots.map(id => (WBY[id] && G.owned.has(id) ? id : 'pistol'));
    }
    G.slot = d.slot === 1 ? 1 : 0;
    if (typeof d.armorTier === 'number') G.armorTier = clamp(Math.floor(d.armorTier), 0, ARMOR.length - 1);
    G.alphaTrophy = !!d.alphaTrophy;
    if (typeof d.alphaKills === 'number') G.alphaKills = Math.max(0, Math.floor(d.alphaKills));
    if (typeof d.airstrikes === 'number') G.airstrikes = clamp(Math.floor(d.airstrikes), 0, kitMax());
    if (typeof d.medkits === 'number') G.medkits = clamp(Math.floor(d.medkits), 0, kitMax());
    if (typeof d.bestWave === 'number') G.bestWave = Math.max(0, Math.floor(d.bestWave));
    if (CBY[d.charId]) {
      G.charId = d.charId;
      const ci = CHARACTERS.findIndex(c => c.id === d.charId);
      G.partnerId = CHARACTERS[(ci + 1) % CHARACTERS.length].id;
    }
    if (MBY[d.mapId]) G.mapId = d.mapId;
    if (Array.isArray(d.mapBag)) G.mapBag = d.mapBag.filter(id => MBY[id]);
    G.coop = !!d.coop;
    if (d.gunLvl && typeof d.gunLvl === 'object') {
      G.gunLvl = {};
      for (const k of Object.keys(d.gunLvl)) {
        if (WBY[k]) G.gunLvl[k] = clamp(Math.floor(d.gunLvl[k]) || 0, 0, WEAPON_RANK_MAX);
      }
    }
    if (d.charLvl && typeof d.charLvl === 'object') {
      G.charLvl = {};
      for (const k of Object.keys(d.charLvl)) {
        if (CBY[k]) G.charLvl[k] = clamp(Math.floor(d.charLvl[k]) || 0, 0, CHAR_RANK_MAX);
      }
    }
    if (Array.isArray(d.ach)) G.ach = new Set(d.ach.filter(id => ABY[id]));
    if (typeof d.totalKills === 'number') G.totalKills = Math.max(0, Math.floor(d.totalKills));
    if (typeof d.bossKills === 'number') G.bossKills = Math.max(0, Math.floor(d.bossKills));
    if (typeof d.perfectWaves === 'number') G.perfectWaves = Math.max(0, Math.floor(d.perfectWaves));
    return true;
  } catch (e) { return false; }
}

function saveProgress() {
  try {
    const best = Math.max(G.bestWave || 0, G.wave || 0);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: SAVE_VERSION,
      coins: G.coins,
      cashGrant: 1,
      xp: G.xp,
      level: G.level,
      xpNext: G.xpNext,
      owned: [...G.owned],
      slots: G.slots.slice(),
      slot: G.slot,
      armorTier: G.armorTier,
      airstrikes: G.airstrikes,
      medkits: G.medkits,
      bestWave: best,
      charId: G.charId,
      mapId: G.mapId,
      mapBag: Array.isArray(G.mapBag) ? G.mapBag : [],
      coop: G.coop,
      gunLvl: G.gunLvl || {},
      charLvl: G.charLvl || {},
      ach: [...(G.ach || [])],
      totalKills: G.totalKills || 0,
      bossKills: G.bossKills || 0,
      perfectWaves: G.perfectWaves || 0,
      alphaTrophy: !!G.alphaTrophy,
      alphaKills: G.alphaKills || 0
    }));
    G.bestWave = best;
  } catch (e) {}
}

window.addEventListener('pagehide', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
let saveTimer = 0;

const keys = Object.create(null);
const pointer = { x: 0, y: 0, down: false, inside: false };
const sticks = { move: null, aim: null };
let hudHits = [];

// ------------------------------------------------------------
//  Renderer / scene
// ------------------------------------------------------------
const MOBILE_GPU = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ------------------------------------------------------------
//  Graphics quality (LOW / MEDIUM / HIGH)
//  Stored on its own key so it applies before the GPU is touched.
// ------------------------------------------------------------
const GFX_KEY = 'gunbros3d.gfx.v1';
const GFX_PRESETS = {
  low:    { dpr: 1.0, mobileDpr: 1.0,  shadows: false, env: false, smoke: 90,  enemies: 0.72, weather: 0.45, shadowMap: 512,  budget: 1100000, lod: 620,  aiLod: 2, shadowHz: 1 },
  medium: { dpr: 2.0, mobileDpr: 1.5,  shadows: false, env: true,  smoke: 150, enemies: 0.9,  weather: 0.75, shadowMap: 1024, budget: 1900000, lod: 900,  aiLod: 2, shadowHz: 1 },
  high:   { dpr: 2.6, mobileDpr: 1.75, shadows: true,  env: true,  smoke: 260, enemies: 1,    weather: 1,    shadowMap: 2048, budget: 3000000, lod: 1250, aiLod: 3, shadowHz: 2 }
};
const GFX_DESC = {
  low: 'Fastest. Softer resolution, no shadows or reflections, smaller herds.',
  medium: 'Balanced. Full models and lighting, no shadow maps.',
  high: 'Sharpest. Shadows, reflections, full particle and herd counts.'
};
function autoQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (MOBILE_GPU) {
    if (mem <= 4 || cores <= 4) return 'low';
    if (mem >= 8 && cores >= 8) return 'high';   // flagship phones: sharp, full detail
    return 'medium';
  }
  return 'high';
}
let QUALITY = (() => {
  try {
    const q = localStorage.getItem(GFX_KEY);
    if (q && GFX_PRESETS[q]) return q;
  } catch (e) {}
  return autoQuality();
})();
let Q = GFX_PRESETS[QUALITY];

// Runtime performance guard. The tiers below are where the game STARTS; if
// frames still come up short on this device the guard walks it down further
// (resolution first, then shadows, then effect counts) instead of leaving the
// player to grind through a stuttering wave.
let FX_SCALE = 1;      // multiplier on particle / smoke spawn counts
let LOD_MUL = 1;       // multiplier on the distance where detail drops
let GEAR = 0;          // 0 = full, 1 = shadows off, 2 = light effects
let LOD_ANIM2 = 0, LOD_AI_MID2 = 0, LOD_AI_FAR2 = 0;
function refreshLodDistance() {
  const base = Q.lod * LOD_MUL;
  LOD_ANIM2 = Math.pow(base * 1.5, 2);   // full skeletal animation radius
  LOD_AI_MID2 = Math.pow(base * 1.9, 2); // steering every 2nd frame
  LOD_AI_FAR2 = Math.pow(base * 2.6, 2); // steering every 3rd frame
}
refreshLodDistance();

// Never exceed a sane number of shaded pixels: phones with 3x panels and
// tablets with 2x panels were asking the GPU for multi-megapixel frames.
// Phones report a small CSS viewport (≈400×900) on top of a 3× panel. Capping
// the render at 1.35× made the whole 3D view upscale and look soft on
// flagship screens, so the budget follows the quality tier instead.
const PIXEL_BUDGET = MOBILE_GPU ? Q.budget : Math.round(Q.budget * 1.6);
// Phones: even a "high" tier renders at 1.75x instead of 2.6x. A 3x phone panel
// was asking the GPU for 6+ megapixels of deferred-lit pixels per frame, which
// is what actually dropped Android framerates during big waves.
const DPR_CAP = Math.min(window.devicePixelRatio || 1, MOBILE_GPU ? Q.mobileDpr : Q.dpr);
function budgetDPR(w, h) {
  const fit = Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h));
  return Math.max(0.8, Math.min(DPR_CAP, fit));
}
let MAXDPR = budgetDPR(window.innerWidth || 1024, window.innerHeight || 768);

// A blank white page is worse than a clear message: if 3D cannot start at
// all (WebGL blocked, driver blacklisted, out of memory) say so on screen.
function fatalScreen(title, detail) {
  try {
    const o = document.getElementById('overlay');
    const p = document.getElementById('panel');
    document.body.style.background = '#0a0705';
    if (!o || !p) return;
    p.innerHTML = `<h1>${title}</h1><p class="sub">${detail}</p>`;
    o.classList.add('show');
  } catch (e) {}
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: QUALITY !== 'low', alpha: false, stencil: false,
    powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false
  });
} catch (err) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'default' });
  } catch (err2) {
    fatalScreen('3D graphics could not start', 'This device reported no usable WebGL context. Try Chrome, turn off battery saver, or enable hardware acceleration.');
    throw err2;
  }
}

// Capability probe: image-based reflections need a float render target.
// On GPUs without one, PMREM output can come back invalid and every
// lit surface renders flat white — so we simply skip reflections there.
const GL = renderer.getContext();
let HALF_FLOAT_RT = false;
try {
  HALF_FLOAT_RT = renderer.capabilities.isWebGL2
    ? !!(GL.getExtension('EXT_color_buffer_float') || GL.getExtension('EXT_color_buffer_half_float'))
    : !!(GL.getExtension('OES_texture_half_float') && GL.getExtension('WEBGL_color_buffer_float'));
} catch (e) { HALF_FLOAT_RT = false; }
const CAN_ENV = (QUALITY !== 'low') && HALF_FLOAT_RT;
let gpuName = 'unknown';
try {
  const dbg = GL.getExtension('WEBGL_debug_renderer_info');
  if (dbg) gpuName = String(GL.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'unknown');
} catch (e) {}

// ------------------------------------------------------------
//  Crash / blank-screen recorder
//  Keeps the last dozen events on the device, so a white screen
//  leaves evidence even after the auto-reload wipes the page.
// ------------------------------------------------------------
const DIAG_KEY = 'gunbros3d.diag.v1';
function readDiagLog() {
  try { const v = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function recordDiag(kind, extra) {
  try {
    const log = readDiagLog();
    log.push(Object.assign({
      t: new Date().toISOString().slice(11, 19), kind, build: BUILD, gpu: gpuName,
      q: QUALITY, dpr: +renderer.getPixelRatio().toFixed(2),
      canvas: canvas.width + 'x' + canvas.height
    }, extra || {}));
    while (log.length > 20) log.shift();
    localStorage.setItem(DIAG_KEY, JSON.stringify(log));
  } catch (e) {}
}
DPR = MAXDPR;
renderer.setPixelRatio(MAXDPR);
// Flagships now get real shadow maps too, at a size they can afford.
renderer.shadowMap.enabled = Q.shadows && (MOBILE_GPU ? window.innerWidth >= 380 : window.innerWidth >= 620);
const SHADOW_SIZE = MOBILE_GPU ? Math.min(1024, Q.shadowMap) : Q.shadowMap;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The sun never moves, so the shadow map does not need rebuilding 60 times a
// second. It is refreshed every 1-2 frames from frame(); on a phone that is a
// whole extra geometry pass saved on half the frames.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Android throws the WebGL context away under memory pressure. Without this
// the canvas stays blank (white page) until the user reloads by hand.
let contextLost = false;
let contextLossCount = 0;
let blankFrames = 0;
canvas.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  contextLost = true;
  contextLossCount++;
  recordDiag('context-lost');
  fatalScreen('Restoring 3D graphics', 'The GPU reset — reloading the arena. Your coins, level and weapons are saved.');
  setTimeout(() => {
    try { saveProgress(); } catch (e) {}
    location.reload();
  }, 1000);
}, false);
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; }, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0705);
scene.fog = new THREE.Fog(0x2b160b, 1100, 2700);

// A tiny baked sky probe. Cheap (one cube render at boot) but it gives
// every metal surface actual reflections instead of flat grey.
scene.environment = CAN_ENV ? (() => {
  const envScene = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#9dbcd8');
  grad.addColorStop(0.45, '#6a8298');
  grad.addColorStop(0.62, '#585048');
  grad.addColorStop(1, '#151210');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 20, 14), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide }));
  envScene.add(dome);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
  sun.position.set(-52, 58, 24);
  sun.lookAt(0, 0, 0);
  envScene.add(sun);
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0.04);
    pm.dispose();
    return rt.texture;
  } catch (e) {
    // reflections are optional: a failure here must never kill the boot
    return null;
  }
})() : null;

const camera = new THREE.PerspectiveCamera(56, 1, 5, 7000);
const camState = { pos: new THREE.Vector3(0, 900, 900), look: new THREE.Vector3(0, 0, 0) };

const hemi = new THREE.HemisphereLight(0xffd9b0, 0x140a06, 0.98);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffe6c4, 3.3);
key.position.set(-420, 900, 380);
key.castShadow = renderer.shadowMap.enabled;
key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
key.shadow.camera.near = 200;
key.shadow.camera.far = 2400;
const SHADOW_SPAN = MOBILE_GPU ? 620 : 780;
key.shadow.camera.left = -SHADOW_SPAN;
key.shadow.camera.right = SHADOW_SPAN;
key.shadow.camera.top = SHADOW_SPAN;
key.shadow.camera.bottom = -SHADOW_SPAN;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.08;
scene.add(key);
scene.add(key.target);

const rim = new THREE.DirectionalLight(0xff6a2a, 0.7);
rim.position.set(500, 420, -700);
scene.add(rim);

// Explosion light pool.
// three.js rebuilds the shader program of EVERY lit material when the number
// of lights in the scene changes. Creating a PointLight per explosion and
// deleting it 0.55s later meant a full shader recompile several times a
// second on a busy wave — the single worst stall on Android. These three
// lights live in the scene for good at zero intensity and are borrowed.
const BOOM_LIGHTS = [];
for (let i = 0; i < 3; i++) {
  const l = new THREE.PointLight(0xffa14a, 0, 320, 2);
  l.position.set(0, 100, 0);
  scene.add(l);
  BOOM_LIGHTS.push({ light: l, busy: false });
}
function takeBoomLight() {
  for (let i = 0; i < BOOM_LIGHTS.length; i++) if (!BOOM_LIGHTS[i].busy) return BOOM_LIGHTS[i];
  return null;
}

// --- ground ---
// ------------------------------------------------------------
//  Battlefield themes
// ------------------------------------------------------------
const MAPS = [
  {
    id: 'base', name: 'FORWARD BASE', propTag: 'MILITARY BASE', env: 'base',
    blurb: 'A fortified forward operating base. Hangars, armour and a very unfriendly welcome party.',
    ground: { base: '#403a2f', light: '124,110,86', dark: '26,22,16', crack: '74,62,44', pebble: '164,148,118', speck: '18,15,11' },
    sky: ['#080d14', '#182433', '#35516b', '#93aec2', '#24313d'],
    fog: 0x24313d, fogNear: 1200, fogFar: 3000,
    hemiSky: 0xdce8ff, hemiGround: 0x232520,
    key: 0xfff1d6, rim: 0x7fb0ff,
    rock: 0x5a5b52, wall: 0x56574e, wallEmissive: 0x0d1114,
    glow: 0xffc46a, glowOpacity: 0.07, dust: 0xd6d2c4, prop: 'base',
    roads: { type: 'asphalt', width: 230, cross: true },
    weather: { color: '#e2e6ea', speed: 26, size: 3, count: 130, drift: 34 }
  },
  {
    id: 'ruins', name: 'RUINED DISTRICT', propTag: 'URBAN WARZONE', env: 'urban',
    blurb: 'A gutted city block. Concrete, rebar and very bad company on every corner.',
    ground: { base: '#26282d', light: '112,118,130', dark: '12,13,16', crack: '70,62,54', pebble: '150,156,170', speck: '8,8,10' },
    sky: ['#0a0e16', '#182130', '#33455c', '#7b93a8', '#1c242f'],
    fog: 0x1c242f, fogNear: 1100, fogFar: 2900,
    hemiSky: 0xc8d8ee, hemiGround: 0x0e1014,
    key: 0xe8f0ff, rim: 0x6a94ff,
    rock: 0x4e5058, wall: 0x4a4c53, wallEmissive: 0x0e141c,
    glow: 0x6ad4ff, glowOpacity: 0.10, dust: 0xc6d4e4, prop: 'urban',
    roads: { type: 'asphalt', width: 230, cross: true, sidewalk: true },
    weather: { color: '#aebfd4', speed: 120, size: 4, count: 210, drift: 30 }
  },
  {
    id: 'factory', name: 'IRONWORKS', propTag: 'INDUSTRIAL COMPLEX', env: 'factory',
    blurb: 'Smokestacks, storage tanks and a foundry that stopped caring about safety years ago.',
    ground: { base: '#3a352f', light: '128,116,100', dark: '22,19,16', crack: '58,46,36', pebble: '172,158,136', speck: '14,12,10' },
    sky: ['#0d0907', '#241812', '#4a2c1c', '#9c6038', '#2a1a12'],
    fog: 0x2a1a12, fogNear: 1050, fogFar: 2800,
    hemiSky: 0xf0c9a0, hemiGround: 0x1a120c,
    key: 0xffcf9e, rim: 0xff7a3a,
    rock: 0x4a4038, wall: 0x453c34, wallEmissive: 0x1a0e06,
    glow: 0xff9a3a, glowOpacity: 0.13, dust: 0xe0b88a, prop: 'factory',
    roads: { type: 'asphalt', width: 230, cross: true },
    weather: { color: '#c9a582', speed: 38, size: 4, count: 180, drift: 32 }
  },
  {
    id: 'jungle', name: 'BOKOR JUNGLE', propTag: 'JUNGLE ZONE', env: 'jungle',
    blurb: 'Wet moss, palms and spores. Something is moving in the canopy.',
    ground: { base: '#333d26', light: '100,118,70', dark: '17,22,11', crack: '24,30,16', pebble: '130,142,94', speck: '10,14,8' },
    sky: ['#08120a', '#122414', '#2a4422', '#6d8c46', '#1c2a12'],
    fog: 0x1c2a12, fogNear: 950, fogFar: 2600,
    hemiSky: 0xd8ffc0, hemiGround: 0x182410,
    key: 0xf4ffd8, rim: 0x7dff62,
    rock: 0x434f34, wall: 0x3a4330, wallEmissive: 0x10200c,
    glow: 0x9dff62, glowOpacity: 0.16, dust: 0xc6ff9a, prop: 'jungle',
    roads: { type: 'mud', width: 190, cross: false },
    weather: { color: '#b8e896', speed: 54, size: 4, count: 200, drift: 26 }
  },
  {
    id: 'outpost', name: 'DUST COMPOUND', propTag: 'DESERT COMPOUND', env: 'desert',
    blurb: 'A desert outpost half buried in sand. The walls still shoot back.',
    ground: { base: '#8a6f45', light: '214,180,124', dark: '94,68,38', crack: '120,92,54', pebble: '246,224,178', speck: '82,58,32' },
    sky: ['#2a1c0c', '#5c3c14', '#a06c24', '#e0ad5a', '#7a5326'],
    fog: 0x7a5326, fogNear: 900, fogFar: 2700,
    hemiSky: 0xffe8c0, hemiGround: 0x4a3418,
    key: 0xffeccb, rim: 0xffb055,
    rock: 0x8a6a42, wall: 0x9c8258, wallEmissive: 0x241706,
    glow: 0xffb43a, glowOpacity: 0.08, dust: 0xffd9a0, prop: 'desert',
    roads: { type: 'dirt', width: 210, cross: true },
    weather: { color: '#e8c78a', speed: 190, size: 4, count: 230, drift: 48 }
  },
  {
    id: 'wasteland', name: 'SCORCHED WASTE', propTag: 'BATTLEFIELD', env: 'wasteland',
    blurb: 'Dead rocks, burnt-out armour and old fires. Home turf.',
    ground: { base: '#443629', light: '132,106,78', dark: '26,19,13', crack: '24,14,8', pebble: '188,160,122', speck: '12,8,5' },
    sky: ['#0a0709', '#1d1210', '#4a2418', '#8a4a28', '#2b160b'],
    fog: 0x2b160b, fogNear: 1000, fogFar: 2700,
    hemiSky: 0xffd9b0, hemiGround: 0x140a06,
    key: 0xffe0bc, rim: 0xff7a3a,
    rock: 0x5a4230, wall: 0x4a3828, wallEmissive: 0x1c0c04,
    glow: 0xff5a12, glowOpacity: 0.15, dust: 0xffb27a, prop: 'wasteland',
    roads: { type: 'asphalt', width: 190, cross: false },
    weather: { color: '#d9c3a5', speed: 120, size: 4, count: 180, drift: 26 }
  },
  {
    id: 'ice', name: 'FROZEN EXPANSE', propTag: 'ARCTIC OUTPOST', env: 'ice',
    blurb: 'A dead world under a blue sun. Mind the ice.',
    ground: { base: '#c6d4e0', light: '247,252,255', dark: '132,152,170', crack: '168,188,203', pebble: '255,255,255', speck: '104,126,144' },
    sky: ['#0a1420', '#183048', '#3c6688', '#a8c8dc', '#233a4c'],
    fog: 0x233a4c, fogNear: 1000, fogFar: 2800,
    hemiSky: 0xdceeff, hemiGround: 0x1a2a36,
    key: 0xeaf6ff, rim: 0x5aa8ff,
    rock: 0x7d8f9c, wall: 0x6a7c88, wallEmissive: 0x0a2434,
    glow: 0x66ccff, glowOpacity: 0.16, dust: 0xeaf6ff, prop: 'ice',
    roads: { type: 'snow', width: 200, cross: false },
    weather: { color: '#f2fbff', speed: 74, size: 5, count: 230, drift: 20 }
  },
  {
    id: 'volcano', name: 'MOLTEN CORE', propTag: 'VOLCANIC RIG', env: 'volcano',
    blurb: 'A drilling rig on top of an active caldera. Do not stand still.',
    ground: { base: '#3a2a24', light: '132,72,48', dark: '16,9,7', crack: '120,40,16', pebble: '190,110,68', speck: '12,6,4' },
    sky: ['#0a0403', '#22070a', '#5c1410', '#b53a12', '#1d0a06'],
    fog: 0x2a0d06, fogNear: 950, fogFar: 2600,
    hemiSky: 0xffb080, hemiGround: 0x1a0503,
    key: 0xffd0a0, rim: 0xff3a1a,
    rock: 0x453229, wall: 0x40302a, wallEmissive: 0x3a1206,
    glow: 0xff4a12, glowOpacity: 0.22, dust: 0xff8a4a, prop: 'volcano',
    roads: { type: 'ash', width: 190, cross: false },
    weather: { color: '#ff8a3a', speed: -64, size: 4, count: 200, drift: 14 }
  }
];

// ------------------------------------------------------------
//  HOLOGRAPHIC DECK
//  Every map is re-skinned as a T.O.O.L. holo-deck: cold navy steel,
//  cyan emissive light and a projected grid floor. Layout, props and
//  gameplay are untouched — only the world's materials and light.
// ------------------------------------------------------------
const HOLO = {
  violet: 0xb44dff, violetSoft: 0xd9b8ff, magenta: 0xff4dd2, white: 0xf3f0ff,
  ink: 0x141416, deep: 0x0a0a0c, steel: 0x2b2e34
};
function holofyMap(t) {
  // charcoal deck, graphite steel, violet projection light
  t.ground = { base: '#25262a', light: '122,126,140', dark: '10,10,12', crack: '126,86,196', pebble: '186,186,198', speck: '6,6,8' };
  t.sky = ['#050508', '#101014', '#26262c', '#4a3a63', '#15151a'];
  t.fog = 0x18181c; t.fogNear = 1000; t.fogFar = 2900;
  t.hemiSky = 0xd6d4e2; t.hemiGround = 0x0e0e12;
  t.key = 0xf4f1ff; t.rim = 0x8a3fd0;
  t.rock = 0x3a3d44; t.wall = 0x2b2e34; t.wallEmissive = 0x3a1060;
  t.glow = 0xb44dff; t.glowOpacity = 0.13; t.dust = 0xd9d4e2;
  t.weather = { color: '#cfc8dd', speed: 44, size: 3, count: 150, drift: 24 };
  return t;
}
for (const m of MAPS) holofyMap(m);

const MBY = Object.fromEntries(MAPS.map(m => [m.id, m]));

const groundTexCache = new Map();

// Projected deck grid: one additive plane, one draw call, scrolling.
let holoGridMesh = null;
let holoGridTex = null;
function makeHoloGridTex() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(180,120,255,0.5)';
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (S / 4) * i;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.strokeStyle = 'rgba(205,170,255,0.22)';
  g.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const p = (S / 16) * i + 8;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.fillStyle = 'rgba(230,215,255,0.5)';
  for (let x = 0; x <= S; x += S / 4) {
    for (let y = 0; y <= S; y += S / 4) {
      g.beginPath(); g.arc(x % S, y % S, 3, 0, TAU); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeGroundMaps(theme) {
  if (groundTexCache.has(theme.id)) return groundTexCache.get(theme.id);

  // 768px ground maps plus their derived normal maps are ~4.5MB of VRAM and a
  // visible chunk of boot time; phones get 512px, which is still 1:1 at the
  // distance the arena camera sits. The normal map follows the source size.
  const S = (MOBILE_GPU || LOWQ) ? 512 : 768;
  const p = theme.ground;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  g.fillStyle = p.base;
  g.fillRect(0, 0, S, S);

  // broad tonal patches: damp soil, dried clay and gravel beds
  for (let i = 0; i < 72; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 40 + Math.random() * 115;
    const col = Math.random() > 0.45 ? p.light : p.dark;
    const grd = g.createRadialGradient(x, y, r * 0.12, x, y, r);
    grd.addColorStop(0, 'rgba(' + col + ',0.11)');
    grd.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, TAU);
    g.fill();
  }

  // gravel beds with real stone grain
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 12 + Math.random() * 30;
    g.fillStyle = 'rgba(' + p.light + ',' + (0.03 + Math.random() * 0.05) + ')';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.62, Math.random() * Math.PI, 0, TAU);
    g.fill();
    const stones = 6;
    for (let k = 0; k < stones; k++) {
      const a = 0.03 + Math.random() * 0.045;
      g.fillStyle = Math.random() > 0.4
        ? 'rgba(' + p.pebble + ',' + a + ')'
        : 'rgba(' + p.dark + ',' + a + ')';
      g.beginPath();
      g.arc(x + (Math.random() - 0.5) * r * 1.9, y + (Math.random() - 0.5) * r * 1.25, Math.random() * 1.5 + 0.4, 0, TAU);
      g.fill();
    }
  }

  // packed earth grain
  for (let i = 0; i < 9000; i++) {
    const a = 0.02 + Math.random() * 0.045;
    g.fillStyle = Math.random() > 0.5
      ? 'rgba(' + p.light + ',' + a + ')'
      : 'rgba(' + p.dark + ',' + a + ')';
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // weathering cracks
  g.strokeStyle = 'rgba(' + p.crack + ',0.07)';
  for (let i = 0; i < 11; i++) {
    g.lineWidth = 0.8 + Math.random() * 1.1;
    g.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 100;
      y += (Math.random() - 0.5) * 100;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // vehicle ruts worn into the surface
  g.strokeStyle = 'rgba(' + p.dark + ',0.09)';
  g.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const x0 = Math.random() * S, y0 = Math.random() * S;
    const a = Math.random() * Math.PI;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 + Math.cos(a) * 90, y0 + Math.sin(a) * 90, x0 + Math.cos(a) * 180, y0 + Math.sin(a) * 180);
    g.stroke();
  }

  if (theme.env === 'ice') {
    // snow cover mutes the gravel base before wind features go on
    g.fillStyle = 'rgba(228,239,248,0.62)';
    g.fillRect(0, 0, S, S);
    // wind-packed drift shading
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * S, y = Math.random() * S, rr = 40 + Math.random() * 90;
      const grd = g.createRadialGradient(x, y, 2, x, y, rr);
      grd.addColorStop(0, 'rgba(150,172,190,0.10)');
      grd.addColorStop(1, 'rgba(150,172,190,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    // sastrugi ridges and drift tails
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 18, y - 6, x + 34 + Math.random() * 26, y - 3);
      g.stroke();
    }
    // exposed frozen gravel and rock
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * S, y = Math.random() * S, rr = 12 + Math.random() * 30;
      g.fillStyle = i % 3 ? 'rgba(112,124,132,0.13)' : 'rgba(92,82,68,0.12)';
      g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, Math.random() * 3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(70,78,84,0.25)';
      for (let k = 0; k < 4; k++) g.fillRect(x + (Math.random() - 0.5) * rr, y + (Math.random() - 0.5) * rr * 0.6, 2, 2);
    }
    // ice glints
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 900; i++) g.fillRect(Math.random() * S, Math.random() * S, 1.2, 1.2);
  } else if (theme.env === 'jungle') {
    g.strokeStyle = 'rgba(' + p.light + ',0.13)';
    g.lineWidth = 1;
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 8, y - 4 - Math.random() * 7);
      g.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.repeat.set(WORLD.w / 460, WORLD.h / 460);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;

  // derive a bump map so light plays across the surface
  const src = g.getImageData(0, 0, S, S).data;
  const height = new Float32Array(S * S);
  for (let i = 0, q = 0; i < S * S; i++, q += 4) {
    height[i] = (src[q] * 0.299 + src[q + 1] * 0.587 + src[q + 2] * 0.114) / 255;
  }
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(S, S);
  const wrap = (x, y) => ((y + S) % S) * S + ((x + S) % S);
  const strength = 1.7;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = height[wrap(x - 1, y)], r = height[wrap(x + 1, y)];
      const u = height[wrap(x, y - 1)], d = height[wrap(x, y + 1)];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const o = (y * S + x) * 4;
      nimg.data[o] = (nx * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const nm = new THREE.CanvasTexture(nc);
  nm.wrapS = nm.wrapT = THREE.MirroredRepeatWrapping;
  nm.repeat.copy(t.repeat);
  nm.anisotropy = 8;

  const out = { map: t, normalMap: nm };
  groundTexCache.set(theme.id, out);
  return out;
}

// ------------------------------------------------------------
//  Arena construction (rebuilt per map)
// ------------------------------------------------------------
const arenaGroup = new THREE.Group();
scene.add(arenaGroup);
let currentMapId = null;
let dust = null;

function clearArena() {
  while (arenaGroup.children.length) {
    const child = arenaGroup.children.pop();
    child.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
  dust = null;
}

function edgeSpot(margin) {
  const side = randInt(0, 3);
  const m = margin || 240;
  if (side === 0) return { x: rand(-HX, HX), z: rand(-HZ, -HZ + m) };
  if (side === 1) return { x: rand(-HX, HX), z: rand(HZ - m, HZ) };
  if (side === 2) return { x: rand(-HX, -HX + m), z: rand(-HZ, HZ) };
  return { x: rand(HX - m, HX), z: rand(-HZ, HZ) };
}

// Per-map image-based lighting. A tiny baked panorama built from the map's own
// sky, sun and ground bounce means armour, glass and ice reflect the right world
// instead of one generic grey probe. One cube render per map, cached.
const envProbeCache = new Map();
function setThemeEnvironment(theme) {
  if (!CAN_ENV) { scene.environment = null; return; }
  if (envProbeCache.has(theme.id)) { scene.environment = envProbeCache.get(theme.id); return; }
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, theme.sky[0]);
  grad.addColorStop(0.34, theme.sky[1]);
  grad.addColorStop(0.56, theme.sky[2]);
  grad.addColorStop(0.70, theme.sky[3]);
  grad.addColorStop(0.80, theme.sky[3]);
  grad.addColorStop(1, '#' + new THREE.Color(theme.hemiGround).getHexString());
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(100, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
  ));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(13, 16), new THREE.MeshBasicMaterial({ color: theme.key }));
  sun.position.set(-56, 62, 30);
  sun.lookAt(0, 0, 0);
  envScene.add(sun);
  const bounce = new THREE.Mesh(
    new THREE.CircleGeometry(98, 20),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.hemiGround).multiplyScalar(2.1) })
  );
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -10;
  envScene.add(bounce);

  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0.035);
    pm.dispose();
    envProbeCache.set(theme.id, rt.texture);
    scene.environment = rt.texture;
  } catch (e) {
    scene.environment = null;
  }
  tex.dispose();
}

function buildArena(theme) {
  clearArena();
  currentMapId = theme.id;

  scene.fog = new THREE.Fog(theme.fog, theme.fogNear || 1100, theme.fogFar || 2800);
  scene.background = new THREE.Color(theme.fog);
  hemi.color.setHex(theme.hemiSky);
  hemi.groundColor.setHex(theme.hemiGround);
  key.color.setHex(theme.key);
  rim.color.setHex(theme.rim);
  setThemeEnvironment(theme);
  hemi.intensity = theme.env === 'ice' ? 0.88 : 0.98;
  key.intensity = theme.env === 'ice' ? 3.1 : 3.3;
  rim.intensity = theme.env === 'ice' ? 0.85 : 0.7;

  const maps = makeGroundMaps(theme);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.w, WORLD.h),
    new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.95,
      metalness: 0.05,
      envMapIntensity: 0.22
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  arenaGroup.add(ground);

  // holographic deck grid projected onto the terrain
  if (!holoGridTex) holoGridTex = makeHoloGridTex();
  const gridRep = WORLD.w / 760;
  const gridGeo = new THREE.PlaneGeometry(WORLD.w, WORLD.h);
  const gtex = holoGridTex.clone();
  gtex.needsUpdate = true;
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(gridRep, WORLD.h / 760);
  holoGridMesh = new THREE.Mesh(gridGeo, new THREE.MeshBasicMaterial({
    map: gtex, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true
  }));
  holoGridMesh.rotation.x = -Math.PI / 2;
  holoGridMesh.position.y = 0.8;
  holoGridMesh.userData.noMerge = true;
  holoGridMesh.renderOrder = 2;
  arenaGroup.add(holoGridMesh);

  // sky dome
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 16;
  skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, theme.sky[0]);
  grad.addColorStop(0.45, theme.sky[1]);
  grad.addColorStop(0.7, theme.sky[2]);
  grad.addColorStop(0.85, theme.sky[3]);
  grad.addColorStop(1, theme.sky[4]);
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.userData.noMerge = true;
  sky.castShadow = false;
  arenaGroup.add(sky);

  // drifting motes
  const DUST_N = 240;
  const dpos = new Float32Array(DUST_N * 3);
  const dvel = new Float32Array(DUST_N * 2);
  for (let i = 0; i < DUST_N; i++) {
    dpos[i * 3] = rand(-HX, HX);
    dpos[i * 3 + 1] = rand(20, 280);
    dpos[i * 3 + 2] = rand(-HZ, HZ);
    dvel[i * 2] = rand(-14, 14);
    dvel[i * 2 + 1] = rand(-14, 14);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dmat = new THREE.PointsMaterial({
    color: theme.dust, size: 5, transparent: true, opacity: 0.42,
    map: softDotTex, alphaTest: 0.02,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  const dpoints = new THREE.Points(dg, dmat);
  dpoints.frustumCulled = false;
  arenaGroup.add(dpoints);
  dust = { points: dpoints, pos: dpos, vel: dvel, n: DUST_N };

  buildArenaEnvironment(theme);
  buildWeather(theme);
}

function updateArena(dt) {
  for (const f of fires) {
    const fl = 0.75 + Math.sin(G.time * 13 + f.base) * 0.2 + Math.random() * 0.15;
    f.light.intensity = f.base * fl;
    if (f.flame) f.flame.scale.setScalar(0.9 + Math.random() * 0.25);
  }
  for (const s of spinners) s.rotation.y += (s.userData.spin || 1.2) * dt;
  if (!dust) return;
  const px = G.player ? G.player.x - HX : 0;
  const pz = G.player ? G.player.y - HZ : 0;
  const pos = dust.pos, vel = dust.vel;
  for (let i = 0; i < dust.n; i++) {
    const i3 = i * 3;
    pos[i3] += vel[i * 2] * dt;
    pos[i3 + 2] += vel[i * 2 + 1] * dt;
    if (pos[i3] - px > 900) pos[i3] -= 1800;
    if (pos[i3] - px < -900) pos[i3] += 1800;
    if (pos[i3 + 2] - pz > 900) pos[i3 + 2] -= 1800;
    if (pos[i3 + 2] - pz < -900) pos[i3 + 2] += 1800;
  }
  dust.points.geometry.attributes.position.needsUpdate = true;
}

// aim marker
const aimMarker = new THREE.Mesh(
  new THREE.RingGeometry(14, 20, 24),
  new THREE.MeshBasicMaterial({ color: 0xff8a4d, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
);
aimMarker.rotation.x = -Math.PI / 2;
aimMarker.visible = false;
scene.add(aimMarker);

// ------------------------------------------------------------
//  Meshes
// ------------------------------------------------------------
const matCache = new Map();
function stdMat(hex, emissive, intensity, extra) {
  const k = hex + '|' + (emissive || '') + '|' + (intensity || 0);
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial(Object.assign({
    color: new THREE.Color(hex),
    roughness: 0.55,
    metalness: 0.25,
    flatShading: true
  }, emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: intensity || 1 } : {}, extra || {}));
  matCache.set(k, m);
  return m;
}

const gunMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.9, roughness: 0.24, envMapIntensity: 1, emissive: 0x241040, emissiveIntensity: 0.3 });

// soft blob shadow so models read against the dark floor
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });

const softDotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function addBlobShadow(group, r) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.1, r * 3.1), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 1.6;
  group.add(m);
  return m;
}

// Layered muzzle flash: soft star burst with hot core, drawn as camera-facing
// sprites so it reads from any angle.
const muzzleTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,248,1)');
  grd.addColorStop(0.16, 'rgba(255,240,196,0.95)');
  grd.addColorStop(0.42, 'rgba(255,176,72,0.42)');
  grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate(i * TAU / 6 + 0.2);
    g.fillStyle = 'rgba(255,224,170,0.3)';
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(60, 0);
    g.lineTo(0, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const GUN_LOOK = { pistol: 0.74, rifle: 1, shotgun: 1.07, minigun: 1.2, energy: 1.13, launcher: 1.26 };

const camoTexCache = new Map();
function camoTexture(base, accent) {
  const key = base + '|' + accent;
  if (camoTexCache.has(key)) return camoTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const col = new THREE.Color(base);
  const dark = col.clone().multiplyScalar(0.42);
  const mid = col.clone().offsetHSL(0, -0.12, -0.14);
  const light = new THREE.Color(accent).multiplyScalar(0.75);
  g.fillStyle = '#' + col.getHexString();
  g.fillRect(0, 0, 128, 128);
  const palette = ['#' + dark.getHexString(), '#' + mid.getHexString(), '#' + light.getHexString(), 'rgba(20,22,18,0.55)'];
  for (let i = 0; i < 110; i++) {
    g.fillStyle = palette[i % palette.length];
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 128, Math.random() * 13 + 4, Math.random() * 8 + 2, Math.random() * Math.PI, 0, TAU);
    g.fill();
  }
  // fine dirt speckle
  g.globalAlpha = 1;
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.16) + ')';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  camoTexCache.set(key, t);
  return t;
}

// Merge a group's static child meshes per material. Characters are assembled from
// dozens of little boxes; batching them keeps the draw-call count phone-friendly
// while every animated part stays its own node.
function mergeGroupMeshes(root, keep) {
  if (!root) return 0;
  const buckets = new Map();
  const remove = [];
  for (const child of root.children) {
    if (!child.isMesh) continue;
    if (keep && keep.has(child)) continue;
    if (child.userData.keep) continue;
    const mat = child.material;
    if (!mat || Array.isArray(mat) || mat.transparent) continue;
    const g = child.geometry;
    if (!g || !g.attributes.position || !g.attributes.normal || !g.attributes.uv) continue;
    child.updateMatrix();
    const copy = g.index ? g.toNonIndexed() : g.clone();
    copy.applyMatrix4(child.matrix);
    const key = mat.uuid;
    let rec = buckets.get(key);
    if (!rec) { rec = { mat, geos: [] }; buckets.set(key, rec); }
    rec.geos.push(copy);
    remove.push(child);
  }
  for (const c of remove) root.remove(c);
  for (const rec of buckets.values()) {
    const geo = mergeStaticGeos(rec.geos);
    const m = new THREE.Mesh(geo, rec.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    for (const g of rec.geos) g.dispose();
  }
  return remove.length;
}

function makeFighterMesh(ch) {
  const g = new THREE.Group();
  const r = ch.r;
  const hi = !LOWQ;
  const camo = camoTexture(ch.color, ch.dark);

  // ----------------------------------------------------------
  //  Palette — matte composite black, gunmetal plating and violet
  //  holographic emitters. Everything reads as one suit of armour.
  // ----------------------------------------------------------
  const HOLO = 0x8b4dff;
  const HOLO_HOT = 0xd9c2ff;
  const clothMat = new THREE.MeshStandardMaterial({ map: camo, color: 0x2f343b, roughness: 0.94, metalness: 0.06 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.66, metalness: 0.32 });
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.24, metalness: 0.96, emissive: 0x1a0a2e, emissiveIntensity: 0.4 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.32, metalness: 0.92, emissive: 0x1f0c36, emissiveIntensity: 0.34 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9d86c4, roughness: 0.22, metalness: 0.88, emissive: HOLO, emissiveIntensity: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HOLO) });
  const hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HOLO_HOT) });
  const holoMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HOLO), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 0.58, metalness: 0.52 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(ch.skin), roughness: 0.72, metalness: 0.02 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1016, roughness: 0.12, metalness: 0.9, emissive: HOLO, emissiveIntensity: 0.55 });
  const bodyMat = new THREE.MeshStandardMaterial({ map: camo, color: 0x323841, roughness: 0.9, metalness: 0.1 });
  clothMat.envMapIntensity = 0.22;
  suitMat.envMapIntensity = 0.4;
  armorMat.envMapIntensity = 0.7;
  plateMat.envMapIntensity = 0.62;
  trimMat.envMapIntensity = 0.95;
  gloveMat.envMapIntensity = 0.25;
  skinMat.envMapIntensity = 0.14;
  glassMat.envMapIntensity = 1.05;
  bodyMat.envMapIntensity = 0.22;

  const put = (parent, geo, mat, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const hips = new THREE.Group();
  g.add(hips);

  // ----------------------------------------------------------
  //  Torso — anatomically shaped chest and abdomen under plates
  // ----------------------------------------------------------
  // pelvis block and waist taper (the load-bearing core of the silhouette)
  const pelvis = put(hips, new THREE.CylinderGeometry(r * 0.29, r * 0.33, r * 0.24, 12), suitMat, 0, r * 1.0, 0);
  pelvis.scale.set(1, 1, 0.82);
  const waist = put(hips, new THREE.CylinderGeometry(r * 0.3, r * 0.27, r * 0.26, 12), suitMat, 0, r * 1.26, 0);
  waist.scale.set(1, 1, 0.78);

  // ribcage: an ellipse wider at the shoulders, narrower at the waist
  const torso = put(hips, new THREE.SphereGeometry(r * 0.42, 16, 12), bodyMat, r * 0.02, r * 1.62, 0);
  torso.scale.set(0.76, 1.05, 1.16);
  const bodyBase = { x: torso.scale.x, y: torso.scale.y, z: torso.scale.z };

  // abdominal plating, segmented so the waist can flex
  for (let i = 0; i < 3; i++) {
    const seg = put(hips, new THREE.BoxGeometry(r * 0.2, r * 0.08, r * 0.42 - i * r * 0.03), armorMat, r * 0.3, r * (1.14 + i * 0.1), 0);
    seg.rotation.z = -0.08;
  }
  for (const s of [-1, 1]) {
    put(hips, new THREE.BoxGeometry(r * 0.16, r * 0.34, r * 0.12), plateMat, r * 0.18, r * 1.28, s * r * 0.26);
  }

  // chest plate: a broad curved plastron with a holo core in the sternum
  const chest = put(hips, new THREE.SphereGeometry(r * 0.4, 14, 10), armorMat, r * 0.13, r * 1.68, 0);
  chest.scale.set(0.52, 0.9, 1.02);
  for (const s of [-1, 1]) {
    const pec = put(hips, new THREE.SphereGeometry(r * 0.2, 10, 8), plateMat, r * 0.3, r * 1.72, s * r * 0.21);
    pec.scale.set(0.42, 0.72, 0.9);
  }
  // collar bones and neck seal
  put(hips, new THREE.BoxGeometry(r * 0.3, r * 0.08, r * 0.46), armorMat, r * 0.1, r * 1.9, 0);
  put(hips, new THREE.CylinderGeometry(r * 0.19, r * 0.21, r * 0.1, 10), suitMat, 0, r * 1.97, 0);
  // back plate and spine rails
  put(hips, new THREE.BoxGeometry(r * 0.16, r * 0.5, r * 0.42), armorMat, -r * 0.26, r * 1.66, 0);
  for (let i = 0; i < 3; i++) put(hips, new THREE.BoxGeometry(r * 0.06, r * 0.06, r * 0.3), trimMat, -r * 0.34, r * (1.5 + i * 0.14), 0);

  // sternum hologram: emitter ring, projected panel and two side slits
  const chestRing = put(hips, new THREE.TorusGeometry(r * 0.085, r * 0.014, 6, 18), hotMat, r * 0.36, r * 1.74, 0, 0, Math.PI / 2, 0);
  const chestHolo = put(hips, new THREE.PlaneGeometry(r * 0.14, r * 0.08), holoMat, r * 0.365, r * 1.58, 0, 0, Math.PI / 2, 0);
  chestHolo.userData.keep = true;
  for (const s of [-1, 1]) put(hips, new THREE.BoxGeometry(r * 0.05, r * 0.05, r * 0.2), glowMat, r * 0.3, r * 1.56, s * r * 0.3);
  put(hips, new THREE.BoxGeometry(r * 0.03, r * 0.3, r * 0.03), trimMat, r * 0.34, r * 1.86, -r * 0.22);

  // belt, pouches, holster and knife
  put(hips, new THREE.BoxGeometry(r * 0.46, r * 0.09, r * 0.4), armorMat, r * 0.02, r * 1.09, 0);
  put(hips, new THREE.BoxGeometry(r * 0.4, r * 0.015, r * 0.36), trimMat, r * 0.06, r * 1.085, 0);
  put(hips, new THREE.BoxGeometry(r * 0.1, r * 0.08, r * 0.1), hotMat, r * 0.25, r * 1.09, 0);
  for (let i = 0; i < 2; i++) {
    put(hips, new THREE.BoxGeometry(r * 0.18, r * 0.24, r * 0.2), plateMat, r * 0.4, r * 1.2, (i - 0.5) * r * 0.28);
  }
  put(hips, new THREE.BoxGeometry(r * 0.24, r * 0.28, r * 0.32), plateMat, -r * 0.3, r * 1.16, r * 0.34);
  put(hips, new THREE.BoxGeometry(r * 0.1, r * 0.34, r * 0.08), trimMat, r * 0.3, r * 1.36, -r * 0.44, 0.34);

  // ----------------------------------------------------------
  //  Head — skull, jaw, helmet shell, visor and comms
  // ----------------------------------------------------------
  const headG = new THREE.Group();
  headG.position.set(0, 0, 0);
  hips.add(headG);
  const neck = put(headG, new THREE.CylinderGeometry(r * 0.1, r * 0.14, r * 0.16, 10), suitMat, 0, r * 2.04, 0);
  const skull = put(headG, new THREE.SphereGeometry(r * 0.235, 14, 12), skinMat, r * 0.03, r * 2.2, 0);
  skull.scale.set(0.96, 1.06, 0.9);
  // jaw and chin, then the brow shelf and nose
  const jaw = put(headG, new THREE.BoxGeometry(r * 0.13, r * 0.09, r * 0.17), suitMat, r * 0.14, r * 2.1, 0);
  jaw.rotation.z = -0.12;
  put(headG, new THREE.BoxGeometry(r * 0.04, r * 0.03, r * 0.15), skinMat, r * 0.18, r * 2.16, 0);
  // sealed respirator covers the lower face: it reads as a soldier in a helmet, not a mannequin
  put(headG, new THREE.BoxGeometry(r * 0.17, r * 0.12, r * 0.2), armorMat, r * 0.15, r * 2.04, 0);
  put(headG, new THREE.BoxGeometry(r * 0.07, r * 0.07, r * 0.11), plateMat, r * 0.22, r * 2.03, 0);
  put(headG, new THREE.BoxGeometry(r * 0.05, r * 0.03, r * 0.11), glowMat, r * 0.21, r * 1.99, 0);
  put(headG, new THREE.ConeGeometry(r * 0.03, r * 0.06, 6), skinMat, r * 0.22, r * 2.17, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) put(headG, new THREE.SphereGeometry(r * 0.05, 6, 5), skinMat, r * 0.0, r * 2.2, s * r * 0.21);

  // helmet: shell, brow visor, cheek guards, crest rail
  const helmet = put(headG, new THREE.SphereGeometry(r * 0.275, 16, 12, 0, TAU, 0, Math.PI * 0.62), armorMat, r * 0.0, r * 2.24, 0);
  helmet.scale.set(1.06, 0.98, 1.08);
  put(headG, new THREE.CylinderGeometry(r * 0.278, r * 0.27, r * 0.05, 16), plateMat, r * 0.0, r * 2.24, 0);
  const visor = put(headG, new THREE.BoxGeometry(r * 0.06, r * 0.055, r * 0.27), glassMat, r * 0.275, r * 2.245, 0);
  visor.rotation.z = -0.14;
  // optics: two narrow violet emitters set into the faceplate
  for (const s of [-1, 1]) put(headG, new THREE.BoxGeometry(r * 0.012, r * 0.022, r * 0.035), hotMat, r * 0.312, r * 2.25, s * r * 0.065);
  for (const s of [-1, 1]) {
    put(headG, new THREE.BoxGeometry(r * 0.16, r * 0.16, r * 0.07), plateMat, r * 0.02, r * 2.16, s * r * 0.2);
  }
  put(headG, new THREE.BoxGeometry(r * 0.05, r * 0.04, r * 0.42), trimMat, r * 0.0, r * 2.42, 0);
  // comms: ear cup, boom mic, whip antenna
  const cup = put(headG, new THREE.CylinderGeometry(r * 0.1, r * 0.1, r * 0.1, 10), trimMat, -r * 0.02, r * 2.2, r * 0.24, Math.PI / 2);
  put(headG, new THREE.CylinderGeometry(r * 0.016, r * 0.016, r * 0.3, 5), trimMat, r * 0.1, r * 2.1, r * 0.19, 0, 0, 1.1);
  if (hi) {
    put(headG, new THREE.CylinderGeometry(r * 0.009, r * 0.009, r * 0.3, 4), trimMat, -r * 0.06, r * 2.5, r * 0.17);
    put(headG, new THREE.SphereGeometry(r * 0.025, 6, 5), glowMat, -r * 0.06, r * 2.66, r * 0.17);
  }
  const strobe = put(headG, new THREE.BoxGeometry(r * 0.09, r * 0.05, r * 0.09), new THREE.MeshBasicMaterial({ color: new THREE.Color(ch.color) }), -r * 0.14, r * 2.34, r * 0.24);
  const headBaseY = 0;

  // ----------------------------------------------------------
  //  Arms — deltoid, bicep, elbow, tapered forearm, gloved hand
  // ----------------------------------------------------------
  const arms = [];
  const elbows = [];
  const shoulders = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(r * 0.0, r * 1.86, s * r * 0.46);
    sh.rotation.y = s * 0.5;
    sh.rotation.z = -0.24;
    hips.add(sh);

    const delt = put(sh, new THREE.SphereGeometry(r * 0.155, 10, 8), armorMat, r * 0.02, r * 0.02, 0);
    delt.scale.set(1.05, 0.95, 1);
    // layered pauldron over the deltoid
    const pad = put(sh, new THREE.SphereGeometry(r * 0.19, 10, 6, 0, TAU, 0, Math.PI * 0.55), plateMat, r * 0.01, r * 0.04, 0);
    pad.scale.set(1.0, 0.85, 1.05);
    put(sh, new THREE.BoxGeometry(r * 0.2, r * 0.05, r * 0.26), trimMat, r * 0.06, r * 0.1, 0, 0, 0, 0.1);

    const upper = put(sh, new THREE.CapsuleGeometry(r * 0.105, r * 0.3, 3, 8), suitMat, r * 0.24, 0, 0, 0, 0, -Math.PI / 2);
    upper.scale.set(1.06, 1, 1.06);
    const bicep = put(sh, new THREE.SphereGeometry(r * 0.11, 8, 7), suitMat, r * 0.27, -r * 0.01, 0);
    bicep.scale.set(1.35, 1.05, 1.0);
    put(sh, new THREE.BoxGeometry(r * 0.18, r * 0.06, r * 0.2), armorMat, r * 0.25, r * 0.06, 0, 0, 0, -0.1);

    const el = new THREE.Group();
    el.position.set(r * 0.44, 0, 0);
    el.rotation.y = s * 0.42;
    el.rotation.z = 0.14;
    sh.add(el);
    put(el, new THREE.SphereGeometry(r * 0.105, 8, 7), plateMat, 0, 0, 0);
    const fore = put(el, new THREE.CylinderGeometry(r * 0.095, r * 0.075, r * 0.4, 10), suitMat, r * 0.2, 0, 0, 0, 0, -Math.PI / 2);
    fore.scale.set(1, 1, 1);
    // forearm gauntlet with a holo readout band
    put(el, new THREE.BoxGeometry(r * 0.32, r * 0.13, r * 0.17), armorMat, r * 0.2, r * 0.01, 0);
    put(el, new THREE.BoxGeometry(r * 0.3, r * 0.05, r * 0.19), trimMat, r * 0.2, r * 0.06, 0);
    put(el, new THREE.BoxGeometry(r * 0.1, r * 0.09, r * 0.15), glassMat, r * 0.15, r * 0.08, 0);
    put(el, new THREE.TorusGeometry(r * 0.1, r * 0.012, 5, 12), hotMat, r * 0.35, 0, 0, 0, Math.PI / 2, 0);
    // gloved hand: palm plus four fingers and a thumb
    const hand = put(el, new THREE.BoxGeometry(r * 0.14, r * 0.1, r * 0.15), gloveMat, r * 0.42, -r * 0.01, 0);
    hand.rotation.z = -0.12;
    for (let i = 0; i < 3; i++) {
      put(el, new THREE.BoxGeometry(r * 0.09, r * 0.045, r * 0.035), gloveMat, r * 0.48, -r * 0.01, (i - 1) * r * 0.045);
    }
    put(el, new THREE.BoxGeometry(r * 0.07, r * 0.04, r * 0.05), gloveMat, r * 0.44, r * 0.03, r * 0.08, 0, 0, 0.4);

    arms.push(sh);
    elbows.push(el);
    shoulders.push(sh);
  }

  // ----------------------------------------------------------
  //  Legs — hip, thigh, knee, calf and articulated boot
  // ----------------------------------------------------------
  const legs = [], knees = [], feet = [];
  for (const s of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(0, r * 0.92, s * r * 0.22);
    // glute and hip guard
    const glute = put(legGroup, new THREE.SphereGeometry(r * 0.17, 8, 7), suitMat, -r * 0.02, -r * 0.02, 0);
    glute.scale.set(1, 0.9, 1);
    put(legGroup, new THREE.BoxGeometry(r * 0.24, r * 0.14, r * 0.2), armorMat, r * 0.08, -r * 0.02, s * r * 0.03);
    const thigh = put(legGroup, new THREE.CylinderGeometry(r * 0.14, r * 0.115, r * 0.44, 10), suitMat, 0, -r * 0.22, 0);
    thigh.scale.set(1.05, 1, 1.02);
    put(legGroup, new THREE.BoxGeometry(r * 0.14, r * 0.3, r * 0.2), armorMat, r * 0.11, -r * 0.22, 0, 0, 0, 0.02);
    put(legGroup, new THREE.BoxGeometry(r * 0.05, r * 0.16, r * 0.16), trimMat, r * 0.17, -r * 0.16, 0);

    const knee = new THREE.Group();
    knee.position.set(0, -r * 0.44, 0);
    legGroup.add(knee);
    const kneecap = put(knee, new THREE.SphereGeometry(r * 0.12, 8, 7), plateMat, r * 0.05, r * 0.01, 0);
    kneecap.scale.set(0.9, 1, 1);
    put(knee, new THREE.BoxGeometry(r * 0.16, r * 0.14, r * 0.18), armorMat, r * 0.04, -r * 0.02, 0);
    const calf = put(knee, new THREE.CylinderGeometry(r * 0.105, r * 0.08, r * 0.34, 10), suitMat, 0, -r * 0.17, 0);
    calf.scale.set(1, 1, 1.04);
    const calfMuscle = put(knee, new THREE.SphereGeometry(r * 0.1, 8, 7), suitMat, -r * 0.02, -r * 0.08, 0);
    calfMuscle.scale.set(1.1, 1.5, 1);
    put(knee, new THREE.BoxGeometry(r * 0.1, r * 0.26, r * 0.16), armorMat, r * 0.08, -r * 0.18, 0);
    put(knee, new THREE.BoxGeometry(r * 0.03, r * 0.2, r * 0.05), trimMat, r * 0.13, -r * 0.18, 0);

    const foot = new THREE.Group();
    foot.position.set(0, -r * 0.34, 0);
    knee.add(foot);
    put(foot, new THREE.BoxGeometry(r * 0.1, r * 0.06, r * 0.17), trimMat, 0, -r * 0.02, 0);
    const boot = put(foot, new THREE.BoxGeometry(r * 0.3, r * 0.12, r * 0.2), gloveMat, r * 0.06, -r * 0.08, 0);
    boot.scale.z = 1.05;
    put(foot, new THREE.BoxGeometry(r * 0.34, r * 0.05, r * 0.22), armorMat, r * 0.06, -r * 0.14, 0);
    put(foot, new THREE.BoxGeometry(r * 0.1, r * 0.08, r * 0.16), plateMat, r * 0.2, -r * 0.06, 0);
    if (s === 1) {
      put(legGroup, new THREE.BoxGeometry(r * 0.16, r * 0.3, r * 0.14), plateMat, r * 0.16, -r * 0.24, r * 0.16);
      put(legGroup, new THREE.BoxGeometry(r * 0.08, r * 0.18, r * 0.09), gloveMat, r * 0.2, -r * 0.38, r * 0.16);
    }

    g.add(legGroup);
    legs.push(legGroup);
    knees.push(knee);
    feet.push(foot);
  }

  // ----------------------------------------------------------
  //  Backpack: life support, twin reactors and antenna
  // ----------------------------------------------------------
  const pack = put(hips, new THREE.BoxGeometry(r * 0.24, r * 0.48, r * 0.42), suitMat, -r * 0.38, r * 1.62, 0);
  put(hips, new THREE.BoxGeometry(r * 0.08, r * 0.36, r * 0.34), plateMat, -r * 0.5, r * 1.64, 0);
  for (const s of [-1, 1]) {
    put(hips, new THREE.CylinderGeometry(r * 0.075, r * 0.075, r * 0.2, 8), armorMat, -r * 0.56, r * 1.88, s * r * 0.18, 0, 0, Math.PI / 2);
    put(hips, new THREE.CylinderGeometry(r * 0.045, r * 0.045, r * 0.04, 8), glowMat, -r * 0.67, r * 1.88, s * r * 0.18, 0, 0, Math.PI / 2);
  }
  put(hips, new THREE.BoxGeometry(r * 0.04, r * 0.4, r * 0.03), trimMat, -r * 0.54, r * 1.7, r * 0.2);
  put(hips, new THREE.CylinderGeometry(r * 0.012, r * 0.012, r * 0.3, 4), trimMat, -r * 0.4, r * 2.02, -r * 0.22);
  const thruster = put(hips, new THREE.ConeGeometry(r * 0.075, r * 0.24, 8), new THREE.MeshBasicMaterial({
    color: ch.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false
  }), -r * 0.56, r * 1.3, 0, 0, 0, Math.PI / 2);
  thruster.visible = false;

  // ----------------------------------------------------------
  //  Role kit — each bro keeps his own silhouette
  // ----------------------------------------------------------
  if (ch.id === 'percy') {
    // heavy breacher: extra pauldron layers, chest block, reactor vents
    for (const s of [-1, 1]) {
      put(hips, new THREE.BoxGeometry(r * 0.3, r * 0.14, r * 0.44), armorMat, r * 0.02, r * 2.0, s * r * 0.5, 0, 0, -0.18);
      put(hips, new THREE.BoxGeometry(r * 0.08, r * 0.08, r * 0.08), hotMat, r * 0.02, r * 2.08, s * r * 0.56);
      put(hips, new THREE.BoxGeometry(r * 0.07, r * 0.2, r * 0.08), trimMat, r * 0.34, r * 1.62, s * r * 0.34);
    }
    put(hips, new THREE.BoxGeometry(r * 0.14, r * 0.36, r * 0.46), plateMat, r * 0.4, r * 1.6, 0);
    put(hips, new THREE.BoxGeometry(r * 0.06, r * 0.14, r * 0.3), trimMat, r * 0.34, r * 1.44, 0);
  } else if (ch.id === 'francis') {
    // scout: slim layered plates, exposed harness, single chest bar
    for (const s of [-1, 1]) put(hips, new THREE.BoxGeometry(r * 0.18, r * 0.06, r * 0.3), armorMat, r * 0.2, r * 1.86, s * r * 0.36, 0, 0, 0.1);
    put(hips, new THREE.BoxGeometry(r * 0.03, r * 0.16, r * 0.24), hotMat, r * 0.36, r * 1.68, 0);
    put(hips, new THREE.BoxGeometry(r * 0.26, r * 0.05, r * 0.26), trimMat, r * 0.04, r * 1.22, 0);
    for (const s of [-1, 1]) put(hips, new THREE.BoxGeometry(r * 0.03, r * 0.34, r * 0.03), trimMat, r * 0.22, r * 1.6, s * r * 0.24, 0, 0, 0.16);
  }

  // ----------------------------------------------------------
  //  Weapons — one platform per class, each with moving parts
  // ----------------------------------------------------------
  const gunBaseX = r * 1.02;

  const buildPlatform = (kind) => {
    const gg = new THREE.Group();
    gg.position.set(gunBaseX, r * 1.66, 0);
    hips.add(gg);
    const parts = { group: gg };
    const gmetal = new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.95, roughness: 0.3, emissive: 0x180a2c, emissiveIntensity: 0.35 });
    gmetal.envMapIntensity = 0.85;
    const ggrip = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.72, metalness: 0.35 });
    const gcore = new THREE.MeshBasicMaterial({ color: new THREE.Color(ch.color) });

    if (kind === 'compact') {
      // sidearm: full-length slide, comp, grip magazine
      put(gg, new THREE.BoxGeometry(r * 0.44, r * 0.12, r * 0.2), gmetal, r * 0.14, -r * 0.02, 0);
      put(gg, new THREE.BoxGeometry(r * 0.18, r * 0.14, r * 0.18), gmetal, -r * 0.08, -r * 0.06, 0, 0, 0, 0.24);
      put(gg, new THREE.BoxGeometry(r * 0.18, r * 0.14, r * 0.08), ggrip, -r * 0.1, -r * 0.08, r * 0.06, 0, 0, 0.24);
      put(gg, new THREE.CylinderGeometry(r * 0.052, r * 0.052, r * 0.1, 8), gmetal, r * 0.4, -r * 0.02, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.BoxGeometry(r * 0.1, r * 0.05, r * 0.12), trimMat, r * 0.44, r * 0.01, 0);
      put(gg, new THREE.BoxGeometry(r * 0.08, r * 0.06, r * 0.02), gcore, r * 0.14, -r * 0.075, r * 0.1);
      // slide: the whole top rides back on every shot
      const slide = put(gg, new THREE.BoxGeometry(r * 0.56, r * 0.12, r * 0.22), plateMat, r * 0.16, r * 0.08, 0);
      for (let i = 0; i < 3; i++) put(slide, new THREE.BoxGeometry(r * 0.03, r * 0.09, r * 0.23), gmetal, -r * 0.2 + i * r * 0.04, 0, 0);
      put(slide, new THREE.BoxGeometry(r * 0.03, r * 0.05, r * 0.06), hotMat, r * 0.26, r * 0.02, 0);
      put(slide, new THREE.BoxGeometry(r * 0.04, r * 0.05, r * 0.16), gmetal, -r * 0.27, r * 0.02, 0);
      // optic and sight ring
      put(slide, new THREE.BoxGeometry(r * 0.1, r * 0.035, r * 0.08), gmetal, r * 0.02, r * 0.07, 0);
      put(slide, new THREE.TorusGeometry(r * 0.035, r * 0.01, 5, 12), hotMat, r * 0.03, r * 0.1, 0, 0, Math.PI / 2, 0);
      // grip magazine, drops free on reload
      const mag = put(gg, new THREE.BoxGeometry(r * 0.13, r * 0.34, r * 0.15), gmetal, -r * 0.06, -r * 0.24, 0, 0, 0, 0.24);
      put(mag, new THREE.BoxGeometry(r * 0.14, r * 0.03, r * 0.16), trimMat, 0, -r * 0.16, 0);
      put(gg, new THREE.BoxGeometry(r * 0.12, r * 0.03, r * 0.06), gmetal, r * 0.06, -r * 0.1, 0);
      parts.mag = mag;
      parts.slide = slide;
      parts.slideHome = r * 0.16;
      parts.magHomeY = -r * 0.24;
      parts.magHomeRZ = 0.24;
      parts.magHomeZ = 0;
    } else if (kind === 'energy') {
      // coil rifle: housing, energised rails, vents, battery cell
      put(gg, new THREE.BoxGeometry(r * 0.92, r * 0.2, r * 0.2), armorMat, r * 0.16, 0, 0);
      put(gg, new THREE.BoxGeometry(r * 0.42, r * 0.1, r * 0.16), plateMat, r * 0.72, r * 0.04, 0);
      const core = put(gg, new THREE.CylinderGeometry(r * 0.035, r * 0.035, r * 0.94, 8), hotMat, r * 0.62, r * 0.02, 0, 0, 0, -Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        put(gg, new THREE.TorusGeometry(r * 0.1, r * 0.02, 6, 14), trimMat, r * 0.36 + i * r * 0.17, r * 0.02, 0, 0, Math.PI / 2, 0);
      }
      put(gg, new THREE.ConeGeometry(r * 0.085, r * 0.24, 10), trimMat, r * 1.14, r * 0.02, 0, 0, 0, -Math.PI / 2);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        put(gg, new THREE.BoxGeometry(r * 0.12, r * 0.05, r * 0.03), trimMat, r * 0.5 + i * r * 0.16, -r * 0.02, s * r * 0.1);
      }
      put(gg, new THREE.BoxGeometry(r * 0.06, r * 0.14, r * 0.3), armorMat, r * 0.2, r * 0.16, 0);
      put(gg, new THREE.PlaneGeometry(r * 0.16, r * 0.08), holoMat, r * 0.22, r * 0.22, 0, 0, Math.PI / 2, 0);
      put(gg, new THREE.BoxGeometry(r * 0.16, r * 0.3, r * 0.14), ggrip, -r * 0.02, -r * 0.22, 0, 0, 0, 0.2);
      put(gg, new THREE.BoxGeometry(r * 0.3, r * 0.12, r * 0.18), plateMat, -r * 0.4, -r * 0.02, 0);
      const mag = put(gg, new THREE.CylinderGeometry(r * 0.075, r * 0.075, r * 0.26, 10), gmetal, r * 0.14, -r * 0.2, 0, 0, 0, 0.1);
      put(mag, new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.28, 10), hotMat, r * 0.14, -r * 0.2, 0, 0, 0, 0.1);
      parts.mag = mag;
      parts.magHomeY = -r * 0.2;
      parts.magHomeRZ = 0.1;
      parts.magHomeZ = 0;
    } else if (kind === 'heavy') {
      // support weapon: shroud, drum, carry handle, foregrip
      put(gg, new THREE.CylinderGeometry(r * 0.15, r * 0.15, r * 0.86, 12), plateMat, r * 0.52, 0, 0, 0, 0, -Math.PI / 2);
      for (let i = 0; i < 4; i++) put(gg, new THREE.TorusGeometry(r * 0.155, r * 0.014, 5, 12), trimMat, r * 0.28 + i * r * 0.18, 0, 0, 0, Math.PI / 2, 0);
      put(gg, new THREE.CylinderGeometry(r * 0.055, r * 0.055, r * 0.36, 8), gmetal, r * 1.0, 0, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.CylinderGeometry(r * 0.1, r * 0.085, r * 0.2, 10), trimMat, r * 1.14, 0, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.BoxGeometry(r * 0.5, r * 0.26, r * 0.26), armorMat, r * 0.14, -r * 0.02, 0);
      put(gg, new THREE.BoxGeometry(r * 0.3, r * 0.08, r * 0.18), trimMat, r * 0.1, r * 0.16, 0);
      put(gg, new THREE.BoxGeometry(r * 0.08, r * 0.12, r * 0.12), glassMat, r * 0.1, r * 0.24, 0);
      put(gg, new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.24, 8), ggrip, r * 0.6, -r * 0.2, 0);
      put(gg, new THREE.BoxGeometry(r * 0.16, r * 0.28, r * 0.14), ggrip, -r * 0.06, -r * 0.22, 0, 0, 0, 0.22);
      put(gg, new THREE.BoxGeometry(r * 0.3, r * 0.14, r * 0.2), plateMat, -r * 0.4, -r * 0.02, 0);
      const mag = put(gg, new THREE.CylinderGeometry(r * 0.17, r * 0.17, r * 0.24, 14), gmetal, r * 0.16, -r * 0.24, 0, Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        put(mag, new THREE.CylinderGeometry(r * 0.03, r * 0.03, r * 0.26, 6), hotMat, Math.cos(i * TAU / 5) * r * 0.09, Math.sin(i * TAU / 5) * r * 0.09, 0, Math.PI / 2);
      }
      parts.mag = mag;
      parts.magHomeY = -r * 0.24;
      parts.magHomeZ = 0;
      parts.magHomeRZ = 0;
    } else {
      // carbine: receiver, railed handguard, optic, brake, stock
      put(gg, new THREE.BoxGeometry(r * 0.72, r * 0.2, r * 0.24), plateMat, r * 0.12, 0, 0);
      put(gg, new THREE.BoxGeometry(r * 0.54, r * 0.11, r * 0.22), armorMat, r * 0.18, r * 0.14, 0);
      for (let i = 0; i < 7; i++) put(gg, new THREE.BoxGeometry(r * 0.035, r * 0.025, r * 0.2), gmetal, -r * 0.04 + i * r * 0.08, r * 0.2, 0);
      put(gg, new THREE.BoxGeometry(r * 0.44, r * 0.17, r * 0.2), plateMat, r * 0.72, 0, 0);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        put(gg, new THREE.BoxGeometry(r * 0.09, r * 0.05, r * 0.02), trimMat, r * 0.58 + i * r * 0.13, r * 0.01, s * r * 0.1);
      }
      put(gg, new THREE.CylinderGeometry(r * 0.042, r * 0.048, r * 0.5, 8), gmetal, r * 1.06, r * 0.02, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.BoxGeometry(r * 0.1, r * 0.12, r * 0.11), trimMat, r * 0.94, r * 0.03, 0);
      put(gg, new THREE.CylinderGeometry(r * 0.075, r * 0.062, r * 0.16, 10), trimMat, r * 1.3, r * 0.02, 0, 0, 0, -Math.PI / 2);
      for (let i = 0; i < 3; i++) put(gg, new THREE.BoxGeometry(r * 0.02, r * 0.05, r * 0.1), gmetal, r * 1.28 + i * r * 0.045, r * 0.06, 0);
      // optic: base, tube, lens and rear aperture
      put(gg, new THREE.BoxGeometry(r * 0.22, r * 0.07, r * 0.15), trimMat, r * 0.2, r * 0.26, 0);
      put(gg, new THREE.CylinderGeometry(r * 0.075, r * 0.075, r * 0.24, 10), trimMat, r * 0.24, r * 0.32, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.CylinderGeometry(r * 0.062, r * 0.062, r * 0.015, 10), glassMat, r * 0.37, r * 0.32, 0, 0, 0, -Math.PI / 2);
      put(gg, new THREE.BoxGeometry(r * 0.04, r * 0.09, r * 0.12), trimMat, -r * 0.2, r * 0.25, 0);
      // stock, cheek riser, grip, trigger group
      put(gg, new THREE.BoxGeometry(r * 0.3, r * 0.17, r * 0.18), plateMat, -r * 0.46, -r * 0.02, 0);
      put(gg, new THREE.BoxGeometry(r * 0.08, r * 0.26, r * 0.2), armorMat, -r * 0.64, -r * 0.02, 0);
      put(gg, new THREE.BoxGeometry(r * 0.18, r * 0.05, r * 0.19), trimMat, -r * 0.46, r * 0.08, 0);
      put(gg, new THREE.BoxGeometry(r * 0.12, r * 0.26, r * 0.15), ggrip, -r * 0.02, -r * 0.22, 0, 0, 0, 0.26);
      put(gg, new THREE.BoxGeometry(r * 0.2, r * 0.035, r * 0.12), gmetal, r * 0.12, -r * 0.13, 0);
      put(gg, new THREE.BoxGeometry(r * 0.18, r * 0.1, r * 0.2), armorMat, r * 0.14, -r * 0.11, 0);
      // magazine, bolt carrier and ejection port cover
      const mag = put(gg, new THREE.BoxGeometry(r * 0.18, r * 0.4, r * 0.19), gmetal, r * 0.16, -r * 0.32, 0, 0, 0, 0.14);
      for (let i = 0; i < 3; i++) put(mag, new THREE.BoxGeometry(r * 0.02, r * 0.3, r * 0.2), gmetal, r * 0.11 + i * r * 0.045, 0, 0, 0, 0, 0.14);
      put(mag, new THREE.BoxGeometry(r * 0.19, r * 0.04, r * 0.2), trimMat, 0, -r * 0.19, 0);
      const slide = put(gg, new THREE.BoxGeometry(r * 0.2, r * 0.06, r * 0.03), trimMat, r * 0.16, r * 0.07, r * 0.12);
      const charge = put(gg, new THREE.BoxGeometry(r * 0.12, r * 0.05, r * 0.06), gmetal, -r * 0.06, r * 0.13, r * 0.1);
      // laser module, sling loop and side holo counter
      put(gg, new THREE.BoxGeometry(r * 0.14, r * 0.1, r * 0.1), armorMat, r * 0.84, r * 0.0, r * 0.15);
      put(gg, new THREE.BoxGeometry(r * 0.03, r * 0.03, r * 0.04), gcore, r * 0.92, r * 0.0, r * 0.15);
      put(gg, new THREE.PlaneGeometry(r * 0.12, r * 0.06), holoMat, r * 0.14, r * 0.06, -r * 0.13, 0, -Math.PI / 2, 0);
      put(gg, new THREE.BoxGeometry(r * 0.02, r * 0.12, r * 0.06), trimMat, r * 0.08, -r * 0.02, -r * 0.13);
      // charge core: its own emitter so the weapon colour can be pushed into it
      const core = put(gg, new THREE.BoxGeometry(r * 0.09, r * 0.05, r * 0.03), new THREE.MeshBasicMaterial({ color: ch.color }), r * 0.2, r * 0.02, -r * 0.135);
      parts.core = core;
      parts.mag = mag;
      parts.slide = slide;
      parts.charge = charge;
      parts.slideHome = r * 0.16;
      parts.magHomeY = -r * 0.32;
      parts.magHomeZ = 0;
      parts.magHomeRZ = 0.14;
    }
    mergeGroupMeshes(gg, new Set([parts.mag, parts.slide, parts.charge, parts.core].filter(Boolean)));
    return parts;
  };

  const pKinetic = buildPlatform('kinetic');
  const pCompact = buildPlatform('compact');
  const pEnergy = buildPlatform('energy');
  const pHeavy = buildPlatform('heavy');
  const gunGroup = pKinetic.group;
  const guns = { kinetic: gunGroup, compact: pCompact.group, energy: pEnergy.group, heavy: pHeavy.group };
  for (const k in guns) if (k !== 'kinetic') guns[k].visible = false;

  // muzzle flash: layered, camera facing, coloured per weapon
  const flash = new THREE.Group();
  const flashSprites = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleTex, color: new THREE.Color(ch.color), transparent: true,
      opacity: i === 0 ? 0.95 : 0.55, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sp.scale.setScalar(r * (i === 0 ? 2.1 : 3.0));
    flash.add(sp);
    flashSprites.push(sp);
  }
  flash.visible = false;
  hips.add(flash);
  flash.position.set(gunBaseX + r * 1.38, r * 1.69, 0);
  const MUZZLE = { kinetic: r * 1.38, compact: r * 0.5, energy: r * 1.26, heavy: r * 1.24 };

  // ----------------------------------------------------------
  //  Batch static detail, keep the animated nodes live
  // ----------------------------------------------------------
  addBlobShadow(g, r);
  mergeGroupMeshes(hips, new Set([torso, strobe, thruster]));
  mergeGroupMeshes(headG);
  for (const a of arms) { mergeGroupMeshes(a); }
  for (const e of elbows) { mergeGroupMeshes(e); }
  for (const l of legs) { mergeGroupMeshes(l); }
  for (const k of knees) { mergeGroupMeshes(k); }
  for (const ft of feet) { mergeGroupMeshes(ft); }

  g.userData.flash = flash;
  g.userData.body = torso;
  g.userData.bodyBase = bodyBase;
  g.userData.core = pKinetic.core || null;
  g.userData.thruster = thruster;
  g.userData.hips = hips;
  g.userData.head = headG;
  g.userData.headBaseY = headBaseY;
  g.userData.neck = neck;
  g.userData.chest = chest;
  g.userData.holo = holoMat;
  g.userData.legL = legs[0];
  g.userData.legR = legs[1];
  g.userData.kneeL = knees[0];
  g.userData.kneeR = knees[1];
  g.userData.footL = feet[0];
  g.userData.footR = feet[1];
  g.userData.armL = arms[0];
  g.userData.armR = arms[1];
  g.userData.shoulderL = shoulders[0];
  g.userData.shoulderR = shoulders[1];
  g.userData.gun = gunGroup;
  g.userData.guns = guns;
  g.userData.gunKey = 'kinetic';
  g.userData.gunBaseX = gunBaseX;
  g.userData.muzzle = MUZZLE;
  g.userData.mag = pKinetic.mag;
  g.userData.parts = { kinetic: pKinetic, compact: pCompact, energy: pEnergy, heavy: pHeavy };
  g.userData.flashSprites = flashSprites;
  g.userData.strobe = strobe;
  return g;
}

const enemyGeoCache = new Map();

function enemyGeometry(type, r) {
  const k = type + '|' + r;
  if (enemyGeoCache.has(k)) return enemyGeoCache.get(k);
  let geo;
  if (type === 'runner') geo = new THREE.ConeGeometry(r * 0.92, r * 2.3, 7);
  else if (type === 'swarm') geo = new THREE.IcosahedronGeometry(r, 0);
  else if (type === 'brute' || type === 'crusher') geo = new THREE.DodecahedronGeometry(r, 1);
  else geo = new THREE.IcosahedronGeometry(r, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.55 + y * 0.35) * 0.5 + Math.sin(z * 0.7 - x * 0.25) * 0.5;
    const s = 1 + n * 0.1;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  enemyGeoCache.set(k, geo);
  return geo;
}

function makeEnemyMesh(e) {
  const def = e.def;
  const r = def.r;
  if (def.kind) return makeDinoMesh(e);
  const g = new THREE.Group();
  const hi = !LOWQ;
  const lean = e.type === 'runner' || e.type === 'swarm';
  const boss = !!def.boss;
  const elite = !!def.elite;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color),
    emissive: new THREE.Color(def.color),
    emissiveIntensity: 0.18,
    roughness: 0.78,
    metalness: 0.06,
    flatShading: true
  });
  const flesh = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.72),
    roughness: 0.9,
    metalness: 0.03,
    flatShading: true
  });
  const shell = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.42),
    roughness: 0.5,
    metalness: 0.28,
    flatShading: true
  });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.72, metalness: 0.05, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.acid ? 0x8dff6a : boss ? 0xffd75e : 0xffe27a });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color) });
  mat.envMapIntensity = 0.35;
  flesh.envMapIntensity = 0.22;
  shell.envMapIntensity = 0.6;
  bone.envMapIntensity = 0.25;

  const bodyG = new THREE.Group();
  g.add(bodyG);

  const body = new THREE.Mesh(enemyGeometry(e.type, r), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  if (e.type === 'runner') {
    body.rotation.x = Math.PI / 2;
    body.position.y = r * 1.05;
    body.scale.set(1, 1, 0.9);
  } else if (e.type === 'swarm') {
    body.scale.set(1.2, 0.82, 1.2);
    body.position.y = r * 0.9;
  } else {
    body.scale.set(1.14, 0.76, 1.0);
    body.position.y = r * 1.0;
  }
  bodyG.add(body);

  // ---- carapace plates, sacs and dorsal spines ----
  if (!lean) {
    const hump = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 9, 7), flesh);
    hump.position.set(-r * 0.3, r * 1.56, 0);
    hump.scale.set(1.15, 0.42, 1.2);
    hump.castShadow = true;
    bodyG.add(hump);
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(r * (0.34 - i * 0.04), 8, 6, 0, TAU, 0, Math.PI * 0.55), shell);
      plate.position.set(-r * 0.5 + i * r * 0.42, r * 1.66 + i * r * 0.09, 0);
      plate.scale.set(1.55, 0.5, 1.6);
      bodyG.add(plate);
    }
    const spikes = boss ? 8 : elite ? 5 : 3;
    for (let i = 0; i < spikes; i++) {
      const t = i / Math.max(1, spikes - 1);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * (0.5 + t * 0.4), 5), shell);
      sp.position.set(-r * 0.55 + t * r * 0.75, r * (1.98 - t * 0.26), (i % 2 ? 1 : -1) * r * 0.3);
      sp.rotation.z = -0.4 - t * 0.5;
      sp.castShadow = true;
      bodyG.add(sp);
    }
    // sacs of bio-energy
    if (e.def.acid || e.type === 'shooty' || boss) {
      for (const s of [-1, 1]) {
        const sac = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 8, 6), glowMat);
        sac.position.set(-r * 0.2, r * 1.42, s * r * 0.62);
        sac.scale.set(1, 1.2, 0.9);
        bodyG.add(sac);
      }
    }
  }

  // ---- head, jaw and mandibles ----
  const headPos = e.type === 'runner' ? r * 1.62 : r * 1.18;
  const headY = e.type === 'runner' ? r * 1.12 : r * 1.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 8), flesh);
  head.scale.set(1.2, 0.82, 1.24);
  head.position.set(headPos, headY, 0);
  head.castShadow = true;
  bodyG.add(head);
  // brow ridge
  const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.12, r * 0.44), shell);
  brow.position.set(headPos + r * 0.1, headY + r * 0.24, 0);
  brow.rotation.z = -0.16;
  bodyG.add(brow);
  // eyes
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * (boss ? 0.12 : 0.09), 7, 5), eyeMat);
    eye.position.set(headPos + r * 0.16, headY + r * 0.27, s * r * 0.2);
    bodyG.add(eye);
  }
  // jaw + mandibles
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.16, r * 0.34), flesh);
  jaw.position.set(headPos + r * 0.22, headY - r * 0.19, 0);
  bodyG.add(jaw);
  for (const s of [-1, 1]) {
    const mand = new THREE.Mesh(new THREE.ConeGeometry(r * 0.07, r * 0.4, 5), bone);
    mand.position.set(headPos + r * 0.38, headY - r * 0.15, s * r * 0.17);
    mand.rotation.z = Math.PI / 2 + s * 0.25;
    mand.rotation.x = s * 0.3;
    bodyG.add(mand);
  }

  // ---- weapon arm for ranged units ----
  if (e.type === 'shooty' || e.def.acid || boss) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.2, r * 1.15, 8), shell);
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.set(r * 1.3, r * 1.05, 0);
    bodyG.add(barrel);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 8, 6), glowMat);
    tip.position.set(r * 1.86, r * 1.05, 0);
    bodyG.add(tip);
  }

  // ---- arms ----
  const arms = [];
  if (!lean) {
    for (const s of [-1, 1]) {
      const armG = new THREE.Group();
      armG.position.set(r * 0.12, r * 1.62, s * r * 0.84);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.19, r * 0.5, 3, 8), mat);
      upper.position.y = -r * 0.3;
      upper.castShadow = true;
      armG.add(upper);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, r * 0.34, 3, 7), flesh);
      fore.position.set(r * 0.1, -r * 0.66, 0);
      armG.add(fore);
      for (let c = 0; c < 2; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(r * 0.1, r * 0.4, 5), bone);
        claw.position.set(r * 0.18, -r * 0.88, (c ? 1 : -1) * r * 0.09);
        claw.rotation.x = Math.PI;
        claw.rotation.z = (c ? 1 : -1) * 0.2;
        armG.add(claw);
      }
      armG.rotation.z = 0.32;
      bodyG.add(armG);
      arms.push(armG);
    }
  }

  // ---- boss crown, core and aura ----
  if (boss) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.09, r * (0.46 + (i % 2) * 0.3), 5), bone);
      horn.position.set(headPos + Math.cos(a) * r * 0.42, headY + r * 0.1, Math.sin(a) * r * 0.46);
      horn.rotation.z = 0.3 + Math.cos(a) * 0.2;
      horn.rotation.x = Math.sin(a) * 0.5;
      bodyG.add(horn);
    }
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 9, 7, 0, TAU, 0, Math.PI * 0.6), shell);
      plate.position.set(0, r * 1.9, s * r * 0.72);
      plate.scale.set(1.3, 0.7, 1.2);
      bodyG.add(plate);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 8), glowMat);
    core.position.set(r * 0.42, r * 1.72, 0);
    bodyG.add(core);
    g.userData.core = core;
    g.userData.aura = null;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.5, r * 0.07, 6, 26),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = r * 1.05;
    bodyG.add(ring);
    g.userData.spin = ring;
    ring.userData.keep = true;
    const aura = new THREE.Mesh(
      new THREE.CircleGeometry(r * 2.4, 22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 2.2;
    g.add(aura);
    g.userData.aura = aura;
  }

  // ---- articulated legs: hip, knee, clawed foot ----
  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const legG = new THREE.Group();
    legG.position.set(0, r * (lean ? 0.82 : 0.74), s * r * (e.type === 'swarm' ? 0.6 : lean ? 0.28 : 0.45));
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.17, r * 0.36, 3, 7), flesh);
    thigh.position.y = -r * 0.22;
    thigh.castShadow = true;
    legG.add(thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -r * 0.4, 0);
    legG.add(knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.36, r * 0.22), shell);
    shin.position.set(r * 0.03, -r * 0.16, 0);
    knee.add(shin);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 7, 5), shell);
    knuckle.position.set(r * 0.02, 0, 0);
    knee.add(knuckle);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 0.46, r * 0.16, r * 0.3), flesh);
    foot.position.set(r * 0.12, -r * 0.38, 0);
    foot.castShadow = true;
    knee.add(foot);
    if (hi) {
      for (let c = 0; c < 2; c++) {
        const toe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.07, r * 0.2, 4), bone);
        toe.position.set(r * 0.32, -r * 0.4, (c ? 1 : -1) * r * 0.1);
        toe.rotation.z = -Math.PI / 2;
        knee.add(toe);
      }
    }
    g.add(legG);
    legs.push(legG);
    knees.push(knee);
  }

  if (!lean) {
    for (const s of [-1, 1]) {
      const limb = new THREE.Group();
      limb.position.set(-r * 0.28, r * 0.86, s * r * 0.5);
      limb.rotation.y = s * 2.1;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.12, r * 0.72, 2, 6), flesh);
      seg.rotation.z = Math.PI / 2;
      seg.position.x = -r * 0.4;
      seg.castShadow = true;
      limb.add(seg);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.1, r * 0.34, 4), bone);
      tip.position.set(-r * 0.86, 0, 0);
      tip.rotation.z = -Math.PI / 2;
      limb.add(tip);
      g.add(limb);
    }
  }

  addBlobShadow(g, def.r);

  // crowd mode: only bosses and elites get real shadow-map casters. Everyone
  // else keeps the cheap blob shadow, so a 40-strong field still renders fast.
  if (!boss && !elite) g.traverse(o => { if (o.isMesh) o.castShadow = false; });

  body.userData.keep = true;
  head.userData.keep = true;
  if (g.userData.core) g.userData.core.userData.keep = true;
  mergeGroupMeshes(bodyG);
  for (const a of arms) mergeGroupMeshes(a);
  for (const l of legs) mergeGroupMeshes(l);
  for (const k of knees) mergeGroupMeshes(k);

  g.userData.body = body;
  g.userData.bodyG = bodyG;
  g.userData.head = head;
  g.userData.legL = legs[0];
  g.userData.legR = legs[1];
  g.userData.kneeL = knees[0];
  g.userData.kneeR = knees[1];
  g.userData.armL = arms[0] || null;
  g.userData.armR = arms[1] || null;
  g.userData.core = g.userData.core || null;
  const baseScale = boss ? 1.44 : elite ? 1.3 : e.type === 'swarm' ? 1.05 : 1.2;
  g.userData.baseScale = baseScale;
  g.scale.setScalar(baseScale);
  g.position.set(e.x - HX, 0, e.y - HZ);
  scene.add(g);
  return g;
}

// ------------------------------------------------------------
//  Dinosaurs. One rig builder, six species: velociraptor, nightmare
//  raptor, dilophosaurus, ankylosaurus, spinosaurus and T-Rex.
//
//  Rig contract used by syncScene:
//    bodyG, head, jaw, legL/legR + kneeL/kneeR (bipeds),
//    legs4 (quadrupeds), tail[] segments, frill, core/spin/aura
// ------------------------------------------------------------
const DINO_TUNE = {
  raptor:    { hip: 1.00, neck: 0.30, snout: 0.46, head: 1.00, legs: 2, tail: 3, girth: 0.98, quills: true, scale: 1.34 },
  nightmare: { hip: 0.98, neck: 0.32, snout: 0.50, head: 1.06, legs: 2, tail: 3, girth: 1.02, quills: true, spines: true, scale: 1.4 },
  dilo:      { hip: 1.00, neck: 0.54, snout: 0.42, head: 0.94, legs: 2, tail: 3, girth: 0.94, frill: true, doubleCrest: true, scale: 1.34 },
  anky:      { hip: 0.62, neck: 0.16, snout: 0.36, head: 0.86, legs: 4, tail: 4, girth: 1.04, plates: true, club: true, scale: 1.2 },
  spino:     { hip: 1.05, neck: 0.42, snout: 0.78, head: 0.96, legs: 2, tail: 4, girth: 1.04, sail: true, scale: 1.25 },
  trex:      { hip: 1.08, neck: 0.26, snout: 0.62, head: 1.62, legs: 2, tail: 5, girth: 1.2, scale: 1.0 }
};

// One shared 128px scale pattern: gives the flat-shaded bodies a real hide
// surface without adding draw calls or textures per dinosaur.
let dinoScaleCache = null;
function makeDinoScaleTex() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 7) {
    const row = Math.floor(y / 7);
    for (let x = 0; x < S; x += 7) {
      const ox = (row % 2) * 3.5;
      const v = Math.random();
      g.fillStyle = v > 0.62 ? 'rgba(0,0,0,0.16)' : v > 0.3 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
      g.beginPath();
      g.ellipse(x + ox + 3.5, y + 3.5, 3.6, 2.9, 0, 0, TAU);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.2, 2.2);
  t.anisotropy = 4;
  return t;
}

function makeDinoMesh(e) {
  const def = e.def;
  const r = def.r;
  const kind = def.kind || 'raptor';
  const P = DINO_TUNE[kind] || DINO_TUNE.raptor;
  const boss = !!def.boss;
  const elite = !!def.elite;
  const g = new THREE.Group();

  const col = new THREE.Color(def.color);
  // individual variation so a pack of thirty reads as thirty animals
  col.offsetHSL((Math.random() - 0.5) * 0.025, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.07);
  const std = (c, rough, metal, glow) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, flatShading: true });
    if (glow) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0.45; }
    m.envMapIntensity = 0.38;
    return m;
  };
  // natural hide with a subtle violet projection sheen and glowing detail
  const hide = std(col, 0.68, 0.08, 0x2a1240);
  hide.emissiveIntensity = 0.16;
  const dark = std(col.clone().multiplyScalar(0.55), 0.72, 0.1, 0x1e0b33);
  const belly = std(0xcfcbb4, 0.8, 0.02, 0x2a1240);
  const bone = std(0xece6d6, 0.5, 0.04, 0x3a1a5c);
  const claw = std(0xd8d2c4, 0.42, 0.2, 0x5a2aa0);
  if (!dinoScaleCache) dinoScaleCache = makeDinoScaleTex();
  for (const m of [hide, dark, belly]) { m.map = dinoScaleCache; m.needsUpdate = true; }
  const crest = std(def.crest || 0xd65a2c, 0.56, 0.05, def.crest || 0xd65a2c);
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.eye || 0xffc63a });

  const hipY = r * P.hip;
  const bodyG = new THREE.Group();
  g.add(bodyG);
  const rig = new THREE.Group();
  rig.position.y = hipY;
  bodyG.add(rig);
  if (QUALITY !== 'low') {
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.86, r * 0.055, r * 0.075),
      new THREE.MeshBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    spine.position.set(0, P.hip * r * 0.62, 0);
    spine.userData.noMerge = true;
    bodyG.add(spine);
  }

  // ---- torso ----
  const girth = P.girth;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 14, 10), hide);
  torso.scale.set(1.85, 0.88 * girth, 0.82 * (kind === 'anky' ? 1.3 : 1));
  torso.position.set(-r * 0.05, 0, 0);
  torso.castShadow = true; torso.receiveShadow = true;
  torso.userData.keep = true;
  rig.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(r * 0.44, 12, 9), hide);
  chest.position.set(r * 0.45, r * 0.02, 0);
  chest.scale.set(1.05, 1.0 * girth, 0.92);
  chest.castShadow = true;
  rig.add(chest);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 10, 8), hide);
  hips.position.set(-r * 0.6, r * 0.02, 0);
  hips.scale.set(1.05, 0.98 * girth, 0.92);
  rig.add(hips);

  const gut = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 8), belly);
  gut.position.set(r * 0.02, -r * 0.26, 0);
  gut.scale.set(kind === 'anky' ? 1.6 : 1.75, 0.44, 0.76 * (kind === 'anky' ? 1.2 : 1));
  rig.add(gut);

  // dorsal striping on the hunters
  if (P.quills || P.sail) {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const band = new THREE.Mesh(new THREE.BoxGeometry(r * 0.1, r * 0.05, r * (0.72 - t * 0.1)), dark);
      band.position.set(r * (0.5 - t * 0.55), r * 0.3, 0);
      rig.add(band);
    }
  }

  // ---- ankylosaurus armour + tail club ----
  if (P.plates) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const plate = new THREE.Mesh(new THREE.SphereGeometry(r * 0.21, 8, 6, 0, TAU, 0, Math.PI * 0.55), dark);
      plate.position.set(r * (-0.68 + t * 1.32), r * 0.24, 0);
      plate.scale.set(1.45, 0.66, 1.85);
      rig.add(plate);
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const t = Math.floor(i / 2) / 3;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.1, r * 0.42, 4), bone);
      spike.position.set(r * (-0.55 + t * 1.15), r * 0.1, side * r * 0.62);
      spike.rotation.x = side * Math.PI * 0.45;
      rig.add(spike);
    }
  }

  // ---- spinosaurus sail ----
  if (P.sail) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const h = r * (0.4 + Math.sin(t * Math.PI) * 0.8);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(r * 0.15, h, r * 0.07), i % 2 ? crest : dark);
      plate.position.set(r * (-0.62 + t * 1.3), r * 0.22 + h * 0.42, 0);
      plate.rotation.z = -0.15 + t * 0.26;
      plate.castShadow = true;
      rig.add(plate);
    }
  }

  // ---- nightmare spines ----
  if (P.spines) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * (0.3 + t * 0.24), 4), crest);
      sp.position.set(r * (-0.6 + t * 1.2), r * 0.3, 0);
      sp.rotation.z = -0.55;
      rig.add(sp);
    }
  }

  // ---- neck + head ----
  const hs = P.head;
  const neckL = r * P.neck;
  const neckX = r * 0.86, neckY = r * 0.08;
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.2, neckL, 3, 7), hide);
  neck.position.set(neckX + neckL * 0.36, neckY + neckL * 0.44, 0);
  neck.rotation.z = -0.62;
  neck.castShadow = true;
  rig.add(neck);

  const headG = new THREE.Group();
  headG.position.set(neckX + neckL * 0.92, neckY + neckL * 0.98, 0);
  rig.add(headG);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(r * 0.23 * hs, 12, 9), hide);
  skull.scale.set(1.45, 0.92, 0.92);
  skull.castShadow = true;
  headG.add(skull);

  const snoutLen = r * P.snout * hs;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(snoutLen, r * 0.17 * hs, r * 0.24 * hs), hide);
  snout.position.set(r * 0.18 * hs + snoutLen * 0.4, r * 0.015, 0);
  headG.add(snout);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1 * hs, 8, 6), hide);
  noseTip.position.set(r * 0.18 * hs + snoutLen * 0.9, r * 0.02, 0);
  noseTip.scale.set(1.1, 0.85, 0.9);
  headG.add(noseTip);

  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.2 * hs, r * 0.06, r * 0.12 * hs), dark);
    brow.position.set(r * 0.1 * hs, r * 0.15 * hs, s * r * 0.13 * hs);
    brow.rotation.z = 0.14;
    headG.add(brow);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.05 * hs, 7, 5), eyeMat);
    eye.position.set(r * 0.12 * hs, r * 0.1 * hs, s * r * 0.16 * hs);
    headG.add(eye);
  }

  const toothH = r * 0.09 * hs;
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(r * 0.026, toothH, 4), bone);
    tooth.position.set(r * 0.12 * hs + (i / 5) * snoutLen * 0.88, -r * 0.09 * hs, (i % 2 ? 1 : -1) * r * 0.08 * hs);
    tooth.rotation.x = Math.PI;
    headG.add(tooth);
  }

  // hinged jaw
  const jawG = new THREE.Group();
  jawG.position.set(0, -r * 0.1 * hs, 0);
  headG.add(jawG);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(snoutLen * 0.92, r * 0.1 * hs, r * 0.2 * hs), belly);
  jaw.position.set(r * 0.16 * hs + snoutLen * 0.44, 0, 0);
  jawG.add(jaw);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(r * 0.024, r * 0.08 * hs, 4), bone);
    tooth.position.set(r * 0.12 * hs + (i / 4) * snoutLen * 0.82, r * 0.05, (i % 2 ? 1 : -1) * r * 0.07 * hs);
    jawG.add(tooth);
  }

  // dilophosaurus double crest
  if (P.doubleCrest) {
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.1, r * 0.36, 4), crest);
      c.position.set(-r * 0.02, r * 0.12, s * r * 0.06);
      c.rotation.z = -0.4;
      c.rotation.x = s * 0.14;
      headG.add(c);
    }
  }
  // quilled hunters
  if (P.quills) {
    for (let i = 0; i < 5; i++) {
      const q = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * (0.34 + i * 0.03), 4), crest);
      q.position.set(r * (0.26 - i * 0.09), r * 0.2, 0);
      q.rotation.z = -0.85 - i * 0.12;
      q.castShadow = true;
      headG.add(q);
    }
  }

  // ---- dilophosaurus neck frill ----
  let frill = null;
  if (P.frill) {
    frill = new THREE.Group();
    frill.position.set(r * 0.78, r * 0.3, 0);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * Math.PI * 1.25;
      const plate = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.6, 4), crest);
      plate.position.set(-r * 0.06, Math.sin(a) * r * 0.3, Math.cos(a) * r * 0.3);
      plate.rotation.x = a;
      plate.rotation.z = -1.35;
      frill.add(plate);
    }
    rig.add(frill);
  }

  // ---- tail ----
  const tailG = new THREE.Group();
  tailG.position.set(-r * 0.92, r * 0.05, 0);
  rig.add(tailG);
  const tailSegs = [];
  let parent = tailG;
  for (let i = 0; i < P.tail; i++) {
    const seg = new THREE.Group();
    seg.position.x = i === 0 ? 0 : -r * 0.36;
    const len = r * (2.0 / P.tail) * (1 - i * 0.12);
    const rad = Math.max(r * 0.035, r * (0.2 - i * 0.045));
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 2, 6), i % 2 ? dark : hide);
    m.rotation.z = Math.PI / 2;
    m.position.x = -len / 2;
    m.castShadow = true;
    seg.add(m);
    parent.add(seg);
    parent = seg;
    tailSegs.push(seg);
  }
  if (P.club) {
    const club = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 9, 7), dark);
    club.scale.set(1.4, 0.88, 1.1);
    club.position.x = -r * 0.22;
    parent.add(club);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.07, r * 0.28, 4), bone);
      sp.position.set(-r * 0.22 + Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.22, 0);
      sp.rotation.z = Math.PI / 2 + a;
      parent.add(sp);
    }
  }
  if (P.sail) {
    for (let s = 0; s < 2; s++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.4, 4), crest);
      f.position.set(-r * 0.3, r * 0.02, (s ? 1 : -1) * r * 0.05);
      f.rotation.z = Math.PI / 2;
      f.rotation.x = (s ? 1 : -1) * 0.4;
      parent.add(f);
    }
  }

  // ---- forelimbs (built straight onto the rig so they merge by material) ----
  if (P.legs === 2) {
    for (const s of [-1, 1]) {
      const ax = r * 0.55, ay = -r * 0.02, az = s * r * 0.3;
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.075, r * 0.2, 2, 6), hide);
      upper.position.set(ax + r * 0.08, ay - r * 0.1, az);
      upper.rotation.z = 0.55;
      rig.add(upper);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.055, r * 0.15, 2, 6), belly);
      fore.position.set(ax + r * 0.19, ay - r * 0.21, az);
      fore.rotation.z = -0.4;
      rig.add(fore);
      for (let c = 0; c < 2; c++) {
        const k = new THREE.Mesh(new THREE.ConeGeometry(r * 0.03, r * 0.15, 4), claw);
        k.position.set(ax + r * 0.26, ay - r * 0.31, az + (c ? 1 : -1) * r * 0.03);
        k.rotation.z = Math.PI * 0.9;
        rig.add(k);
      }
    }
  }

  // ---- legs ----
  const legs = [], knees = [], legs4 = [];
  const legMul = kind === 'trex' ? 1.32 : kind === 'spino' ? 1.1 : 1;
  if (P.legs === 2) {
    for (const s of [-1, 1]) {
      const legG = new THREE.Group();
      legG.position.set(-r * 0.14, hipY, s * r * (kind === 'trex' ? 0.36 : 0.4));
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.19 * legMul, r * 0.42, 3, 7), hide);
      thigh.position.set(r * 0.02, -r * 0.22, 0);
      thigh.rotation.z = -0.3;
      thigh.castShadow = true;
      legG.add(thigh);
      const knee = new THREE.Group();
      knee.position.set(r * 0.1, -r * 0.46, 0);
      legG.add(knee);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.13 * legMul, r * 0.34, 2, 6), hide);
      shin.position.set(-r * 0.03, -r * 0.17, 0);
      shin.rotation.z = 0.2;
      knee.add(shin);
      const ankle = new THREE.Mesh(new THREE.SphereGeometry(r * 0.11, 7, 5), hide);
      ankle.position.set(-r * 0.06, -r * 0.35, 0);
      knee.add(ankle);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 0.42 * legMul, r * 0.1, r * 0.24 * legMul), hide);
      foot.position.set(r * 0.1, -r * 0.41, 0);
      knee.add(foot);
      for (let c = 0; c < 3; c++) {
        const toe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.045, r * 0.18, 4), bone);
        toe.position.set(r * 0.31, -r * 0.43, (c - 1) * r * 0.09);
        toe.rotation.z = -Math.PI / 2;
        knee.add(toe);
      }
      if (kind === 'raptor' || kind === 'nightmare' || kind === 'dilo') {
        const sickle = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.26, 4), claw);
        sickle.position.set(r * 0.2, -r * 0.34, s * r * 0.02);
        sickle.rotation.z = Math.PI * 0.62;
        knee.add(sickle);
      }
      g.add(legG);
      legs.push(legG);
      knees.push(knee);
    }
  } else {
    for (const fx of [0.52, -0.52]) {
      for (const s of [-1, 1]) {
        const legG = new THREE.Group();
        legG.position.set(r * fx, hipY, s * r * 0.48);
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, r * 0.28, 2, 6), hide);
        upper.position.set(0, -r * 0.16, 0);
        legG.add(upper);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 0.36, r * 0.1, r * 0.3), dark);
        foot.position.set(r * 0.06, -r * 0.34, 0);
        legG.add(foot);
        for (let c = 0; c < 3; c++) {
          const toe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.04, r * 0.16, 4), bone);
          toe.position.set(r * 0.26, -r * 0.35, (c - 1) * r * 0.1);
          toe.rotation.z = -Math.PI / 2;
          legG.add(toe);
        }
        mergeGroupMeshes(legG);
        g.add(legG);
        legs4.push(legG);
      }
    }
  }

  addBlobShadow(g, r * 1.15);

  // boss presence: glowing core, spinning halo, ground aura
  let core = null, halo = null, aura = null;
  if (boss) {
    core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color) }));
    core.position.set(r * 0.5, r * 0.1, 0);
    core.userData.keep = true;
    rig.add(core);

    halo = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.6, r * 0.05, 6, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -r * 0.9;
    halo.userData.keep = true;
    rig.add(halo);

    aura = new THREE.Mesh(
      new THREE.CircleGeometry(r * 2.6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 2.4;
    g.add(aura);
  }

  mergeGroupMeshes(rig);
  mergeGroupMeshes(headG);
  mergeGroupMeshes(jawG);
  mergeGroupMeshes(tailG);
  if (frill) mergeGroupMeshes(frill);
  for (const l of legs) mergeGroupMeshes(l);
  for (const k of knees) mergeGroupMeshes(k);

  // crowds stay cheap: only bosses and marked elites cast real shadows
  if (!boss && !elite) g.traverse(o => { if (o.isMesh) o.castShadow = false; });

  g.userData.body = torso;
  g.userData.bodyG = bodyG;
  g.userData.head = headG;
  g.userData.jaw = jawG;
  g.userData.legL = legs[0] || null;
  g.userData.legR = legs[1] || null;
  g.userData.kneeL = knees[0] || null;
  g.userData.kneeR = knees[1] || null;
  g.userData.legs4 = legs4.length ? legs4 : null;
  g.userData.armL = null;
  g.userData.armR = null;
  g.userData.frill = frill;
  g.userData.core = core;
  g.userData.spin = halo;
  g.userData.aura = aura;
  g.userData.tail = tailSegs;
  const baseScale = (boss ? (def.alpha ? 1.35 : P.scale) : (elite ? P.scale * 1.12 : P.scale));
  g.userData.baseScale = baseScale;
  g.scale.setScalar(baseScale);
  g.position.set(e.x - HX, 0, e.y - HZ);
  scene.add(g);
  return g;
}


// pools
const bulletGeo = new THREE.CylinderGeometry(2.6, 2.6, 1, 6);
bulletGeo.rotateZ(Math.PI / 2);
const bulletMats = new Map();
function bulletMaterial(hex) {
  if (!bulletMats.has(hex)) {
    bulletMats.set(hex, new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }
  return bulletMats.get(hex);
}
const bulletPool = [];
function takeBulletMesh(hex, scale) {
  const m = bulletPool.pop() || new THREE.Mesh(bulletGeo, bulletMaterial(hex));
  m.material = bulletMaterial(hex);
  m.scale.setScalar(scale || 1);
  m.visible = true;
  scene.add(m);
  return m;
}
function releaseBulletMesh(m) {
  if (!m) return;
  scene.remove(m);
  bulletPool.push(m);
}

const gemGeo = new THREE.OctahedronGeometry(9, 0);
const gemMat = new THREE.MeshStandardMaterial({ color: 0x8dffc4, emissive: 0x2fff9a, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.25, flatShading: true });
const gemPool = [];
function takeGemMesh() {
  const m = gemPool.pop() || new THREE.Mesh(gemGeo, gemMat);
  m.visible = true;
  scene.add(m);
  return m;
}
function releaseGemMesh(m) {
  if (!m) return;
  scene.remove(m);
  gemPool.push(m);
}

const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
// Shockwave rings used to allocate a fresh mesh AND material on every hit,
// which leaked GPU memory over a long run and fed the garbage collector exactly
// when the screen was busy. They are pooled per colour instead.
const ringPool = new Map();
function takeRingMesh(hex) {
  const key = String(hex);
  let arr = ringPool.get(key);
  if (!arr) { arr = []; ringPool.set(key, arr); }
  let m = arr.pop();
  if (!m) {
    m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(key), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.rotation.x = -Math.PI / 2;
    m.userData.ringKey = key;
  }
  m.visible = true;
  m.material.opacity = 0.9;
  m.position.y = 3;
  m.scale.setScalar(1);
  scene.add(m);
  return m;
}
function releaseRingMesh(m) {
  if (!m) return;
  scene.remove(m);
  const arr = ringPool.get(m.userData.ringKey);
  if (arr) arr.push(m);
}

// particles as one point cloud
const MAXP = 1500;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAXP * 3);
const pCol = new Float32Array(MAXP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({
  size: 11, vertexColors: true, transparent: true, opacity: 0.8,
  map: softDotTex, alphaTest: 0.02,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

// ------------------------------------------------------------
//  Smoke: one draw call, per-particle size and alpha so it can
//  billow and fade like a real plume instead of glowing dots.
// ------------------------------------------------------------
const MAXSMOKE = Math.round(Q.smoke);
const smoke = [];
const sGeo = new THREE.BufferGeometry();
const sPosA = new Float32Array(MAXSMOKE * 3);
const sColA = new Float32Array(MAXSMOKE * 3);
const sSizeA = new Float32Array(MAXSMOKE);
const sAlphaA = new Float32Array(MAXSMOKE);
sGeo.setAttribute('position', new THREE.BufferAttribute(sPosA, 3));
sGeo.setAttribute('aColor', new THREE.BufferAttribute(sColA, 3));
sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSizeA, 1));
sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlphaA, 1));
const smokeMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: softDotTex } },
  vertexShader: [
    'attribute vec3 aColor;',
    'attribute float aSize;',
    'attribute float aAlpha;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vColor = aColor; vAlpha = aAlpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (760.0 / max(1.0, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D uTex;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  float a = t.a * vAlpha;',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n'),
  transparent: true,
  depthWrite: false
});
const smokePoints = new THREE.Points(sGeo, smokeMat);
smokePoints.frustumCulled = false;
scene.add(smokePoints);

const smokeColorCache = new Map();
function smokeColor(tint) {
  if (!smokeColorCache.has(tint)) smokeColorCache.set(tint, new THREE.Color(tint));
  return smokeColorCache.get(tint);
}
function smokeCloud(x, y, count, tint, size, spread, life) {
  if (FX_SCALE < 1) count = Math.max(1, Math.round(count * FX_SCALE));
  const base = smokeColor(tint || '#6f6a62');
  for (let i = 0; i < count; i++) {
    if (smoke.length >= MAXSMOKE) smoke.shift();
    const a = rand(0, TAU), sp = rand(6, spread || 40);
    const lf = Math.max(0.2, life || 0.9);
    smoke.push({
      x, y, z: rand(6, 22),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(8, 32),
      life: rand(lf * 0.55, lf), max: lf,
      size: rand((size || 30) * 0.55, size || 30),
      r: base.r * rand(0.72, 1.05), g: base.g * rand(0.72, 1.05), b: base.b * rand(0.72, 1.05),
      grow: rand(0.7, 1.5)
    });
  }
}
function updateSmoke(dt) {
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.life -= dt;
    if (p.life <= 0) { smoke.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const f = Math.max(0, 1 - 1.7 * dt);
    p.vx *= f;
    p.vy *= f;
    p.vz = p.vz * 0.97 + 16 * dt;
    p.size += p.grow * dt * 30;
  }
  for (let i = 0; i < MAXSMOKE; i++) {
    const p = smoke[i];
    const i3 = i * 3;
    if (!p) {
      sAlphaA[i] = 0;
      sSizeA[i] = 0;
      sPosA[i3 + 1] = -9999;
      continue;
    }
    sPosA[i3] = p.x - HX;
    sPosA[i3 + 1] = p.z;
    sPosA[i3 + 2] = p.y - HZ;
    sColA[i3] = p.r;
    sColA[i3 + 1] = p.g;
    sColA[i3 + 2] = p.b;
    const a = clamp(p.life / p.max, 0, 1);
    sAlphaA[i] = a * a * 0.32;
    sSizeA[i] = p.size;
  }
  sGeo.attributes.position.needsUpdate = true;
  sGeo.attributes.aColor.needsUpdate = true;
  sGeo.attributes.aSize.needsUpdate = true;
  sGeo.attributes.aAlpha.needsUpdate = true;
}

const FLASH_WHITE = new THREE.Color('#ffffff');
const FLASH_NONE = new THREE.Color(0x000000);

const colorCache = new Map();
function rgbOf(hex) {
  if (colorCache.has(hex)) return colorCache.get(hex);
  const c = new THREE.Color(hex);
  const v = [c.r, c.g, c.b];
  colorCache.set(hex, v);
  return v;
}

// ------------------------------------------------------------
//  Input
// ------------------------------------------------------------
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'escape' && (G.state === 'playing' || G.state === 'paused')) togglePause();
  if (k === ' ' && G.state === 'playing') G.player.jumpQueued = true;
  if (k === 'e' && G.state === 'playing') useAirstrike();
  if (k === 'f' && G.state === 'playing') useMedkit();
  if (k === 'r' && G.state === 'playing') useAbility();
  if (k === 'q' && G.state === 'playing') switchSlot();
  if (k === 'm') Sound.toggle();
  if (k === 'enter' && G.coop && G.state === 'playing') e.preventDefault();
  if (k === 'enter' && G.state === 'shop') nextWave();
  if (k === 'r' && G.state === 'over') startRun();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointer.down = false; });

function localPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', e => {
  const p = localPos(e);
  for (const hit of hudHits) {
    if (p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h) {
      if (hit.id === 'air') useAirstrike();
      if (hit.id === 'med') useMedkit();
      if (hit.id === 'ult') useAbility();
      if (hit.id === 'swap') switchSlot();
      if (hit.id === 'jump') G.player.jumpQueued = true;
      return;
    }
  }
  if (e.pointerType === 'mouse') {
    pointer.x = p.x; pointer.y = p.y; pointer.down = true; pointer.inside = true;
  } else {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (p.x < VW * 0.5) {
      if (!sticks.move) sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    } else if (!sticks.aim) {
      sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
  }
});

canvas.addEventListener('pointermove', e => {
  const p = localPos(e);
  if (e.pointerType === 'mouse') { pointer.x = p.x; pointer.y = p.y; return; }
  if (sticks.move && sticks.move.id === e.pointerId) { sticks.move.x = p.x; sticks.move.y = p.y; }
  if (sticks.aim && sticks.aim.id === e.pointerId) { sticks.aim.x = p.x; sticks.aim.y = p.y; }
});

function endPointer(e) {
  if (e.pointerType === 'mouse') { pointer.down = false; return; }
  if (sticks.move && sticks.move.id === e.pointerId) sticks.move = null;
  if (sticks.aim && sticks.aim.id === e.pointerId) sticks.aim = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { pointer.inside = false; pointer.down = false; } });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ------------------------------------------------------------
//  Camera / projections
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

function pointerWorld(sx, sy) {
  ndc.set((sx / VW) * 2 - 1, -(sy / VH) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    return { x: G.player ? G.player.x : HX, y: G.player ? G.player.y : HZ };
  }
  return { x: hitPoint.x + HX, y: hitPoint.z + HZ };
}

const projV = new THREE.Vector3();
function project(x, y, height) {
  projV.set(x - HX, height || 0, y - HZ).project(camera);
  return {
    x: (projV.x * 0.5 + 0.5) * VW,
    y: (-projV.y * 0.5 + 0.5) * VH,
    visible: projV.z < 1
  };
}

function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const aspect = VW / Math.max(1, VH);
  const fit = clamp(1.08 / Math.min(1, aspect), 1, 2.0);
  // steeper top-down angle: more battlefield per screen, no wasted sky
  const back = 548 * fit, up = 612 * fit;
  const lead = 40;
  const ax = Math.cos(p.angle) * lead, az = Math.sin(p.angle) * lead;
  const spd = Math.hypot(p.vx, p.vy);
  const tx = p.x - HX + ax * 0.55, tz = p.y - HZ + az * 0.55;
  const tx2 = tx, tz2 = tz + back + spd * 0.05;
  const k = 1 - Math.pow(0.00008, dt);
  camState.pos.lerp(new THREE.Vector3(tx2, up, tz2), k);
  if (!camState.init) { camState.pos.set(tx2, up, tz2); camState.look.set(tx, 20, tz); camState.init = true; }

  camera.position.copy(camState.pos);
  if (G.shake > 0.05) {
    camera.position.x += rand(-1, 1) * G.shake * 2.4;
    camera.position.y += rand(-1, 1) * G.shake * 2.0;
    camera.position.z += rand(-1, 1) * G.shake * 1.6;
  }
  camState.look.lerp(new THREE.Vector3(tx + ax * 0.45 + p.vx * 0.1, 46, tz + 28 + az * 0.45 + p.vy * 0.1), k * 0.9);
  camera.lookAt(camState.look);
  camera.updateMatrixWorld();

  key.position.set(tx - 420, 950, tz + 380);
  key.target.position.set(tx, 0, tz);
  key.target.updateMatrixWorld();
}

// ------------------------------------------------------------
//  Entities
// ------------------------------------------------------------
function maxHpFor(tier, ch) {
  const id = (ch && ch.id) || G.charId;
  return Math.round(ARMOR[tier].hp * ((ch && ch.hp) || 100) / 100 * charStatMul(id));
}

function playerMaxHp() {
  const ch = (G.player && G.player.char) || CBY[G.charId] || CHARACTERS[0];
  return maxHpFor(G.armorTier, ch) + (G.level - 1) * 8;
}

function makeFighter(x, y, isBro, ch) {
  const c = ch || CHARACTERS[0];
  const f = {
    x, y, vx: 0, vy: 0, r: c.r, angle: -Math.PI / 2,
    hp: 100, maxHp: 100,
    fireCd: 0, muzzle: 0, hurt: 0, downed: false,
    z: 0, vz: 0, crouch: 0, reloadT: 0, reloadMax: 0.5, walk: 0, deathT: 0,
    isBro, bob: rand(0, TAU), recoul: 0,
    char: c, color: c.color, dark: c.dark, skin: c.skin,
    speed: c.speed, dmgMul: c.dmg * charStatMul(c.id), rateMul: c.rate,
    baseDmgMul: c.dmg * charStatMul(c.id), baseRateMul: c.rate,
    ultCd: 0, buffT: 0, buffMax: 0, buffKind: null, invulnT: 0,
    mesh: null
  };
  f.maxHp = isBro ? Math.round(c.hp * 1.15) : maxHpFor(0, c);
  f.hp = f.maxHp;
  f.mesh = makeFighterMesh(c);
  f.mesh.scale.set(1.45 * 0.96, 1.45 * 1.08, 1.45 * 0.96);
  f.mesh.position.set(x - HX, 0, y - HZ);
  scene.add(f.mesh);
  return f;
}

function disposeFighter(f) {
  if (f && f.mesh) { scene.remove(f.mesh); f.mesh = null; }
}

function resetRun() {
  G.wave = 0; G.kills = 0; G.banner = null;
  G.enemies.forEach(e => { if (e.mesh) scene.remove(e.mesh); });
  G.bullets.forEach(b => releaseBulletMesh(b.mesh));
  G.gems.forEach(g => releaseGemMesh(g.mesh));
  G.rings.forEach(r => releaseRingMesh(r.mesh));
  G.enemies = []; G.bullets = []; G.gems = []; G.parts = []; G.rings = []; G.floats = [];
  for (const c of G.corpses) scene.remove(c.mesh);
  smoke.length = 0;
  for (const d of G.decals) releaseDecalMesh(d.mesh);
  for (const b of G.booms) {
    if (b.mesh) scene.remove(b.mesh);
    if (b.core) scene.remove(b.core);
    if (b.slot) { b.slot.light.intensity = 0; b.slot.busy = false; }
  }
  for (const c of casings) scene.remove(c.mesh);
  G.corpses = []; G.decals = []; G.booms = []; casings.length = 0;
  // coins, level, xp, guns, armor and bro all carry over from saved progress
  G.airstrikes = clamp(G.airstrikes, 0, kitMax());
  G.medkits = clamp(G.medkits, 0, kitMax());
  if (!(G.owned instanceof Set) || !G.owned.size) G.owned = new Set(['pistol']);
  G.owned.add('pistol');
  if (!Array.isArray(G.slots) || G.slots.length !== 2) G.slots = ['pistol', 'pistol'];
  G.slots = G.slots.map(id => (WBY[id] && G.owned.has(id) ? id : 'pistol'));
  G.slot = G.slot === 1 ? 1 : 0;
  G.armorTier = clamp(G.armorTier | 0, 0, ARMOR.length - 1);
  disposeFighter(G.player);
  disposeFighter(G.bro);
  G.player = makeFighter(PLAYER_SPAWN.x - 58, PLAYER_SPAWN.z, false, CBY[G.charId] || CHARACTERS[0]);
  G.bro = makeFighter(PLAYER_SPAWN.x + 58, PLAYER_SPAWN.z, true, CBY[G.partnerId] || CHARACTERS[1]);
  G.player.maxHp = playerMaxHp();
  G.player.hp = G.player.maxHp;
  G.player.ultCd = 0; G.player.buffT = 0; G.player.buffKind = null; G.player.invulnT = 0;
  G.bro.maxHp = Math.round(G.bro.char.hp * 1.15) + (G.level - 1) * 8;
  G.bro.hp = G.bro.maxHp;
  G.shake = 0; G.flash = 0; G.time = 0;
  camState.init = false;
}

// Every deployment gets the next battlefield from a shuffled bag, so all maps
// appear before any repeats and the player never picks one by hand.
function shuffleMapBag() {
  const ids = MAPS.map(m => m.id).filter(id => id !== G.mapId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
  }
  if (G.mapId) ids.push(G.mapId);
  G.mapBag = ids;
}

function nextMapId() {
  if (!Array.isArray(G.mapBag) || !G.mapBag.length) shuffleMapBag();
  let id = G.mapBag.pop();
  if (!MBY[id]) id = MAPS[0].id;
  if (id === G.mapId) {
    // a saved bag can still end on the map you just left: swap it for any other
    const other = G.mapBag.find(x => x !== G.mapId && MBY[x]);
    if (other) {
      G.mapBag.splice(G.mapBag.indexOf(other), 1);
      G.mapBag.push(id);
      id = other;
    } else {
      const pool = MAPS.filter(m => m.id !== G.mapId);
      id = pool[randInt(0, pool.length - 1)].id;
    }
  }
  return id;
}

function startRun() {
  resize();
  Sound.warm();
  // New run, new battlefield: rotate automatically, while the overlay is up.
  const nextId = nextMapId();
  if (nextId !== G.mapId || currentMapId !== nextId) {
    G.mapId = nextId;
    buildArena(MBY[nextId] || MAPS[0]);
  }
  const idx = Math.max(0, CHARACTERS.findIndex(c => c.id === G.charId));
  G.charId = CHARACTERS[idx].id;
  G.partnerId = CHARACTERS[(idx + 1) % CHARACTERS.length].id;
  resetRun();
  hideOverlay();
  G.state = 'playing';
  beginWave(1);
}

// ------------------------------------------------------------
//  Campaign pacing — every wave is a timed engagement.
//  Waves 1-5: 2-3 min, 6-10: 3-4, 11-20: 4-5, 21-25: 5-7,
//  26-49: 5-6, wave 50 (Alpha Velociraptor): 8-10.
// ------------------------------------------------------------
const WAVE_BANDS = [
  { upTo: 5,  min: 120, max: 180, pace: 3.4 },
  { upTo: 10, min: 180, max: 240, pace: 2.9 },
  { upTo: 20, min: 240, max: 300, pace: 2.3 },
  { upTo: 25, min: 300, max: 420, pace: 2.0 },
  { upTo: 49, min: 300, max: 360, pace: 1.8 },
  { upTo: 50, min: 480, max: 600, pace: 2.4 }
];

function waveBand(n) {
  // endless waves past the campaign keep the 5-6 minute pressure of rounds 26-49
  if (n > G.campaign) return WAVE_BANDS[WAVE_BANDS.length - 2];
  for (const b of WAVE_BANDS) if (n <= b.upTo) return b;
  return WAVE_BANDS[WAVE_BANDS.length - 1];
}

// deterministic length inside the band, so a retried wave keeps the same clock
function waveDuration(n) {
  const b = waveBand(n);
  const t = ((n * 9301 + 49297) % 233280) / 233280;
  return Math.round(b.min + (b.max - b.min) * (0.25 + t * 0.5));
}

// the field is kept crowded, but bigger species arrive in smaller herds:
// 32 raptors from wave 1, fewer ankylosaurs, even fewer spinosaurs
const FIELD_SIZE_MUL = { raptor: 1, dilo: 0.85, anky: 0.62, spino: 0.5, nightmare: 0.95 };
function fieldTarget(n) {
  const base = MOBILE_GPU ? 22 : 32;
  const grow = MOBILE_GPU ? 0.45 : 0.75;
  const mul = FIELD_SIZE_MUL[dinoSpecies(n)] || 1;
  return Math.min(enemyCap(), Math.max(10, Math.round((base + (n - 1) * grow) * mul)));
}

// difficulty curve: health, damage, speed and aggression all climb with the round
function waveHpScale(n)  { return 1 + (n - 1) * 0.17; }
function waveDmgScale(n) { return 1 + Math.min(0.8, (n - 1) * 0.02); }
function waveSpdScale(n) { return 1 + Math.min(0.45, (n - 1) * 0.022); }
function waveAggro(n)    { return 1 - Math.min(0.38, (n - 1) * 0.009); }

function enemyCap() { return Math.round((MOBILE_GPU ? 26 : 46) * Q.enemies); }

function bossForWave(n) {
  if (n === G.campaign) return 'alpha';      // wave 50: Alpha Velociraptor
  if (n >= 21 && n <= 25) return 'trex';     // waves 21-25: T-Rex bosses
  if (n > G.campaign && n % 10 === 0) return 'trex';
  return null;
}

// which species holds the field on a given wave
function dinoSpecies(n) {
  if (n === G.campaign) return 'raptor';   // 50: the Alpha's own pack
  if (n <= 5) return 'raptor';        // 1-5   Velociraptors
  if (n <= 10) return 'dilo';         // 6-10  Dilophosaurus
  if (n <= 15) return 'anky';         // 11-15 Ankylosaurus
  if (n <= 20) return 'spino';        // 16-20 Spinosaurus
  if (n <= 25) return 'raptor';       // 21-25 T-Rex escort packs
  return 'nightmare';                 // 26-49 Nightmare Velociraptors
}

function beginWave(n) {
  G.wave = n;
  G.spawnQueue = [];
  G.waveLen = waveDuration(n);
  G.waveT = 0;
  G.waveTotal = fieldTarget(n);
  G.spawnTimer = 0.3;
  G.bossWave = bossForWave(n);
  G.bossSpawned = false;
  G.bossAt = G.bossWave ? G.waveLen * (G.bossWave === 'alpha' ? 0.28 : 0.22) : 0;
  G.ambushes = [];
  if (n >= 6) {
    const rolls = n >= 26 ? 2 : 1;
    const chance = n >= 26 ? 0.8 : 0.5;
    for (let i = 0; i < rolls; i++) {
      if (Math.random() < chance) G.ambushes.push(G.waveLen * rand(0.2, 0.85));
    }
    G.ambushes.sort((a, b) => a - b);
  }
  G.waveMode = null;
  G.damageTaken = false;
  G.cleared = false;
  G.clearTimer = 0;
  const boss = bossForWave(n);
  const final = n === G.campaign;
  const mm = Math.floor(G.waveLen / 60), ss = G.waveLen - mm * 60;
  G.banner = final
    ? { text: 'ALPHA HUNT', sub: 'Wave 50 — the Alpha Velociraptor has your scent', t: 3.4, color: '#8dff6a' }
    : { text: boss ? 'BOSS WAVE' : 'WAVE ' + n, sub: boss ? (ENEMIES[boss].name + ' is coming') : n > G.campaign ? 'ENDLESS — they never stop' : 'T.O.O.L. inbound · ' + mm + ':' + String(ss).padStart(2, '0'), t: 2.2, color: boss ? '#c04dff' : '#c9a8ff' };
  if (G.player.hp < G.player.maxHp) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.3);
  G.bro.downed = false;
  G.bro.hp = G.bro.maxHp;
  G.player.x = clamp(G.player.x, 80, WORLD.w - 80);
  G.player.y = clamp(G.player.y, 80, WORLD.h - 80);
}

// reinforcements: the wave's species, with nightmare alphas mixed in late
function pickEnemyType(n) {
  const sp = dinoSpecies(n);
  if (sp === 'nightmare' && n >= 32 && Math.random() < 0.18) return 'nmElite';
  return sp;
}

function spawnPoint() {
  // The field is much larger now, so most breaches come in on a ring around
  // the player (never inside a building) while the gate lanes still produce
  // the big frontal pushes.
  for (let tries = 0; tries < 14; tries++) {
    let x, y;
    if (Math.random() < 0.42) {
      const lane = ENEMY_LANES[randInt(0, ENEMY_LANES.length - 1)];
      x = clamp(lane.x + rand(-90, 90), 120, WORLD.w - 120);
      y = clamp(lane.z + rand(-90, 90), 120, WORLD.h - 120);
    } else {
      const a = rand(0, TAU), r = rand(720, 1060);
      x = clamp(G.player.x + Math.cos(a) * r, 120, WORLD.w - 120);
      y = clamp(G.player.y + Math.sin(a) * r, 120, WORLD.h - 120);
    }
    if (Math.hypot(x - G.player.x, y - G.player.y) < 480) continue;
    if (pointBlocked(x, y, 46)) continue;
    return { x, y };
  }
  const lane = ENEMY_LANES[randInt(0, ENEMY_LANES.length - 1)];
  return { x: lane.x, y: lane.z };
}

function spawnEnemy(type, overrides) {
  const def = ENEMIES[type] || ENEMIES.raptor;
  const p = (overrides && overrides.at) || spawnPoint();
  const scale = (def.boss ? 1 + (G.wave - 1) * 0.085 : waveHpScale(G.wave)) * (overrides && overrides.hpMul || 1);
  const aggro = waveAggro(G.wave);
  const e = {
    type, def,
    x: p.x, y: p.y, vx: 0, vy: 0, r: def.r, angle: 0,
    hp: def.hp * scale,
    maxHp: def.hp * scale,
    speed: def.speed * waveSpdScale(G.wave),
    dmgScale: waveDmgScale(G.wave) + (def.alpha ? 0.15 : 0),
    aggro,
    spawnT: def.boss ? 1.1 : 0.5,
    hitFlash: 0, hitCd: 0, shootCd: rand(0.6, 1.8) * aggro, wob: rand(0, TAU),
    stunT: 0, summonCd: 5 * aggro, slamCd: 3.5 * aggro,
    leapCd: rand(2.2, 4), leapWind: 0, leapT: 0, leapVX: 0, leapVY: 0, leapHit: false,
    mesh: null
  };
  e.mesh = makeEnemyMesh(e);
  // never leave a dinosaur standing inside a wall
  pushOutObstacles(e);
  G.enemies.push(e);
  return e;
}

function removeEnemyMesh(e) {
  if (e.mesh) { scene.remove(e.mesh); e.mesh = null; }
}

// ------------------------------------------------------------
//  Effects
// ------------------------------------------------------------
function burst(x, y, color, count, power, size) {
  if (FX_SCALE < 1) count = Math.max(2, Math.round(count * FX_SCALE));
  for (let i = 0; i < count; i++) {
    if (G.parts.length >= MAXP) return;
    const a = rand(0, TAU), s = rand(power * 0.2, power);
    G.parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.25, 0.65), max: 0.65, color,
      size: size || rand(1.5, 3.6), drag: rand(2.5, 5.5)
    });
  }
}

function ring(x, y, color, maxR, life, width) {
  const mesh = takeRingMesh(color);
  G.rings.push({ x, y, r: maxR * 0.15, maxR, life, max: life, color, width: width || 3, mesh });
}

function floatText(x, y, text, color) {
  G.floats.push({ x, y, text, color, life: 0.9, max: 0.9, vy: -46 });
}

// ------------------------------------------------------------
//  Combat
// ------------------------------------------------------------
function shoot(f, weapon, angle) {
  f.fireCd = 1 / (weapon.rate * (f.rateMul || 1));
  Sound.shoot(weapon.id, f.isBro);
  f.muzzle = 0.07;
  f.recoul = 5;
  for (let i = 0; i < (weapon.pellets || 1); i++) {
    const a = angle + rand(-weapon.spread, weapon.spread) + (weapon.pellets > 1 ? rand(-0.06, 0.06) : 0);
    const spd = weapon.speed * rand(0.94, 1.06);
    const bx = f.x + Math.cos(angle) * (f.r + 12);
    const by = f.y + Math.sin(angle) * (f.r + 12);
    G.bullets.push({
      x: bx, y: by,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg: weapon.dmg * (f.dmgMul || 1) * (G.alphaTrophy ? 1.12 : 1), r: 4.4, life: weapon.splash ? 1.0 : 1.15,
      color: weapon.color, friendly: true,
      pierce: weapon.pierce || 0, splash: weapon.splash || 0,
      hit: [], big: !!weapon.splash, thick: weapon.splash ? 1.9 : 1,
      mesh: takeBulletMesh(weapon.color, weapon.splash ? 1.9 : 1)
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = angle + rand(-0.4, 0.4), s = rand(120, 340);
    if (G.parts.length < MAXP) {
      G.parts.push({
        x: f.x + Math.cos(angle) * (f.r + 10), y: f.y + Math.sin(angle) * (f.r + 10),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.12, max: 0.12, color: weapon.color, size: rand(1.5, 3), drag: 6
      });
    }
  }
  G.shake = Math.max(G.shake, weapon.splash ? 5 : weapon.pellets > 1 ? 4 : 1.4);
  spawnCasing(f);
  const mx = f.x + Math.cos(angle) * (f.r + 30);
  const my = f.y + Math.sin(angle) * (f.r + 30);
  smokePuff(mx, my, 2, '#7c6a58');
  smokeCloud(mx, my, 1, '#a49a8c', 18 + (weapon.splash ? 12 : 0), 26, 0.45);
}

function enemyShoot(e) {
  const target = nearestFighter(e);
  if (!target) return;
  const acid = !!e.def.acid;
  const titan = !!e.def.titan;
  const a = Math.atan2(target.y - e.y, target.x - e.x);
  const spd = acid ? 265 : e.def.boss ? 300 : 330;
  const shots = e.def.raptor ? 5 : titan ? 12 : e.def.boss ? 7 : acid ? 2 : 1;
  const col = e.def.alpha ? '#8dff6a' : acid ? '#9bff5a' : titan ? '#d98cff' : '#ff5a3c';
  for (let i = 0; i < shots; i++) {
    const a2 = titan
      ? a + i * (TAU / shots)
      : a + (i - (shots - 1) / 2) * (acid ? 0.13 : 0.22);
    const th = e.def.boss ? 1.7 : 1.15;
    G.bullets.push({
      x: e.x + Math.cos(a2) * (e.r + 6), y: e.y + Math.sin(a2) * (e.r + 6),
      vx: Math.cos(a2) * spd, vy: Math.sin(a2) * spd,
      dmg: (acid ? 9 : e.def.boss ? 13 : 11) * (e.dmgScale || 1), r: e.def.boss ? 7 : 5.5, life: 2.6,
      color: col, friendly: false, pierce: 0, splash: 0, hit: [],
      thick: th,
      mesh: takeBulletMesh(col, th)
    });
  }
  ring(e.x, e.y, col, e.r * 2, 0.2, 2);
  smokePuff(e.x, e.y, 1, '#6b5a48');
}

function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 0.09;
  Sound.hit();
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  G.totalKills = (G.totalKills || 0) + 1;
  if (e.def.boss) G.bossKills = (G.bossKills || 0) + 1;
  Sound.kill();
  const def = e.def;
  if (def.boss) {
    const bounty = 120 + G.wave * 14;
    G.coins += bounty;
    floatText(e.x, e.y - 30, 'BOUNTY +' + bounty + ' ◈', '#ffd75e');
  }
  burst(e.x, e.y, def.color, def.boss ? 60 : 14, def.boss ? 520 : 240, def.boss ? 5 : 3);
  ring(e.x, e.y, def.color, def.boss ? 260 : 48, def.boss ? 0.75 : 0.32, def.boss ? 6 : 2);
  G.shake = Math.max(G.shake, def.boss ? 22 : 4);
  addXp(def.xp);
  for (let i = 0; i < def.gems; i++) {
    const a = rand(0, TAU), s = rand(30, 190);
    G.gems.push({
      x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 14, t: rand(0, TAU), val: 4,
      mesh: takeGemMesh()
    });
  }
  boom(e.x, e.y, def.boss ? 200 : 54);
  if (e.mesh) { const cm = e.mesh; e.mesh = null; makeCorpse(cm); }
  if (def.boss) {
    floatText(e.x, e.y, def.name + ' DOWN', '#ffd75e');
    G.flash = 0.5;
  }
  checkAchievements();
}

function addXp(n) {
  G.xp += n;
  checkAchievements();
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = Math.round(G.xpNext * 1.32);
    floatText(G.player.x, G.player.y, 'LEVEL ' + G.level, '#d9b8ff');
    ring(G.player.x, G.player.y, '#7fe7ff', 130, 0.7, 4);
    G.player.maxHp = playerMaxHp();
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + 25);
    Sound.level();
    checkAchievements();
  }
}

function hurtFighter(f, dmg) {
  if (f.downed) return;
  if ((f.invulnT || 0) > 0) return;
  if (f.buffKind === 'bulwark' && (f.buffT || 0) > 0) dmg *= 0.3;
  f.hp -= dmg;
  f.hurt = 0.28;
  if (!f.isBro) {
    G.damageTaken = true;
    G.shake = Math.max(G.shake, 7);
    G.flash = Math.max(G.flash, 0.16);
  }
  Sound.hurt();
  floatText(f.x, f.y, '-' + Math.round(dmg), f.color);
  if (f.hp <= 0) {
    f.hp = 0;
    if (f.isBro) {
      f.downed = true;
      burst(f.x, f.y, f.color, 26, 300, 4);
      floatText(f.x, f.y, f.char.name + ' DOWN', f.color);
    } else {
      gameOver();
    }
  }
}

function nearestFighter(e) {
  const cands = [];
  if (!G.player.downed) cands.push(G.player);
  if (!G.bro.downed) cands.push(G.bro);
  if (!cands.length) return null;
  cands.sort((a, b) => dist(e, a) - dist(e, b));
  return cands[0];
}

function nearestEnemy(from, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) {
    if (e.spawnT > 0 || e.dead) continue;
    const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function explode(x, y, radius, dmg, color) {
  Sound.boom();
  boom(x, y, radius * 0.95);
  ring(x, y, color || '#ffb066', radius, 0.42, 5);
  burst(x, y, color || '#ffb066', 22, 320, 4);
  G.shake = Math.max(G.shake, 9);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius + e.r) damageEnemy(e, dmg * (1 - d / (radius + e.r) * 0.5));
  }
}

// ------------------------------------------------------------
//  Abilities
// ------------------------------------------------------------
function useAirstrike() {
  if (G.state !== 'playing' || G.airstrikes <= 0) return;
  G.airstrikes--;
  Sound.boom();
  G.flash = 0.75;
  G.shake = 18;
  const targets = G.enemies.filter(e => !e.dead);
  targets.forEach((e, i) => {
    setTimeout(() => {
      if (G.enemies.includes(e) && !e.dead) explode(e.x, e.y, 120, 300, '#ffe27a');
    }, 60 + i * 45);
  });
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const x = G.player.x + rand(-420, 420), y = G.player.y + rand(-320, 320);
      ring(x, y, '#ffd75e', rand(90, 150), 0.5, 4);
      burst(x, y, '#ffd75e', 10, 220, 3);
    }, i * 70);
  }
  floatText(G.player.x, G.player.y, 'SMARTILLERY!', '#ffd75e');
}

function useAbility() {
  if (G.state !== 'playing' || !G.player) return;
  const p = G.player;
  if (p.downed) return;
  const ab = (p.char && p.char.ability) || CHARACTERS[0].ability;
  if ((p.ultCd || 0) > 0) {
    floatText(p.x, p.y, Math.ceil(p.ultCd) + 's', '#ff9f43');
    Sound.ui();
    return;
  }
  p.ultCd = ab.cd;
  p.buffT = ab.dur;
  p.buffMax = ab.dur;
  p.buffKind = ab.id;
  floatText(p.x, p.y, ab.name + '!', p.color);
  ring(p.x, p.y, p.color, 180, 0.65, 6);
  Sound.level();

  if (ab.id === 'overdrive') {
    burst(p.x, p.y, p.color, 26, 320, 4);
    ring(p.x, p.y, '#ffd75e', 120, 0.4, 4);
  } else if (ab.id === 'bulwark') {
    p.invulnT = 0.2;
    ring(p.x, p.y, '#ffd75e', 240, 0.55, 7);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 240 + e.r) continue;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      e.vx += Math.cos(a) * 520;
      e.vy += Math.sin(a) * 520;
      e.stunT = 0.6;
      damageEnemy(e, 55);
    }
    burst(p.x, p.y, '#ffd75e', 30, 380, 4);
  } else if (ab.id === 'blink') {
    p.invulnT = 0.55;
    const sx = p.x, sy = p.y;
    const tx = clamp(p.x + Math.cos(p.angle) * 280, p.r + 14, WORLD.w - p.r - 14);
    const ty = clamp(p.y + Math.sin(p.angle) * 280, p.r + 14, WORLD.h - p.r - 14);
    const segLen = Math.hypot(tx - sx, ty - sy) || 1;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const t = clamp(((e.x - sx) * (tx - sx) + (e.y - sy) * (ty - sy)) / (segLen * segLen), 0, 1);
      const px = sx + (tx - sx) * t, py = sy + (ty - sy) * t;
      if (Math.hypot(e.x - px, e.y - py) < 88 + e.r) damageEnemy(e, 140);
    }
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      burst(sx + (tx - sx) * t, sy + (ty - sy) * t, p.color, 3, 120, 2.4);
    }
    p.x = tx; p.y = ty; p.vx = 0; p.vy = 0;
    pushOutObstacles(p);
    ring(sx, sy, p.color, 90, 0.35, 4);
    ring(tx, ty, p.color, 110, 0.4, 4);
  } else if (ab.id === 'quake') {
    explode(p.x, p.y, 300, 220, '#ffb066');
    ring(p.x, p.y, '#ffb066', 340, 0.75, 9);
    G.shake = Math.max(G.shake, 24);
    G.flash = 0.25;
    boom(p.x, p.y, 230);
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 340 + e.r) e.stunT = 0.9;
    }
  }
  checkAchievements();
}

function useMedkit() {
  if (G.state !== 'playing' || G.medkits <= 0) return;
  if (G.player.hp >= G.player.maxHp && G.bro.hp >= G.bro.maxHp) return;
  G.medkits--;
  const heal = (f) => {
    if (f.downed) { f.downed = false; f.hp = f.maxHp * 0.5; }
    else f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.6);
    ring(f.x, f.y, '#5affa0', 90, 0.5, 3);
    burst(f.x, f.y, '#5affa0', 16, 160, 3);
  };
  heal(G.player); heal(G.bro);
  floatText(G.player.x, G.player.y, '+MEDKIT', '#5affa0');
}

// ------------------------------------------------------------
//  Update
// ------------------------------------------------------------
function update(dt) {
  G.time += dt;
  G.shake = Math.max(0, G.shake - dt * 40);
  G.flash = Math.max(0, G.flash - dt * 2.6);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }

  updatePlayer(dt);
  updatePartner(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateGems(dt);
  updateParticles(dt);
  updateCamera(dt);

  saveTimer += dt;
  if (saveTimer > 2) { saveTimer = 0; saveProgress(); }

  prune(G.enemies, e => !e.dead);

  if (!G.cleared && G.wave > 0) {
    G.waveT = Math.min(G.waveLen, G.waveT + dt);
    const bossAlive = G.enemies.some(e => e.def.boss && !e.dead);
    if (G.bossSpawned && !bossAlive) {
      // dropped the boss: the wave breaks early, however much clock is left
      G.cleared = true;
      G.waveMode = 'clear';
      G.clearTimer = 1.2;
      purgeWave();
    } else if (G.waveT >= G.waveLen && !bossAlive) {
      // clock ran out: the rest of the horde breaks contact and the line holds
      G.cleared = true;
      G.waveMode = 'hold';
      G.clearTimer = 1.2;
      purgeWave();
    }
  }
  if (G.cleared && G.clearTimer > 0) {
    G.clearTimer -= dt;
    if (G.clearTimer <= 0) { awardWaveBonus(G.waveMode); openShop(); }
  }
}

// clock expired: the leftovers pull back instead of chasing you into the shop
function purgeWave() {
  let left = 0;
  for (const e of G.enemies) {
    if (!e || e.dead) continue;
    left++;
    e.dead = true;
    burst(e.x, e.y, e.def.color, 10, 180, 3);
    smokePuff(e.x, e.y, 2, '#6b5a48');
    if (e.mesh) { scene.remove(e.mesh); e.mesh = null; }
  }
  G.spawnQueue.length = 0;
  G.enemies = [];
  if (left > 0) floatText(G.player.x, G.player.y - 40, 'WAVE HELD', '#c9a8ff');
}

function updatePlayer(dt) {
  const p = G.player;
  let ix = 0, iy = 0;
  if (keys['a'] || (!G.coop && keys['arrowleft'])) ix -= 1;
  if (keys['d'] || (!G.coop && keys['arrowright'])) ix += 1;
  if (keys['w'] || (!G.coop && keys['arrowup'])) iy -= 1;
  if (keys['s'] || (!G.coop && keys['arrowdown'])) iy += 1;

  if (sticks.move) {
    const dx = sticks.move.x - sticks.move.ox, dy = sticks.move.y - sticks.move.oy;
    const m = Math.hypot(dx, dy);
    if (m > 10) { ix = dx / m; iy = dy / m; }
  }
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }

  const wantCrouch = keys['c'] && p.z <= 0 && !p.downed;
  p.crouch = lerp(p.crouch || 0, wantCrouch ? 1 : 0, 1 - Math.pow(0.0002, dt));
  if (p.jumpQueued && p.z <= 0.5) { p.vz = 300; p.jumpQueued = false; }
  p.jumpQueued = false;
  if (p.z > 0 || p.vz !== 0) {
    p.vz -= 1150 * dt;
    p.z += p.vz * dt;
    if (p.z <= 0) { p.z = 0; p.vz = 0; }
  }

  // bro ability timers + buff state
  p.ultCd = Math.max(0, (p.ultCd || 0) - dt);
  p.invulnT = Math.max(0, (p.invulnT || 0) - dt);
  p.buffT = Math.max(0, (p.buffT || 0) - dt);
  if (p.buffT <= 0) p.buffKind = null;
  const od = p.buffKind === 'overdrive' && p.buffT > 0;
  p.dmgMul = (p.baseDmgMul || p.char.dmg) * (od ? 1.1 : 1);
  p.rateMul = (p.baseRateMul || p.char.rate) * (od ? 1.7 : 1);

  const speed = p.speed * (1 - 0.45 * p.crouch) * (od ? 1.25 : 1);
  const accel = 1 - Math.pow(0.0005, dt);
  p.vx = lerp(p.vx, ix * speed, accel);
  p.vy = lerp(p.vy, iy * speed, accel);
  p.x = clamp(p.x + p.vx * dt, p.r + 14, WORLD.w - p.r - 14);
  p.y = clamp(p.y + p.vy * dt, p.r + 14, WORLD.h - p.r - 14);
  pushOutObstacles(p);

  let aim = p.angle, fire = false;
  if (sticks.aim) {
    const dx = sticks.aim.x - sticks.aim.ox, dy = sticks.aim.y - sticks.aim.oy;
    const m = Math.hypot(dx, dy);
    if (m > 12) { aim = Math.atan2(dy, dx); fire = true; }
  } else {
    const w = pointerWorld(pointer.x, pointer.y);
    aim = Math.atan2(w.y - p.y, w.x - p.x);
    fire = pointer.down;
  }
  p.angle = aim;

  p.fireCd -= dt;
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.recoul = Math.max(0, p.recoul - dt * 40);
  p.reloadT = Math.max(0, (p.reloadT || 0) - dt);
  p.bob += dt * 6;

  if (p.buffKind === 'overdrive' && p.buffT > 0) {
    p.hp = Math.min(p.maxHp, p.hp + dt * 2.5);
    if (Math.random() < dt * 26) {
      burst(p.x + rand(-18, 18), p.y + rand(-18, 18), '#ffd75e', 1, 70, 2.2);
    }
  }

  if (fire && p.fireCd <= 0 && p.reloadT <= 0 && !p.downed) shoot(p, activeWeapon(), p.angle);
}

function activeWeapon() { return gunStats(G.slots[G.slot]); }

function switchSlot() {
  G.slot = G.slot === 0 ? 1 : 0;
  G.player.reloadT = 0.5;
  G.player.reloadMax = 0.5;
  Sound.ui();
  const w = activeWeapon();
  floatText(G.player.x, G.player.y, w.name, w.color);
}

function broWeapon() {
  const base = G.wave < 3 ? WBY.pistol : G.wave < 7 ? WBY.smg : WBY.laser;
  return { ...base, dmg: base.dmg * 0.85, rate: base.rate * 0.9 };
}

function updatePartner(dt) {
  if (!G.coop) { updateBro(dt); return; }
  const b = G.bro;
  b.hurt = Math.max(0, b.hurt - dt);
  b.muzzle = Math.max(0, b.muzzle - dt);
  b.recoul = Math.max(0, b.recoul - dt * 40);
  b.bob += dt * 6;
  if (b.downed) { b.vx *= 0.9; b.vy *= 0.9; return; }

  let ix = 0, iy = 0;
  if (keys['arrowleft']) ix -= 1;
  if (keys['arrowright']) ix += 1;
  if (keys['arrowup']) iy -= 1;
  if (keys['arrowdown']) iy += 1;
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }

  const accel = 1 - Math.pow(0.0006, dt);
  b.vx = lerp(b.vx, ix * b.speed, accel);
  b.vy = lerp(b.vy, iy * b.speed, accel);
  b.x = clamp(b.x + b.vx * dt, b.r + 14, WORLD.w - b.r - 14);
  b.y = clamp(b.y + b.vy * dt, b.r + 14, WORLD.h - b.r - 14);
  pushOutObstacles(b);

  const target = nearestEnemy(b, 860);
  if (target) b.angle = Math.atan2(target.y - b.y, target.x - b.x);
  else if (len > 0.1) b.angle = Math.atan2(iy, ix);

  b.fireCd -= dt;
  const firing = keys['enter'] || keys['shift'] || keys['/'] || keys['.'];
  if (firing && b.fireCd <= 0) shoot(b, broWeapon(), b.angle);
}

function updateBro(dt) {
  const b = G.bro;
  b.hurt = Math.max(0, b.hurt - dt);
  b.muzzle = Math.max(0, b.muzzle - dt);
  b.recoul = Math.max(0, b.recoul - dt * 40);
  b.bob += dt * 6;

  if (b.downed) { b.vx *= 0.9; b.vy *= 0.9; return; }

  const target = nearestEnemy(b, 900);
  let tx, ty;
  if (target) {
    const d = dist(b, target);
    const ang = Math.atan2(b.y - target.y, b.x - target.x);
    const want = 200;
    if (d > want + 40) { tx = target.x + Math.cos(ang) * want; ty = target.y + Math.sin(ang) * want; }
    else if (d < want - 60) { tx = b.x - (target.x - b.x) * 0.4; ty = b.y - (target.y - b.y) * 0.4; }
    else { tx = b.x + Math.cos(b.bob * 0.7) * 60; ty = b.y + Math.sin(b.bob * 0.7) * 60; }
  } else {
    const ang = G.player.angle + Math.PI * 0.75;
    tx = G.player.x + Math.cos(ang) * 80;
    ty = G.player.y + Math.sin(ang) * 80;
  }

  const dx = tx - b.x, dy = ty - b.y;
  const m = Math.hypot(dx, dy) || 1;
  const spd = b.speed * 0.95;
  const accel = 1 - Math.pow(0.0006, dt);
  b.vx = lerp(b.vx, (dx / m) * spd, accel);
  b.vy = lerp(b.vy, (dy / m) * spd, accel);
  b.x = clamp(b.x + b.vx * dt, b.r + 14, WORLD.w - b.r - 14);
  b.y = clamp(b.y + b.vy * dt, b.r + 14, WORLD.h - b.r - 14);
  pushOutObstacles(b);

  if (target) b.angle = Math.atan2(target.y - b.y, target.x - b.x);
  b.fireCd -= dt;
  if (target && dist(b, target) < 620 && b.fireCd <= 0) shoot(b, broWeapon(), b.angle);
}

// Reinforcement engine: refill the field as soon as it thins out instead of
// dripping one enemy at a time. The population stays high all wave long.
function updateSpawning(dt) {
  if (G.cleared) return;

  // scheduled boss entrance, ignores the population cap
  if (G.bossWave && !G.bossSpawned && G.waveT >= G.bossAt) {
    G.bossSpawned = true;
    G.banner = { text: 'BOSS INBOUND', sub: ENEMIES[G.bossWave].name + ' has entered the arena', t: 2.6, color: '#ff2e88' };
    spawnEnemy(G.bossWave);
  }

  // surprise raptor packs out of the treeline
  while (G.ambushes && G.ambushes.length && G.waveT >= G.ambushes[0]) {
    G.ambushes.shift();
    const pack = randInt(3, 5);
    G.banner = { text: 'RAPTOR AMBUSH', sub: pack + ' velociraptors are flanking you', t: 2.4, color: '#8dff6a' };
    G.shake = Math.max(G.shake, 12);
    for (let i = 0; i < pack; i++) {
      const p = spawnPoint();
      spawnEnemy('raptor', { at: p });
      ring(p.x, p.y, '#8dff6a', 90, 0.5, 4);
      smokePuff(p.x, p.y, 2, '#5a6b4a');
    }
  }

  const target = Math.min(fieldTarget(G.wave), enemyCap());
  const alive = G.enemies.length;
  if (alive >= target) { G.spawnTimer = 0.12; return; }

  G.spawnTimer -= dt;
  if (G.spawnTimer > 0) return;

  // slam the gap shut in bursts so the field never looks empty
  const need = target - alive;
  const burst = clamp(Math.ceil(need / 2), 1, 5);
  for (let i = 0; i < burst; i++) spawnEnemy(pickEnemyType(G.wave));
  G.spawnTimer = rand(0.1, 0.28);
}

// Dinosaurs are not ghosts. Probe a short way ahead; when a structure is in
// the way, swing around its face instead of grinding into it, and flip sides
// when a corner pins the animal down.
const STEER = { x: 0, y: 0 };
function steerAround(e, ax, ay, sdt) {
  e.probeT = (e.probeT || 0) - sdt;
  if (e.probeT <= 0) {
    e.probeT = 0.1 + Math.random() * 0.1;
    const ahead = 70 + e.r * 2.4;
    const hit = segmentHit(e.x, e.y, e.x + ax * ahead, e.y + ay * ahead, e.r + 3, false);
    e.blocked = hit.hit ? Math.max(0.25, 1 - hit.t) : 0;
    if (hit.hit) { e.blockNx = hit.nx; e.blockNz = hit.nz; }
  }
  STEER.x = ax; STEER.y = ay;
  if (!(e.blocked > 0)) return STEER;
  if (!e.avoidSign) e.avoidSign = Math.random() < 0.5 ? 1 : -1;
  const w = Math.min(1, e.blocked * 1.7);
  const tx = -e.blockNz * e.avoidSign, tz = e.blockNx * e.avoidSign;
  const rx = ax * (1 - w * 0.85) + tx * w;
  const ry = ay * (1 - w * 0.85) + tz * w;
  const m = Math.hypot(rx, ry) || 1;
  STEER.x = rx / m; STEER.y = ry / m;
  return STEER;
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.hitCd = Math.max(0, e.hitCd - dt);
    e.biteT = Math.max(0, (e.biteT || 0) - dt);
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    if ((e.stunT || 0) > 0) { e.stunT -= dt; e.vx *= 0.88; e.vy *= 0.88; continue; }

    // ---- LOD: a dinosaur far from the fight thinks at 15-30 Hz instead of
    // every frame. Nothing on it is legible at that distance, and a big wave
    // was paying full AI cost for animals still crossing the arena.
    {
      const ldx = e.x - G.player.x, ldy = e.y - G.player.y;
      const d2p = ldx * ldx + ldy * ldy;
      const steps = d2p > LOD_AI_FAR2 ? Q.aiLod : d2p > LOD_AI_MID2 ? 2 : 1;
      if (steps > 1) {
        e.acc = (e.acc || 0) + dt;
        if (e.acc < 0.0166 * steps) continue;
      }
    }
    const sdt = e.acc > 0 ? e.acc : dt;
    e.acc = 0;

    const target = nearestFighter(e);
    if (!target) continue;
    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);

    let ax = dx / d, ay = dy / d;
    if (e.def.ranged) {
      const want = 260;
      if (d < want - 40) { ax = -ax; ay = -ay; }
      else if (d < want + 40) { const s = Math.sin(G.time * 1.4 + e.wob); ax = -dy / d * s; ay = dx / d * s; }
      e.shootCd -= sdt;
      if (e.shootCd <= 0 && d < 560) { enemyShoot(e); e.shootCd = rand(1.5, 2.4) * (e.aggro || 1); }
    } else if (e.def.raptor) {
      // raptors hunt: pounce across the arena; the Alpha also calls the pack and spits bile
      e.shootCd -= sdt;
      e.summonCd -= sdt;
      e.leapCd = Math.max(0, (e.leapCd || 0) - sdt);
      if (e.leapWind > 0) {
        e.leapWind -= sdt;
        e.vx *= 0.72; e.vy *= 0.72;
        if (e.leapWind <= 0) {
          e.leapT = 0.5;
          e.leapVX = (dx / d) * (e.def.boss ? 980 : 780);
          e.leapVY = (dy / d) * (e.def.boss ? 980 : 780);
          e.leapHit = false;
          ring(e.x, e.y, '#8dff6a', 130, 0.3, 5);
          smokePuff(e.x, e.y, 2, '#6b7a5a');
        }
        continue;
      }
      if (e.leapT > 0) {
        e.leapT -= sdt;
        e.x = clamp(e.x + e.leapVX * sdt, e.r, WORLD.w - e.r);
        e.y = clamp(e.y + e.leapVY * sdt, e.r, WORLD.h - e.r);
        pushOutObstacles(e);
        if (!e.leapHit) {
          for (const f of [G.player, G.bro]) {
            if (f.downed) continue;
            if (Math.hypot(f.x - e.x, f.y - e.y) < f.r + e.r * 1.25) {
              hurtFighter(f, (e.def.boss ? 26 : 13) * (e.dmgScale || 1));
              e.leapHit = true;
              e.leapT = 0;
              G.shake = Math.max(G.shake, 13);
              break;
            }
          }
        }
        continue;
      }
      if (e.leapCd <= 0 && d > 260 && d < 880) {
        e.leapCd = rand(e.def.boss ? 3.4 : 4.2, e.def.boss ? 4.8 : 6.2) * (e.aggro || 1) * (e.hp < e.maxHp * 0.5 ? 0.65 : 1);
        e.leapWind = 0.5;
        ring(e.x, e.y, '#ffd75e', e.r * 3.2, 0.5, 4);
        if (e.def.boss || e.def.elite) floatText(e.x, e.y, 'POUNCE', '#ffd75e');
        continue;
      }
      if (e.def.boss && e.summonCd <= 0) {
        e.summonCd = rand(12, 17) * (e.aggro || 1);
        ring(e.x, e.y, '#8dff6a', 250, 0.6, 6);
        floatText(e.x, e.y, 'PACK CALL', '#8dff6a');
        for (let k = 0; k < 3; k++) {
          spawnEnemy('raptor', {
            at: {
              x: clamp(e.x + rand(-180, 180), 60, WORLD.w - 60),
              y: clamp(e.y + rand(-180, 180), 60, WORLD.h - 60)
            }
          });
        }
      }
      if (e.def.boss && e.shootCd <= 0) { enemyShoot(e); e.shootCd = rand(3.4, 4.6) * (e.aggro || 1); }
      if (d < 140) { ax *= 0.3; ay *= 0.3; }
    } else if (e.def.slam) {
      e.shootCd -= sdt; e.slamCd -= sdt;
      if (d < 250 && e.slamCd <= 0) {
        e.slamCd = 5.5 * (e.aggro || 1);
        ring(e.x, e.y, '#ff7a3c', 270, 0.45, 7);
        boom(e.x, e.y, 180);
        G.shake = Math.max(G.shake, 14);
        for (const f of [G.player, G.bro]) {
          if (!f.downed && Math.hypot(f.x - e.x, f.y - e.y) < 280) hurtFighter(f, 20 * (e.dmgScale || 1));
        }
        burst(e.x, e.y, '#ff7a3c', 22, 300, 4);
      }
      if (!e.def.noShot && e.shootCd <= 0) { enemyShoot(e); e.shootCd = rand(1.9, 2.7) * (e.aggro || 1); }
      if (d < 200) { ax *= 0.15; ay *= 0.15; }
    } else if (e.def.titan) {
      e.shootCd -= sdt; e.summonCd -= sdt;
      if (e.shootCd <= 0) { enemyShoot(e); e.shootCd = rand(1.6, 2.2) * (e.aggro || 1); }
      if (e.summonCd <= 0) {
        e.summonCd = rand(7, 10) * (e.aggro || 1);
        ring(e.x, e.y, '#c02bff', 210, 0.6, 6);
        floatText(e.x, e.y, 'SUMMONING', '#d98cff');
        for (let k = 0; k < 3; k++) {
          spawnEnemy('swarm', { at: {
            x: clamp(e.x + rand(-170, 170), 60, WORLD.w - 60),
            y: clamp(e.y + rand(-170, 170), 60, WORLD.h - 60)
          } });
        }
      }
      if (d < 230) { ax *= 0.25; ay *= 0.25; }
    } else if (e.def.boss) {
      e.shootCd -= sdt;
      if (e.shootCd <= 0) { enemyShoot(e); e.shootCd = rand(2.0, 3.0) * (e.aggro || 1); }
      if (d < 190) { ax *= 0.2; ay *= 0.2; }
    }

    const steer = steerAround(e, ax, ay, sdt);
    ax = steer.x; ay = steer.y;

    const wob = Math.sin(G.time * 3 + e.wob) * 0.22;
    const cos = Math.cos(wob), sin = Math.sin(wob);
    const rx = ax * cos - ay * sin, ry = ax * sin + ay * cos;
    e.vx = lerp(e.vx, rx * e.speed, 1 - Math.pow(0.001, sdt));
    e.vy = lerp(e.vy, ry * e.speed, 1 - Math.pow(0.001, sdt));
    e.x += e.vx * sdt;
    e.y += e.vy * sdt;
    pushOutObstacles(e);

    // wedged against a wall for most of a second: commit to the other way round
    e.watchT = (e.watchT || 0) + sdt;
    if (e.watchT > 0.65) {
      const moved = (e.wx === undefined) ? 999 : Math.hypot(e.x - e.wx, e.y - e.wy);
      if (moved < 30 && d > 220) {
        e.avoidSign = -(e.avoidSign || 1);
        e.blocked = 1; e.probeT = 0;
      }
      e.watchT = 0; e.wx = e.x; e.wy = e.y;
    }

    if (!e.def.ranged && e.hitCd <= 0) {
      for (const f of [G.player, G.bro]) {
        if (f.downed) continue;
        if (Math.hypot(f.x - e.x, f.y - e.y) < f.r + e.r) {
          hurtFighter(f, e.def.dmg * (e.dmgScale || 1));
          e.hitCd = 0.65;
          e.biteT = 0.32;
          const a = Math.atan2(e.y - f.y, e.x - f.x);
          e.vx += Math.cos(a) * 180; e.vy += Math.sin(a) * 180;
          burst(f.x, f.y, '#ff5d6c', 6, 160, 2.6);
          break;
        }
      }
    }
  }

  buildEnemyGrid();
  for (let i = 0; i < G.enemies.length; i++) {
    const a = G.enemies[i];
    if (a.spawnT > 0) continue;
    // dinosaurs are long: keep their bodies clear of each other, not just
    // their collision circles, so a pack reads as separate animals
    const nq = gridQuery(a.x, a.y, a.r * 1.55 + EG.maxSum);
    for (let q = 0; q < nq; q++) {
      const b = GQ[q];
      if (b === a || b.spawnT > 0 || b.__idx < i) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.r + b.r) * 1.55;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0.0001 || d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.62;
      const nx = dx / d, ny = dy / d;
      const wa = b.def.boss ? 1.6 : 1, wb = a.def.boss ? 1.6 : 1;
      a.x -= nx * push * wa; a.y -= ny * push * wa;
      b.x += nx * push * wb; b.y += ny * push * wb;
    }
    a.x = clamp(a.x, a.r, WORLD.w - a.r);
    a.y = clamp(a.y, a.r, WORLD.h - a.r);
  }
}

// ------------------------------------------------------------
//  Enemy broad-phase grid
//  The old code compared every dinosaur with every other one, and every
//  bullet with every dinosaur. 40 animals is 780 pair checks per frame; 120 is
//  7,140. Bucketing them into 130-unit cells keeps a full wave linear.
// ------------------------------------------------------------
// Flat pre-allocated grid: no strings, no per-frame arrays, no Map hashing.
// (A Map keyed by "x,y" looked tidy but allocated thousands of throwaway
// strings a second, which cost more than the pair checks it saved.)
const EG = { cell: 150, cols: 0, rows: 0, cells: null, used: [], maxSum: 48, n: 0 };
const GQ = [];
let GQN = 0;
function initEnemyGrid() {
  EG.cols = Math.ceil(WORLD.w / EG.cell) + 2;
  EG.rows = Math.ceil(WORLD.h / EG.cell) + 2;
  EG.cells = new Array(EG.cols * EG.rows);
  for (let i = 0; i < EG.cells.length; i++) EG.cells[i] = [];
}
function buildEnemyGrid() {
  if (!EG.cells) initEnemyGrid();
  for (let u = 0; u < EG.used.length; u++) EG.cells[EG.used[u]].length = 0;
  EG.used.length = 0;
  let maxR = 0;
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    e.__idx = i;
    if (e.r > maxR) maxR = e.r;
    const gx = Math.min(EG.cols - 1, Math.max(0, ((e.x / EG.cell) | 0) + 1));
    const gy = Math.min(EG.rows - 1, Math.max(0, ((e.y / EG.cell) | 0) + 1));
    const idx = gy * EG.cols + gx;
    const arr = EG.cells[idx];
    if (!arr.length) EG.used.push(idx);
    arr.push(e);
  }
  EG.maxSum = maxR * 3.2;
  EG.n = G.enemies.length;
}
function gridQuery(x, y, radius) {
  GQN = 0;
  if (!EG.cells) return 0;
  const c = EG.cell, cols = EG.cols;
  const x0 = ((x - radius) / c | 0) + 1, x1 = ((x + radius) / c | 0) + 1;
  const y0 = ((y - radius) / c | 0) + 1, y1 = ((y + radius) / c | 0) + 1;
  for (let cy = y0; cy <= y1; cy++) {
    if (cy < 0 || cy >= EG.rows) continue;
    const row = cy * cols;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cx >= cols) continue;
      const arr = EG.cells[row + cx];
      for (let i = 0; i < arr.length; i++) GQ[GQN++] = arr[i];
    }
  }
  return GQN;
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    const px = b.x, py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) b.life = 0;

    // walls and structures stop every bullet; rockets detonate against them
    if (b.life > 0) {
      const wh = segmentHit(px, py, b.x, b.y, b.r || 4, true);
      if (wh.hit) {
        b.x = wh.x; b.y = wh.z;
        if (b.splash) explode(wh.x, wh.z, b.splash, b.dmg, b.color);
        else impactFx(wh.x, wh.z, b.color, !!b.big);
        b.spent = 1;
        b.life = 0;
        continue;
      }
    }

    if (b.friendly) {
      // only dinosaurs whose cell could contain this bullet are tested
      const nq = gridQuery(b.x, b.y, EG.maxSum + (b.r || 8));
      for (let q = 0; q < nq; q++) {
        const e = GQ[q];
        if (e.dead || e.spawnT > 0) continue;
        if (b.hit.includes(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          if (b.splash) {
            explode(b.x, b.y, b.splash, b.dmg, b.color);
            b.life = 0;
            break;
          }
          damageEnemy(e, b.dmg);
          impactFx(b.x, b.y, b.color, !!b.big);
          b.hit.push(e);
          if (b.pierce > 0) { b.pierce--; }
          else { b.life = 0; break; }
        }
      }
    } else {
      for (const f of [G.player, G.bro]) {
        if (f.downed) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) < f.r + b.r) {
          hurtFighter(f, b.dmg);
          impactFx(b.x, b.y, '#ff6bd6', true);
          b.life = 0;
          break;
        }
      }
    }
  }
  for (const b of G.bullets) {
    if (b.life > 0) continue;
    releaseBulletMesh(b.mesh);
    if (!b.spent && b.x > 0 && b.y > 0 && b.x < WORLD.w && b.y < WORLD.h) impactFx(b.x, b.y, b.color, false);
    else { burst(b.x, b.y, b.color, 3, 130, 2); smokePuff(b.x, b.y, 1, '#7d6a58'); }
  }
  prune(G.bullets, b => b.life > 0);
}

function updateGems(dt) {
  const p = G.player;
  for (const g of G.gems) {
    g.life -= dt;
    g.t += dt * 3;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < 190) {
      const a = Math.atan2(p.y - g.y, p.x - g.x);
      const pull = 620 * (1 - d / 190) + 90;
      g.vx += Math.cos(a) * pull * dt;
      g.vy += Math.sin(a) * pull * dt;
    }
    g.vx *= 1 - dt * 2.2;
    g.vy *= 1 - dt * 2.2;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (d < 30) {
      g.life = -1;
      G.coins += g.val;
      Sound.gem();
      burst(g.x, g.y, '#7dffb0', 4, 90, 2);
    }
  }
  for (const g of G.gems) if (g.life <= 0) releaseGemMesh(g.mesh);
  prune(G.gems, g => g.life > 0);
}

function updateParticles(dt) {
  for (const p of G.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const f = 1 - p.drag * dt;
    p.vx *= f; p.vy *= f;
  }
  prune(G.parts, p => p.life > 0);
  for (const r of G.rings) {
    r.life -= dt;
    r.r = lerp(r.r, r.maxR, 1 - Math.pow(0.0001, dt));
  }
  for (let i = G.rings.length - 1; i >= 0; i--) {
    if (G.rings[i].life > 0) continue;
    releaseRingMesh(G.rings[i].mesh);
    G.rings.splice(i, 1);
  }
  for (const f of G.floats) {
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy *= 1 - dt * 2;
  }
  prune(G.floats, f => f.life > 0);
}

// ------------------------------------------------------------
//  Battlefield props, obstacles and effects
// ------------------------------------------------------------
const arenaObstacles = [];
const fires = [];

// ------------------------------------------------------------
//  Solid collision
//  Round props are circles; buildings, walls and containers are oriented
//  boxes carrying their true footprint. Player, bro, every dinosaur, every
//  bullet and the enemy line-of-sight probes all use this one spatial hash,
//  so nothing walks or shoots through a wall.
// ------------------------------------------------------------
const OB_CELL = 180;
const OB_GRID = { cols: 0, rows: 0, cells: null, used: [] };
const OQ = [];
let OQN = 0, OQ_STAMP = 0;

function addObstacle(x, z, r, group) {
  arenaObstacles.push({ x: x + CX, z: z + CZ, r, group, box: false, __q: -1 });
}

// layout-space oriented box (buildings, warehouses, containers, compound walls)
function addBoxObstacle(x, z, hw, hd, ry, group) {
  const a = ry || 0;
  arenaObstacles.push({
    x: x + CX, z: z + CZ, hw, hd, c: Math.cos(a), s: Math.sin(a),
    r: Math.hypot(hw, hd), group, box: true, __q: -1
  });
}

// arena-space box (the outer perimeter is built directly in world coordinates)
function addWallObstacle(x, z, hw, hd) {
  arenaObstacles.push({ x, z, hw, hd, c: 1, s: 0, r: Math.hypot(hw, hd), box: true, __q: -1 });
}

function buildObstacleGrid() {
  const cols = Math.ceil(WORLD.w / OB_CELL) + 2;
  const rows = Math.ceil(WORLD.h / OB_CELL) + 2;
  if (!OB_GRID.cells || OB_GRID.cols !== cols || OB_GRID.rows !== rows) {
    OB_GRID.cells = new Array(cols * rows);
    for (let i = 0; i < OB_GRID.cells.length; i++) OB_GRID.cells[i] = [];
    OB_GRID.cols = cols; OB_GRID.rows = rows;
  }
  for (let i = 0; i < OB_GRID.cells.length; i++) OB_GRID.cells[i].length = 0;
  OB_GRID.used.length = 0;
  for (const o of arenaObstacles) {
    const x0 = Math.max(0, ((o.x - o.r) / OB_CELL | 0) + 1);
    const x1 = Math.min(cols - 1, ((o.x + o.r) / OB_CELL | 0) + 1);
    const z0 = Math.max(0, ((o.z - o.r) / OB_CELL | 0) + 1);
    const z1 = Math.min(rows - 1, ((o.z + o.r) / OB_CELL | 0) + 1);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const idx = cz * cols + cx;
        const arr = OB_GRID.cells[idx];
        if (!arr.length) OB_GRID.used.push(idx);
        arr.push(o);
      }
    }
  }
}

// Fills OQ with every solid near (x,z). Each obstacle is reported once per
// query, so a wall spanning several cells cannot push an entity twice.
function obstacleQuery(x, z, radius) {
  OQN = 0;
  const g = OB_GRID;
  if (!g.cells) return 0;
  OQ_STAMP++;
  const cols = g.cols;
  const x0 = ((x - radius) / OB_CELL | 0) + 1, x1 = ((x + radius) / OB_CELL | 0) + 1;
  const z0 = ((z - radius) / OB_CELL | 0) + 1, z1 = ((z + radius) / OB_CELL | 0) + 1;
  for (let cz = z0; cz <= z1; cz++) {
    if (cz < 0 || cz >= g.rows) continue;
    const row = cz * cols;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cx >= cols) continue;
      const arr = g.cells[row + cx];
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (o.__q === OQ_STAMP) continue;
        o.__q = OQ_STAMP;
        OQ[OQN++] = o;
      }
    }
  }
  return OQN;
}

// Circle-vs-circle / circle-vs-box resolution with the into-wall velocity
// removed, which is what stops the player skating along a wall at speed.
function pushOutObstacles(ent) {
  for (let pass = 0; pass < 2; pass++) {
    const n = obstacleQuery(ent.x, ent.y, ent.r + 26);
    let moved = false;
    for (let i = 0; i < n; i++) {
      const o = OQ[i];
      if (o.box) {
        const dx = ent.x - o.x, dz = ent.y - o.z;
        const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        const qx = clamp(lx, -o.hw, o.hw), qz = clamp(lz, -o.hd, o.hd);
        let ox = lx - qx, oz = lz - qz;
        let d = Math.hypot(ox, oz);
        if (d >= ent.r) continue;
        let nx, nz, push;
        if (d > 0.0001) {
          ox /= d; oz /= d;
          nx = ox * o.c + oz * o.s;
          nz = -ox * o.s + oz * o.c;
          push = ent.r - d;
        } else {
          // centre ended up inside the box: leave through the nearest face
          const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
          if (px < pz) {
            const sg = lx < 0 ? -1 : 1;
            nx = sg * o.c; nz = -sg * o.s;
            push = px + ent.r;
          } else {
            const sg = lz < 0 ? -1 : 1;
            nx = sg * o.s; nz = sg * o.c;
            push = pz + ent.r;
          }
        }
        ent.x += nx * push; ent.y += nz * push;
        const dot = ent.vx * nx + ent.vy * nz;
        if (dot < 0) { ent.vx -= nx * dot; ent.vy -= nz * dot; }
        moved = true;
      } else {
        const dx = ent.x - o.x, dz = ent.y - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + ent.r;
        if (d < min && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          ent.x = o.x + nx * min;
          ent.y = o.z + nz * min;
          const dot = ent.vx * nx + ent.vy * nz;
          if (dot < 0) { ent.vx -= nx * dot; ent.vy -= nz * dot; }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

// Swept test used by bullets and by enemy line-of-sight probes. Returns the
// first solid hit along the segment, with its surface normal.
const HIT = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0 };
function segmentHit(x0, y0, x1, y1, pad, solidsOnly) {
  HIT.hit = false; HIT.t = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.000001) return HIT;
  const len = Math.sqrt(len2);
  const n = obstacleQuery((x0 + x1) * 0.5, (y0 + y1) * 0.5, len * 0.5 + (pad || 0) + 24);
  let best = 1, bnx = 0, bnz = 0;
  for (let i = 0; i < n; i++) {
    const o = OQ[i];
    // low cover (crates, barrels, sandbags) stops feet, not bullets
    if (solidsOnly && !o.box && o.r < 46) continue;
    if (o.box) {
      const p0x = (x0 - o.x) * o.c - (y0 - o.z) * o.s;
      const p0z = (x0 - o.x) * o.s + (y0 - o.z) * o.c;
      const p1x = (x1 - o.x) * o.c - (y1 - o.z) * o.s;
      const p1z = (x1 - o.x) * o.s + (y1 - o.z) * o.c;
      const hw = o.hw + (pad || 0), hd = o.hd + (pad || 0);
      const ddx = p1x - p0x, ddz = p1z - p0z;
      let tmin = 0, tmax = 1, nx = 0, nz = 0;
      const inside = Math.abs(p0x) <= hw && Math.abs(p0z) <= hd;
      if (!inside) {
        if (Math.abs(ddx) < 1e-6) {
          if (Math.abs(p0x) > hw) continue;
        } else {
          let t1 = (-hw - p0x) / ddx, t2 = (hw - p0x) / ddx, sg = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
          if (t1 > tmin) { tmin = t1; nx = sg; nz = 0; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        if (Math.abs(ddz) < 1e-6) {
          if (Math.abs(p0z) > hd) continue;
        } else {
          let t1 = (-hd - p0z) / ddz, t2 = (hd - p0z) / ddz, sg = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
          if (t1 > tmin) { tmin = t1; nx = 0; nz = sg; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
      }
      if (tmin >= best) continue;
      best = tmin;
      bnx = nx * o.c + nz * o.s;
      bnz = -nx * o.s + nz * o.c;
    } else {
      const fx = x0 - o.x, fz = y0 - o.z;
      const rr = o.r + (pad || 0);
      const c = fx * fx + fz * fz - rr * rr;
      let t;
      if (c < 0) {
        t = 0;
      } else {
        const b = 2 * (fx * dx + fz * dy);
        const disc = b * b - 4 * len2 * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        t = (-b - sq) / (2 * len2);
        if (t < 0) continue;
      }
      if (t >= best) continue;
      best = t;
      const hx = x0 + dx * t, hz = y0 + dy * t;
      const m = Math.hypot(hx - o.x, hz - o.z) || 1;
      bnx = (hx - o.x) / m; bnz = (hz - o.z) / m;
    }
  }
  if (best >= 1) return HIT;
  HIT.hit = true; HIT.t = best;
  HIT.x = x0 + dx * best; HIT.z = y0 + dy * best;
  HIT.nx = bnx; HIT.nz = bnz;
  return HIT;
}

function pointBlocked(x, z, pad) {
  const n = obstacleQuery(x, z, (pad || 0) + 10);
  for (let i = 0; i < n; i++) {
    const o = OQ[i];
    if (o.box) {
      const lx = (x - o.x) * o.c - (z - o.z) * o.s;
      const lz = (x - o.x) * o.s + (z - o.z) * o.c;
      if (Math.abs(lx) < o.hw + (pad || 0) && Math.abs(lz) < o.hd + (pad || 0)) return true;
    } else if (Math.hypot(x - o.x, z - o.z) < o.r + (pad || 0)) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------
//  Themed battlefield environment
// ------------------------------------------------------------
const spinners = [];
const ENV_TEX = new Map();
let ENV = null;
const LOWQ = QUALITY === 'low'
  || Math.min(window.innerWidth || 1024, window.innerHeight || 768) < 520;

function envCanvasTex(key, draw, size) {
  if (ENV_TEX.has(key)) return ENV_TEX.get(key);
  const S = size || 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  ENV_TEX.set(key, t);
  return t;
}

function concreteTexture(tint, ruined) {
  return envCanvasTex('conc_' + tint + (ruined ? '_r' : ''), (g, S) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      const a = Math.random() * 0.07;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, Math.random() * 4 + 0.6, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.20)';
    g.lineWidth = 2;
    for (let y = 0; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    for (let x = 0; x < S; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
    if (ruined) {
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < 10; i++) {
        g.lineWidth = 1 + Math.random() * 1.8;
        g.beginPath();
        let x = Math.random() * S, y = Math.random() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.14) + ')';
        g.beginPath();
        g.arc(Math.random() * S, Math.random() * S, Math.random() * 14 + 2, 0, TAU);
        g.fill();
      }
    }
  });
}

function metalTexture(hex) {
  return envCanvasTex('metal_' + hex, (g, S) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, 0, 5, S);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 9, 0, 4, S);
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = 'rgba(90,50,30,' + (Math.random() * 0.3) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, Math.random() * 10 + 1, Math.random() * 5 + 1);
    }
  });
}

// Derive a normal map from any procedural canvas texture. This is what makes the
// flat procedural concrete, sandbag weave and brushed steel catch the sun instead
// of reading as painted cardboard. Cached per source texture.
const normalMapCache = new Map();
function normalFromTexture(tex, strength) {
  const key = tex.uuid + '|' + strength;
  if (normalMapCache.has(key)) return normalMapCache.get(key);
  const img = tex.image;
  if (!img || !img.getContext) return null;
  const S = img.width || 256;
  const src = img.getContext('2d').getImageData(0, 0, S, S).data;
  const h = new Float32Array(S * S);
  for (let i = 0, q = 0; i < S * S; i++, q += 4) {
    h[i] = (src[q] * 0.299 + src[q + 1] * 0.587 + src[q + 2] * 0.114) / 255;
  }
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(S, S);
  const wrap = (x, y) => ((y + S) % S) * S + ((x + S) % S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[wrap(x - 1, y)], r = h[wrap(x + 1, y)];
      const u = h[wrap(x, y - 1)], d = h[wrap(x, y + 1)];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const o = (y * S + x) * 4;
      nimg.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const nm = new THREE.CanvasTexture(nc);
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  nm.repeat.copy(tex.repeat);
  nm.anisotropy = 4;
  normalMapCache.set(key, nm);
  return nm;
}

function weaveTexture() {
  return envCanvasTex('weave', (g, S) => {
    g.fillStyle = '#f2f0ea';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = 'rgba(0,0,0,' + (0.03 + (y % 8 ? 0 : 0.02)) + ')';
      g.fillRect(0, y, S, 1.5);
    }
    for (let i = 0; i < 2400; i++) {
      const a = Math.random() * 0.06;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 2, 1);
    }
  }, 128);
}

function roadTexture(type) {
  return envCanvasTex('road_' + type, (g, S) => {
    const base = type === 'asphalt' ? '#262a30'
      : type === 'concrete' ? '#6d6e67'
        : type === 'dirt' ? '#a08a62'
          : type === 'mud' ? '#4e4230'
            : type === 'snow' ? '#a9bcc9' : '#4a423e';
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3600; i++) {
      const a = Math.random() * 0.10;
      g.fillStyle = Math.random() > 0.45 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, Math.random() * 5 + 0.6, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 6; i++) {
      g.lineWidth = 0.8 + Math.random() * 1.1;
      g.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
    }
    if (type === 'mud' || type === 'dirt') {
      g.fillStyle = 'rgba(0,0,0,0.16)';
      for (const x of [70, 186]) g.fillRect(x - 16, 0, 32, S);
    }
    if (type === 'snow') {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 400; i++) g.fillRect(Math.random() * S, Math.random() * S, 4, 4);
    }
  });
}

function helipadTexture() {
  return envCanvasTex('helipad', (g, S) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(58,58,54,0.95)';
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.47, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(240,240,220,0.7)';
    g.lineWidth = 9;
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.40, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(245,245,225,0.85)';
    g.font = 'bold 120px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', S / 2, S / 2 + 4);
  }, 256);
}

function flagTexture(color) {
  return envCanvasTex('flag' + color, (g, S) => {
    g.fillStyle = '#171a1e';
    g.fillRect(0, 0, S, S);
    g.fillStyle = color;
    g.fillRect(0, S * 0.62, S, S * 0.16);
    g.fillStyle = 'rgba(240,240,230,0.9)';
    g.beginPath();
    g.arc(S / 2, S * 0.34, S * 0.17, 0, TAU);
    g.fill();
    g.fillStyle = '#171a1e';
    g.beginPath();
    g.arc(S / 2, S * 0.34, S * 0.10, 0, TAU);
    g.fill();
  });
}

function signTexture(text, bg, fg) {
  return envCanvasTex('sign' + text + bg, (g, S) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(10, 10, S - 20, S - 20);
    g.fillStyle = fg;
    g.font = 'bold 54px Arial';
    const tw = g.measureText(text).width;
    if (tw > S - 46) g.font = 'bold ' + Math.max(18, Math.floor(54 * (S - 46) / tw)) + 'px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, S / 2, S / 2);
  });
}

// ---- primitive helpers (unit geometries scaled per part) ----
function addBox(parent, mat, w, h, d, x, y, z, ry, rx, rz) {
  const m = new THREE.Mesh(ENV.G.box, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  m.castShadow = ENV.shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCyl(parent, mat, rad, h, x, y, z, rx, rz, seg) {
  const m = new THREE.Mesh(seg === 8 ? ENV.G.cyl8 : ENV.G.cyl, mat);
  m.scale.set(rad, h, rad);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  m.castShadow = ENV.shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addSphere(parent, mat, rad, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(ENV.G.sph, mat);
  m.scale.set(rad * (sx === undefined ? 1 : sx), rad * (sy === undefined ? 1 : sy), rad * (sz === undefined ? 1 : sz));
  m.position.set(x, y, z);
  m.castShadow = ENV.shadows;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCone(parent, mat, rad, h, x, y, z, rx, rz) {
  const m = new THREE.Mesh(ENV.G.cone, mat);
  m.scale.set(rad, h, rad);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  m.castShadow = ENV.shadows;
  parent.add(m);
  return m;
}

function envProp(x, z, ry) {
  const g = new THREE.Group();
  g.position.set(coreX(x), 0, coreZ(z));
  g.rotation.y = ry || 0;
  arenaGroup.add(g);
  return g;
}

// ---- themed props ----
function buildBuilding(x, z, w, d, floors, ry, opts) {
  const o = opts || {};
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const fh = 48;
  const h = floors * fh;
  const glass = o.lit ? M.glassLit : M.glass;
  addGroundAO(g, w * 1.5, d * 1.65);
  // concrete plinth and corner pilasters so the block reads as built, not extruded
  addBox(g, M.concreteDark, w + 14, 10, d + 14, 0, 5, 0);
  addBox(g, M.concrete, w, h, d, 0, h / 2 + 7, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addBox(g, M.concreteDark, 15, h, 15, sx * (w / 2 - 6), h / 2 + 7, sz * (d / 2 - 6));
  }
  for (let f = 1; f < floors; f++) addBox(g, M.band, w + 5, 5, d + 5, 0, f * fh + 4, 0);
  // glazed floor bands with mullions and sills
  for (let f = 1; f < floors; f++) {
    const y = f * fh + fh * 0.36;
    for (const sz of [-1, 1]) {
      addBox(g, glass, w * 0.8, fh * 0.32, 3, 0, y, sz * (d / 2 + 2));
      addBox(g, M.band, w * 0.84, 4, 5, 0, y - fh * 0.2, sz * (d / 2 + 3));
      const n = Math.max(3, Math.round(w / 42));
      for (let i = 0; i <= n; i++) addBox(g, M.darkMetal, 3, fh * 0.34, 4, -w * 0.4 + (w * 0.8 / n) * i, y, sz * (d / 2 + 3));
    }
    for (const sx of [-1, 1]) {
      addBox(g, glass, 3, fh * 0.32, d * 0.62, sx * (w / 2 + 2), y, 0);
      const n = Math.max(2, Math.round(d / 60));
      for (let i = 0; i <= n; i++) addBox(g, M.darkMetal, 4, fh * 0.34, 3, sx * (w / 2 + 3), y, -d * 0.31 + (d * 0.62 / n) * i);
    }
  }
  // parapet cap, roof plant and vents
  addBox(g, M.concreteDark, w + 10, 8, d + 10, 0, h + 10, 0);
  addBox(g, M.concrete, w + 10, 12, 6, 0, h + 15, d / 2 + 2);
  addBox(g, M.concrete, w + 10, 12, 6, 0, h + 15, -d / 2 - 2);
  addBox(g, M.metal, 30, 14, 26, w * 0.22, h + 21, d * 0.16);
  addBox(g, M.darkMetal, 34, 4, 30, w * 0.22, h + 28, d * 0.16);
  addBox(g, M.metal, 16, 10, 16, -w * 0.28, h + 19, -d * 0.2);
  addCyl(g, M.darkMetal, 7, 12, -w * 0.28, h + 30, -d * 0.2);
  for (let i = 0; i < 4; i++) addBox(g, M.darkMetal, 10, 6, 16, -w * 0.36 + i * 20, h + 15, -d * 0.34);
  // downpipes, wall conduit and exterior lights
  for (const sx of [-1, 1]) {
    addCyl(g, M.darkMetal, 2.6, h, sx * (w / 2 - 12), h / 2 + 8, d / 2 + 4, 0, 0, 8);
    addBox(g, M.darkMetal, 3, h * 0.7, 3, sx * (w / 2 + 4), h * 0.4, -d * 0.3);
  }
  for (const sx of [-1, 1]) {
    addBox(g, M.darkMetal, 8, 4, 12, sx * (w * 0.3), fh * 0.86, d / 2 + 6);
    addBox(g, M.lamp, 6, 3, 9, sx * (w * 0.3), fh * 0.84, d / 2 + 7);
  }
  // entrance: steps, canopy, door frame and bollards
  addBox(g, M.concreteDark, w * 0.34, 8, 26, 0, 4, d / 2 + 18);
  addBox(g, M.concreteDark, w * 0.3, 6, 22, 0, fh - 14, d / 2 + 12);
  addBox(g, M.metal, w * 0.3, 3, 24, 0, fh - 9, d / 2 + 12);
  addBox(g, M.darkMetal, w * 0.18, fh * 0.64, 4, 0, fh * 0.32 + 7, d / 2 + 2);
  addBox(g, M.glassDark, w * 0.15, fh * 0.56, 3, 0, fh * 0.32 + 7, d / 2 + 4);
  addBox(g, M.lamp, w * 0.3, 2, 22, 0, fh - 7, d / 2 + 12);
  for (const sx of [-1, 1]) addCyl(g, M.hazard, 4, 16, sx * w * 0.22, 8, d / 2 + 28, 0, 0, 8);
  // rooftop antenna
  addCyl(g, M.darkMetal, 2, 46, -w * 0.3, h + 36, d * 0.28);
  addSphere(g, M.lamp, 3.4, -w * 0.3, h + 60, d * 0.28);
  addBoxObstacle(x, z, w / 2 + 9, d / 2 + 9, ry);
  return g;
}

function buildRuin(x, z, ry, scale) {
  const M = ENV.M;
  const s = scale || 1;
  const g = envProp(x, z, ry);
  addBox(g, M.concreteDark, 190 * s, 10, 170 * s, 0, 5, 0);
  const slabs = ENV.low ? 2 : 3;
  for (let i = 0; i < slabs; i++) {
    const h = rand(52, 132) * s;
    const w = rand(46, 74) * s;
    const slab = addBox(g, M.concrete, w, h, 16 * s, -70 * s + i * 66 * s, h / 2, -58 * s + rand(-8, 8),
      rand(-0.16, 0.16), 0, rand(-0.05, 0.05));
    for (let k = 0; k < 3; k++) {
      addCyl(g, M.rust, 1.7, rand(18, 32), slab.position.x + rand(-w * 0.35, w * 0.35),
        h + rand(4, 10), slab.position.z + rand(-5, 5), rand(-0.3, 0.3), rand(-0.3, 0.3));
    }
    // window holes
    addBox(g, M.glassDark, w * 0.6, 14, 3, slab.position.x, h * 0.62, slab.position.z + 9 * s);
  }
  for (let k = 0; k < 7; k++) {
    const r = rand(10, 26) * s;
    const m = new THREE.Mesh(ENV.G.dodeca, k % 2 ? M.concrete : M.concreteDark);
    m.scale.set(r, r * 0.7, r);
    m.position.set(rand(-92, 92) * s, rand(4, 14), rand(-80, 80) * s);
    m.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
  }
  addBoxObstacle(x, z, 96 * s, 86 * s, ry);
  return g;
}

function buildHangar(x, z, ry, width) {
  const M = ENV.M;
  const w = width || 280, d = 190, h = 96;
  const g = envProp(x, z, ry);
  addGroundAO(g, w * 1.35, d * 1.45);
  addBox(g, M.concreteDark, w + 16, 9, d + 16, 0, 4.5, 0);
  addBox(g, M.concrete, w, h, d, 0, h / 2 + 8, 0);
  // structural ribs and wall panels
  for (let i = 0; i <= 6; i++) {
    addBox(g, M.concreteDark, 10, h, 8, -w / 2 + (w / 6) * i, h / 2 + 8, d / 2 + 4);
    addBox(g, M.concreteDark, 10, h, 8, -w / 2 + (w / 6) * i, h / 2 + 8, -d / 2 - 4);
  }
  addBox(g, M.band, w + 6, 6, d + 6, 0, h * 0.62 + 8, 0);
  // arched roof approximated with angled slabs, plus ridge cap and vents
  addBox(g, M.metal, w + 14, 8, d * 0.56, 0, h + 18, 0);
  addBox(g, M.metal, w + 14, 34, d * 0.34, 0, h + 28, -d * 0.34, 0, -0.34);
  addBox(g, M.metal, w + 14, 34, d * 0.34, 0, h + 28, d * 0.34, 0, 0.34);
  addBox(g, M.darkMetal, w + 20, 4, 12, 0, h + 40, 0);
  for (let i = 0; i < 3; i++) {
    addBox(g, M.darkMetal, 28, 10, 28, -w * 0.3 + i * w * 0.3, h + 38, d * 0.2);
    addCyl(g, M.metal, 8, 8, -w * 0.3 + i * w * 0.3, h + 45, d * 0.2);
  }
  // massive roller door, rails and frame
  addBox(g, M.darkMetal, 7, h * 0.84, d * 0.78, w / 2 + 2, h * 0.42 + 8, 0);
  for (let i = 0; i < 9; i++) addBox(g, M.band, 5, 4, d * 0.78, w / 2 + 6, h * 0.1 + i * h * 0.09, 0);
  addBox(g, M.metal, 13, 10, d * 0.88, w / 2 + 5, h * 0.88 + 8, 0);
  addBox(g, M.hazard, 8, h * 0.82, 6, w / 2 + 4, h * 0.42 + 8, d * 0.4);
  addBox(g, M.hazard, 8, h * 0.82, 6, w / 2 + 4, h * 0.42 + 8, -d * 0.4);
  for (let i = 0; i < 4; i++) addBox(g, M.hazard, 4, 16, d * 0.1, w / 2 + 9, 12, -d * 0.3 + i * d * 0.2);
  addBox(g, M.lamp, 12, 5, 26, w / 2 + 8, h * 0.8 + 8, 0);
  addBox(g, M.lamp, 8, 4, 18, w / 2 + 8, h * 0.8 + 8, d * 0.28);
  addBox(g, M.lamp, 8, 4, 18, w / 2 + 8, h * 0.8 + 8, -d * 0.28);
  addBoxObstacle(x, z, w / 2 + 7, d / 2 + 7, ry);
  return g;
}

function buildContainer(x, z, ry, stack, tint) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const mat = ENV.containerMat(tint || 0);
  addGroundAO(g, 160, 90);
  let y = 0;
  for (let i = 0; i < (stack || 1); i++) {
    const h = 46, w = 118, d = 48;
    addBox(g, mat, w, h, d, rand(-4, 4), y + h / 2, rand(-4, 4));
    addBox(g, M.darkMetal, w + 2, 4, d + 2, 0, y + 3, 0);
    addBox(g, M.darkMetal, w + 2, 4, d + 2, 0, y + h - 2, 0);
    // corrugation, end doors and locking bars
    for (let k = 0; k < 8; k++) addBox(g, M.band, 4, h - 6, 2, -w / 2 + 8 + k * ((w - 16) / 7), y + h / 2, d / 2 + 1);
    addBox(g, M.darkMetal, 3, h - 10, d * 0.8, w / 2 + 1, y + h / 2, 0);
    addBox(g, M.hazard, w * 0.5, 4, 2, 0, y + h * 0.78, d / 2 + 2);
    y += h;
  }
  addBoxObstacle(x, z, 61, 26, ry);
  return g;
}

function buildWatchtower(x, z, ry, lit) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addGroundAO(g, 190, 190);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, M.wood, 9, 150, 9, sx * 32, 75, sz * 32, 0, 0, sx * 0.02);
  addBox(g, M.wood, 96, 8, 96, 0, 150, 0);
  addBox(g, M.metal, 100, 3, 100, 0, 155, 0);
  for (const sx of [-1, 1]) {
    addBox(g, M.wood, 96, 30, 4, 0, 172, sx * 46);
    addBox(g, M.wood, 4, 30, 96, sx * 46, 172, 0);
  }
  addBox(g, M.rust, 112, 7, 112, 0, 192, 0);
  addBox(g, M.sand, 30, 18, 22, 0, 162, 26);
  // spotlight
  addCyl(g, M.darkMetal, 9, 14, 0, 208, 0, 0, Math.PI / 2);
  addCyl(g, M.lamp, 7, 5, 10, 208, 0, 0, Math.PI / 2);
  if (lit !== false) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.scale.set(140, 380, 140);
    cone.position.set(120, 40, 0);
    cone.rotation.z = -Math.PI / 2 + 0.55;
    g.add(cone);
  }
  for (let l = 0; l < 6; l++) addBox(g, M.metal, 20, 3, 3, 32, 24 + l * 24, -40);
  addObstacle(x, z, 64);
  return g;
}

function buildTent(x, z, ry, tint) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const w = 120, d = 96, h = 52;
  const mat = tint === 1 ? M.tan : M.olive;
  addGroundAO(g, 190, 150);
  addBox(g, mat, w, h, d, 0, h / 2, 0);
  addBox(g, mat, w + 8, 30, d * 0.64, 0, h + 12, -d * 0.2, 0, -0.28);
  addBox(g, mat, w + 8, 30, d * 0.64, 0, h + 12, d * 0.2, 0, 0.28);
  addBox(g, M.darkMetal, 36, h * 0.8, 3, 0, h * 0.4, d / 2 + 2);
  addBox(g, M.darkMetal, w * 0.9, 4, 4, 0, h - 4, d / 2 + 1);
  // guy ropes
  for (const s of [-1, 1]) {
    addBox(g, M.rope, 2, 60, 2, s * (w / 2 + 24), 34, 0, 0, 0, s * 0.5);
  }
  addObstacle(x, z, 66);
  return g;
}

function buildHumvee(x, z, ry, wrecked) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  if (wrecked) g.rotation.z = rand(-0.08, 0.08);
  const body = wrecked ? M.burnt : M.olive;
  addGroundAO(g, 150, 86);
  // ladder frame, suspension and underbody
  addBox(g, M.darkMetal, 124, 10, 44, 0, 24, 0);
  addBox(g, M.darkMetal, 18, 14, 56, 40, 28, 0);
  addBox(g, M.darkMetal, 18, 14, 56, -40, 28, 0);
  addBox(g, M.rust, 30, 8, 36, -6, 20, 0);
  // armoured tub, hood and cab
  addBox(g, body, 118, 24, 56, -4, 36, 0);
  addBox(g, body, 44, 18, 54, 46, 50, 0, 0, 0, -0.07);
  addBox(g, M.olive, 60, 34, 58, 14, 58, 0);
  addBox(g, M.darkMetal, 60, 5, 58, 14, 76, 0);
  // split windshield, side glass and door lines
  for (const sz of [-1, 1]) addBox(g, M.glass, 4, 18, 24, 43, 64, sz * 14, 0, 0, -0.2);
  for (const sz of [-1, 1]) {
    addBox(g, M.glass, 30, 15, 3, 8, 64, sz * 29.5);
    addBox(g, M.band, 2, 30, 3, 34, 50, sz * 29.6);
    addBox(g, M.band, 2, 30, 3, -12, 50, sz * 29.6);
    addBox(g, M.darkMetal, 10, 3, 4, 24, 58, sz * 30.2);
    addBox(g, M.olive, 46, 16, 4, -4, 44, sz * 31);
    addBox(g, M.darkMetal, 8, 4, 18, 8, 20, sz * 34);
  }
  // brush guard, grille, bumper, winch and lights
  addBox(g, M.darkMetal, 6, 30, 56, 66, 44, 0);
  for (let i = 0; i < 7; i++) addBox(g, M.metal, 4, 26, 3, 69, 44, -24 + i * 8);
  addBox(g, M.metal, 6, 4, 50, 69, 54, 0);
  addBox(g, M.darkMetal, 12, 10, 62, 63, 28, 0);
  addCyl(g, M.metal, 7, 16, 69, 32, 0, 0, 0, 8);
  for (const sz of [-1, 1]) {
    addBox(g, M.lamp, 8, 7, 10, 69, 48, sz * 20);
    addBox(g, M.darkMetal, 4, 8, 12, 68, 48, sz * 20);
    addBox(g, M.beacon, 4, 4, 6, -64, 50, sz * 20);
  }
  // wheels: tyre, rim, hub and lugs
  for (const wx of [-40, 42]) for (const sz of [-1, 1]) {
    addCyl(g, M.darkMetal, 17, 12, wx, 17, sz * 30, Math.PI / 2, 0, 12);
    addCyl(g, M.rust, 10, 13.5, wx, 17, sz * 30, Math.PI / 2, 0, 10);
    addCyl(g, M.metal, 4, 15, wx, 17, sz * 30, Math.PI / 2, 0, 8);
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      addBox(g, M.darkMetal, 2, 2, 2, wx + Math.cos(a) * 6, 17 + Math.sin(a) * 6, sz * 30);
    }
    addBox(g, body, 44, 6, 10, wx, 38, sz * 30);
    addBox(g, M.darkMetal, 40, 6, 5, wx, 32, sz * 35, 0, 0.2);
  }
  // turret ring, shield, M2 and ammo can
  addCyl(g, M.metal, 17, 7, 14, 79, 0);
  addCyl(g, M.darkMetal, 13, 6, 14, 83, 0);
  addBox(g, M.olive, 26, 16, 4, 14, 90, -18, 0, 0, 0.1);
  addBox(g, M.olive, 26, 16, 4, 14, 90, 18, 0, 0, -0.1);
  addBox(g, M.darkMetal, 26, 6, 30, 6, 87, 0);
  addBox(g, M.metal, 6, 6, 4, 18, 90, 0);
  addCyl(g, M.darkMetal, 3.2, 52, 44, 92, 0, 0, Math.PI / 2, 8);
  addBox(g, M.olive, 12, 12, 14, -6, 90, 10);
  addBox(g, M.olive, 10, 8, 10, 14, 92, -6);
  // stowage, spare, cans and antenna
  addBox(g, M.olive, 26, 14, 26, -46, 58, 0);
  addBox(g, M.tan, 18, 22, 12, -52, 48, 24);
  addBox(g, M.tan, 18, 22, 12, -52, 48, -24);
  addCyl(g, M.darkMetal, 15, 8, -63, 40, 0, 0, 0, 10);
  addCyl(g, M.darkMetal, 2, 60, -30, 86, 24, 0, 0, 6);
  addBox(g, M.tan, 34, 10, 12, -20, 82, -24, 0, 0, 0.2);
  for (const sz of [-1, 1]) addBox(g, M.darkMetal, 3, 14, 3, 44, 56, sz * 27);
  if (wrecked) {
    addCone(g, M.fire, 14, 48, 10, 66, 0);
    addBox(g, M.burnt, 40, 10, 30, 6, 74, 0, 0.3);
  }
  addObstacle(x, z, 76);
  return g;
}

function buildTruck(x, z, ry, wrecked) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const body = wrecked ? M.burnt : M.olive;
  const canvasMat = wrecked ? M.burnt : M.tan;
  addGroundAO(g, 176, 92);
  // frame rails and axles
  addBox(g, M.darkMetal, 158, 10, 44, -8, 28, 0);
  for (const wx of [56, -16, -78]) addCyl(g, M.rust, 4, 62, wx, 18, 0, Math.PI / 2, 0, 8);
  // bonnet, cab, roof and glass
  addBox(g, body, 56, 24, 52, 76, 48, 0, 0, 0, -0.05);
  addBox(g, M.darkMetal, 60, 8, 54, 74, 34, 0);
  for (let i = 0; i < 6; i++) addBox(g, M.darkMetal, 3, 16, 46, 103, 34, 0, 0, 0, 0);
  addBox(g, M.olive, 6, 6, 58, 104, 30, 0);
  addBox(g, body, 50, 36, 56, 42, 52, 0);
  addBox(g, body, 48, 6, 56, 42, 72, 0);
  addBox(g, M.glass, 3, 20, 46, 66, 62, 0, 0, 0, -0.12);
  for (const sz of [-1, 1]) {
    addBox(g, M.glass, 22, 16, 3, 42, 60, sz * 28.5);
    addBox(g, M.darkMetal, 10, 3, 4, 34, 54, sz * 29);
    addBox(g, M.darkMetal, 4, 24, 4, 24, 60, sz * 30);
    addBox(g, M.glass, 8, 10, 2, 24, 66, sz * 31);
    addBox(g, M.darkMetal, 30, 3, 3, 55, 64, sz * 29);
    addBox(g, M.lamp, 7, 7, 9, 104, 38, sz * 20);
    addBox(g, M.beacon, 4, 5, 7, -90, 40, sz * 24);
  }
  // cargo bed, side rails, ribs and tailgate
  addBox(g, M.darkMetal, 118, 8, 58, -34, 38, 0);
  addBox(g, body, 120, 12, 6, -34, 44, 29);
  addBox(g, body, 120, 12, 6, -34, 44, -29);
  addBox(g, body, 6, 22, 58, -92, 46, 0);
  addBox(g, canvasMat, 112, 34, 56, -34, 62, 0);
  addBox(g, canvasMat, 112, 12, 48, -34, 82, 0);
  for (let i = 0; i < 6; i++) {
    const bx = -86 + i * 20;
    addCyl(g, M.wood, 1.8, 58, bx, 84, 0, Math.PI / 2, 0, 6);
    addBox(g, M.olive, 3, 4, 20, bx, 66, 0);
  }
  addBox(g, M.olive, 116, 3, 54, -34, 45, 0);
  // wheels with hubs, dual rears
  for (const wx of [56, -16, -78]) for (const sz of [-1, 1]) {
    addCyl(g, M.darkMetal, 19, 13, wx, 18, sz * 30, Math.PI / 2, 0, 12);
    addCyl(g, M.rust, 11, 14, wx, 18, sz * 30, Math.PI / 2, 0, 10);
    addCyl(g, M.metal, 4, 15, wx, 18, sz * 30, Math.PI / 2, 0, 8);
    addBox(g, body, 46, 6, 10, wx, 41, sz * 30);
    addBox(g, M.darkMetal, 8, 18, 4, wx - 24, 30, sz * 35, 0, 0, 0.2);
  }
  for (const sz of [-1, 1]) {
    addCyl(g, M.darkMetal, 13, 10, -16, 18, sz * 41, Math.PI / 2, 0, 10);
    addCyl(g, M.darkMetal, 13, 10, -78, 18, sz * 41, Math.PI / 2, 0, 10);
  }
  // fuel tank, toolbox, exhaust stack and mirrors
  addCyl(g, M.metal, 12, 34, 12, 26, -34, 0, Math.PI / 2, 10);
  addBox(g, M.olive, 26, 16, 16, 4, 38, 32);
  addCyl(g, M.darkMetal, 3.2, 44, 66, 92, -28, 0, 0, 6);
  addBox(g, M.darkMetal, 6, 6, 6, 66, 114, -28);
  for (const sz of [-1, 1]) {
    addBox(g, M.darkMetal, 4, 26, 4, 66, 84, sz * 32);
    addBox(g, M.glass, 3, 12, 10, 66, 96, sz * 34);
  }
  addCyl(g, M.darkMetal, 16, 8, -34, 48, 26, Math.PI / 2, 0, 10);
  addBox(g, M.tan, 26, 12, 12, -50, 48, -26);
  if (wrecked) {
    addBox(g, M.burnt, 104, 40, 58, -34, 58, 0);
    addCone(g, M.fire, 12, 40, 40, 60, 0);
  }
  addObstacle(x, z, 82);
  return g;
}

function buildTank(x, z, ry, wrecked) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const armor = wrecked ? M.burnt : M.olive;
  addGroundAO(g, 186, 118);
  // lower hull, sloped glacis and rear plate
  addBox(g, armor, 138, 26, 68, -4, 34, 0);
  addBox(g, armor, 42, 12, 68, 72, 40, 0, 0, 0, 0.5);
  addBox(g, M.darkMetal, 20, 24, 66, -80, 34, 0, 0, 0, -0.18);
  addBox(g, armor, 108, 16, 76, 4, 50, 0);
  // running gear: tracks, pads, road wheels, sprocket and idler
  for (const sz of [-1, 1]) {
    addBox(g, M.darkMetal, 164, 26, 24, -4, 20, sz * 48);
    for (let i = 0; i < 11; i++) addBox(g, M.band, 13, 4, 26, -76 + i * 15, 34, sz * 48);
    for (let i = 0; i < 6; i++) addCyl(g, M.rust, 14, 8, -60 + i * 26, 17, sz * 49, Math.PI / 2, 0, 10);
    addCyl(g, M.darkMetal, 16, 10, 74, 22, sz * 48, Math.PI / 2, 0, 10);
    addCyl(g, M.darkMetal, 13, 10, -78, 22, sz * 48, Math.PI / 2, 0, 10);
    addBox(g, armor, 132, 14, 6, -4, 44, sz * 56);
    for (let i = 0; i < 4; i++) addBox(g, M.olive, 20, 10, 4, 30 - i * 30, 46, sz * 58);
  }
  // turret cheeks, bustle and roof
  addBox(g, armor, 84, 18, 64, 12, 66, 0);
  addBox(g, armor, 34, 16, 56, 48, 66, 0, 0, 0, -0.16);
  addBox(g, armor, 26, 14, 54, -30, 68, 0, 0, 0, 0.14);
  addBox(g, M.darkMetal, 34, 12, 58, -50, 66, 0);
  for (let i = 0; i < 4; i++) addBox(g, M.olive, 12, 8, 12, -58 + i * 6, 74, -24 + (i % 2) * 48);
  for (const sz of [-1, 1]) addBox(g, M.darkMetal, 24, 10, 6, 22, 76, sz * 32);
  // mantlet, barrel, bore evacuator and muzzle brake
  addBox(g, M.darkMetal, 26, 22, 30, 54, 68, 0);
  addCyl(g, M.darkMetal, 5.2, 118, 108, 70, 0, 0, Math.PI / 2, 10);
  addCyl(g, M.olive, 8.5, 20, 94, 70, 0, 0, Math.PI / 2, 10);
  addCyl(g, M.darkMetal, 8, 18, 158, 70, 0, 0, Math.PI / 2, 10);
  addCyl(g, M.darkMetal, 6, 6, 168, 70, 0, 0, Math.PI / 2, 8);
  // cupola, hatch, machine gun and periscopes
  addCyl(g, M.olive, 22, 14, 6, 82, -12, 0, 0, 12);
  addCyl(g, M.darkMetal, 18, 5, 6, 90, -12, 0, 0, 12);
  addCyl(g, M.darkMetal, 2.6, 40, 26, 94, -12, 0, Math.PI / 2, 8);
  addBox(g, M.metal, 6, 6, 8, 6, 94, -12);
  for (let i = 0; i < 3; i++) addBox(g, M.glass, 6, 3, 5, 4, 87, -2 + i * 8);
  addCyl(g, M.darkMetal, 14, 5, 2, 76, 22, 0, 0, 10);
  // smoke dischargers, tow cables, stowage, lights and antennas
  for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) {
    addCyl(g, M.darkMetal, 3.4, 10, 46, 78, sz * (24 + i * 7), 0, Math.PI / 2, 6);
  }
  addBox(g, M.darkMetal, 54, 3, 3, 6, 78, 30);
  addBox(g, M.darkMetal, 54, 3, 3, 6, 78, -30);
  addBox(g, M.tan, 22, 12, 14, -52, 78, 18);
  addBox(g, M.tan, 18, 10, 12, -52, 78, -16);
  for (const sz of [-1, 1]) {
    addBox(g, M.lamp, 7, 6, 9, 86, 50, sz * 22);
    addCyl(g, M.darkMetal, 1.6, 40, -62, 88, sz * 26, 0, 0, 6);
  }
  addBox(g, M.darkMetal, 20, 6, 20, -70, 52, 0);
  if (wrecked) {
    addBox(g, M.burnt, 130, 30, 64, -4, 36, 0);
    g.rotation.z = 0.1;
    addCone(g, M.fire, 16, 60, 20, 66, 6);
  }
  addObstacle(x, z, 96);
  return g;
}

function buildHeli(x, z, ry, wrecked) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const body = wrecked ? M.burnt : M.olive;
  addGroundAO(g, 240, 130);
  // fuselage, nose and canopy
  addSphere(g, body, 42, 18, 50, 0, 1.6, 0.95, 1);
  addSphere(g, body, 26, 62, 48, 0, 1.2, 0.8, 0.86);
  addSphere(g, M.glass, 30, 54, 52, 0, 0.92, 0.72, 0.82);
  addBox(g, M.darkMetal, 20, 3, 26, 74, 62, 0, 0, 0, -0.3);
  // engine deck, exhausts and intakes
  addBox(g, body, 60, 18, 46, 2, 78, 0);
  addBox(g, M.darkMetal, 44, 6, 40, 2, 89, 0);
  for (const sz of [-1, 1]) {
    addBox(g, M.darkMetal, 22, 14, 12, -12, 82, sz * 26);
    addCyl(g, M.darkMetal, 6, 16, -26, 80, sz * 22, 0, Math.PI / 2, 8);
    addBox(g, M.glass, 16, 10, 2, 40, 58, sz * 24);
    addBox(g, M.glass, 10, 8, 2, 16, 58, sz * 26);
  }
  // tail boom, fin and stabiliser
  addCyl(g, body, 9, 96, -62, 52, 0, 0, Math.PI / 2, 8);
  addCyl(g, body, 5, 24, -110, 52, 0, 0, 0, 8);
  addBox(g, body, 5, 30, 22, -116, 62, 0, 0, 0, -0.2);
  addBox(g, body, 14, 4, 26, -104, 54, 0);
  addBox(g, M.darkMetal, 3, 8, 24, -106, 72, 0);
  addCyl(g, M.darkMetal, 2.2, 50, -96, 52, 22, Math.PI / 2, 0, 6);
  // main rotor head and blades
  addCyl(g, M.metal, 7, 10, -2, 92, 0, 0, 0, 8);
  addCyl(g, M.darkMetal, 13, 6, -2, 98, 0, 0, 0, 10);
  if (!wrecked) {
    const rotor = new THREE.Group();
    rotor.position.set(-2, 102, 0);
    for (let i = 0; i < 4; i++) {
      const blade = addBox(rotor, M.darkMetal, 190, 2, 9, 0, 0, 0, i * Math.PI / 2);
      blade.position.x = 0;
    }
    spinners.push(rotor);
    g.add(rotor);
    addCyl(g, M.metal, 3, 10, -96, 52, 22, 0, Math.PI / 2, 6);
    const tail = new THREE.Group();
    tail.position.set(-96, 52, 22);
    addBox(tail, M.darkMetal, 3, 44, 4, 0, 0, 0);
    addBox(tail, M.darkMetal, 3, 4, 44, 0, 0, 0);
    spinners.push(tail);
    g.add(tail);
  }
  // skids and struts
  for (const sz of [-1, 1]) {
    addBox(g, M.darkMetal, 96, 5, 6, 10, 4, sz * 48);
    addBox(g, M.darkMetal, 5, 26, 5, 48, 17, sz * 48, 0, 0, 0.1);
    addBox(g, M.darkMetal, 5, 26, 5, -20, 17, sz * 48, 0, 0, -0.1);
    addBox(g, M.darkMetal, 5, 20, 34, 40, 26, sz * 40);
  }
  // stub wings with rocket pods and door gun
  for (const sz of [-1, 1]) {
    addBox(g, body, 34, 10, 46, 4, 58, sz * 48);
    addCyl(g, M.darkMetal, 9, 40, 4, 56, sz * 64, 0, Math.PI / 2, 10);
    for (let i = 0; i < 3; i++) addCyl(g, M.rust, 3.2, 4, 22, 56, sz * (58 + i * 6), 0, Math.PI / 2, 6);
  }
  addCyl(g, M.darkMetal, 3, 34, 22, 40, 44, 0, Math.PI / 2, 8);
  addBox(g, M.olive, 16, 12, 12, 8, 44, 40);
  addBox(g, M.darkMetal, 3, 22, 3, -34, 76, 20);
  addBox(g, M.lamp, 4, 4, 6, 78, 50, 0);
  addBox(g, M.beacon, 4, 4, 4, -4, 92, 20);
  if (wrecked) { g.rotation.z = 0.22; addBox(g, M.burnt, 70, 60, 70, 10, 52, 0); }
  addObstacle(x, z, 86);
  return g;
}

function buildSilo(x, z, scale) {
  const M = ENV.M;
  const s = scale || 1;
  const g = envProp(x, z, 0);
  addCyl(g, M.metal, 42 * s, 150 * s, 0, 75 * s, 0, 0, 0, 12);
  addSphere(g, M.metal, 42 * s, 0, 150 * s, 0, 1, 0.5, 1);
  addCyl(g, M.darkMetal, 44 * s, 6, 0, 120 * s, 0, 0, 0, 12);
  addBox(g, M.darkMetal, 6, 110 * s, 8, 44 * s, 80 * s, 0);
  for (let i = 0; i < 5; i++) addBox(g, M.darkMetal, 20 * s, 3, 3, 44 * s, 24 * i * s + 20, 0);
  addCyl(g, M.rust, 7 * s, 90, -30 * s, 40 * s, 26 * s, 0, 0, 8);
  addObstacle(x, z, 54 * s);
  return g;
}

function buildChimney(x, z, h) {
  const M = ENV.M;
  const H = h || 300;
  const g = envProp(x, z, 0);
  addCyl(g, M.brick, 26, H, 0, H / 2, 0, 0, 0, 12);
  for (let i = 1; i < 5; i++) addCyl(g, M.band, 28, 5, 0, (H / 5) * i, 0, 0, 0, 12);
  addCyl(g, M.darkMetal, 28, 12, 0, H + 4, 0, 0, 0, 12);
  addCyl(g, M.band, 30, 4, 0, H * 0.62, 0, 0, 0, 12);
  addObstacle(x, z, 34);
  return g;
}

function buildPipeChain(x, z, ry, len) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addCyl(g, M.rust, 12, len, 0, 46, 0, 0, Math.PI / 2, 12);
  addCyl(g, M.rust, 7, len, 0, 74, 14, 0, Math.PI / 2, 8);
  for (const s of [-1, 1]) {
    addBox(g, M.metal, 8, 48, 8, s * (len / 2 - 18), 24, 0);
    addBox(g, M.metal, 8, 48, 8, s * (len / 2 - 18), 24, 26);
  }
  addObstacle(x, z, Math.min(90, len * 0.3));
  return g;
}

function buildPalm(x, z, h) {
  const M = ENV.M;
  const H = h || rand(150, 240);
  const g = envProp(x, z, rand(0, TAU));
  let px = 0, py = 0;
  for (let i = 0; i < 3; i++) {
    const seg = H / 3;
    addCyl(g, M.bark, 7 - i, seg, px, py + seg / 2, 0, 0, 0.06 + i * 0.03, 7);
    px += seg * 0.05;
    py += seg * 0.96;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const frond = addBox(g, M.frond, 90, 2.4, 17, px + Math.cos(a) * 38, py + 4, Math.sin(a) * 38, -a, 0, -0.34);
    frond.position.y = py + 6;
  }
  addSphere(g, M.coco, 6, px, py - 4, 0);
  return g;
}

function buildPine(x, z, h) {
  const M = ENV.M;
  const H = h || rand(120, 210);
  const g = envProp(x, z, rand(0, TAU));
  addCyl(g, M.bark, 8, H * 0.4, 0, H * 0.2, 0, 0, 0, 7);
  for (let i = 0; i < 3; i++) {
    const r = 48 - i * 12;
    addCone(g, M.pine, r, 70, 0, H * 0.4 + i * 38, 0);
  }
  return g;
}

function buildDeadTree(x, z) {
  const M = ENV.M;
  const H = rand(100, 190);
  const g = envProp(x, z, rand(0, TAU));
  addCyl(g, M.bark, 8, H, 0, H / 2, 0, 0, rand(-0.08, 0.08), 7);
  for (let i = 0; i < 4; i++) {
    addCyl(g, M.bark, 3.4, H * 0.38, rand(-6, 6), H * (0.5 + i * 0.1), 0, rand(-0.5, 0.5), rand(0.5, 1.0), 6);
  }
  return g;
}

function buildGrass(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, rand(0, TAU));
  for (let i = 0; i < 5; i++) {
    const h = rand(10, 26);
    const m = addCone(g, M.foliageDark, rand(1.6, 3.2), h, rand(-11, 11), h / 2, rand(-11, 11), rand(-0.22, 0.22), rand(-0.22, 0.22));
    m.castShadow = false;
  }
  return g;
}

function buildBush(x, z) {
  const M = ENV.M;
  const r = rand(13, 25);
  const g = envProp(x, z, rand(0, TAU));
  addSphere(g, M.foliage, r, 0, r * 0.7, 0, 1.2, 0.7, 1.1);
  addSphere(g, M.foliageDark, r * 0.8, r * 0.6, r * 0.5, r * 0.3, 1, 0.8, 1);
  addSphere(g, M.foliage, r * 0.7, -r * 0.5, r * 0.6, -r * 0.4, 1, 0.9, 1);
  return g;
}

function buildRocks(x, z, n, scale) {
  const g = envProp(x, z, rand(0, TAU));
  const s0 = scale || 1;
  for (let i = 0; i < (n || 4); i++) {
    const r = rand(14, 40) * s0;
    const m = new THREE.Mesh(ENV.G.dodeca, i % 3 ? ENV.M.rock : ENV.M.rockDark);
    m.scale.set(r, r * rand(0.5, 0.9), r * rand(0.8, 1.2));
    m.position.set(rand(-50, 50), r * 0.3, rand(-50, 50));
    m.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
  }
  addObstacle(x, z, 40 * s0);
  return g;
}

function buildBarrier(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addGroundAO(g, 130, 70);
  // jersey barrier: flared base, chamfered body, lifting loops and reflectors
  addBox(g, M.concrete, 86, 9, 30, 0, 4.5, 0);
  addBox(g, M.concrete, 82, 10, 22, 0, 13, 0);
  addBox(g, M.concrete, 80, 5, 13, 0, 20.5, 0);
  addBox(g, M.hazard, 58, 3, 10, 0, 23.4, 0, 0, 0, 0.02);
  for (const sx of [-1, 1]) {
    addBox(g, M.darkMetal, 4, 9, 4, sx * 26, 27, 0);
    addBox(g, M.lamp, 5, 2, 1.4, sx * 18, 21, 7.2);
    addBox(g, M.lamp, 5, 2, 1.4, sx * 18, 21, -7.2);
  }
  addObstacle(x, z, 48);
  return g;
}

function buildSandbags(x, z, ry, rows) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const R = rows || 2;
  addGroundAO(g, 170, 60);
  for (let row = 0; row < R; row++) {
    for (let b = 0; b < 7; b++) {
      const bag = addBox(g, b % 2 ? M.sand : M.sandAlt, 19, 10, 13,
        -66 + b * 21 + (row ? 10 : 0), 5.5 + row * 10, rand(-1.5, 1.5), rand(-0.09, 0.09));
      bag.scale.set(19 * rand(0.96, 1.04), 10, 13 * rand(0.92, 1.06));
      bag.rotation.y = rand(-0.05, 0.05);
      // stitched seam down the middle of every bag
      addBox(g, M.tan, 2.2, 9, 12, bag.position.x, bag.position.y, bag.position.z, bag.rotation.y);
    }
  }
  for (const sx of [-1, 1]) {
    addCyl(g, M.wood, 2.4, 30, sx * 74, 15, -6, 0, 0, 8);
    addCyl(g, M.wood, 2.4, 30, sx * 74, 15, 6, 0, 0, 8);
  }
  addBox(g, M.wood, 154, 3, 6, 0, R * 10 + 7, -12);
  addObstacle(x, z, 54);
  return g;
}

function buildCrates(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addGroundAO(g, 110, 90);
  let y = 0;
  for (let i = 0; i < randInt(2, 3); i++) {
    const s = rand(26, 36);
    addBox(g, M.wood, s, s * 0.8, s, rand(-8, 8), y + s * 0.4, rand(-8, 8));
    addBox(g, M.darkMetal, s + 2, 3, s + 2, 0, y + s * 0.66, 0);
    y += s * 0.8;
  }
  addObstacle(x, z, 38);
  return g;
}

function buildBarrels(x, z, burning) {
  const M = ENV.M;
  const g = envProp(x, z, rand(0, TAU));
  addGroundAO(g, 100, 100);
  for (let i = 0; i < randInt(2, 4); i++) {
    const bx = rand(-24, 24), bz = rand(-24, 24);
    addCyl(g, i % 2 ? M.rust : M.olive, 13, 34, bx, 17, bz, 0, 0, 12);
    addCyl(g, M.darkMetal, 13.4, 3, bx, 26, bz, 0, 0, 12);
  }
  if (burning) {
    addCone(g, M.fire, 9, 30, 0, 40, 0);
    addCone(g, M.fire, 5, 20, 2, 46, -2);
    const fl = addCone(g, M.fire, 4, 34, -3, 44, 3);
    fl.material = M.fire;
  }
  addObstacle(x, z, 38);
  return g;
}

function buildLamp(x, z, ry, lit) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addCyl(g, M.darkMetal, 4.4, 160, 0, 80, 0, 0, 0, 8);
  addBox(g, M.darkMetal, 44, 4, 4, 18, 160, 0);
  addBox(g, M.lamp, 18, 5, 12, 36, 156, 0);
  if (lit !== false) {
    // one shared glow resource for every street light: merged into a single
    // draw call instead of one material per lamp (there are a lot of lamps now)
    if (!ENV.lampGlow) {
      ENV.lampGlow = {
        geo: new THREE.CircleGeometry(26, 16),
        mat: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
      };
    }
    const glow = new THREE.Mesh(ENV.lampGlow.geo, ENV.lampGlow.mat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(36, 1.4, 0);
    g.add(glow);
  }
  addObstacle(x, z, 12);
  return g;
}

function buildFlag(x, z, color) {
  const M = ENV.M;
  const g = envProp(x, z, 0);
  addCyl(g, M.metal, 3, 190, 0, 95, 0, 0, 0, 8);
  addBox(g, M.band, 12, 8, 12, 0, 4, 0);
  const tex = flagTexture(color);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 26),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
  );
  flag.position.set(23, 152, 0);
  flag.rotation.y = Math.PI / 2;
  flag.castShadow = ENV.shadows;
  g.add(flag);
  addObstacle(x, z, 18);
  return g;
}

function buildHelipad(x, z) {
  const tex = helipadTexture();
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(150, 32),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, metalness: 0.05 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), 2.0, coreZ(z));
  m.receiveShadow = true;
  m.castShadow = false;
  m.userData.noMerge = true;
  arenaGroup.add(m);
  return m;
}

function buildCar(x, z, ry, burnt) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const body = burnt ? M.burnt : ENV.carMat(randInt(0, 3));
  addBox(g, body, 96, 26, 50, 0, 30, 0);
  addBox(g, body, 52, 22, 48, -6, 52, 0);
  addBox(g, M.glass, 46, 14, 44, -6, 54, 0);
  addBox(g, M.darkMetal, 92, 8, 54, 0, 18, 0);
  for (const wx of [-30, 30]) for (const wz of [-26, 26]) addCyl(g, M.darkMetal, 14, 8, wx, 15, wz, Math.PI / 2, 0, 10);
  if (burnt) { g.rotation.z = rand(-0.08, 0.08); addCone(g, M.fire, 10, 34, 0, 48, 0); }
  addObstacle(x, z, 56);
  return g;
}

function buildBus(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addBox(g, M.burnt, 210, 74, 56, 0, 46, 0);
  addBox(g, M.glass, 200, 22, 58, 0, 62, 0);
  addBox(g, M.glass, 4, 26, 48, 105, 58, 0);
  for (const wx of [-66, 20, 74]) for (const wz of [-28, 28]) addCyl(g, M.darkMetal, 18, 10, wx, 17, wz, Math.PI / 2, 0, 10);
  addBox(g, M.darkMetal, 210, 6, 58, 0, 82, 0);
  addObstacle(x, z, 112);
  return g;
}

function buildBillboard(x, z, ry, text) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addCyl(g, M.metal, 5, 170, -58, 85, 0, 0, 0, 8);
  addCyl(g, M.metal, 5, 170, 58, 85, 0, 0, 0, 8);
  addBox(g, M.darkMetal, 190, 96, 6, 0, 176, 0);
  const tex = signTexture(text || 'SECTOR 7', '#20242a', '#e8e2c8');
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(182, 88),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
  );
  panel.position.set(0, 176, 3.6);
  g.add(panel);
  addObstacle(x, z, 34);
  return g;
}

function buildDune(x, z, rx) {
  const M = ENV.M;
  const g = envProp(x, z, rand(0, TAU));
  addSphere(g, M.sandDune, rx || 180, 0, -26, 0, 1.9, 0.17, 1.1);
  return g;
}

function buildPuddle(x, z, r) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r || 70, 20),
    new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.06, metalness: 0.55, envMapIntensity: 1.35, transparent: true, opacity: 0.82 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), 1.5, coreZ(z));
  arenaGroup.add(m);
  return m;
}

function buildFence(x, z, ry, len) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const n = Math.max(3, Math.round(len / 70));
  for (let i = 0; i < n; i++) {
    addBox(g, M.metal, 4, 74, 4, -len / 2 + i * (len / (n - 1)), 37, 0);
  }
  addBox(g, M.metal, len, 2.6, 2.6, 0, 64, 0);
  addBox(g, M.metal, len, 2.6, 2.6, 0, 32, 0);
  // wire suggestion
  addBox(g, M.wire, len, 26, 0.6, 0, 48, 0);
  return g;
}

function buildDerrick(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, M.metal, 7, 280, 7, sx * 34, 140, sz * 34);
  for (let i = 1; i < 6; i++) {
    addBox(g, M.metal, 76, 4, 4, 0, i * 46, 34);
    addBox(g, M.metal, 76, 4, 4, 0, i * 46, -34);
  }
  addBox(g, M.rust, 120, 10, 120, 0, 280, 0);
  addCyl(g, M.darkMetal, 5, 40, 0, 300, 0, 0, 0, 8);
  addObstacle(x, z, 70);
  return g;
}

function buildDish(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, 0);
  addCyl(g, M.metal, 5, 120, 0, 60, 0, 0, 0, 8);
  const dish = addCyl(g, M.metal, 46, 9, 0, 122, 0, 0.62, 0, 12);
  dish.scale.set(46, 9, 46);
  addBox(g, M.darkMetal, 6, 44, 6, 0, 132, 0, 0, 0.62);
  addSphere(g, M.lamp, 4, 0, 148, 0);
  addObstacle(x, z, 42);
  return g;
}

function buildRubble(x, z, n) {
  const g = envProp(x, z, rand(0, TAU));
  for (let i = 0; i < (n || 6); i++) {
    const r = rand(6, 22);
    const m = new THREE.Mesh(ENV.G.dodeca, i % 2 ? ENV.M.concreteDark : ENV.M.concrete);
    m.scale.set(r, r * 0.6, r);
    m.position.set(rand(-56, 56), r * 0.3, rand(-56, 56));
    m.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function buildLogs(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 22;
    addCyl(g, M.bark, 13, 110, 0, 13 + (i % 2 ? 24 : 0), 0, 0, Math.PI / 2, 8).position.z = off;
  }
  addObstacle(x, z, 52);
  return g;
}

function buildAntenna(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, 0);
  addCyl(g, M.metal, 4, 190, 0, 95, 0, 0, 0, 8);
  for (let i = 0; i < 3; i++) {
    addBox(g, M.metal, 60 - i * 12, 3, 3, 0, 90 + i * 34, 0);
    addBox(g, M.metal, 60 - i * 12, 3, 3, 0, 90 + i * 34, 0, Math.PI / 2);
  }
  addSphere(g, M.lamp, 4, 0, 192, 0);
  addObstacle(x, z, 16);
  return g;
}

function buildCamoNet(x, z, ry, w, d) {
  const mat = ENV.M.camo;
  const g = envProp(x, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCyl(g, ENV.M.metal, 3, 90, sx * w * 0.42, 45, sz * d * 0.42, 0, 0, 8);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  net.rotation.x = -Math.PI / 2 + 0.06;
  net.position.y = 92;
  g.add(net);
  addObstacle(x, z, Math.min(w, d) * 0.4);
  return g;
}

function buildForklift(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addBox(g, M.hazard, 60, 46, 44, 0, 36, 0);
  addBox(g, M.darkMetal, 44, 30, 40, -12, 72, 0);
  addBox(g, M.glassDark, 40, 20, 36, -12, 74, 0);
  addBox(g, M.darkMetal, 6, 100, 40, 36, 62, 0);
  addBox(g, M.metal, 30, 4, 34, 54, 8, 0);
  for (const wx of [-18, 20]) for (const wz of [-22, 22]) addCyl(g, M.darkMetal, 12, 8, wx, 12, wz, Math.PI / 2, 0, 10);
  addObstacle(x, z, 48);
  return g;
}

function buildScrap(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, rand(0, TAU));
  for (let i = 0; i < 7; i++) {
    addBox(g, i % 3 ? M.rust : M.darkMetal, rand(18, 52), rand(4, 12), rand(10, 40),
      rand(-40, 40), rand(4, 22), rand(-35, 35), rand(0, TAU), rand(-0.4, 0.4), rand(-0.4, 0.4));
  }
  return g;
}

function buildCrane(x, z) {
  const M = ENV.M;
  const g = envProp(x, z, rand(-0.4, 0.4));
  addBox(g, M.hazard, 70, 20, 50, 0, 10, 0);
  addBox(g, M.metal, 26, 250, 26, 0, 135, 0);
  addBox(g, M.metal, 300, 14, 16, 100, 250, 0);
  addBox(g, M.darkMetal, 16, 40, 16, 40, 232, 0);
  addCyl(g, M.wire, 1.4, 110, 220, 180, 0, 0, 0, 6);
  addBox(g, M.rust, 40, 20, 40, 220, 118, 0);
  addObstacle(x, z, 60);
  return g;
}

function setupEnvMaterials(theme) {
  const tint = theme.env === 'desert' ? '#a08d68'
    : theme.env === 'ice' ? '#93a6b2'
      : theme.env === 'jungle' ? '#6d7260'
        : theme.env === 'volcano' ? '#4d453e'
          : theme.env === 'wasteland' ? '#7d7060' : '#8b8b82';
  const conc = concreteTexture(tint, theme.env === 'urban' || theme.env === 'wasteland');
  const concN = normalFromTexture(conc, 1.15);
  const steel = metalTexture('#7a7f86');
  const steelN = normalFromTexture(steel, 2.1);
  const plate = metalTexture('#2a2d32');
  const plateN = normalFromTexture(plate, 1.8);
  const weave = weaveTexture();
  const weaveN = normalFromTexture(weave, 0.65);
  const M = {
    concrete: new THREE.MeshStandardMaterial({ map: conc, normalMap: concN, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.93, metalness: 0.03 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x4c4b45, roughness: 0.97 }),
    band: new THREE.MeshStandardMaterial({ color: 0x35383d, roughness: 0.9, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ map: steel, normalMap: steelN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.42, metalness: 0.72 }),
    darkMetal: new THREE.MeshStandardMaterial({ map: plate, normalMap: plateN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.52, metalness: 0.68 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x74412a, roughness: 0.9, metalness: 0.3 }),
    brick: new THREE.MeshStandardMaterial({ color: theme.env === 'factory' ? 0x6b4a3c : 0x5a4a40, roughness: 0.96 }),
    olive: new THREE.MeshStandardMaterial({ map: weave, normalMap: weaveN, normalScale: new THREE.Vector2(0.35, 0.35), color: 0x4c543a, roughness: 0.8, metalness: 0.24 }),
    tan: new THREE.MeshStandardMaterial({ map: weave, normalMap: weaveN, color: 0x9a8659, roughness: 0.92 }),
    sand: new THREE.MeshStandardMaterial({ map: weave, normalMap: weaveN, normalScale: new THREE.Vector2(0.5, 0.5), color: theme.env === 'desert' ? 0xbda373 : 0x9c8a63, roughness: 1 }),
    sandDune: new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1 }),
    sandAlt: new THREE.MeshStandardMaterial({ map: weave, normalMap: weaveN, normalScale: new THREE.Vector2(0.5, 0.5), color: 0x8a7a56, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x16222c, roughness: 0.16, metalness: 0.8, emissive: 0x09141c, emissiveIntensity: 0.5 }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0x2a3c48, roughness: 0.18, metalness: 0.7, emissive: 0x2d4a5c, emissiveIntensity: 0.9 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.3, metalness: 0.4 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2ac }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xa8801f, roughness: 0.78, metalness: 0.18 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5f3a, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1, flatShading: true }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 }),
    wire: new THREE.MeshBasicMaterial({ color: 0x6a6a66, transparent: true, opacity: 0.45 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x3c5530, roughness: 0.95, flatShading: true }),
    foliageDark: new THREE.MeshStandardMaterial({ color: 0x28401f, roughness: 0.95, flatShading: true }),
    frond: new THREE.MeshStandardMaterial({ color: 0x4c7a32, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
    pine: new THREE.MeshStandardMaterial({ color: 0x2f4a33, roughness: 0.95, flatShading: true }),
    coco: new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.95, metalness: 0.06, flatShading: true }),
    rockDark: new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.rock).multiplyScalar(0.6), roughness: 0.98, flatShading: true }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x332a24, roughness: 0.98, metalness: 0.08 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    roadLine: new THREE.MeshBasicMaterial({ color: theme.env === 'desert' ? 0xd9c9a0 : theme.env === 'ice' ? 0x5f707c : 0xd8d8cc, transparent: true, opacity: theme.env === 'ice' ? 0.5 : 0.3 }),
    camo: new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.95, side: THREE.DoubleSide }),
    ice: new THREE.MeshStandardMaterial({ color: 0xbfe4f2, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.9, flatShading: true }),
    snow: new THREE.MeshStandardMaterial({ color: 0xdce8ef, roughness: 0.85, flatShading: true }),
    snowFresh: new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.88, metalness: 0.02 }),
    snowSoft: new THREE.MeshStandardMaterial({ color: 0xe4eef7, roughness: 0.95, metalness: 0.01 }),
    iceSheet: new THREE.MeshStandardMaterial({ color: 0x7fa3b6, roughness: 0.08, metalness: 0.45, transparent: true, opacity: 0.26 }),
    panel: new THREE.MeshStandardMaterial({ map: metalTexture('#96a7b4'), normalMap: normalFromTexture(metalTexture('#96a7b4'), 1.6), roughness: 0.48, metalness: 0.5 }),
    contact: new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    ao: new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.34, depthWrite: false }),
    wall: new THREE.MeshStandardMaterial({ color: theme.wall, emissive: theme.wallEmissive, emissiveIntensity: 0.12, roughness: 0.95, metalness: 0.06 }),
    wallCap: new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(1.6), roughness: 0.88 }),
    trench: new THREE.MeshStandardMaterial({ color: theme.env === 'ice' ? 0x8b9fae : theme.env === 'desert' ? 0x7a6440 : 0x1e1813, roughness: 1 }),
    crater: new THREE.MeshStandardMaterial({ color: theme.env === 'ice' ? 0x8195a2 : theme.env === 'desert' ? 0x77603d : 0x33271c, roughness: 1 }),
    craterDeep: new THREE.MeshStandardMaterial({ color: theme.env === 'ice' ? 0x6d8795 : theme.env === 'desert' ? 0x5c482a : 0x140f0a, roughness: 1 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
    lava: new THREE.MeshBasicMaterial({ color: 0xff5a12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  };
  const carCols = [0x5a2a24, 0x2a3a4a, 0x6a6040, 0x3a3a3a];
  ENV.carMat = i => new THREE.MeshStandardMaterial({ color: carCols[i % carCols.length], roughness: 0.45, metalness: 0.5 });
  const contCols = [0x7a3a2a, 0x2a4a5a, 0x4a5a3a, 0x6a5a2a];
  ENV.containerMat = i => new THREE.MeshStandardMaterial({ map: metalTexture('#' + contCols[i % contCols.length].toString(16).padStart(6, '0')), roughness: 0.62, metalness: 0.55 });
  for (const k in M) {
    if (M[k] && M[k].isMeshStandardMaterial) M[k].envMapIntensity = 0.3;
  }
  for (const k of ['metal', 'darkMetal', 'glass', 'glassLit', 'rust', 'band', 'olive', 'hazard', 'bark']) {
    if (M[k]) M[k].envMapIntensity = 0.85;
  }
  M.iceSheet.envMapIntensity = 1.5;
  M.panel.envMapIntensity = 0.9;
  M.snowFresh.envMapIntensity = 0.35;
  M.snowSoft.envMapIntensity = 0.25;
  ENV.M = M;
  ENV.G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    sph: new THREE.SphereGeometry(1, 10, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    ico: new THREE.IcosahedronGeometry(1, 0),
    dodeca: new THREE.DodecahedronGeometry(1, 0),
    plane: new THREE.PlaneGeometry(1, 1)
  };
}

// ---- road network ----
function addRoadPlane(x, z, w, l, type, rot, y) {
  const base = roadTexture(type);
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const rx = Math.max(1, w / 300), ry = Math.max(1, l / 300);
  t.repeat.set(rx, ry);
  const nsrc = normalFromTexture(base, 1.3);
  let nrm = null;
  if (nsrc) {
    nrm = nsrc.clone();
    nrm.needsUpdate = true;
    nrm.repeat.set(rx, ry);
  }
  const wet = type === 'asphalt' || type === 'mud';
  const mat = new THREE.MeshStandardMaterial({
    map: t, normalMap: nrm,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: wet ? 0.6 : 0.93,
    metalness: wet ? 0.24 : 0.04,
    envMapIntensity: wet ? 0.6 : 0.2
  });
  const m = new THREE.Mesh(ENV.G.plane, mat);
  m.scale.set(w, l, 1);
  m.rotation.x = -Math.PI / 2;
  if (rot) m.rotation.z = rot;
  m.position.set(coreX(x), y === undefined ? 0.35 : y, coreZ(z));
  m.receiveShadow = true;
  m.castShadow = false;
  m.userData.noMerge = true;
  arenaGroup.add(m);
  return m;
}

function roadPaint(mat, w, d, x, z, ry) {
  addBox(arenaGroup, mat, w, 0.4, d, coreX(x), 1.95, coreZ(z), ry || 0);
}

function buildRoadNetwork(theme) {
  const type = (theme.roads && theme.roads.type) || 'concrete';
  const M = ENV.M;
  const paint = M.roadLine;
  const NS = ROAD_NS, EW = ROAD_EW;
  const W = DCW, H = DCH, cx = DCX, cz = DCZ;
  const westEdge = cx - NS / 2, eastEdge = cx + NS / 2;
  const northEdge = cz - EW / 2, southEdge = cz + EW / 2;

  // two avenues meeting at a proper four-way junction
  addRoadPlane(cx, cz, W - 40, EW, type, 0, 0.3);
  addRoadPlane(cx, cz, NS, H - 40, type, Math.PI / 2, 0.36);
  // service spurs: motor pool (west) and command post (east)
  addRoadPlane(cx - 300, 380, 370, 120, type, 0, 0.26);
  addRoadPlane(cx + 250, 300, 270, 120, type, 0, 0.26);

  // ---- outer ring road: the sector highway the new districts hang off ----
  addRoadPlane(cx, -335, WORLD.w - 20, 130, type, 0, 0.24);
  addRoadPlane(cx, H + 335, WORLD.w - 20, 130, type, 0, 0.24);
  addRoadPlane(-445, cz, 130, WORLD.h - 20, type, 0, 0.24);
  addRoadPlane(W + 445, cz, 130, WORLD.h - 20, type, 0, 0.24);
  // both avenue ends run out to the ring
  addRoadPlane(cx, -168, NS, 336, type, 0, 0.28);
  addRoadPlane(cx, H + 168, NS, 336, type, 0, 0.28);
  addRoadPlane(-224, cz, 448, EW, type, 0, 0.28);
  addRoadPlane(W + 224, cz, 448, EW, type, 0, 0.28);

  // edge lines, broken at the junction
  for (const s of [-1, 1]) {
    roadPaint(paint, 3, cz - EW / 2 - 60, cx + s * (NS / 2 - 14), (40 + cz - EW / 2 - 20) / 2);
    roadPaint(paint, 3, H - 40 - (cz + EW / 2 + 20), cx + s * (NS / 2 - 14), (cz + EW / 2 + 20 + H - 40) / 2);
    roadPaint(paint, cx - NS / 2 - 40, 3, (40 + cx - NS / 2 - 20) / 2, cz + s * (EW / 2 - 14));
    roadPaint(paint, W - 40 - (cx + NS / 2 + 20), 3, (cx + NS / 2 + 20 + W - 40) / 2, cz + s * (EW / 2 - 14));
  }

  // centre lines
  for (let z = 60; z < H - 50; z += 92) {
    if (Math.abs(z - cz) < EW / 2 + 24) continue;
    roadPaint(paint, 9, 46, cx, z);
  }
  for (let x = 60; x < W - 50; x += 92) {
    if (Math.abs(x - cx) < NS / 2 + 24) continue;
    roadPaint(paint, 46, 9, x, cz);
  }

  // ring road centre dashes
  for (let x = 90; x < W - 60; x += 104) {
    if (Math.abs(x - cx) < NS / 2 + 30) continue;
    roadPaint(paint, 44, 9, x, -335);
    roadPaint(paint, 44, 9, x, H + 335);
  }
  for (let z = 90; z < H - 60; z += 104) {
    if (Math.abs(z - cz) < EW / 2 + 30) continue;
    roadPaint(paint, 9, 44, -445, z);
    roadPaint(paint, 9, 44, W + 445, z);
  }

  // zebra crossings and stop lines on all four approaches
  for (const s of [-1, 1]) {
    const zc = cz + s * (EW / 2 + 30);
    for (let i = 0; i < 6; i++) roadPaint(paint, 18, 30, cx - 90 + i * 36, zc);
    const xc = cx + s * (NS / 2 + 30);
    for (let i = 0; i < 5; i++) roadPaint(paint, 30, 16, xc, cz - 72 + i * 36);
  }
  roadPaint(paint, NS / 2 - 16, 10, cx + NS / 4 + 4, northEdge - 62);
  roadPaint(paint, NS / 2 - 16, 10, cx - NS / 4 - 4, southEdge + 62);
  roadPaint(paint, 10, EW / 2 - 16, westEdge - 62, cz - EW / 4 - 4);
  roadPaint(paint, 10, EW / 2 - 16, eastEdge + 62, cz + EW / 4 + 4);

  // rubber wear on the asphalt
  const wear = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.09, depthWrite: false });
  for (const off of [-62, 62]) addBox(arenaGroup, wear, 26, 0.2, H - 80, off, 0.5, 0);
  for (const off of [-56, 56]) addBox(arenaGroup, wear, W - 80, 0.2, 22, 0, 0.5, off);

  // curb stones along the avenues
  for (let z = 110; z < H - 80; z += 210) {
    if (Math.abs(z - cz) < EW / 2 + 60) continue;
    for (const s of [-1, 1]) addBox(arenaGroup, M.concreteDark, 14, 5, 84, coreX(cx + (s * NS) / 2), 2.5, coreZ(z));
  }
  for (let x = 110; x < W - 80; x += 210) {
    if (Math.abs(x - cx) < NS / 2 + 60) continue;
    for (const s of [-1, 1]) addBox(arenaGroup, M.concreteDark, 84, 5, 14, coreX(x), 2.5, coreZ(cz + (s * EW) / 2));
  }
}

// ---- laid-out battlefield furniture ----
function buildPad(x, z, w, d, type) {
  const src = roadTexture(type || 'concrete');
  const t = src.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const rx = Math.max(1, w / 240), ry = Math.max(1, d / 240);
  t.repeat.set(rx, ry);
  const nsrc = normalFromTexture(src, 1.2);
  let nrm = null;
  if (nsrc) { nrm = nsrc.clone(); nrm.needsUpdate = true; nrm.repeat.set(rx, ry); }
  const mat = new THREE.MeshStandardMaterial({
    map: t, normalMap: nrm, normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.94, metalness: 0.05, envMapIntensity: 0.25
  });
  const m = new THREE.Mesh(ENV.G.plane, mat);
  m.scale.set(w, d, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), 1.6, coreZ(z));
  m.receiveShadow = true;
  m.castShadow = false;
  m.userData.noMerge = true;
  arenaGroup.add(m);
  return m;
}

function buildScorch(x, z, r) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 18),
    new THREE.MeshBasicMaterial({ color: 0x080604, transparent: true, opacity: 0.26, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), 1.98, coreZ(z));
  m.userData.noMerge = true;
  arenaGroup.add(m);
  return m;
}

function buildTrench(x, z, len, ry) {
  const M = ENV.M;
  const ice = ENV.theme && ENV.theme.env === 'ice';
  const lipMat = ice ? M.snowFresh : M.sandAlt;
  const bagMat = ice ? M.snow : M.sand;
  const g = envProp(x, z, ry);
  const halfD = 58;
  // sunken floor with a dark, damp bottom
  addBox(g, M.trench, len - 10, 1.8, halfD * 2 - 12, 0, 1.3, 4);
  addBox(g, M.trench, len - 24, 1.2, halfD * 1.5, 0, 2.0, 4);
  // low earth lips: no tall wall hiding the trench from this camera
  const lumps = Math.max(3, Math.round(len / 62));
  for (let i = 0; i < lumps; i++) {
    const t = -len / 2 + 26 + i * ((len - 52) / Math.max(1, lumps - 1));
    const far = new THREE.Mesh(ENV.G.dodeca, lipMat);
    far.scale.set(40, 13, 24);
    far.position.set(t, 5, -halfD + 4);
    far.rotation.set(0.24, i * 1.2, 0.1);
    far.castShadow = ENV.shadows;
    far.receiveShadow = true;
    g.add(far);
    const near = new THREE.Mesh(ENV.G.dodeca, lipMat);
    near.scale.set(34, 9, 18);
    near.position.set(t + 10, 3.4, halfD - 2);
    near.rotation.set(-0.2, i * 1.7, 0.08);
    near.castShadow = ENV.shadows;
    near.receiveShadow = true;
    g.add(near);
  }
  addBox(g, lipMat, 22, 10, halfD * 2 - 10, -len / 2 + 8, 5, 4);
  addBox(g, lipMat, 22, 10, halfD * 2 - 10, len / 2 - 8, 5, 4);
  // duckboards and revetment posts
  // sandbag parapet on the enemy side
  const bags = Math.max(3, Math.round(len / 74));
  for (let i = 0; i < bags; i++) {
    const bx = -len / 2 + 28 + i * ((len - 56) / Math.max(1, bags - 1));
    addBox(g, bagMat, 56, 9, 16, bx, 6, -halfD - 4);
  }
  return g;
}

function buildCrater(x, z, r) {
  const M = ENV.M;
  const g = envProp(x, z, 0);
  const pit = new THREE.Mesh(new THREE.CircleGeometry(r, 22), M.crater);
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 1.15;
  pit.receiveShadow = true;
  g.add(pit);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.6, 20), M.craterDeep);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 1.3;
  inner.receiveShadow = true;
  g.add(inner);
  const ice = ENV.theme && ENV.theme.env === 'ice';
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, r * 0.085, 5, 22), ice ? M.snowFresh : M.sandAlt);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 2.2;
  rim.receiveShadow = true;
  g.add(rim);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.35;
    const d = r * (1.04 + (i % 3) * 0.11);
    const s = r * (0.06 + (i % 4) * 0.022);
    const m = new THREE.Mesh(ENV.G.dodeca, ice ? (i % 2 ? M.rockDark : M.snowFresh) : (i % 2 ? M.rockDark : M.sandAlt));
    m.scale.set(s, s * 0.5, s);
    m.position.set(Math.cos(a) * d, s * 0.24, Math.sin(a) * d);
    m.rotation.set(0.1, a * 2, 0.2);
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function buildBerm(x, z, len, ry) {
  const M = ENV.M;
  const ice = ENV.theme && ENV.theme.env === 'ice';
  const g = envProp(x, z, ry);
  const n = Math.max(3, Math.round(len / 58));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (len - 40);
    const s = 48 + (i % 2) * 12;
    const m = new THREE.Mesh(ice ? ENV.G.sph : ENV.G.dodeca, ice ? M.snowSoft : (i % 2 ? M.sandAlt : M.sand));
    m.scale.set(s, ice ? s * 0.16 : s * 0.38, 42 + (i % 3) * 8);
    m.position.set(t, s * 0.14, 0);
    m.rotation.set(0.1, i * 1.7, 0.08);
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
    addObstacle(x + Math.cos(ry) * t, z - Math.sin(ry) * t, 42, 'berm' + x + ',' + z);
  }
  return g;
}

function buildBunker(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addGroundAO(g, 300, 220);
  addBox(g, M.concrete, 230, 58, 150, 0, 29, 0);
  addBox(g, M.concreteDark, 246, 10, 166, 0, 63, 0);
  addBox(g, M.darkMetal, 168, 15, 22, 0, 34, 78);
  addBox(g, M.darkMetal, 168, 6, 30, 0, 25, 85);
  addBox(g, M.concreteDark, 54, 40, 16, -62, 20, -80);
  addBox(g, M.metal, 26, 9, 26, 42, 70, -22);
  addBox(g, M.metal, 26, 9, 26, 92, 70, -22);
  for (let i = 0; i < 4; i++) addBox(g, M.sand, 56, 11, 18, -90 + i * 60, 5.5, 96);
  addBoxObstacle(x, z, 123, 83, ry);
  return g;
}

function buildGate(x, z, ry, label) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  for (const s of [-1, 1]) {
    addBox(g, M.concrete, 54, 128, 54, s * 140, 64, 0);
    addBox(g, M.concreteDark, 68, 12, 68, s * 140, 134, 0);
    addBox(g, M.hazard, 58, 12, 58, s * 140, 22, 0);
    addBox(g, M.lamp, 18, 6, 12, s * 140, 126, 24);
    addBox(g, M.beacon, 8, 8, 8, s * 140, 142, 24);
    addObstacle(x + s * 140 * Math.cos(ry || 0), z - s * 140 * Math.sin(ry || 0), 42);
  }
  addBox(g, M.metal, 334, 16, 26, 0, 122, 0);
  addBox(g, M.darkMetal, 262, 108, 14, 0, 54, 0);
  for (let i = 0; i < 4; i++) {
    addBox(g, M.hazard, 250, 6, 2, 0, 18 + i * 24, 8, 0, 0, 0.22);
  }
  addBox(g, M.darkMetal, 6, 108, 18, 0, 54, 2);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 34),
    new THREE.MeshBasicMaterial({ map: signTexture(label, '#1b1f18', '#d8c98a') })
  );
  sign.position.set(0, 148, 22);
  g.add(sign);
  return g;
}

function buildPerimeter(theme) {
  const M = ENV.M;
  const T = 24, H = 92;
  const ice = theme.env === 'ice';
  const wallRun = (lx, lz, w, d) => {
    addBox(arenaGroup, M.wall, w, H, d, lx, H / 2, lz);
    addBox(arenaGroup, M.wallCap, w + 6, 5, d + 6, lx, H + 2, lz);
    if (ice) addBox(arenaGroup, M.snowSoft, w + 4, 7, d + 4, lx, H + 7, lz);
  };
  // arena-local coordinates: the wall sits just outside the playable field
  wallRun(0, -HZ - T / 2, WORLD.w + T * 2, T);
  wallRun(0, HZ + T / 2, WORLD.w + T * 2, T);
  wallRun(-HX - T / 2, 0, T, WORLD.h + T * 2);
  wallRun(HX + T / 2, 0, T, WORLD.h + T * 2);
  addWallObstacle(HX, -T / 2, HX + T, T / 2);
  addWallObstacle(HX, WORLD.h + T / 2, HX + T, T / 2);
  addWallObstacle(-T / 2, HZ, T / 2, HZ + T);
  addWallObstacle(WORLD.w + T / 2, HZ, T / 2, HZ + T);
  // one gate on each side, where the avenues leave the sector
  buildGate(DCX, -CZ - 26, 0, 'NORTH GATE');
  buildGate(DCX, DCH + CZ + 26, Math.PI, 'SOUTH GATE');
  buildGate(-CX - 26, DCZ, -Math.PI / 2, 'WEST GATE');
  buildGate(DCW + CX + 26, DCZ, Math.PI / 2, 'EAST GATE');
}

// ---- the one designed layout every map is built from ----
// ------------------------------------------------------------
//  Arctic outpost kit (Frozen Expanse)
// ------------------------------------------------------------
function treadTexture() {
  return envCanvasTex('tread', (g, S) => {
    g.clearRect(0, 0, S, S);
    for (const cx of [S * 0.31, S * 0.69]) {
      g.fillStyle = 'rgba(104,120,134,0.42)';
      g.fillRect(cx - 15, 0, 30, S);
      g.fillStyle = 'rgba(78,94,108,0.18)';
      for (let y = 0; y < S; y += 22) g.fillRect(cx - 12, y, 24, 7);
      g.fillStyle = 'rgba(226,238,246,0.16)';
      g.fillRect(cx - 20, 0, 4, S);
      g.fillRect(cx + 16, 0, 4, S);
    }
  }, 128);
}

function footTexture() {
  return envCanvasTex('boot', (g, S) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(52,68,82,0.85)';
    g.beginPath();
    g.ellipse(S / 2, S * 0.62, S * 0.22, S * 0.3, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(S / 2, S * 0.28, S * 0.17, S * 0.16, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(30,42,54,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(S * 0.38, S * 0.5); g.lineTo(S * 0.62, S * 0.5);
    g.stroke();
  }, 64);
}

function contactTexture() {
  return envCanvasTex('contact', (g, S) => {
    g.clearRect(0, 0, S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.5);
    grd.addColorStop(0, 'rgba(18,28,38,0.55)');
    grd.addColorStop(0.65, 'rgba(18,28,38,0.22)');
    grd.addColorStop(1, 'rgba(18,28,38,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }, 128);
}

// Soft contact occlusion under a prop, in local prop space so it merges into the
// batched arena mesh and costs a single extra draw call for every prop combined.
function addGroundAO(g, w, d, y) {
  if (!g || !ENV || !ENV.M) return null;
  const m = new THREE.Mesh(ENV.G.plane, ENV.M.ao);
  m.scale.set(w, d, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y === undefined ? 2.05 : y, 0);
  m.receiveShadow = false;
  g.add(m);
  return m;
}

function buildContactShadow(x, z, w, d, y) {
  const m = new THREE.Mesh(ENV.G.plane, ENV.M.contact);
  m.scale.set(w, d, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), y === undefined ? 1.74 : y, coreZ(z));
  arenaGroup.add(m);
  return m;
}

function buildSnowCap(x, z, w, d, y, ry, mat) {
  const g = envProp(x, z, ry || 0);
  addBox(g, mat || ENV.M.snowSoft, w - 8, 4, d - 6, 0, y, 0);
  return g;
}

function buildSnowPile(x, z, len, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  // overlapping low drifts make one continuous ploughed ridge
  const n = Math.max(4, Math.round(len / 32));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (len - 14);
    const s = 26 + (i % 3) * 6;
    const m = new THREE.Mesh(ENV.G.sph, i % 4 === 0 ? M.snowFresh : M.snowSoft);
    m.scale.set(s, 13 + (i % 2) * 4, 22 + (i % 3) * 5);
    m.position.set(t, 3, (i % 2 ? 4 : -4));
    m.rotation.set(0.08, i * 1.3, 0.04);
    m.castShadow = ENV.shadows;
    m.receiveShadow = true;
    g.add(m);
    if (i % 2) {
      const k = new THREE.Mesh(ENV.G.sph, M.snowSoft);
      k.scale.set(s * 0.8, 9, 18);
      k.position.set(t + 8, 2, -10);
      k.rotation.set(0.1, i * 0.9, 0.05);
      k.castShadow = ENV.shadows;
      k.receiveShadow = true;
      g.add(k);
    }
  }
  return g;
}

function buildSnowFence(x, z, len, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const n = Math.max(4, Math.round(len / 26));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + 13 + i * ((len - 26) / Math.max(1, n - 1));
    addBox(g, M.wood, 4, 56, 5, t, 28, 0);
    for (let k = 0; k < 4; k++) addBox(g, M.wood, 26, 4, 3, t + 13, 14 + k * 12, 2);
  }
  addObstacle(x, z, Math.max(28, len * 0.28));
  return g;
}

function buildHesco(x, z, len, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const seg = 58;
  const n = Math.max(2, Math.round(len / seg));
  addGroundAO(g, len + 44, 92);
  for (let i = 0; i < n; i++) {
    const bx = -len / 2 + seg / 2 + i * seg;
    // fabric-filled basket: sides bulge, steel mesh cage wraps the outside
    addBox(g, M.sandAlt, seg - 6, 44, 48, bx, 22, 0);
    addBox(g, M.sand, seg - 12, 40, 52, bx, 22, 0);
    addBox(g, M.darkMetal, seg - 2, 3, 50, bx, 44, 0);
    addBox(g, M.darkMetal, seg - 2, 3, 50, bx, 2, 0);
    addBox(g, M.snowFresh, seg - 6, 8, 46, bx, 48, 0);
    for (let k = 0; k < 4; k++) {
      const wx = bx - seg / 2 + 6 + k * ((seg - 12) / 3);
      addBox(g, M.wire, 2, 42, 2, wx, 22, 25);
      addBox(g, M.wire, 2, 42, 2, wx, 22, -25);
      addBox(g, M.wire, seg - 8, 2, 2, wx, 40, 25);
    }
    addObstacle(x + Math.cos(ry) * bx, z - Math.sin(ry) * bx, 32, 'hesco' + x + ',' + z);
  }
  return g;
}

function buildGenerator(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addBox(g, M.darkMetal, 92, 16, 62, 0, 8, 0);
  addBox(g, M.panel, 84, 46, 54, 0, 39, 0);
  addBox(g, M.hazard, 78, 8, 46, 0, 15, 0);
  for (let i = 0; i < 5; i++) addBox(g, M.darkMetal, 4, 30, 44, -32 + i * 16, 38, 28);
  addBox(g, M.snowFresh, 88, 6, 58, 0, 63, 0);
  addCyl(g, M.darkMetal, 6, 42, 30, 68, -8);
  addCyl(g, M.darkMetal, 22, 18, 56, 34, 6, 0, Math.PI / 2, 0);
  addBox(g, M.beacon, 8, 8, 8, -38, 70, 0);
  addObstacle(x, z, 58);
  return g;
}

function buildSnowplow(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  addBox(g, M.hazard, 146, 26, 62, 0, 28, 0);
  addBox(g, M.darkMetal, 66, 42, 58, 38, 52, 0);
  addBox(g, M.glass, 50, 20, 3, 38, 60, 30);
  addBox(g, M.glass, 50, 20, 3, 38, 60, -30);
  addBox(g, M.snowFresh, 60, 5, 46, 38, 75, 0);
  for (const sz of [-34, 34]) {
    addBox(g, M.darkMetal, 148, 34, 22, 0, 17, sz);
    addBox(g, M.metal, 148, 4, 24, 0, 35, sz);
  }
  addBox(g, M.metal, 24, 60, 188, 90, 30, 0, 0, 0, -0.28);
  addBox(g, M.hazard, 5, 12, 188, 99, 54, 0, 0, 0, -0.28);
  addCyl(g, M.darkMetal, 5, 34, 20, 82, 20);
  addBox(g, M.beacon, 10, 8, 10, 26, 80, 0);
  addObstacle(x, z, 88);
  return g;
}

function buildArcticBarracks(x, z, ry, floors) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const w = 240, d = 112, fh = 48, fl = floors || 2;
  const h = fl * fh;
  addBox(g, M.concreteDark, w + 18, 8, d + 18, 0, 4, 0);
  addBox(g, M.panel, w, h, d, 0, h / 2 + 8, 0);
  for (let f = 0; f < fl; f++) {
    addBox(g, M.band, w + 5, 4, d + 5, 0, 8 + f * fh + fh * 0.5, 0);
    for (const bx of [-70, 0, 70]) {
      addBox(g, M.glassLit, 34, 22, 4, bx, 8 + f * fh + 30, d / 2 + 1);
      addBox(g, M.darkMetal, 42, 4, 6, bx, 8 + f * fh + 44, d / 2 + 2);
      addBox(g, M.snowFresh, 40, 3, 8, bx, 8 + f * fh + 48, d / 2 + 3);
    }
  }
  // entrance with lit vestibule and snow hood
  addBox(g, M.darkMetal, 48, 36, 8, 0, 26, d / 2 + 3);
  addBox(g, M.glassLit, 34, 20, 4, 0, 26, d / 2 + 8);
  addBox(g, M.darkMetal, 5, 44, 5, -26, 30, d / 2 + 20);
  addBox(g, M.darkMetal, 5, 44, 5, 26, 30, d / 2 + 20);
  addBox(g, M.metal, 62, 5, 28, 0, 54, d / 2 + 9);
  addBox(g, M.snowSoft, 58, 4, 24, 0, 58, d / 2 + 9);
  addBox(g, M.hazard, 52, 5, 6, 0, 10, d / 2 + 4);
  // gabled roof with a heavy snow load
  const roofY = 8 + h;
  addBox(g, M.metal, w + 20, 5, d * 0.62, 0, roofY + 9, -d * 0.24, 0, -0.24);
  addBox(g, M.metal, w + 20, 5, d * 0.62, 0, roofY + 9, d * 0.24, 0, 0.24);
  addBox(g, M.darkMetal, w + 26, 10, 6, 0, roofY + 6, -d * 0.47);
  addBox(g, M.darkMetal, w + 26, 10, 6, 0, roofY + 6, d * 0.47);
  addBox(g, M.darkMetal, w + 12, 8, 10, 0, roofY + 20, 0);
  addBox(g, M.snowSoft, w + 10, 8, d * 0.6, 0, roofY + 15, -d * 0.24, 0, -0.24);
  addBox(g, M.snowSoft, w + 10, 8, d * 0.6, 0, roofY + 15, d * 0.24, 0, 0.24);
  // roof furniture
  addCyl(g, M.darkMetal, 7, 48, w * 0.28, roofY + 26, d * 0.2);
  addCyl(g, M.snowFresh, 9, 6, w * 0.28, roofY + 51, d * 0.2);
  addBox(g, M.metal, 24, 14, 22, -w * 0.28, roofY + 12, -d * 0.1);
  addBox(g, M.darkMetal, 5, 34, 5, -w / 2 + 16, 25, d / 2 + 6);
  for (let i = 0; i < 6; i++) addBox(g, M.metal, 20, 3, 3, w / 2 - 12, 12 + i * 15, d / 2 + 6);
  addBox(g, M.lamp, 9, 5, 12, -w / 2 + 6, 40, d / 2 + 8);
  addBoxObstacle(x, z, w / 2 + 8, d / 2 + 8, ry);
  buildContactShadow(x, z, w + 70, d + 70);
  return g;
}

function buildArcticHangar(x, z, ry) {
  const M = ENV.M;
  const g = envProp(x, z, ry);
  const w = 300, d = 200, h = 104;
  addBox(g, M.concreteDark, w + 24, 8, d + 24, 0, 4, 0);
  addBox(g, M.panel, w, h, d, 0, h / 2 + 8, 0);
  for (let i = 0; i < 4; i++) addBox(g, M.band, w + 6, 4, d + 6, 0, 30 + i * 20, 0);
  // arched ribbed roof with snow
  addBox(g, M.metal, w + 14, 8, d * 0.58, 0, h + 24, 0);
  addBox(g, M.metal, w + 14, 32, d * 0.36, 0, h + 34, -d * 0.33, 0, -0.34);
  addBox(g, M.metal, w + 14, 32, d * 0.36, 0, h + 34, d * 0.33, 0, 0.34);
  addBox(g, M.snowFresh, w + 16, 8, d * 0.6, 0, h + 31, 0);
  addBox(g, M.snowFresh, w + 16, 7, d * 0.38, 0, h + 42, -d * 0.33, 0, -0.34);
  addBox(g, M.snowFresh, w + 16, 7, d * 0.38, 0, h + 42, d * 0.33, 0, 0.34);
  // insulated hangar doors
  addBox(g, M.darkMetal, 8, h * 0.82, d * 0.74, w / 2 + 3, h * 0.41 + 8, 0);
  for (let i = 0; i < 8; i++) addBox(g, M.metal, 4, h * 0.8, 12, w / 2 + 8, h * 0.42 + 8, -d * 0.32 + i * d * 0.09);
  addBox(g, M.hazard, 5, 14, d * 0.7, w / 2 + 10, 16, 0);
  addBox(g, M.lamp, 14, 6, 30, w / 2 + 9, h * 0.8, 0);
  // side annex
  addBox(g, M.panel, 96, 58, 74, -w * 0.36, 37, d / 2 + 18);
  addBox(g, M.snowFresh, 102, 7, 80, -w * 0.36, 69, d / 2 + 18);
  addBox(g, M.darkMetal, 34, 40, 5, -w * 0.36, 28, d / 2 + 56);
  addBox(g, M.lamp, 8, 5, 8, -w * 0.36 + 30, 56, d / 2 + 56);
  // roof vents and stacks
  for (const vx of [-70, 40, 110]) {
    addCyl(g, M.darkMetal, 8, 44, vx, h + 46, -d * 0.18);
    addCyl(g, M.snowFresh, 10, 5, vx, h + 70, -d * 0.18);
  }
  addBoxObstacle(x, z, w / 2 + 9, d / 2 + 9, ry);
  buildContactShadow(x, z, w + 90, d + 90);
  return g;
}

function buildArcticHQ(x, z, ry) {
  const M = ENV.M;
  buildBuilding(x, z, 300, 170, 3, ry, { lit: true });
  const g = envProp(x, z, ry);
  const h = 144;
  // snow-loaded roof, HVAC and dishes
  addBox(g, M.metal, 312, 5, 182, 0, h + 3, 0);
  addBox(g, M.concreteDark, 310, 8, 6, 0, h + 7, 86);
  addBox(g, M.concreteDark, 310, 8, 6, 0, h + 7, -86);
  addBox(g, M.concreteDark, 6, 8, 176, 151, h + 7, 0);
  addBox(g, M.concreteDark, 6, 8, 176, -151, h + 7, 0);
  addBox(g, M.snowSoft, 296, 7, 164, 0, h + 13, 0);
  for (const f of [1, 2]) {
    addBox(g, M.snowSoft, 250, 5, 7, 0, f * 48 + 6, 88);
    addBox(g, M.snowSoft, 250, 5, 7, 0, f * 48 + 6, -88);
  }
  addBox(g, M.metal, 62, 24, 42, -58, h + 27, 18);
  addBox(g, M.snowFresh, 64, 6, 44, -58, h + 41, 18);
  addBox(g, M.darkMetal, 40, 12, 30, 58, h + 20, -22);
  addCyl(g, M.darkMetal, 4, 62, 96, h + 34, 44);
  addSphere(g, M.lamp, 4, 96, h + 68, 44);
  // armoured entrance and snow-loaded canopy
  addBox(g, M.darkMetal, 58, 34, 4, 0, 21, 90);
  addBox(g, M.glassDark, 44, 24, 3, 0, 21, 92);
  addBox(g, M.hazard, 60, 4, 12, 0, 3, 100);
  addBox(g, M.snowFresh, 96, 5, 26, 0, 46, 96);
  // wall details: downpipes, lamps, conduit
  for (const s of [-1, 1]) {
    addBox(g, M.darkMetal, 5, h, 5, s * 146, h / 2 + 6, 82);
    addBox(g, M.lamp, 8, 5, 12, s * 138, 60, 90);
  }
  buildContactShadow(x, z, 380, 250);
  return g;
}

function buildTireTrack(x, z, len, width, ry) {
  const tex = treadTexture().clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, Math.max(1, len / 300));
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.4, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2
  });
  const m = new THREE.Mesh(ENV.G.plane, mat);
  m.scale.set(width, len, 1);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = ry || 0;
  m.position.set(coreX(x), 1.0, coreZ(z));
  arenaGroup.add(m);
  return m;
}

function buildFootprints(x1, z1, x2, z2, steps) {
  const tex = footTexture();
  let mat = ENV.footMat;
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3
    });
    ENV.footMat = mat;
  }
  const n = steps || 12;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const side = i % 2 ? 8 : -8;
    const m = new THREE.Mesh(ENV.G.plane, mat);
    m.scale.set(9, 13, 1);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(dx, dz) + Math.PI / 2 + (i % 2 ? 0.14 : -0.12);
    m.position.set(coreX(x1 + dx * t + nx * side), 1.99, coreZ(z1 + dz * t + nz * side));
    arenaGroup.add(m);
  }
}

function buildIceSheet(x, z, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), ENV.M.iceSheet);
  m.rotation.x = -Math.PI / 2;
  m.position.set(coreX(x), 1.9, coreZ(z));
  m.receiveShadow = true;
  arenaGroup.add(m);
  return m;
}

function buildArcticOutpost(theme) {
  const M = ENV.M;
  // ploughed roads read as packed snow with vehicle ruts
  buildTireTrack(996, 760, 1350, 52, 0);
  buildTireTrack(1104, 760, 1350, 52, 0);
  buildTireTrack(1050, 715, 1950, 48, Math.PI / 2);
  buildTireTrack(1050, 805, 1950, 48, Math.PI / 2);
  buildTireTrack(775, 380, 330, 40, Math.PI / 2);
  buildTireTrack(1300, 300, 250, 40, Math.PI / 2);

  // walking routes: gate -> plaza -> junction, plus works around the compound
  buildFootprints(1050, 1290, 1050, 1120, 10);
  buildFootprints(1050, 1120, 1050, 905, 12);
  buildFootprints(1050, 905, 1050, 700, 12);
  buildFootprints(1000, 1055, 890, 990, 7);
  buildFootprints(1100, 1055, 1210, 990, 7);
  buildFootprints(1600, 430, 1470, 470, 8);
  buildFootprints(1600, 905, 1500, 850, 6);
  buildFootprints(690, 350, 880, 600, 9);

  // ploughed banks against the structures
  buildSnowPile(450, 480, 220, 0);
  buildSnowPile(1600, 490, 240, 0);
  buildSnowPile(1600, 1315, 240, 0);
  buildSnowPile(300, 1080, 200, Math.PI / 2);
  buildSnowPile(1850, 900, 200, Math.PI / 2);

  // frozen ground: sheets of ice in the shell craters and low spots
  buildIceSheet(700, 1160, 40);
  buildIceSheet(380, 560, 44);
  buildIceSheet(1850, 900, 30);

  // snow fences and wire
  buildSnowFence(90, 980, 190, Math.PI / 2);
  buildSnowFence(1880, 300, 200, 0);

  // ploughed shoulders framing the avenue
  buildSnowPile(900, 800, 90, Math.PI / 2);
  buildSnowPile(1200, 800, 90, Math.PI / 2);
  buildSnowPile(900, 400, 90, Math.PI / 2);
  buildSnowPile(1200, 430, 90, Math.PI / 2);

  // extra drifts around the wall
  buildSnowPile(180, 560, 120, Math.PI / 2);
  buildSnowPile(1960, 1080, 170, Math.PI / 2);
}

function buildDefense(x, z, ry, len) {
  if (ENV.theme && ENV.theme.env === 'ice') buildHesco(x, z, len || 120, ry);
  else buildSandbags(x, z, ry);
}

// ------------------------------------------------------------
//  OUTER DISTRICTS
//  The hand-placed compound is the middle of the sector; these blocks are
//  what make the battlefield properly large. They are laid out in the same
//  coordinate space as the core, so roads, props and colliders stay in step.
// ------------------------------------------------------------
function buildWarehouse(x, z, ry, width, depth) {
  const M = ENV.M;
  const w = width || 300, d = depth || 170, h = 84;
  const g = envProp(x, z, ry);
  addGroundAO(g, w * 1.35, d * 1.5);
  addBox(g, M.concreteDark, w + 18, 9, d + 18, 0, 4.5, 0);
  addBox(g, M.metal, w, h, d, 0, h / 2 + 8, 0);
  for (let i = 0; i <= 8; i++) {
    addBox(g, M.band, 5, h, 5, -w / 2 + (w / 8) * i, h / 2 + 8, d / 2 + 2);
    addBox(g, M.band, 5, h, 5, -w / 2 + (w / 8) * i, h / 2 + 8, -d / 2 - 2);
  }
  addBox(g, M.band, w + 6, 5, d + 6, 0, h * 0.55 + 8, 0);
  addBox(g, M.darkMetal, w + 10, 7, d + 10, 0, h + 12, 0);
  for (let i = 0; i < 4; i++) {
    addBox(g, M.metal, 26, 12, 26, -w * 0.3 + i * w * 0.2, h + 20, d * 0.18);
    addCyl(g, M.rust, 5, 16, -w * 0.3 + i * w * 0.2, h + 32, d * 0.18, 0, 0, 8);
  }
  // loading doors with canopies, dock and hazard stripes
  for (let i = -1; i <= 1; i++) {
    const dx = i * w * 0.3;
    addBox(g, M.darkMetal, 68, h * 0.66, 5, dx, h * 0.33 + 8, d / 2 + 3);
    for (let k = 0; k < 6; k++) addBox(g, M.band, 64, 3, 3, dx, 14 + k * 9, d / 2 + 6);
    addBox(g, M.lamp, 16, 5, 8, dx, h * 0.78 + 8, d / 2 + 6);
    addBox(g, M.hazard, 70, 4, 4, dx, h * 0.05 + 8, d / 2 + 7);
  }
  addBox(g, M.concreteDark, w * 0.86, 12, 28, 0, 6, d / 2 + 20);
  addBox(g, M.hazard, w * 0.86, 3, 6, 0, 12.5, d / 2 + 30);
  // yard details
  buildContactShadow(x, z, w + 60, d + 60);
  addBoxObstacle(x, z, w / 2 + 9, d / 2 + 9, ry);
  return g;
}

function buildParkingLot(x, z, ry, w, d) {
  const M = ENV.M;
  const W = w || 300, D = d || 200;
  const r = ry || 0, c = Math.cos(r), s = Math.sin(r);
  const px = (ax, az) => x + ax * c + az * s;
  const pz = (ax, az) => z - ax * s + az * c;
  const g = envProp(x, z, r);
  addBox(g, M.concreteDark, W, 1.0, D, 0, 1.6, 0);
  const bays = Math.max(3, Math.round(W / 52));
  const bw = (W - 44) / bays;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= bays; i++) {
      addBox(g, M.roadLine, 3, 0.2, 74, -W / 2 + 22 + i * bw, 2.16, side * (D / 2 - 62));
    }
    addBox(g, M.roadLine, W - 44, 0.2, 3, 0, 2.16, side * (D / 2 - 99));
  }
  // parked vehicles (most of the lot is full)
  for (const side of [-1, 1]) {
    for (let i = 0; i < bays; i++) {
      if (Math.random() < (MOBILE_GPU ? 0.42 : 0.22)) continue;
      const ax = -W / 2 + 22 + (i + 0.5) * bw, az = side * (D / 2 - 62);
      buildCar(px(ax, az), pz(ax, az), r + (side > 0 ? Math.PI : 0) + rand(-0.05, 0.05), Math.random() < 0.08);
    }
  }
  for (const ax of [-W * 0.25, W * 0.25]) buildLamp(px(ax, 0), pz(ax, 0), r, true);
  return g;
}

function buildWalledCompound(x, z, w, d, ry) {
  const M = ENV.M;
  const W = w || 340, D = d || 240, T = 16, H = 78;
  const r = ry || 0, c = Math.cos(r), s = Math.sin(r);
  const px = (ax, az) => x + ax * c + az * s;
  const pz = (ax, az) => z - ax * s + az * c;
  const g = envProp(x, z, r);
  addGroundAO(g, W + 110, D + 110);
  // three full walls and a gated front
  addBox(g, M.concreteDark, W, H, T, 0, H / 2, -D / 2);
  addBox(g, M.wallCap, W + 4, 4, T + 4, 0, H + 2, -D / 2);
  for (const sg of [-1, 1]) {
    addBox(g, M.concreteDark, T, H, D, sg * W / 2, H / 2, 0);
    addBox(g, M.wallCap, T + 4, 4, D + 4, sg * W / 2, H + 2, 0);
  }
  const gap = 116, seg = (W - gap) / 2;
  for (const sg of [-1, 1]) {
    const ax = sg * (gap / 2 + seg / 2);
    addBox(g, M.concreteDark, seg, H, T, ax, H / 2, D / 2);
    addBox(g, M.wallCap, seg + 2, 4, T + 4, ax, H + 2, D / 2);
    addBox(g, M.concrete, 22, 104, 22, sg * (gap / 2 + 9), 52, D / 2);
    addBox(g, M.lamp, 8, 5, 8, sg * (gap / 2 + 9), 104, D / 2);
    addBox(g, M.hazard, 18, 3, 6, sg * (gap / 2 + 9), 38, D / 2 + 11);
    addBoxObstacle(px(ax, D / 2), pz(ax, D / 2), seg / 2 + T / 2, T / 2, r);
    addObstacle(px(sg * (gap / 2 + 9), D / 2), pz(sg * (gap / 2 + 9), D / 2), 22);
  }
  addBoxObstacle(px(0, -D / 2), pz(0, -D / 2), W / 2 + T / 2, T / 2, r);
  addBoxObstacle(px(-W / 2, 0), pz(-W / 2, 0), T / 2, D / 2 + T / 2, r);
  addBoxObstacle(px(W / 2, 0), pz(W / 2, 0), T / 2, D / 2 + T / 2, r);
  // yard: crates, drums, a tent and a tower over the gate
  buildCrates(px(-W * 0.3, -D * 0.22), pz(-W * 0.3, -D * 0.22), r + 0.2);
  buildCrates(px(-W * 0.18, -D * 0.34), pz(-W * 0.18, -D * 0.34), r - 0.1);
  buildBarrels(px(W * 0.28, -D * 0.16), pz(W * 0.28, -D * 0.16), false);
  buildTent(px(W * 0.08, -D * 0.2), pz(W * 0.08, -D * 0.2), r, 1);
  buildWatchtower(px(W * 0.34, -D * 0.34), pz(W * 0.34, -D * 0.34), r, true);
  return g;
}

const ANNEX_KIT = {
  base:      ['warehouse', 'parking', 'hangar', 'warehouse', 'barracks', 'compound'],
  urban:     ['building', 'parking', 'building', 'warehouse', 'parking', 'ruin'],
  factory:   ['warehouse', 'silo', 'warehouse', 'parking', 'warehouse', 'crane'],
  jungle:    ['ruin', 'tent', 'warehouse', 'ruin', 'tent', 'parking'],
  desert:    ['compound', 'warehouse', 'tent', 'parking', 'barracks', 'warehouse'],
  wasteland: ['ruin', 'wreck', 'warehouse', 'ruin', 'wreck', 'parking'],
  ice:       ['warehouse', 'parking', 'arctic', 'warehouse', 'arctic', 'compound'],
  volcano:   ['warehouse', 'derrick', 'parking', 'warehouse', 'silo', 'wreck']
};

function pickAnnex(env, seed) {
  const kit = ANNEX_KIT[env] || ANNEX_KIT.base;
  return kit[Math.abs(seed) % kit.length];
}

function buildAnnex(kind, x, z, ry) {
  const r = ry || 0;
  const c = Math.cos(r), s = Math.sin(r);
  const offX = (ax) => x + ax * c;
  const offZ = (az) => z - az * s;
  if (kind === 'warehouse') {
    buildWarehouse(x, z, r, 300, 170);
    if (Math.random() < 0.6) buildCrates(offX(190), z + 60, r + 0.3);
    if (Math.random() < 0.4) buildBarrels(offX(-190), z - 40, Math.random() < 0.3);
  } else if (kind === 'building') {
    buildBuilding(x, z, 260, 150, randInt(3, 6), r, { lit: Math.random() < 0.55 });
    buildLamp(offX(170), z + 30, r, true);
  } else if (kind === 'hangar') {
    buildHangar(x, z, r, 280);
    buildTruck(offX(-200), z + 40, r + 0.2, Math.random() < 0.3);
  } else if (kind === 'parking') {
    buildParkingLot(x, z, r, 300, 200);
  } else if (kind === 'compound') {
    buildWalledCompound(x, z, 340, 240, r);
  } else if (kind === 'ruin') {
    buildRuin(x, z, r, 1.1);
    buildRubble(offX(150), z + 70, 5);
  } else if (kind === 'silo') {
    buildSilo(x, z, 1.15);
    buildSilo(offX(110), z + 30, 0.9);
    buildPipeChain(offX(40), z - 70, r, 220);
  } else if (kind === 'tent') {
    buildTent(x, z, r, 1);
    buildTent(offX(110), z + 50, r + 0.25, 0);
    buildCrates(offX(-90), z - 30, r);
  } else if (kind === 'barracks') {
    buildArcticBarracks(x, z, r, 2);
    buildDefense(offX(-170), z + 80, r);
  } else if (kind === 'arctic') {
    buildArcticHangar(x, z, r);
    buildSnowPile(offX(200), z + 90, 160, r);
  } else if (kind === 'derrick') {
    buildDerrick(x, z);
    buildPipeChain(offX(120), z + 60, r, 200);
  } else if (kind === 'crane') {
    buildCrane(x, z);
    buildScrap(offX(-150), z + 60);
  } else if (kind === 'wreck') {
    buildTank(x, z, r, true);
    buildTruck(offX(120), z + 50, r + 0.4, true);
    buildScrap(offX(-120), z - 40);
  }
}

function buildOutskirts(theme) {
  const env = theme.env;
  const flagColor = {
    base: '#4ea8ff', urban: '#e6ecf4', factory: '#ffb03a', jungle: '#7dff62',
    desert: '#e0b040', wasteland: '#e05a2a', ice: '#8ee0ff', volcano: '#ff6a2a'
  }[env] || '#4ea8ff';
  // phones get fewer blocks, but they are still spread over both flanks
  const rowXs = MOBILE_GPU ? [-220, 440, 1760, 2320] : [-220, 110, 440, 1430, 1760, 2090, 2320];

  // north and south rows face the avenues
  rowXs.forEach((bx, i) => {
    if (Math.abs(bx - DCX) < 200) return;
    buildAnnex(pickAnnex(env, i + 1), bx, -150, 0);
  });
  rowXs.forEach((bx, i) => {
    if (Math.abs(bx - DCX) < 200) return;
    buildAnnex(pickAnnex(env, i + 4), bx, 1650, Math.PI);
  });

  // east and west rows run along the vertical avenue
  const sideZs = MOBILE_GPU ? [200, 1020, 1340] : [200, 480, 1020, 1340];
  sideZs.forEach((bz, i) => {
    if (Math.abs(bz - DCZ) < 190) return;
    buildAnnex(pickAnnex(env, i + 2), -170, bz, Math.PI / 2);
    buildAnnex(pickAnnex(env, i + 5), 2275, bz, -Math.PI / 2);
  });

  // lamps and barriers along the ring road
  for (const lx of [-350, 700, 1760, 2420]) {
    buildLamp(lx, -262, 0, true);
    buildLamp(lx, 1752, Math.PI, true);
  }
  for (const lz of [520, 1330]) {
    buildLamp(-352, lz, Math.PI / 2, true);
    buildLamp(2452, lz, -Math.PI / 2, true);
  }

  // a landmark at each gate approach so the ring reads as occupied ground
  buildFlag(-300, 330, flagColor);
  buildBillboard(620, -252, 0, 'SECTOR ' + theme.name.split(' ')[0]);
  buildDefense(-300, 1750, 0, 150);
  buildDefense(2400, 1750, 0, 150);
  buildSandbags(-300, 120, 0);
  buildSandbags(2400, 120, 0);
}

function buildBattlefield(theme) {
  const env = theme.env;
  const M = ENV.M;
  const padType = 'concrete';
  const flagColor = {
    base: '#4ea8ff', urban: '#e6ecf4', factory: '#ffb03a', jungle: '#7dff62',
    desert: '#e0b040', wasteland: '#e05a2a', ice: '#8ee0ff', volcano: '#ff6a2a'
  }[env] || '#4ea8ff';

  buildRoadNetwork(theme);
  buildPerimeter(theme);
  buildOutskirts(theme);

  // hardstands keep every structure on prepared ground
  buildPad(500, 380, 600, 400, padType);
  buildPad(1600, 330, 500, 320, padType);
  buildPad(500, 1060, 520, 400, padType);
  buildPad(1600, 1100, 380, 480, padType);
  buildPad(1050, 1060, 430, 270, padType);

  // ---------------- north-west: motor pool ----------------
  if (env === 'urban') {
    buildRuin(450, 340, 0.12, 1.15);
    buildCar(690, 250, 0.2, true);
    buildCar(690, 480, 2.9, true);
    buildRubble(600, 560, 5);
  } else if (env === 'jungle') {
    buildBunker(450, 340, 0);
    buildLogs(690, 470, 0.3);
    buildTruck(690, 250, 0.15, true);
  } else if (env === 'desert') {
    buildBunker(450, 340, 0);
    buildTent(300, 470, 0.08, 1);
    buildHumvee(690, 250, 0.1);
    buildTruck(690, 470, 3.3);
  } else if (env === 'wasteland') {
    buildRuin(450, 340, 0.2, 1.2);
    buildTank(690, 470, 0.3, true);
    buildTruck(690, 250, 2.9, true);
  } else if (env === 'ice') {
    buildArcticHangar(450, 340, 0.02);
    buildSnowplow(690, 470, -0.35);
    buildTruck(690, 250, 0.08);
    buildTank(1380, 150, 0.35);
  } else {
    if (env === 'volcano') buildDerrick(450, 340);
    else buildHangar(450, 340, 0.02, 300);
    if (env === 'factory' || env === 'volcano') buildForklift(690, 470, -0.4);
    else buildTank(690, 470, 0.1);
    buildTruck(690, 250, 0.08);
  }

  // ---------------- north-east: command post ----------------
  if (env === 'urban') {
    buildBuilding(1600, 330, 280, 170, 6, 0, { lit: true });
  } else if (env === 'wasteland') {
    buildRuin(1600, 330, 0.05, 1.6);
    buildRocks(1400, 380, 3, 0.8);
  } else if (env === 'jungle') {
    buildRuin(1600, 330, -0.04, 1.3);
    buildTent(1360, 300, 0, 1);
  } else if (env === 'factory') {
    buildBuilding(1600, 330, 300, 170, 2, 0, { lit: true });
    buildSilo(1360, 240, 0.7);
    buildSilo(1360, 420, 0.7);
  } else if (env === 'ice') {
    buildArcticHQ(1600, 330, 0);
  } else {
    buildBuilding(1600, 330, 300, 170, 3, 0, { lit: true });
  }
  buildFlag(1460, 480, flagColor);
  if (env === 'ice') buildDish(1840, 470);
  else buildAntenna(env === 'volcano' ? 1900 : 1820, env === 'volcano' ? 470 : 480);

  // ---------------- south-west: supply yard ----------------
  if (env === 'jungle') {
    buildLogs(400, 980, 0.1);
    buildCrates(560, 980, 0.3);
    buildCrates(400, 1130, 1.2);
    buildBarrels(570, 1130);
    buildTent(650, 1190, 0.4, 1);
  } else if (env === 'urban') {
    buildBuilding(420, 1000, 230, 130, 3, 0.04);
    buildRubble(610, 1150, 9);
    buildCar(650, 930, 0.4, true);
  } else if (env === 'factory') {
    buildSilo(380, 980, 0.95);
    buildSilo(380, 1130, 0.85);
    buildCrates(590, 1000, 0.2);
    buildBarrels(610, 1150, true);
  } else if (env === 'ice') {
    buildContainer(380, 980, 0, 2, 2);
    buildContainer(380, 1120, 0, 1, 0);
    buildContainer(560, 980, 0, 1, 1);
    buildContainer(560, 1120, 0, 2, 3);
    buildSnowCap(380, 980, 116, 46, 94, 0);
    buildSnowCap(380, 1120, 116, 46, 48, 0);
    buildSnowCap(560, 980, 116, 46, 48, 0);
    buildSnowCap(560, 1120, 116, 46, 94, 0);
    buildCrates(690, 1000, 0.3);
    buildBarrels(740, 1080);
    buildGenerator(700, 1190, 0.12);
    buildSnowPile(500, 1245, 190, 0);
  } else {
    buildContainer(380, 980, 0, 2, 0);
    buildContainer(380, 1120, 0, 1, 2);
    buildContainer(560, 980, 0, 1, 1);
    buildContainer(560, 1120, 0, 2, 3);
    if (env === 'wasteland') {
      buildBarrels(690, 1160, true);
      buildScrap(660, 930);
    }
  }

  // ---------------- south-east: barracks ----------------
  if (env === 'urban') {
    buildRuin(1600, 980, 0.08, 1.2);
    buildBuilding(1600, 1250, 240, 130, 3, 2.99);
    buildRubble(1420, 1160, 7);
  } else if (env === 'wasteland') {
    buildRuin(1600, 980, -0.1, 1.15);
    buildRuin(1600, 1250, 2.9, 1.0);
    buildBarrels(1450, 1160, true);
  } else if (env === 'jungle') {
    buildTent(1600, 960, 0.02, 1);
    buildTent(1600, 1120, Math.PI, 1);
    buildTent(1600, 1280, 0.03, 0);
    buildCamoNet(1400, 1180, 0, 160, 120);
  } else if (env === 'ice') {
    buildArcticBarracks(1600, 990, 0, 2);
    buildArcticBarracks(1600, 1250, Math.PI, 2);
    buildHesco(1410, 1120, 170, Math.PI / 2);
    buildGenerator(1800, 850, 0);
    buildBarrels(1790, 1120);
  } else {
    buildBuilding(1600, 990, 240, 110, 2, 0, { lit: false });
    buildBuilding(1600, 1250, 240, 110, 2, 0, { lit: false });
    buildCrates(1790, 1120, 0.4);
    if (env === 'factory') buildCrane(1800, 940);
    if (env === 'desert') buildCamoNet(1390, 1180, 0, 170, 130);
  }

  // ---------------- staging plaza (player start) ----------------
  buildCrates(875, 1145, 0.15);
  buildCrates(1225, 1145, 0.3);
  buildBarrels(855, 1020, true);
  buildBarrels(1245, 1020, false);
  buildDefense(840, 1255, 0);
  buildDefense(1260, 1255, 0);
  buildBarrier(855, 930, Math.PI / 2);
  buildBarrier(1245, 930, Math.PI / 2);
  if (env === 'ice') {
    buildSnowPile(755, 1080, 120, 0);
    buildSnowPile(1345, 1080, 120, 0);
    buildSnowCap(855, 930, 84, 24, 25, Math.PI / 2);
    buildSnowCap(1245, 930, 84, 24, 25, Math.PI / 2);
  }
  buildFlag(620, 1320, flagColor);
  buildHelipad(400, 1340);
  if (env === 'base' || env === 'desert' || env === 'ice') buildHeli(400, 1340, 0.6);

  // ---------------- defensive line north of the crossing ----------------
  buildTrench(240, 430, 300, Math.PI / 2);
  buildTrench(1330, 520, 280, 0);
  buildDefense(880, 640, 0);
  buildDefense(1300, 640, 0);

  // ---------------- gate checkpoints / enemy approaches ----------------
  buildDefense(860, 300, 0);
  buildDefense(1240, 300, 0);
  buildDefense(830, 1380, 0);
  buildDefense(1270, 1380, 0);

  // ---------------- terrain damage ----------------
  buildCrater(700, 1160, 58);
  buildCrater(380, 560, 62);
  buildCrater(1850, 900, 46);
  buildScorch(1060, 340, 46);
  buildScorch(980, 1180, 38);

  // ---------------- street furniture ----------------
  for (const l of [
    [905, 1120, 0], [1195, 1120, 0], [900, 560, 0], [1195, 610, 0]
  ]) buildLamp(l[0], l[1], l[2], true);

  // ---------------- per-theme terrain and landmarks ----------------
  if (env === 'jungle') {
    for (const z of [260, 420, 580, 940, 1100, 1260]) {
      buildPalm(120, z, 240 + (z % 90));
      buildPalm(1980, z, 230 + ((z * 2) % 80));
    }
    for (const p of [[820, 180, 250], [1280, 180, 260], [300, 900, 240], [1780, 600, 240], [1800, 1300, 250]]) {
      buildPalm(p[0], p[1], p[2]);
    }
    for (const p of [[950, 700], [1150, 700], [900, 980], [1200, 980], [820, 930], [1280, 930]]) {
      buildBush(p[0], p[1]);
    }
    for (const p of [[690, 880], [1410, 880], [960, 1220], [1140, 1220], [520, 780], [1580, 780], [620, 1260], [1480, 1260]]) {
      buildGrass(p[0], p[1]);
    }
    buildBush(190, 200); buildBush(1910, 200);
    buildBush(190, 1300); buildBush(1910, 1300);
    buildBush(620, 1400); buildBush(1500, 1400);
    buildPuddle(1000, 1200, 70);
    buildPuddle(700, 450, 55);
    buildPuddle(1450, 300, 50);
    buildRocks(650, 1420, 3, 0.9);
    buildPalm(650, 1390, 250);
  } else if (env === 'desert') {
    buildDune(300, 120, 200); buildDune(1800, 120, 220);
    buildDune(160, 430, 170); buildDune(1950, 1100, 180);
    buildDune(620, 1400, 200); buildDune(1520, 1400, 190);
    buildRocks(650, 1420, 4, 1.1);
    buildCamoNet(1450, 570, 0, 190, 130);
  } else if (env === 'ice') {
    for (const p of [[250, 500], [1980, 660], [620, 1400], [1520, 1400], [1990, 1000]]) {
      const g = envProp(p[0], p[1], 0.3);
      for (let k = 0; k < 3; k++) {
        const h = 54 + k * 26;
        addCone(g, M.ice, h * 0.24, h, (k - 1) * 20, h * 0.42, (k % 2) * 16, 0.08, -0.08);
      }
      addObstacle(p[0], p[1], 34);
    }
    for (const p of [[600, 100], [1500, 100], [110, 520], [1990, 900], [700, 1420], [1450, 1420]]) {
      const g = envProp(p[0], p[1], 0);
      addSphere(g, M.snow, 90, 0, -16, 0, 1.8, 0.32, 1.2);
    }
  } else if (env === 'volcano') {
    buildPipeChain(1780, 520, Math.PI / 2, 260);
    for (const p of [[250, 600, 55], [1870, 1240, 65]]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(p[2], 18), M.lava);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(coreX(p[0]), 1.8, coreZ(p[1]));
      arenaGroup.add(pool);
      const light = new THREE.PointLight(0xff5a12, 150, 460, 2);
      light.position.set(coreX(p[0]), 40, coreZ(p[1]));
      arenaGroup.add(light);
      fires.push({ light, flame: null, base: 150 });
    }
    for (const f of [[600, 980, 210, 0.35], [1620, 620, 180, -0.3], [1180, 1320, 200, 0.08]]) {
      const g = envProp(f[0], f[1], f[3]);
      addBox(g, M.lava, f[2], 1.6, 14, 0, 1.3, 0);
      addBox(g, M.crater, f[2] + 20, 1.2, 26, 0, 1.1, 0);
    }
    buildRocks(760, 1400, 5, 1.2);
  } else if (env === 'wasteland') {
    buildDeadTree(1850, 560);
    buildDeadTree(700, 200);
    buildDeadTree(620, 1400);
    buildDeadTree(1500, 180);
    buildRocks(650, 1420, 4, 1.1);
  } else if (env === 'urban') {
    buildCar(700, 1250, 0.1, true);
    buildRubble(1400, 1330, 5);
    buildLamp(720, 1200, 0, true);
    buildLamp(1380, 1200, 0, true);
  } else if (env === 'factory') {
    buildChimney(1300, 180, 300);
    buildChimney(1880, 580, 260);
    buildPipeChain(700, 1420, 0, 220);
  } else {
    buildRocks(650, 1420, 4, 1.1);
    buildRocks(1500, 1400, 3, 1.0);
  }

  if (env === 'ice') buildArcticOutpost(theme);

  // low earth berms close the perimeter so no corner reads as empty
  buildBerm(280, 200, 150, 0);
  buildBerm(1820, 200, 150, 0);
  buildBerm(230, 1080, 160, Math.PI / 2);
  buildBerm(1870, 1080, 160, Math.PI / 2);
}

// Bake every static prop into one mesh per material. Cuts the whole
// battlefield down to a few dozen draw calls (critical on phones).
function mergeStaticGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, off * 3);
    nor.set(n.array, off * 3);
    uv.set(u.array, off * 2);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function batchArenaProps() {
  const groups = new Map();
  const remove = [];
  const keep = new Set(spinners);
  arenaGroup.traverse(o => {
    if (!o.isMesh || keep.has(o) || o.userData.noMerge) return;
    if (Array.isArray(o.material) || !o.material) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
    const key = o.material.uuid;
    let rec = groups.get(key);
    if (!rec) {
      rec = { mat: o.material, geos: [] };
      groups.set(key, rec);
    }
    o.updateWorldMatrix(true, false);
    const copy = g.index ? g.toNonIndexed() : g.clone();
    copy.applyMatrix4(o.matrixWorld);
    rec.geos.push(copy);
    remove.push(o);
  });
  for (const o of remove) {
    if (o.parent) o.parent.remove(o);
  }
  for (const rec of groups.values()) {
    if (!rec.geos.length) continue;
    const geo = mergeStaticGeos(rec.geos);
    const mesh = new THREE.Mesh(geo, rec.mat);
    mesh.castShadow = ENV.shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    arenaGroup.add(mesh);
    for (const g of rec.geos) g.dispose();
  }
}

// Dev safety net: reports props whose footprints collide, so the hand-placed
// layout can be checked instead of eyeballed.
function battlefieldAudit() {
  const list = arenaObstacles;
  const bad = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.group && a.group === b.group) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < a.r + b.r - 12) {
        bad.push({
          d: Math.round(d), sum: a.r + b.r,
          a: [Math.round(a.x), Math.round(a.z)], b: [Math.round(b.x), Math.round(b.z)]
        });
      }
    }
  }
  window.__GUNBROS_AUDIT = { count: bad.length, obstacles: list.length, worst: bad.slice(0, 10) };
  window.__GUNBROS_OBSTACLES = list.map(o => ({ x: o.x, z: o.z, r: o.r }));
  window.__GUNBROS_LANES = ENEMY_LANES.map(o => ({ x: o.x, z: o.z }));
  if (bad.length) console.warn('[map] footprint overlaps:', bad.length, bad.slice(0, 6));
}

// Re-tint the shared prop materials into holo-deck steel and emissive trim.
function applyHoloMaterials(M) {
  const glow = (m, c, i) => { if (m && m.emissive) { m.emissive.setHex(c); m.emissiveIntensity = i; } };
  const tint = (m, c) => { if (m && m.color) m.color.setHex(c); };
  // graphite structures, brushed silver trim, violet projection light
  tint(M.concrete, 0x45484f); glow(M.concrete, 0x2a0f45, 0.16);
  tint(M.concreteDark, 0x2e3138); glow(M.concreteDark, 0x1e0b33, 0.14);
  tint(M.band, 0x6a6f78); glow(M.band, 0x2a1247, 0.18);
  tint(M.metal, 0xd7dbe2); glow(M.metal, 0x241040, 0.12);
  tint(M.darkMetal, 0x34383f); glow(M.darkMetal, 0x1e0b33, 0.16);
  tint(M.rust, 0x3a3634); tint(M.brick, 0x39363a);
  tint(M.olive, 0x4a4d42); tint(M.tan, 0x6a655a);
  tint(M.sand, 0x6b675c); tint(M.sandDune, 0x75705f); tint(M.sandAlt, 0x57534a);
  tint(M.wood, 0x4a4038); tint(M.bark, 0x39332c); tint(M.rope, 0x6b6357);
  tint(M.foliage, 0x3f5a3c); tint(M.foliageDark, 0x2c4030); tint(M.frond, 0x4d7042); tint(M.pine, 0x35513a);
  tint(M.rock, 0x4a4d54); tint(M.rockDark, 0x34373d); tint(M.burnt, 0x2a2724);
  if (M.lamp) M.lamp.color.setHex(0xf2ecff);
  tint(M.hazard, 0x8a7a2e);
  if (M.roadLine) { M.roadLine.color.setHex(0xc9b6ff); M.roadLine.opacity = 0.42; }
  tint(M.camo, 0x45483c);
  tint(M.ice, 0xc8d4e0); if (M.ice) M.ice.opacity = 0.5;
  tint(M.snow, 0xb9c2cc); tint(M.snowFresh, 0xd8dee6); tint(M.snowSoft, 0xa4adb8);
  tint(M.trench, 0x2a2724); tint(M.crater, 0x33302c); tint(M.craterDeep, 0x1d1b19);
  tint(M.wall, 0x3a3d44); glow(M.wall, 0x8a3fd0, 0.2);
  tint(M.wallCap, 0x878c95);
  tint(M.glass, 0x1a1620); glow(M.glass, 0x5a2aa0, 0.9);
  tint(M.glassLit, 0x241c2e); glow(M.glassLit, 0x8a3fd0, 1.1);
  if (M.fire) M.fire.color.setHex(0xd44dff);
  tint(M.panel, 0xc3c8d2);
  if (M.wire) M.wire.color.setHex(0x8f8a9a);
  if (M.contact) M.contact.opacity = 0.45;
}

function buildArenaEnvironment(theme) {
  arenaObstacles.length = 0;
  fires.length = 0;
  spinners.length = 0;
  ENV = { theme, low: LOWQ, shadows: renderer.shadowMap.enabled };
  renderer.toneMappingExposure = theme.env === 'ice' ? 1.02 : 1.0;
  setupEnvMaterials(theme);
  applyHoloMaterials(ENV.M);

  // small warm/cool bounce so the props read three-dimensionally
  const fill = new THREE.DirectionalLight(theme.rim, 0.55);
  fill.position.set(-500, 380, -700);
  fill.castShadow = false;
  arenaGroup.add(fill);

  buildBattlefield(theme);
  batchArenaProps();
  buildObstacleGrid();
  // On phones the shadow pass only needs the fighters: the map is static and
  // lit from above, so letting 30 buildings cast costs hundreds of draws for
  // shadows nobody sees.
  if (MOBILE_GPU && renderer.shadowMap.enabled) {
    arenaGroup.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  battlefieldAudit();
  ENV = null;
}

// ------------------------------------------------------------
//  Weather
// ------------------------------------------------------------
let weather = null;

function buildWeather(theme) {
  if (weather) { scene.remove(weather.points); weather.points.geometry.dispose(); weather = null; }
  const cfg = theme.weather || { color: '#c9b29a', speed: 110, size: 4, count: 200, drift: 16 };
  const n = Math.max(40, Math.round(cfg.count * Q.weather));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rand(-HX, HX);
    pos[i * 3 + 1] = rand(10, 330);
    pos[i * 3 + 2] = rand(-HZ, HZ);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(cfg.color), size: cfg.size, transparent: true,
    opacity: 0.6, map: softDotTex, alphaTest: 0.02, depthWrite: false
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  weather = { points: pts, pos, cfg, n };
}

function updateWeather(dt) {
  if (!weather) return;
  const { pos, cfg, n } = weather;
  const px = G.player ? G.player.x - HX : 0;
  const pz = G.player ? G.player.y - HZ : 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    pos[i3] += cfg.drift * dt;
    pos[i3 + 1] -= cfg.speed * dt;
    if (pos[i3 + 1] < 0) {
      pos[i3 + 1] = cfg.speed > 0 ? 330 : 0;
      pos[i3] = px + rand(-400, 400);
      pos[i3 + 2] = pz + rand(-400, 400);
    }
    if (pos[i3 + 1] > 335) {
      pos[i3 + 1] = 0;
      pos[i3] = px + rand(-400, 400);
      pos[i3 + 2] = pz + rand(-400, 400);
    }
    if (Math.abs(pos[i3] - px) > 480) pos[i3] = px + rand(-400, 400);
    if (Math.abs(pos[i3 + 2] - pz) > 480) pos[i3 + 2] = pz + rand(-400, 400);
  }
  weather.points.geometry.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------
//  Shell casings, smoke and explosions
// ------------------------------------------------------------
const casingGeo = new THREE.BoxGeometry(3, 3, 10);
const casingMat = new THREE.MeshStandardMaterial({ color: 0xd9a93f, metalness: 1, roughness: 0.32 });
const casings = [];

function spawnCasing(f) {
  if (casings.length > 42) return;
  const a = f.angle;
  const m = new THREE.Mesh(casingGeo, casingMat);
  m.position.set(f.x - HX + Math.cos(a) * 46, 46, f.y - HZ + Math.sin(a) * 46);
  m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
  scene.add(m);
  const side = a + Math.PI / 2;
  casings.push({
    mesh: m, life: 3.4,
    vx: Math.cos(side) * rand(60, 120) - Math.cos(a) * 30,
    vy: Math.sin(side) * rand(60, 120) - Math.sin(a) * 30,
    vz: rand(110, 190), spin: rand(-16, 16)
  });
}

function smokePuff(x, y, count, tint) {
  for (let i = 0; i < count; i++) {
    if (G.parts.length >= MAXP) return;
    const a = rand(0, TAU), s = rand(10, 55);
    G.parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.35, 0.8), max: 0.8, color: tint || '#3b302a',
      size: rand(3.5, 6.5), drag: 1.8
    });
  }
}

// Bullet strike: sparks, a dust bloom and (for heavy rounds) a small shock ring.
function impactFx(x, y, color, hard) {
  burst(x, y, color || '#ffcf8a', hard ? 9 : 4, hard ? 240 : 130, hard ? 2.4 : 1.7);
  smokeCloud(x, y, hard ? 3 : 1, '#8a8177', hard ? 38 : 22, hard ? 55 : 24, hard ? 0.9 : 0.5);
  if (hard) ring(x, y, color || '#ffcf8a', 26, 0.22, 2);
}

const boomGeo = new THREE.IcosahedronGeometry(1, 1);

// Explosion meshes and scorch decals are recycled instead of rebuilt: a rocket
// blast used to allocate two materials, a circle geometry and a light.
const boomPool = [];
function takeBoomParts() {
  let b = boomPool.pop();
  if (!b) {
    b = {
      mesh: new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({
        color: 0xff7a26, transparent: true, opacity: 0.62,
        blending: THREE.AdditiveBlending, depthWrite: false
      })),
      core: new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      }))
    };
  }
  return b;
}
const decalGeo = new THREE.CircleGeometry(1, 18);
const decalPool = [];
function takeDecalMesh() {
  let m = decalPool.pop();
  if (!m) {
    m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      color: 0x0a0705, transparent: true, opacity: 0.5, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
  }
  m.position.y = 0.9;
  m.material.opacity = 0.5;
  m.visible = true;
  scene.add(m);
  return m;
}
function releaseDecalMesh(m) {
  if (!m) return;
  scene.remove(m);
  if (decalPool.length < 24) decalPool.push(m);
}

function boom(x, y, size) {
  const s = size || 60;
  // hot outer fireball plus a white core, both additive, both recycled
  const parts = takeBoomParts();
  const mesh = parts.mesh, core = parts.core;
  mesh.position.set(x - HX, 30, y - HZ);
  mesh.scale.setScalar(s * 0.16);
  mesh.material.opacity = 0.62;
  mesh.visible = true;
  scene.add(mesh);
  core.position.set(x - HX, 34, y - HZ);
  core.scale.setScalar(s * 0.08);
  core.material.opacity = 0.8;
  core.visible = true;
  scene.add(core);

  const slot = takeBoomLight();
  if (slot) {
    slot.busy = true;
    slot.light.position.set(x - HX, 100, y - HZ);
    slot.light.intensity = 560;
  }

  G.booms.push({ mesh, core, light: slot ? slot.light : null, slot, t: 0, life: 0.55, size: s });
  smokePuff(x, y, 7);
  smokeCloud(x, y, s > 120 ? 12 : 6, '#4a423a', s > 120 ? 78 : 46, s * 0.6, s > 120 ? 2.0 : 1.15);
  burst(x, y, '#ffcf8a', s > 120 ? 16 : 8, s > 120 ? 430 : 250, 3);
  if (s > 80) ring(x, y, '#ffb066', s * 1.5, 0.38, 6);

  const dec = takeDecalMesh();
  dec.position.set(x - HX, 0.9, y - HZ);
  dec.scale.setScalar(s * 0.85);
  G.decals.push({ mesh: dec, t: 0, life: 12 });
  if (G.decals.length > 24) {
    const old = G.decals.shift();
    releaseDecalMesh(old.mesh);
  }
}

function updateFx(dt) {
  // casings
  for (const c of casings) {
    c.life -= dt;
    c.vz -= 720 * dt;
    c.mesh.position.x += c.vx * dt;
    c.mesh.position.z += c.vy * dt;
    c.mesh.position.y += c.vz * dt;
    if (c.mesh.position.y < 3) {
      c.mesh.position.y = 3;
      c.vz *= -0.35; c.vx *= 0.7; c.vy *= 0.7; c.spin *= 0.6;
    }
    c.mesh.rotation.x += c.spin * dt;
    c.mesh.rotation.z += c.spin * 0.6 * dt;
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    if (casings[i].life <= 0) { scene.remove(casings[i].mesh); casings.splice(i, 1); }
  }

  // explosions
  for (const b of G.booms) {
    b.t += dt;
    const k = clamp(b.t / b.life, 0, 1);
    if (b.mesh) {
      b.mesh.scale.setScalar(lerp(b.size * 0.16, b.size * 0.62, 1 - Math.pow(1 - k, 2.1)));
      b.mesh.material.opacity = (1 - k) * 0.62;
    }
    if (b.core) {
      b.core.scale.setScalar(lerp(b.size * 0.08, b.size * 0.26, 1 - Math.pow(1 - k, 3)));
      b.core.material.opacity = Math.pow(1 - k, 1.6) * 0.8;
    }
    if (b.light) b.light.intensity = 560 * (1 - k);
  }
  for (let i = G.booms.length - 1; i >= 0; i--) {
    const b = G.booms[i];
    if (b.t < b.life) continue;
    if (b.mesh) scene.remove(b.mesh);
    if (b.core) scene.remove(b.core);
    if ((b.mesh || b.core) && boomPool.length < 12) boomPool.push({ mesh: b.mesh, core: b.core });
    if (b.slot) { b.slot.light.intensity = 0; b.slot.busy = false; }
    else if (b.light && b.light.parent) scene.remove(b.light);
    G.booms.splice(i, 1);
  }
  updateSmoke(dt);

  // scorch decals
  for (let i = G.decals.length - 1; i >= 0; i--) {
    const d = G.decals[i];
    d.t += dt;
    if (d.t > d.life - 3) d.mesh.material.opacity = clamp((d.life - d.t) / 3, 0, 0.5);
    if (d.t >= d.life) {
      releaseDecalMesh(d.mesh);
      G.decals.splice(i, 1);
    }
  }

  updateWeather(dt);
}

// ------------------------------------------------------------
//  Corpses
// ------------------------------------------------------------
function makeCorpse(mesh) {
  // the clones are tracked so they can be freed when the corpse is removed —
  // they used to pile up for the whole session, one set per kill
  const clones = [];
  mesh.traverse(o => {
    if (o.material && o.material !== blobMat) {
      o.material = o.material.clone();
      o.material.transparent = true;
      clones.push(o.material);
    }
  });
  mesh.userData.clones = clones;
  G.corpses.push({ mesh, t: 0, dir: rand(-1, 1) < 0 ? -1 : 1 });
  if (G.corpses.length > 20) {
    const old = G.corpses.shift();
    scene.remove(old.mesh);
    freeCorpseMeshes(old.mesh);
  }
}

function freeCorpseMeshes(mesh) {
  const clones = mesh && mesh.userData && mesh.userData.clones;
  if (!clones) return;
  for (let i = 0; i < clones.length; i++) { try { clones[i].dispose(); } catch (e) {} }
  clones.length = 0;
}

function updateCorpses(dt) {
  for (const c of G.corpses) {
    c.t += dt;
    const e = 1 - Math.pow(1 - Math.min(1, c.t / 0.4), 3);
    c.mesh.rotation.z = c.dir * (Math.PI / 2.2) * e;
    c.mesh.position.y = -e * 3;
    if (c.t > 1.8) {
      const a = clamp(1 - (c.t - 1.8) / 0.9, 0, 1);
      c.mesh.traverse(o => { if (o.material && o.material.transparent) o.material.opacity = a; });
    }
  }
  for (let i = G.corpses.length - 1; i >= 0; i--) {
    if (G.corpses[i].t > 2.7) {
      scene.remove(G.corpses[i].mesh);
      freeCorpseMeshes(G.corpses[i].mesh);
      G.corpses.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
//  Scene sync
// ------------------------------------------------------------
function syncFighter(f, dt) {
  if (!f || !f.mesh) return;
  const m = f.mesh;
  const ud = m.userData;
  const step = dt || 0.016;
  m.position.set(f.x - HX, f.z || 0, f.y - HZ);
  m.rotation.y = -f.angle;

  // ---- locomotion: anatomical stride, weight shift and weapon handling ----
  const spd = Math.hypot(f.vx, f.vy);
  const walkAmp = f.downed ? 0 : clamp(spd / 175, 0, 1);
  f.walk = (f.walk || 0) + (f.downed ? 0 : spd * step * 0.058);
  const ph = f.walk;
  const rec = clamp((f.recoul || 0) / 5, 0, 1);
  const recS = rec * rec;
  const crouch = f.crouch || 0;
  const air = (f.z || 0) > 1;
  const rlIn = f.reloadMax > 0 ? clamp((f.reloadT || 0) / f.reloadMax, 0, 1) : 0;
  const rl = rlIn * rlIn * (3 - 2 * rlIn); // 1 at the start of a reload, 0 when ready
  const breath = Math.sin(G.time * 1.7 + f.bob);
  const idle = 1 - walkAmp;

  // different guns read differently in the hands
  if (ud.gun) {
    const aw0 = activeWeapon();
    const gs = GUN_LOOK[aw0.cls] || 1;
    for (const k in (ud.guns || {})) {
      const gg = ud.guns[k];
      gg.scale.x += (gs - gg.scale.x) * Math.min(1, step * 9);
    }
    if (ud.guns) {
      const key = (aw0.id === 'pistol' || aw0.id === 'smg') ? 'compact'
        : (aw0.id === 'laser' || aw0.id === 'plasma') ? 'energy'
          : (aw0.id === 'shotgun' || aw0.id === 'minigun' || aw0.id === 'rocket') ? 'heavy' : 'kinetic';
      if (ud.gunKey !== key) {
        ud.gunKey = key;
        for (const k in ud.guns) ud.guns[k].visible = (k === key);
        const col = new THREE.Color(aw0.color);
        for (const sp of (ud.flashSprites || [])) sp.material.color.copy(col);
        if (ud.core) ud.core.material.color.copy(col);
        if (ud.flash) ud.flash.position.x = ud.gunBaseX + ((ud.muzzle && ud.muzzle[key]) || 0);
      }
    }
  }
  const turn = ((f.angle - (f.prevA === undefined ? f.angle : f.prevA) + Math.PI * 3) % TAU) - Math.PI;
  f.prevA = f.angle;

  // ---- legs: heel strike, knee folding on the back swing, toe off ----
  const stride = Math.sin(ph);
  const swing = stride * 0.72 * walkAmp;
  const liftL = Math.max(0, -stride) * walkAmp;
  const liftR = Math.max(0, stride) * walkAmp;
  if (ud.legL) ud.legL.rotation.z = swing + (air ? -0.55 : crouch * 0.5) - recS * 0.05;
  if (ud.legR) ud.legR.rotation.z = -swing + (air ? 0.4 : -crouch * 0.5) - recS * 0.05;
  // knees fold on the back swing so the run reads as a stride, not a scissor
  if (ud.kneeL) ud.kneeL.rotation.z = -liftL * 1.15 - (air ? 0.85 : 0) - crouch * 0.8 - liftR * 0.05;
  if (ud.kneeR) ud.kneeR.rotation.z = -liftR * 1.15 - (air ? 0.6 : 0) - crouch * 0.8 - liftL * 0.05;
  // ankles roll through the step instead of staying locked at 90 degrees
  if (ud.footL) ud.footL.rotation.z = liftL * 0.5 - 0.05 + crouch * 0.14;
  if (ud.footR) ud.footR.rotation.z = liftR * 0.5 - 0.05 + crouch * 0.14;

  // weight shift: how much of the movement is sideways versus forward
  const side = clamp(((f.vx || 0) * -Math.sin(f.angle) + (f.vy || 0) * Math.cos(f.angle)) / 190, -1, 1);
  const fwd = clamp(((f.vx || 0) * Math.cos(f.angle) + (f.vy || 0) * Math.sin(f.angle)) / 190, -1, 1);

  if (ud.hips && !f.downed) {
    ud.hips.position.y = Math.abs(stride) * f.r * 0.17 * walkAmp
      + breath * f.r * 0.018 * idle
      - recS * f.r * 0.05
      - crouch * f.r * 0.34
      + (air ? f.r * 0.1 : 0)
      - rl * f.r * 0.02;
    // torso leans into the direction of travel and rocks back with each shot
    ud.hips.rotation.z = -0.13 * walkAmp * Math.max(0, fwd) - 0.045 * walkAmp
      + recS * 0.15 - crouch * 0.08 + rl * 0.05;
    ud.hips.rotation.y = Math.sin(ph) * 0.1 * walkAmp - clamp(turn * 0.34, -0.22, 0.22) + rl * 0.08;
    ud.hips.rotation.x = -side * 0.15 * walkAmp + Math.sin(ph * 2) * 0.025 * walkAmp
      + breath * 0.01 * idle - recS * 0.05;
  }
  // the head stays level and on the aim line while the body works underneath it
  if (ud.head) {
    ud.head.rotation.z = -(ud.hips ? ud.hips.rotation.z : 0) * 0.55 - recS * 0.05;
    ud.head.rotation.x = -(ud.hips ? ud.hips.rotation.x : 0) * 0.45 + Math.sin(ph) * 0.03 * walkAmp;
    ud.head.position.y = (ud.headBaseY || 0) - Math.abs(stride) * f.r * 0.018 * walkAmp;
  }
  if (ud.neck) ud.neck.rotation.z = -(ud.hips ? ud.hips.rotation.z : 0) * 0.3;

  // ---- arms: both hands stay welded to the weapon, shoulders absorb recoil ----
  const armSway = Math.sin(ph + 1.2) * 0.05 * walkAmp;
  if (ud.armL) {
    ud.armL.rotation.z = -0.3 + recS * 0.28 - rl * 0.2;
    ud.armL.rotation.x = armSway * 0.6;
  }
  if (ud.armR) {
    ud.armR.rotation.z = -0.3 + recS * 0.24 - rl * 0.16;
    ud.armR.rotation.x = -armSway * 0.6;
  }
  if (ud.shoulderL) ud.shoulderL.rotation.x = -recS * 0.1 + armSway * 0.4;
  if (ud.shoulderR) ud.shoulderR.rotation.x = -recS * 0.1 - armSway * 0.4;
  if (ud.body && !f.downed) {
    const bb = ud.bodyBase || { x: 1, y: 1, z: 1 };
    ud.body.scale.y = bb.y * (1 + breath * 0.012);
    ud.body.scale.x = bb.x * (1 + breath * 0.008);
  }
  if (ud.strobe) ud.strobe.visible = (G.time + f.bob) % 1.6 < 0.12;
  if (ud.holo) ud.holo.opacity = 0.24 + Math.abs(Math.sin(G.time * 2.4 + f.bob)) * 0.14;

  // ---- weapon handling: recoil cycle, magazine swap and bolt rack ----
  const wparts = (ud.parts && ud.parts[ud.gunKey]) || null;
  if (ud.gun) {
    const gun = (ud.guns && ud.guns[ud.gunKey]) || ud.gun;
    gun.position.x = ud.gunBaseX - recS * f.r * 0.14;
    gun.position.y = f.r * 1.66 + Math.sin(ph * 2) * f.r * 0.008 * walkAmp - rl * f.r * 0.08;
    gun.rotation.z = recS * 0.2 + Math.sin(ph) * 0.04 * walkAmp - rl * 0.72 - crouch * 0.1;
    gun.rotation.y = rl * 0.4;
    gun.rotation.x = rl * 0.24;
    if (ud.flash) ud.flash.position.x = ud.gunBaseX + ((ud.muzzle && ud.muzzle[ud.gunKey]) || 0) - recS * f.r * 0.18;
  }
  if (wparts) {
    // slide or bolt rides back on every shot, and gets racked on a reload
    const rack = Math.sin(clamp((0.55 - rl) / 0.45, 0, 1) * Math.PI) * 0.85;
    if (wparts.slide) wparts.slide.position.x = (wparts.slideHome || 0) - (recS + rack) * f.r * 0.15;
    if (wparts.charge) wparts.charge.position.x = -f.r * 0.06 - rack * f.r * 0.12;
    // the magazine drops free, then a fresh one seats home
    const magOut = Math.sin(clamp(1 - rl, 0, 1) * Math.PI);
    if (wparts.mag) {
      wparts.mag.position.y = (wparts.magHomeY || 0) - magOut * f.r * 0.6;
      wparts.mag.position.z = (wparts.magHomeZ || 0) + magOut * f.r * 0.1;
      wparts.mag.rotation.z = (wparts.magHomeRZ || 0) + magOut * 0.35;
    }
  }

  // kicked-up dust under the boots
  f.stepT = (f.stepT || 0) - step;
  if (walkAmp > 0.4 && f.stepT <= 0) {
    f.stepT = 0.24;
    const th = MBY[G.mapId] || MAPS[0];
    burst(
      f.x - Math.cos(f.angle) * f.r * 0.5,
      f.y - Math.sin(f.angle) * f.r * 0.5,
      '#' + th.dust.toString(16).padStart(6, '0'), 3, 70, 1.5
    );
  }

  // ---- down / death: topple to the ground ----
  f.deathT = f.downed ? Math.min(1, (f.deathT || 0) + step * 2.6) : 0;
  if (f.downed) {
    const e = 1 - Math.pow(1 - f.deathT, 3);
    m.rotation.x = 0;
    m.rotation.z = Math.PI / 2.1 * e;
    m.position.y = f.r * 0.5 * e;
    if (ud.legL) ud.legL.rotation.z = 0.55 * e;
    if (ud.legR) ud.legR.rotation.z = -0.4 * e;
    if (ud.kneeL) ud.kneeL.rotation.z = -0.5 * e;
    if (ud.kneeR) ud.kneeR.rotation.z = 0.35 * e;
    if (ud.armL) ud.armL.rotation.z = 0.9 * e;
    if (ud.armR) ud.armR.rotation.z = -0.7 * e;
    if (ud.hips) {
      ud.hips.rotation.set(0, 0, 0);
      ud.hips.position.y = -f.r * 0.1 * e;
    }
    if (ud.gun) {
      ud.gun.rotation.z = -1.15 * e;
      ud.gun.position.x = ud.gunBaseX - f.r * 0.2 * e;
    }
    if (ud.thruster) ud.thruster.visible = false;
  } else {
    m.rotation.x = 0;
    m.rotation.z = 0;
    if (ud.thruster) ud.thruster.visible = walkAmp > 0.55;
  }

  const flash = ud.flash;
  if (flash) {
    flash.visible = f.muzzle > 0 && !f.downed;
    if (flash.visible) {
      const col = activeWeapon().color;
      for (const sp of (ud.flashSprites || [])) {
        sp.material.color.set(col);
        sp.material.rotation = Math.random() * TAU;
        sp.scale.setScalar(f.r * (0.85 + Math.random() * 0.95));
      }
    }
  }
  if (ud.core) ud.core.material.color.set(activeWeapon().color);
  if (ud.thruster) {
    const k = 0.85 + Math.sin(G.time * 14 + f.bob) * 0.15;
    ud.thruster.scale.setScalar(k);
  }
  const body = ud.body;
  if (body) body.material.emissive = f.hurt > 0.1 ? FLASH_WHITE : FLASH_NONE;
}

function syncScene(dt) {
  updateArena(dt);
  syncFighter(G.player, dt);
  syncFighter(G.bro, dt);
  updateFx(dt);
  updateCorpses(dt);

  for (const e of G.enemies) {
    if (!e.mesh) continue;
    e.mesh.position.set(e.x - HX, 0, e.y - HZ);
    e.mesh.rotation.y = -e.angle;
    const s = e.spawnT > 0 ? clamp(1 - e.spawnT / 0.6, 0.05, 1) : 1;
    const hitK = e.hitFlash > 0 ? 1 + Math.min(0.09, e.hitFlash * 0.7) : 1;
    e.mesh.scale.setScalar(s * hitK * (e.mesh.userData.baseScale || 1));
    const body = e.mesh.userData.body;
    if (body) {
      body.material.emissiveIntensity = e.hitFlash > 0 ? 2.2 : 0.45;
    }
    if (e.mesh.userData.spin) e.mesh.userData.spin.rotation.z = G.time * 1.6;
    if (e.def.boss && !e.def.alpha) e.mesh.position.y = Math.sin(G.time * 2) * 6 + 8;

    // Distance LOD: a dinosaur halfway across the arena is a handful of
    // pixels tall on a phone, so its gait is stepped every third frame instead
    // of every frame. Close animals are completely unaffected.
    const adx = e.x - G.player.x, ady = e.y - G.player.y;
    const distant = !e.def.boss && (adx * adx + ady * ady) > LOD_ANIM2;
    if (distant) {
      e.skip = (e.skip | 0) + 1;
      if (e.skip % 3) continue;
    } else e.skip = 0;
    const adt = distant ? dt * 3 : dt;

    // loping gait
    const ud = e.mesh.userData;
    const espd = Math.hypot(e.vx, e.vy);
    e.walk = (e.walk || 0) + espd * adt * 0.075;
    const amp = clamp(espd / 110, 0, 1);
    const sw = Math.sin(e.walk) * 0.72 * amp;
    if (ud.legL) ud.legL.rotation.z = sw;
    if (ud.legR) ud.legR.rotation.z = -sw;
    if (ud.kneeL) ud.kneeL.rotation.z = -Math.max(0, -Math.sin(e.walk)) * 0.95 * amp - 0.05;
    if (ud.kneeR) ud.kneeR.rotation.z = -Math.max(0, Math.sin(e.walk)) * 0.95 * amp - 0.05;
    // quadrupeds (ankylosaurus) run on four legs with an alternating gait
    if (ud.legs4) {
      for (let li = 0; li < ud.legs4.length; li++) {
        const ph = (li % 2 ? Math.PI : 0) + (li > 1 ? Math.PI * 0.55 : 0);
        ud.legs4[li].rotation.z = Math.sin(e.walk + ph) * 0.42 * amp;
      }
    }
    // attack telegraph: rear back and raise the claws before a shot or slam
    const wind = e.def.boss ? clamp((0.5 - (e.shootCd || 0)) / 0.5, 0, 1)
      : e.def.ranged ? clamp((0.35 - (e.shootCd || 0)) / 0.35, 0, 1) : 0;
    const slamWind = e.def.slam ? clamp((0.6 - (e.slamCd || 0)) / 0.6, 0, 1) : 0;
    const windAll = Math.max(wind, slamWind);
    if (ud.armL) {
      ud.armL.rotation.z = 0.3 - sw * 0.5 - windAll * 1.1;
      ud.armR.rotation.z = 0.3 + sw * 0.5 - windAll * 1.1;
      ud.armL.rotation.x = Math.sin(e.walk) * 0.2 * amp + windAll * 0.5;
      ud.armR.rotation.x = -Math.sin(e.walk) * 0.2 * amp - windAll * 0.5;
    }
    if (ud.bodyG) {
      ud.bodyG.position.y = Math.abs(Math.sin(e.walk)) * e.r * 0.18 * amp
        + windAll * e.r * 0.14 + (e.def.boss ? Math.sin(G.time * 1.6 + e.wob) * e.r * 0.03 : 0);
      ud.bodyG.rotation.z = Math.sin(e.walk * 2) * 0.05 * amp - windAll * 0.18;
      ud.bodyG.rotation.y = Math.sin(e.walk) * 0.07 * amp + (e.def.boss ? Math.sin(G.time * 1.1) * 0.06 : 0);
    }
    if (ud.head) ud.head.rotation.z = windAll * 0.25 + Math.sin(e.walk) * 0.04 * amp;
    if (ud.jaw) ud.jaw.rotation.z = -(0.06 + windAll * 0.45 + (e.leapWind > 0 ? 0.4 : 0) + (e.biteT || 0) * 1.4 + Math.max(0, Math.sin(G.time * 1.8 + e.wob)) * 0.06);
    if (ud.frill) ud.frill.scale.setScalar(1 + windAll * 0.4 + (e.biteT || 0) * 0.9 + Math.sin(G.time * 2.4 + e.wob) * 0.04);
    if (ud.tail) {
      for (let ti = 0; ti < ud.tail.length; ti++) {
        ud.tail[ti].rotation.y = Math.sin(e.walk * 0.7 + ti * 0.7 - G.time * 2) * 0.1;
        ud.tail[ti].rotation.z = Math.sin(G.time * 1.6 + ti * 0.5) * 0.035;
      }
    }
    if (ud.core) ud.core.scale.setScalar(1 + Math.sin(G.time * 4 + e.wob) * 0.12 + windAll * 0.4);
    if (ud.aura) ud.aura.material.opacity = 0.1 + Math.sin(G.time * 2 + e.wob) * 0.04 + windAll * 0.12;
  }

  for (const b of G.bullets) {
    if (!b.mesh) continue;
    b.mesh.position.set(b.x - HX, 18, b.y - HZ);
    b.mesh.rotation.y = -Math.atan2(b.vy, b.vx);
    const len = clamp(Math.hypot(b.vx, b.vy) * 0.018, 9, 28);
    b.mesh.scale.set(len, b.thick || 1, b.thick || 1);
  }

  for (const g of G.gems) {
    if (!g.mesh) continue;
    g.mesh.position.set(g.x - HX, 22 + Math.sin(g.t) * 5, g.y - HZ);
    g.mesh.rotation.y = g.t * 1.2;
    g.mesh.rotation.x = Math.sin(g.t * 0.7) * 0.4;
  }

  for (const r of G.rings) {
    if (!r.mesh) continue;
    r.mesh.position.set(r.x - HX, 3, r.y - HZ);
    r.mesh.scale.setScalar(Math.max(1, r.r));
    r.mesh.material.opacity = clamp(r.life / r.max, 0, 1) * 0.9;
  }

  // particles
  const n = Math.min(G.parts.length, MAXP);
  for (let i = 0; i < MAXP; i++) {
    const p = G.parts[i];
    const i3 = i * 3;
    if (!p) {
      pPos[i3 + 1] = -9999;
      pCol[i3] = pCol[i3 + 1] = pCol[i3 + 2] = 0;
      continue;
    }
    pPos[i3] = p.x - HX;
    pPos[i3 + 1] = 14 + (p.size || 2) * 2;
    pPos[i3 + 2] = p.y - HZ;
    const rgb = rgbOf(p.color);
    const a = clamp(p.life / p.max, 0, 1);
    pCol[i3] = rgb[0] * a;
    pCol[i3 + 1] = rgb[1] * a;
    pCol[i3 + 2] = rgb[2] * a;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;

  // aim marker
  if (pointer.inside && !sticks.aim && G.state === 'playing') {
    const w = pointerWorld(pointer.x, pointer.y);
    aimMarker.visible = true;
    aimMarker.position.set(w.x - HX, 2, w.y - HZ);
    aimMarker.rotation.z = G.time * 2;
  } else {
    aimMarker.visible = false;
  }
}

// ------------------------------------------------------------
//  HUD
// ------------------------------------------------------------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

let hudVignette = null, hudVignetteW = 0, hudVignetteH = 0;
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  if (!G.player) return;
  hudHits = [];
  const p = G.player, b = G.bro;
  const small = VW < 560;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // vignette to focus the action
  // the vignette is rebuilt only when the viewport changes, not every frame
  if (!hudVignette || hudVignetteW !== VW || hudVignetteH !== VH) {
    hudVignette = ctx.createRadialGradient(VW * 0.5, VH * 0.48, Math.min(VW, VH) * 0.32, VW * 0.5, VH * 0.48, Math.max(VW, VH) * 0.74);
    hudVignette.addColorStop(0, 'rgba(0,0,0,0)');
    hudVignette.addColorStop(1, 'rgba(0,0,0,0.6)');
    hudVignetteW = VW;
    hudVignetteH = VH;
  }
  ctx.fillStyle = hudVignette;
  ctx.fillRect(0, 0, VW, VH);
  const rad = Math.min(62, VW * 0.088);

  // ---- enemy health bars in world space ----
  // Capped: with a 60-strong wave the bars alone were thousands of 2D canvas
  // fills per frame. The nearest few are the only ones the player reads.
  let barN = 0;
  for (const e of G.enemies) {
    if (e.spawnT > 0 || e.dead || e.def.boss) continue;
    if (e.hp >= e.maxHp && !e.def.elite) continue;
    if (barN >= 18) break;
    const s = project(e.x, e.y, e.r * 3.6);
    if (!s.visible) continue;
    barN++;
    const elite = !!e.def.elite;
    const w = Math.max(elite ? 44 : 30, e.r * (elite ? 3.2 : 2.6)), h = elite ? 6 : 5;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(s.x - w / 2 - 1, s.y - h / 2 - 1, w + 2, h + 2);
    ctx.fillStyle = elite ? '#a06bff' : '#ff3b30';
    ctx.fillRect(s.x - w / 2, s.y - h / 2, w * clamp(e.hp / e.maxHp, 0, 1), h);
    if (elite) {
      ctx.textAlign = 'center';
      ctx.font = '800 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(220,205,255,0.9)';
      ctx.fillText(e.def.name, s.x, s.y - 6);
    }
  }

  // ---- floating combat text ----
  ctx.textAlign = 'center';
  ctx.font = '900 15px "Segoe UI", system-ui, sans-serif';
  for (const f of G.floats) {
    const s = project(f.x, f.y, 55);
    if (!s.visible) continue;
    ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(f.text, s.x + 1.5, s.y + 1.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;

  // ---- top left: coins + xp ----
  ctx.textAlign = 'left';
  ctx.font = '900 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffd75e';
  ctx.fillText(G.coins.toLocaleString(), 40, 38);
  ctx.beginPath();
  ctx.arc(24, 32, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff9f1e';
  ctx.beginPath();
  ctx.arc(24, 32, 3.6, 0, TAU);
  ctx.fill();

  const xw = small ? 110 : 170;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(16, 48, xw, 7, 3.5); ctx.fill();
  ctx.fillStyle = '#c9a8ff';
  roundRect(16, 48, xw * clamp(G.xp / G.xpNext, 0, 1), 7, 3.5); ctx.fill();

  // ---- top right: status block ----
  ctx.textAlign = 'right';
  ctx.font = '900 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffd75e';
  ctx.fillText('LEVEL ' + String(G.level).padStart(2, '0'), VW - 16, 30);
  ctx.fillStyle = '#7fe7ff';
  ctx.fillText('XP ' + Math.round(100 * G.xp / G.xpNext) + '%', VW - 16, 50);
  ctx.fillStyle = '#ff9f43';
  ctx.fillText('WAVE ' + String(G.wave).padStart(3, '0') + (G.wave > G.campaign ? ' ∞' : ' / ' + G.campaign), VW - 16, 70);

  // ---- wave clock: time left in the round + how many enemies are still out there ----
  if (G.waveLen > 0) {
    const wbW = small ? 124 : 172;
    const wbX = VW - 16 - wbW;
    const wbY = 82;
    const remain = Math.max(0, G.waveLen - G.waveT);
    const frac = clamp(G.waveT / G.waveLen, 0, 1);
    const left = G.enemies.filter(e => !e.dead).length;
    const bossUp = G.enemies.some(e => e.def.boss && !e.dead);
    const timeCol = frac >= 1 ? '#c04dff' : frac > 0.75 ? '#c9a8ff' : '#d9c6ff';
    ctx.fillStyle = 'rgba(8,6,5,0.62)';
    roundRect(wbX - 6, wbY - 7, wbW + 12, 31, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(235,140,90,0.22)';
    ctx.lineWidth = 1;
    roundRect(wbX - 6, wbY - 7, wbW + 12, 31, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(wbX, wbY, wbW, 6, 3); ctx.fill();
    ctx.fillStyle = timeCol;
    roundRect(wbX, wbY, Math.max(3, wbW * frac), 6, 3); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '900 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = timeCol;
    ctx.fillText(fmtTime(remain), wbX, wbY + 19);
    ctx.textAlign = 'right';
    ctx.font = '700 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(235,225,210,0.85)';
    ctx.fillText((remain <= 0 && bossUp) ? 'KILL THE BOSS' : 'ENEMIES ' + left, VW - 16, wbY + 19);
  }

  // ---- boss bar ----
  const bosses = G.enemies.filter(e => e.def.boss && !e.dead);
  if (bosses.length) {
    const boss = bosses.reduce((a, b) => (b.maxHp > a.maxHp ? b : a), bosses[0]);
    const bw = Math.min(380, VW * 0.52);
    const bx = (VW - bw) / 2, by = 26;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(bx - 2, by - 2, bw + 4, 14, 7); ctx.fill();
    const bgr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bgr.addColorStop(0, '#c04dff');
    bgr.addColorStop(1, '#4a1a8a');
    ctx.fillStyle = bgr;
    roundRect(bx, by, Math.max(6, bw * clamp(boss.hp / boss.maxHp, 0, 1)), 10, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,150,0.55)';
    ctx.lineWidth = 1;
    roundRect(bx - 2, by - 2, bw + 4, 14, 7); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '900 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffc2b8';
    ctx.fillText(boss.def.name + (bosses.length > 1 ? '  ×' + bosses.length : '') + '   ' + Math.ceil(boss.hp) + ' / ' + Math.round(boss.maxHp), VW / 2, by + 24);
  }

  // ---- weapon slots ----
  const gy = VH - (small ? 78 : 92) - (coarse ? rad * 1.4 : 0);
  const gw = small ? 156 : 196;
  ctx.fillStyle = 'rgba(10,10,12,0.66)';
  roundRect(12, gy - 16, gw, 40, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(180,120,255,0.38)';
  ctx.lineWidth = 1;
  roundRect(12, gy - 16, gw, 40, 8); ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const sw = WBY[G.slots[i]] || WBY.pistol;
    const act = i === G.slot;
    ctx.textAlign = 'left';
    ctx.font = (act ? '800 ' : '600 ') + (small ? 10 : 11) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = act ? sw.color : 'rgba(210,180,155,0.55)';
    const rank = gunLevel(sw.id);
    ctx.fillText((act ? '▶ ' : '   ') + (i + 1) + '  ' + sw.name + (rank ? '  ★' + rank : ''), 20, gy + i * 14);
  }
  hudHits.push({ id: 'swap', x: 12, y: gy - 16, w: gw, h: 40 });

  // ---- bottom centre: vitals ----
  // phones get a compact vitals strip: about a fifth narrower than desktop, with
  // slightly slimmer bars and labels. The airstrike / medkit / jump buttons keep
  // their old tap footprints (hit padding) so controls still feel the same.
  const vk = coarse ? 0.8 : 1;
  const bs0 = small ? 40 : 46;                       // legacy row height (control basis)
  const padS = coarse ? Math.round(bs0 * 0.76) : bs0 - 10;
  const padHit = coarse ? Math.max(0, Math.round((bs0 - 10 - padS) / 2)) : 0;
  const bs = coarse ? padS + 4 : bs0;
  const padGuard = 18 + rad * 2 + 7;                 // joystick pads + breathing room
  const barW = coarse
    ? Math.max(88, Math.min(clamp((VW - 2 * (bs0 + 46)) * vk, 110, 252), VW - padGuard * 2 - bs * 2 - 20))
    : clamp(VW - 2 * (bs + 46), 140, 380);
  const totalW = bs * 2 + barW + (coarse ? 20 : 28);
  const x0 = (VW - totalW) / 2;
  const y0 = VH - bs - 14 - (coarse ? (rad + 16) : 0);
  const padX = coarse ? 4 : 5;
  const padY = coarse ? Math.round((bs - padS) / 2) : 5;

  ctx.fillStyle = 'rgba(10,10,12,0.82)';
  roundRect(x0, y0, totalW, bs, coarse ? 7 : 9); ctx.fill();
  ctx.strokeStyle = 'rgba(180,120,255,0.45)';
  ctx.lineWidth = coarse ? 1.5 : 2;
  roundRect(x0, y0, totalW, bs, coarse ? 7 : 9); ctx.stroke();

  const bx2 = x0 + bs + (coarse ? 6 : 14), bw2 = barW;
  const hpY = y0 + bs * (coarse ? 0.12 : 0.2);
  const hpH = coarse ? Math.max(8, bs * 0.3) : bs * 0.3;
  const hpY2 = y0 + bs * (coarse ? 0.56 : 0.6);
  const hpH2 = coarse ? Math.max(6.5, bs * 0.22) : bs * 0.2;
  const hpR = coarse ? 3 : 4, hpR2 = coarse ? 2 : 3;
  const hpFs = 10;
  const hpTx = bx2 + (coarse ? 6 : 7);

  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  roundRect(bx2, hpY, bw2, hpH, hpR); ctx.fill();
  const hpGrad = ctx.createLinearGradient(0, hpY, 0, hpY + hpH);
  hpGrad.addColorStop(0, '#f4eeff');
  hpGrad.addColorStop(1, '#7a3fd0');
  ctx.fillStyle = hpGrad;
  roundRect(bx2, hpY, Math.max(3, bw2 * clamp(p.hp / p.maxHp, 0, 1)), hpH, hpR); ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  roundRect(bx2, hpY2, bw2, hpH2, hpR2); ctx.fill();
  ctx.fillStyle = '#a97bff';
  roundRect(bx2, hpY2, Math.max(2, bw2 * (b.downed ? 0 : clamp(b.hp / b.maxHp, 0, 1))), hpH2, hpR2); ctx.fill();

  ctx.font = '800 ' + hpFs + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(p.char.name + '  ' + Math.ceil(p.hp) + '/' + Math.round(p.maxHp), hpTx, hpY + hpH * (coarse ? 0.74 : 0.72));
  ctx.fillStyle = 'rgba(228,216,255,0.85)';
  ctx.fillText(b.char.name + (b.downed ? ' — DOWN' : ''), hpTx, hpY2 + hpH2 * (coarse ? 0.9 : 0.8));

  drawPadBtn(x0 + padX, y0 + padY, padS, 'air', G.airstrikes, '#b3241d', '#f2543c', padHit);
  drawPadBtn(x0 + totalW - padS - padX, y0 + padY, padS, 'med', G.medkits, '#17538c', '#3fa5f0', padHit);
  if (coarse) drawPadBtn(x0 + totalW - padS - padX, y0 - padS - 6, padS, 'jump', 1, '#2f6c3a', '#57c46a', padHit);

  // ---- bro ability button ----
  const ab = (p.char && p.char.ability) || CHARACTERS[0].ability;
  const as = bs0 * 0.86;
  const abx = coarse ? x0 + totalW - padS - padX - as - 8 : x0 + totalW - as;
  const aby = y0 - as - 8;
  drawAbilityBtn(abx, aby, as, p, ab);

  if (!small && !coarse && VW > 720 && G.wave <= 2) {
    ctx.textAlign = 'center';
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,205,170,0.5)';
    ctx.fillText('WASD move  •  aim + fire  •  SPACE jump  •  C crouch  •  Q swap  •  R ' + ab.name + '  •  E airstrike  •  F medkit', VW / 2, y0 - 54);
  }

  // ---- joysticks ----
  if (sticks.move) drawJoystickPad(sticks.move, rad);
  else if (coarse) drawJoystickPad({ ox: 18 + rad, oy: VH - 18 - rad, x: 18 + rad, y: VH - 18 - rad }, rad);

  if (sticks.aim) drawJoystickPad(sticks.aim, rad);
  else if (coarse) drawJoystickPad({ ox: VW - 18 - rad, oy: VH - 18 - rad, x: VW - 18 - rad, y: VH - 18 - rad }, rad);

  // ---- reticle ----
  if (pointer.inside && !sticks.aim && G.state === 'playing') {
    const x = pointer.x, y = pointer.y;
    ctx.strokeStyle = 'rgba(255,190,140,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
    ctx.stroke();
  }

  // ---- wave banner ----
  if (G.banner) {
    const t = G.banner.t;
    const a = t > 1.6 ? (2.2 - t) / 0.6 : Math.min(1, t / 0.6);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = '900 ' + (small ? 34 : 54) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = G.banner.color;
    ctx.shadowColor = G.banner.color;
    ctx.shadowBlur = 30;
    ctx.fillText(G.banner.text, VW / 2, VH * 0.36);
    ctx.shadowBlur = 0;
    ctx.font = '700 ' + (small ? 12 : 14) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(240,225,210,0.8)';
    ctx.fillText(G.banner.sub.toUpperCase(), VW / 2, VH * 0.36 + 26);
    ctx.restore();
  }

  // ---- achievement / milestone toast ----
  if (G.toast) {
    const t = G.toast.t;
    const a = Math.min(1, t / 0.55);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    const tw = Math.min(430, VW * 0.82);
    const tx = (VW - tw) / 2, ty = small ? 118 : (bosses.length ? 74 : 58);
    ctx.fillStyle = 'rgba(10,8,6,0.82)';
    roundRect(tx, ty, tw, 44, 9); ctx.fill();
    ctx.strokeStyle = (G.toast.color || '#ffd75e') + '99';
    ctx.lineWidth = 1.5;
    roundRect(tx, ty, tw, 44, 9); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '900 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = G.toast.color || '#ffd75e';
    ctx.fillText(G.toast.text, tx + 14, ty + 19);
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(235,225,210,0.78)';
    ctx.fillText(G.toast.sub, tx + 14, ty + 34);
    ctx.restore();
  }

  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,235,210,' + Math.min(0.45, G.flash * 0.45) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawAbilityBtn(x, y, s, p, ab) {
  hudHits.push({ id: 'ult', x, y, w: s, h: s });
  const cd = p.ultCd || 0;
  const ready = cd <= 0;
  const cx = x + s / 2, cy = y + s / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, TAU);
  const g = ctx.createRadialGradient(cx, cy - s * 0.2, 2, cx, cy, s / 2);
  g.addColorStop(0, ready ? '#ffe9a8' : '#4a3a2a');
  g.addColorStop(1, ready ? '#c98a12' : '#2a2018');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = ready ? 'rgba(255,225,150,0.95)' : 'rgba(160,140,120,0.5)';
  ctx.lineWidth = 2; ctx.stroke();
  if (!ready) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, s / 2, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(cd / ab.cd, 0, 1));
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,8,12,0.72)'; ctx.fill();
  }
  ctx.fillStyle = ready ? '#2a1700' : 'rgba(255,240,215,0.55)';
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.05, cy - s * 0.24);
  ctx.lineTo(cx - s * 0.14, cy + s * 0.03);
  ctx.lineTo(cx - s * 0.01, cy + s * 0.03);
  ctx.lineTo(cx - s * 0.08, cy + s * 0.24);
  ctx.lineTo(cx + s * 0.16, cy - s * 0.03);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.03);
  ctx.closePath(); ctx.fill();
  ctx.font = '900 ' + Math.round(s * 0.2) + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = ready ? 'rgba(40,24,0,0.9)' : 'rgba(255,240,215,0.7)';
  ctx.fillText(ready ? 'R' : String(Math.ceil(cd)), cx, cy + s * 0.33);
  ctx.restore();
}

function drawJoystickPad(s, rad) {
  const cx = s.ox, cy = s.oy;
  const active = Math.hypot(s.x - cx, s.y - cy) > 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, TAU);
  ctx.fillStyle = active ? 'rgba(52,72,104,0.45)' : 'rgba(34,44,62,0.3)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(180,212,245,0.5)';
  ctx.stroke();

  ctx.strokeStyle = 'rgba(180,212,245,0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.66, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.72);
    ctx.lineTo(cx + Math.cos(a) * rad * 0.93, cy + Math.sin(a) * rad * 0.93);
    ctx.stroke();
  }

  let dx = s.x - cx, dy = s.y - cy;
  const m = Math.hypot(dx, dy);
  const kx = cx + (m > 0 ? dx / m : 0) * Math.min(rad * 0.5, m);
  const ky = cy + (m > 0 ? dy / m : 0) * Math.min(rad * 0.5, m);
  const grad = ctx.createRadialGradient(kx, ky, 2, kx, ky, rad * 0.34);
  grad.addColorStop(0, 'rgba(205,232,255,0.92)');
  grad.addColorStop(1, 'rgba(80,140,210,0.35)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(kx, ky, rad * 0.34, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPadBtn(x, y, s, id, count, colDark, colLight, hitPad) {
  const hp = hitPad || 0;
  hudHits.push({ id, x: x - hp, y: y - hp, w: s + hp * 2, h: s + hp * 2 });
  const active = count > 0;
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.45;

  const grd = ctx.createLinearGradient(x, y, x, y + s);
  grd.addColorStop(0, colLight);
  grd.addColorStop(1, colDark);
  ctx.fillStyle = grd;
  roundRect(x, y, s, s, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(x, y, s, s, 7); ctx.stroke();

  const cx = x + s / 2, cy = y + s / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  if (id === 'jump') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.18);
    ctx.lineTo(cx + s * 0.16, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.06, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.06, cy + s * 0.18);
    ctx.lineTo(cx - s * 0.06, cy + s * 0.18);
    ctx.lineTo(cx - s * 0.06, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.16, cy + s * 0.02);
    ctx.closePath();
    ctx.fill();
  } else if (id === 'air') {
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.08, s * 0.1, s * 0.16, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.13, cy - s * 0.15);
    ctx.lineTo(cx + s * 0.13, cy - s * 0.15);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    const t = s * 0.09;
    ctx.fillRect(cx - t, cy - s * 0.17, t * 2, s * 0.34);
    ctx.fillRect(cx - s * 0.17, cy - t, s * 0.34, t * 2);
  }

  ctx.font = '900 ' + Math.round(s * 0.26) + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(String(count), x + s - 4, y + s - 4);
  ctx.restore();
}

function drawBar(x, y, w, h, pct, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.save();
  roundRect(x, y, w, h, h / 2); ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(h, w * clamp(pct, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, Math.max(h, w * clamp(pct, 0, 1)), h * 0.4);
  ctx.restore();
  ctx.font = '800 ' + Math.max(9, h * 0.72) + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(8,14,26,0.85)';
  ctx.fillText(label, x + 8, y + h * 0.76);
}

// ------------------------------------------------------------
//  Overlay screens
// ------------------------------------------------------------
function showOverlay(html) {
  panel.innerHTML = html;
  overlay.classList.add('show');
}
function hideOverlay() {
  overlay.classList.remove('show');
  panel.innerHTML = '';
}

function rankPips(rank, max) {
  let out = '<span class="pips">';
  for (let i = 0; i < max; i++) out += '<i class="' + (i < rank ? 'on' : '') + '"></i>';
  return out + '</span>';
}

function achGrid() {
  return '<div class="achgrid">' + ACHIEVEMENTS.map(a => {
    const got = G.ach && G.ach.has(a.id);
    return `<div class="ach ${got ? 'got' : ''}" title="${a.desc} (+${a.reward} ◈)">
      <b>${got ? '✔' : '○'} ${a.name}</b><span>${a.desc}</span></div>`;
  }).join('') + '</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function diagText() {
  const head = diagReport().map(([k, v]) => k + ': ' + v).join('\n');
  const ev = readDiagLog().slice(-10).map(e => e.t + '  ' + e.kind + '  ' + (e.msg || '')).join('\n') || '(none)';
  return 'GUN BROS ' + BUILD + '\n' + head + '\n--- events ---\n' + ev;
}

function diagReport() {
  const last = readDiagLog().slice(-1)[0];
  const rows = [
    ['BUILD', BUILD],
    ['QUALITY', QUALITY + ' (auto pick: ' + autoQuality() + ')'],
    ['GPU', gpuName],
    ['WEBGL', renderer.capabilities.isWebGL2 ? '2.0' : '1.0'],
    ['MAX TEXTURE', renderer.capabilities.maxTextureSize + ' px'],
    ['SHADOWS', renderer.shadowMap.enabled ? 'on' : 'off'],
    ['REFLECTIONS', CAN_ENV ? 'on' : 'off (no float targets)'],
    ['PIXEL RATIO', DPR.toFixed(2) + ' (cap ' + MAXDPR.toFixed(2) + ')'],
    ['CANVAS', canvas.width + '×' + canvas.height + ' css ' + VW + '×' + VH],
    ['FRAME RATE', Math.round(fpsAvg || 0) + ' fps'],
    ['GPU RESETS', String(contextLossCount)],
    ['BLANK FRAMES', String(blankFrames)],
    ['LAST EVENT', last ? (last.t + ' ' + last.kind) : 'none'],
    ['DEVICE', (navigator.deviceMemory || '?') + ' GB RAM · ' + (navigator.hardwareConcurrency || '?') + ' cores'],
    ['SCREEN', screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'],
    ['URL', location.origin],
    ['USER AGENT', navigator.userAgent]
  ];
  return rows;
}

function showDiagnostics() {
  const events = readDiagLog().slice(-8);
  const evHtml = events.length
    ? events.map(e => `<div style="padding:2px 0;border-bottom:1px solid rgba(180,120,255,.12)"><span style="opacity:.55">${e.t}</span> <b style="color:#e6d4ff">${e.kind}</b> ${e.msg ? '<span style="opacity:.8">' + escapeHtml(String(e.msg)) + '</span>' : ''}</div>`).join('')
    : '<div style="opacity:.6">No faults recorded on this device.</div>';
  const rows = diagReport().map(([k, v]) =>
    `<tr><td style="opacity:.6;padding:3px 10px 3px 0;white-space:nowrap;vertical-align:top">${k}</td><td style="color:#c8f8ff;word-break:break-word">${String(v)}</td></tr>`
  ).join('');
  showOverlay(`
    <div class="eyebrow">Render report</div>
    <h2>SYSTEM DIAGNOSTICS</h2>
    <p class="sub">Screenshot this screen if the game looks wrong — it shows which build your phone loaded and what GPU path it took.</p>
    <table style="width:100%;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;border-collapse:collapse">${rows}</table>
    <h2 style="margin-top:18px">RECENT EVENTS</h2>
    <div style="font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace">${evHtml}</div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="cta" data-action="copydiag">COPY REPORT</button>
      <button class="ghost" data-action="back">BACK</button>
    </div>
  `);
}

function showMenu() {
  G.state = 'menu';
  G.shopFromMenu = false;
  const scroll = panel.scrollTop;
  const chosen = CBY[G.charId] ? G.charId : CHARACTERS[0].id;
  const me = CBY[chosen];
  const partner = CHARACTERS[(CHARACTERS.indexOf(me) + 1) % CHARACTERS.length];
  const got = (G.ach && G.ach.size) || 0;
  const cards = CHARACTERS.map(c => `
    <div class="card pick ${c.id === chosen ? 'chosen' : ''}" data-action="pick" data-id="${c.id}">
      <div class="name"><span class="swatch" style="background:${c.color};color:${c.color}"></span>${c.name}
        <span class="rankpill">${charRank(c.id) ? '★' + charRank(c.id) : 'RANK 0'}</span></div>
      <div class="desc">${c.blurb}</div>
      <div class="ability"><b>R · ${c.ability.name}</b><span>${c.ability.desc}</span></div>
      <div class="row">
        <span class="tag">${c.tag}</span>
        <span class="tag red">${Math.round(c.hp * charStatMul(c.id))} HP</span>
        <span class="tag gold">${(c.dmg * charStatMul(c.id)).toFixed(2)}× DMG</span>
      </div>
    </div>`).join('');
  showOverlay(`
    <div class="eyebrow">Twin-stick survival · 3D</div>
    <h1>GUN BROS</h1>
    <p class="tagline" style="letter-spacing:.18em">BUILD ${BUILD}</p>
    <p class="sub">The T.O.O.L. army is harvesting Xplodium across the sector. Pick your bro, hold the arena, collect the gems, buy bigger guns.</p>
    <p class="tagline">Saved on this device · LVL ${G.level} · ${G.coins.toLocaleString()} ◈ · ${G.owned.size}/${WEAPONS.length} guns · best wave ${G.bestWave || 0} · ${got}/${ACHIEVEMENTS.length} achievements${G.alphaTrophy ? ' · ALPHA SLAYER' : ''}</p>
    <h2>Choose your bro</h2>
    <div class="grid chars">${cards}</div>
    <p class="tagline">Partner in the field: <b style="color:${partner.color}">${partner.name}</b> — ${partner.tag.toLowerCase()}</p>
    <h2>Armoury</h2>
    <div class="grid">
      <div class="card armorycard">
        <div class="name">WEAPONS &amp; UPGRADES</div>
        <div class="desc">${G.owned.size} of ${WEAPONS.length} weapons owned. Rank up guns and bros with coins.</div>
        <div class="row"><button data-action="armory">OPEN ARMOURY</button></div>
      </div>
      <div class="card armorycard">
        <div class="name">ACHIEVEMENTS</div>
        <div class="desc">${got} of ${ACHIEVEMENTS.length} earned. Every one pays a coin bounty.</div>
        <div class="row"><span class="tag gold">${got}/${ACHIEVEMENTS.length}</span></div>
      </div>
    </div>
    <h2>Battlefield</h2>
    <p class="tagline">No map picking. Every deployment rotates you to the next battlefield automatically — each map gets a turn before any repeat.</p>
    <div class="grid">
      ${MAPS.map(m => `
      <div class="card ${currentMapId === m.id ? 'chosen' : ''}">
        <div class="name">${m.name}</div>
        <div class="desc">${m.blurb}</div>
        <div class="row"><span class="tag">${m.propTag}</span>${currentMapId === m.id ? '<span class="tag gold">BUILT NOW</span>' : '<span class="tag">AUTO</span>'}</div>
      </div>`).join('')}
    </div>
    <h2>Mode</h2>
    <div class="grid">
      <div class="card pick ${!G.coop ? 'chosen' : ''}" data-action="mode" data-id="solo">
        <div class="name">SOLO + BRO</div>
        <div class="desc">Your partner fights by himself. You do the aiming.</div>
        <div class="row"><span class="tag">1 PLAYER</span></div>
      </div>
      <div class="card pick ${G.coop ? 'chosen' : ''}" data-action="mode" data-id="coop">
        <div class="name">LOCAL CO-OP</div>
        <div class="desc">A friend plays your bro on the same keyboard.</div>
        <div class="row"><span class="tag gold">2 PLAYERS</span></div>
      </div>
    </div>
    <h2>Graphics</h2>
    <div class="grid">
      ${['low', 'medium', 'high'].map(q => `
      <div class="card pick ${QUALITY === q ? 'chosen' : ''}" data-action="gfx" data-id="${q}">
        <div class="name">${q.toUpperCase()}</div>
        <div class="desc">${GFX_DESC[q]}</div>
        <div class="row">
          <span class="tag ${QUALITY === q ? 'gold' : ''}">${QUALITY === q ? 'ACTIVE' : 'SELECT'}</span>
          <span class="tag">${GFX_PRESETS[q].shadows ? 'SHADOWS' : 'NO SHADOWS'}</span>
        </div>
      </div>`).join('')}
    </div>
    <p class="tagline">Detected ${MOBILE_GPU ? 'mobile GPU' : 'desktop'} · picked ${autoQuality().toUpperCase()} automatically${HALF_FLOAT_RT ? '' : ' · reflections unavailable on this GPU'} · switching reloads the arena, progress is kept.</p>
    <details class="achbox">
      <summary>Achievements — ${got} / ${ACHIEVEMENTS.length}</summary>
      ${achGrid()}
    </details>
    <div class="keys">
      <span><kbd>WASD</kbd>move</span>
      <span><kbd>MOUSE</kbd>aim &amp; fire</span>
      <span><kbd>Q</kbd>swap gun</span>
      <span><kbd>R</kbd>ability</span>
      <span><kbd>SPACE</kbd>jump</span>
      <span><kbd>C</kbd>crouch</span>
      <span><kbd>E</kbd>airstrike</span>
      <span><kbd>F</kbd>medkit</span>
      ${G.coop ? '<span><kbd>ARROWS</kbd>P2 move</span><span><kbd>ENTER</kbd>P2 fire</span>' : ''}
    </div>
    <button class="cta" data-action="start">DEPLOY</button>
    <div style="margin-top:12px"><button class="ghost" data-action="diag">SYSTEM DIAGNOSTICS</button></div>
  `);
  panel.scrollTop = scroll;
}

function awardWaveBonus(mode) {
  const flawless = !G.damageTaken;
  const timeLeft = Math.max(0, G.waveLen - G.waveT);
  const fast = mode === 'clear' && timeLeft > G.waveLen * 0.25;
  let coins = 70 + G.wave * 22;
  let xp = 55 + G.wave * 16;
  const tags = [];
  if (flawless) {
    coins += 100; xp += 40;
    G.perfectWaves = (G.perfectWaves || 0) + 1;
    tags.push('FLAWLESS +100 ◈');
  }
  if (fast) {
    coins += 150; xp += 90;
    tags.push('FAST CLEAR +150 ◈');
  }
  let alphaReward = false;
  if (G.wave === G.campaign) {
    G.alphaKills = (G.alphaKills || 0) + 1;
    if (!G.alphaTrophy) {
      G.alphaTrophy = true;
      alphaReward = true;
      coins += 5000; xp += 2500;
      tags.push('ALPHA TROPHY +5,000 ◈');
      G.toast = {
        text: 'ALPHA VELOCIRAPTOR SLAIN',
        sub: 'Trophy: ALPHA FANG (+12% damage) · +1 strike & medkit slot · 5,000 ◈',
        t: 8,
        color: '#8dff6a'
      };
    } else {
      coins += 1500;
      G.toast = { text: 'CAMPAIGN CLEARED', sub: 'All 50 waves held — endless mode unlocked.', t: 5, color: '#ffd75e' };
    }
  }
  G.coins += coins;
  addXp(xp);
  G.bestWave = Math.max(G.bestWave || 0, G.wave);
  G.lastWaveBonus = { wave: G.wave, coins, xp, mode, fast, flawless, alphaReward, tags };
  saveProgress();
  checkAchievements();
}

function openShop() {
  G.state = 'shop';
  saveProgress();
  const perfect = !G.damageTaken && !G.shopFromMenu;
  const fromMenu = !!G.shopFromMenu;

  const cards = WEAPONS.map(w => {
    const owned = G.owned.has(w.id);
    const equipped = G.slots.includes(w.id);
    const locked = G.level < w.lvl;
    const rank = gunLevel(w.id);
    const st = gunStats(w.id);
    const maxed = rank >= WEAPON_RANK_MAX;
    const upCost = gunUpgradeCost(w);
    const afford = G.coins >= w.cost;
    let btn;
    if (!owned && locked) btn = `<button disabled>LEVEL ${w.lvl}</button>`;
    else if (!owned) btn = `<button data-action="buy" data-id="${w.id}" ${afford ? '' : 'disabled'}>BUY ${w.cost} ◈</button>`;
    else if (equipped) btn = `<button disabled>EQUIPPED</button>`;
    else btn = `<button data-action="equip" data-id="${w.id}">EQUIP</button>`;
    const upBtn = owned
      ? (maxed ? '<button disabled>MAX RANK</button>'
        : `<button data-action="upgun" data-id="${w.id}" ${G.coins >= upCost ? '' : 'disabled'}>▲ RANK ${rank} — ${upCost} ◈</button>`)
      : '';
    return `
      <div class="card gun ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''} ${locked ? 'locked' : ''}">
        <div class="gunartwrap">${weaponArt(w.id, w.color)}<span class="clst">${w.cls}</span></div>
        <div class="name">${w.name}<span class="rankpill">${maxed ? 'MAX' : 'LV ' + rank}</span></div>
        <div class="desc">${w.desc}</div>
        <div class="row">
          <span class="tag" style="color:${w.color};background:${w.color}1f">${Math.round(st.dmg * st.rate * (st.pellets || 1))} DPS</span>
          <span class="tag">${Math.round(st.dmg)} DMG</span>
        </div>
        <div class="row btns">${btn}${upBtn}</div>
      </div>`;
  }).join('');

  const broCards = CHARACTERS.map(c => {
    const rank = charRank(c.id);
    const cost = charUpCost(c);
    const maxed = rank >= CHAR_RANK_MAX;
    return `
      <div class="card ${c.id === G.charId ? 'equipped' : ''}">
        <div class="name"><span class="swatch" style="background:${c.color};color:${c.color}"></span>${c.name}<span class="rankpill">★ ${rank}/${CHAR_RANK_MAX}</span></div>
        ${rankPips(rank, CHAR_RANK_MAX)}
        <div class="desc"><b style="color:${c.color}">${c.ability.name}</b> — ${c.ability.desc}</div>
        <div class="row">
          <span class="tag red">${Math.round(c.hp * charStatMul(c.id))} HP</span>
          <span class="tag gold">${(c.dmg * charStatMul(c.id)).toFixed(2)}×</span>
        </div>
        <div class="row btns">
          ${maxed ? '<button disabled>MAX RANK</button>' : `<button data-action="upchar" data-id="${c.id}" ${G.coins >= cost ? '' : 'disabled'}>▲ ${cost} ◈</button>`}
          ${fromMenu && c.id !== G.charId ? `<button class="ghost" data-action="pickbro" data-id="${c.id}">USE</button>` : ''}
        </div>
      </div>`;
  }).join('');

  const nextArmor = ARMOR[G.armorTier + 1];
  const armorCard = nextArmor ? `
    <div class="card ${G.coins >= nextArmor.cost ? '' : 'locked'}">
      <div class="name">${nextArmor.name}</div>
      <div class="desc">Max health ${Math.round(G.player.maxHp)} → ${maxHpFor(G.armorTier + 1, G.player.char)}.</div>
      <div class="row">
        <span class="tag red">+${maxHpFor(G.armorTier + 1, G.player.char) - Math.round(G.player.maxHp)} HP</span>
        <button data-action="armor" ${G.coins >= nextArmor.cost ? '' : 'disabled'}>${nextArmor.cost} ◈</button>
      </div>
    </div>` : `<div class="card owned"><div class="name">BROTHERHOOD EXO</div><div class="desc">Fully kitted. Nothing left to bolt on.</div><div class="row"><span class="tag">MAXED</span></div></div>`;

  showOverlay(`
    <div class="eyebrow">${fromMenu ? 'Pre-deployment loadout' : 'Wave ' + G.wave + ' cleared' + (perfect ? ' — flawless' : '')}</div>
    <h1>${fromMenu ? 'ARMOURY' : 'SUPPLY DROP'}</h1>
    ${(!fromMenu && G.lastWaveBonus) ? `<div class="perfect">Wave ${G.lastWaveBonus.wave} cleared — +${G.lastWaveBonus.coins.toLocaleString()} ◈ · +${G.lastWaveBonus.xp} XP${G.lastWaveBonus.fast ? ' · FAST CLEAR' : ''}${G.lastWaveBonus.mode === 'hold' ? ' · WAVE HELD' : ''}</div>` : ''}
    ${G.alphaTrophy ? `<div class="perfect" style="color:#b8ff9a;border-color:rgba(141,255,106,.5)">ALPHA SLAYER — ALPHA FANG: +12% damage · ${kitMax()} strike / medkit slots</div>` : ''}
    <div class="statline">
      <div class="stat"><b>${G.coins.toLocaleString()}</b><span>Coins</span></div>
      <div class="stat"><b>${G.level}</b><span>Level</span></div>
      <div class="stat"><b>${G.kills}</b><span>Kills</span></div>
      <div class="stat"><b>${(G.ach && G.ach.size) || 0}/${ACHIEVEMENTS.length}</b><span>Medals</span></div>
    </div>
    <h2>Loadout — ${G.player.char.name}</h2>
    <div class="slots">
      ${[0, 1].map(i => `<button class="slotbtn ${G.slot === i ? 'on' : ''}" data-action="slot" data-id="${i}">SLOT ${i + 1} · ${(WBY[G.slots[i]] || WBY.pistol).name}${gunLevel(G.slots[i]) ? ' ★' + gunLevel(G.slots[i]) : ''}</button>`).join('')}
    </div>
    <h2>Armoury — buy, equip, rank up</h2>
    <div class="grid guns">${cards}</div>
    <h2>Bros — abilities &amp; ranks</h2>
    <div class="grid">${broCards}</div>
    <h2>Upgrades</h2>
    <div class="grid">
      ${armorCard}
      <div class="card">
        <div class="name">SMARTILLERY</div>
        <div class="desc">One button. Everything in the room dies. ${G.airstrikes}/${kitMax()} carried.</div>
        <div class="row"><span class="tag gold">AIRSTRIKE</span>
        <button data-action="air" ${G.coins >= AIRSTRIKE_COST && G.airstrikes < kitMax() ? '' : 'disabled'}>${AIRSTRIKE_COST} ◈</button></div>
      </div>
      <div class="card">
        <div class="name">FIELD MEDKIT</div>
        <div class="desc">Patches up both bros. ${G.medkits}/${kitMax()} carried.</div>
        <div class="row"><span class="tag">HEAL</span>
        <button data-action="med" ${G.coins >= MEDKIT_COST && G.medkits < kitMax() ? '' : 'disabled'}>${MEDKIT_COST} ◈</button></div>
      </div>
    </div>
    <details class="achbox">
      <summary>Achievements — ${(G.ach && G.ach.size) || 0} / ${ACHIEVEMENTS.length}</summary>
      ${achGrid()}
    </details>
    <button class="cta" data-action="${fromMenu ? 'start' : 'next'}">${fromMenu ? 'DEPLOY — WAVE 1' : 'DEPLOY — WAVE ' + (G.wave + 1)}</button>
    <div style="margin-top:10px"><button class="ghost" data-action="quit">BACK TO MENU</button></div>
  `);
}

function nextWave() {
  hideOverlay();
  G.state = 'playing';
  beginWave(G.wave + 1);
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    showOverlay(`
      <div class="eyebrow">Stand by</div>
      <h1>PAUSED</h1>
      <p class="sub">Wave ${G.wave} is still out there.</p>
      <button class="cta" data-action="resume">RESUME</button>
      <div style="margin-top:12px"><button class="ghost" data-action="quit">Abandon run</button></div>
    `);
  } else if (G.state === 'paused') {
    hideOverlay();
    G.state = 'playing';
  }
}

function gameOver() {
  if (G.state === 'over') return;
  G.state = 'over';
  saveProgress();
  burst(G.player.x, G.player.y, G.player.color, 60, 520, 5);
  ring(G.player.x, G.player.y, G.player.color, 220, 0.8, 6);
  G.shake = 26;
  setTimeout(() => {
    showOverlay(`
      <div class="eyebrow">Signal lost</div>
      <h1>BRO DOWN</h1>
      <p class="sub">${G.player.char.name} bought the farm on wave ${G.wave}. The T.O.O.L. army keeps on marching.</p>
      <div class="statline">
        <div class="stat"><b>${G.wave}</b><span>Wave reached</span></div>
        <div class="stat"><b>${G.kills}</b><span>Kills</span></div>
        <div class="stat"><b>${G.level}</b><span>Level</span></div>
      </div>
      <button class="cta" data-action="restart">TRY AGAIN</button>
    `);
  }, 750);
}

// ------------------------------------------------------------
//  Panel clicks
// ------------------------------------------------------------
panel.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  const id = el.dataset.id;

  if (a === 'start' || a === 'restart') { G.shopFromMenu = false; startRun(); return; }
  if (a === 'next') { G.shopFromMenu = false; nextWave(); return; }
  if (a === 'resume') { hideOverlay(); G.state = 'playing'; return; }
  if (a === 'quit') { hideOverlay(); showMenu(); return; }
  if (a === 'back') { hideOverlay(); showMenu(); return; }
  if (a === 'armory') { G.shopFromMenu = true; Sound.ui(); openShop(); return; }
  if (a === 'pickbro') {
    const c = CBY[id];
    if (c) {
      G.charId = c.id;
      G.partnerId = CHARACTERS[(CHARACTERS.indexOf(c) + 1) % CHARACTERS.length].id;
      resetRun();
    }
    Sound.ui(); openShop(); return;
  }
  if (a === 'pick') { G.charId = id; Sound.ui(); showMenu(); return; }
  if (a === 'mode') { G.coop = id === 'coop'; Sound.ui(); showMenu(); return; }
  if (a === 'slot') { G.slot = Number(id) === 1 ? 1 : 0; Sound.ui(); openShop(); return; }

  if (a === 'diag') { showDiagnostics(); return; }
  if (a === 'copydiag') {
    const text = diagText();
    const ok = () => { G.toast = { text: 'REPORT COPIED', sub: 'Paste it into the chat', t: 3, color: '#c9a8ff' }; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(() => showOverlay(`<h2>REPORT</h2><pre style="white-space:pre-wrap;font:11px/1.5 ui-monospace,Menlo,monospace;color:#d9c6ff;-webkit-user-select:text;user-select:text">${escapeHtml(text)}</pre><div style="margin-top:14px"><button class="ghost" data-action="back">BACK</button></div>`));
    } else {
      showOverlay(`<h2>REPORT</h2><pre style="white-space:pre-wrap;font:11px/1.5 ui-monospace,Menlo,monospace;color:#d9c6ff;-webkit-user-select:text;user-select:text">${escapeHtml(text)}</pre><div style="margin-top:14px"><button class="ghost" data-action="back">BACK</button></div>`);
    }
    return;
  }
  if (a === 'gfx') {
    if (GFX_PRESETS[id] && id !== QUALITY) {
      try { localStorage.setItem(GFX_KEY, id); } catch (e) {}
      saveProgress();
      location.reload();
    }
    return;
  }

  if (a === 'buy') {
    const w = WBY[id];
    if (w && !G.owned.has(id) && G.coins >= w.cost && G.level >= w.lvl) {
      G.coins -= w.cost;
      G.owned.add(id);
      G.slots[G.slot] = id;
      Sound.ui();
      checkAchievements();
    }
    openShop();
    return;
  }
  if (a === 'equip') { G.slots[G.slot] = id; Sound.ui(); openShop(); return; }
  if (a === 'upgun') {
    const w = WBY[id];
    if (w && G.owned.has(id)) {
      const rank = gunLevel(id);
      const cost = gunUpgradeCost(w);
      if (rank < WEAPON_RANK_MAX && G.coins >= cost) {
        G.coins -= cost;
        G.gunLvl[id] = rank + 1;
        Sound.level();
        floatText(G.player.x, G.player.y, w.name + ' ★' + (rank + 1), w.color);
        checkAchievements();
      }
    }
    openShop();
    return;
  }
  if (a === 'upchar') {
    const c = CBY[id];
    if (c) {
      const rank = charRank(id);
      const cost = charUpCost(c);
      if (rank < CHAR_RANK_MAX && G.coins >= cost) {
        G.coins -= cost;
        G.charLvl[id] = rank + 1;
        Sound.level();
        if (G.player && G.player.char.id === id) {
          const nm = playerMaxHp();
          const diff = nm - G.player.maxHp;
          G.player.maxHp = nm;
          G.player.hp = Math.min(nm, G.player.hp + Math.max(0, diff));
          G.player.baseDmgMul = c.dmg * charStatMul(id);
          G.player.dmgMul = G.player.baseDmgMul;
        }
        checkAchievements();
      }
    }
    openShop();
    return;
  }
  if (a === 'armor') {
    const nxt = ARMOR[G.armorTier + 1];
    if (nxt && G.coins >= nxt.cost) {
      G.coins -= nxt.cost;
      G.armorTier++;
      const newMax = playerMaxHp();
      const diff = newMax - G.player.maxHp;
      G.player.maxHp = newMax;
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + Math.max(0, diff));
      Sound.ui();
      checkAchievements();
    }
    openShop();
    return;
  }
  if (a === 'air') {
    if (G.coins >= AIRSTRIKE_COST && G.airstrikes < kitMax()) { G.coins -= AIRSTRIKE_COST; G.airstrikes++; Sound.ui(); }
    openShop();
    return;
  }
  if (a === 'med') {
    if (G.coins >= MEDKIT_COST && G.medkits < kitMax()) { G.coins -= MEDKIT_COST; G.medkits++; Sound.ui(); }
    openShop();
    return;
  }
});

// ------------------------------------------------------------
//  Resize / loop / boot
// ------------------------------------------------------------
function resize() {
  VW = window.innerWidth;
  VH = window.innerHeight;
  MAXDPR = budgetDPR(VW, VH);
  DPR = MAXDPR;
  renderer.setPixelRatio(DPR);
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / Math.max(1, VH);
  camera.updateProjectionMatrix();
  hudCanvas.width = Math.round(VW * DPR);
  hudCanvas.height = Math.round(VH * DPR);
}
window.addEventListener('resize', resize);

let perfAcc = 0, perfN = 0, perfStrikes = 0;
// Three-stage automatic fallback, checked twice a second:
//   1. render fewer pixels (resolution)
//   2. stop rebuilding shadows
//   3. halve particles/smoke and pull the detail radius in
// It climbs back up gently when the device has headroom, so a phone does not
// get stuck at the lowest setting after one bad moment on wave load.
function applyDpr() {
  renderer.setPixelRatio(DPR);
  hudCanvas.width = Math.round(VW * DPR);
  hudCanvas.height = Math.round(VH * DPR);
}
function tunePixelRatio(dt) {
  perfAcc += dt;
  perfN++;
  if (perfN < 30) return;
  const avg = perfAcc / perfN;
  perfAcc = 0;
  perfN = 0;
  const floorDpr = MOBILE_GPU ? 0.7 : 0.85;
  if (avg > 0.024) {
    perfStrikes++;
    if (DPR > floorDpr) {
      DPR = Math.max(floorDpr, DPR - 0.12);
      applyDpr();
    } else if (perfStrikes >= 2) {
      perfStrikes = 0;
      if (GEAR < 1 && renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        key.castShadow = false;
        GEAR = 1;
        recordDiag('perf-gear', { gear: 1, fps: Math.round(1 / avg) });
      } else if (GEAR < 2) {
        FX_SCALE = 0.55;
        LOD_MUL = 0.8;
        refreshLodDistance();
        GEAR = 2;
        recordDiag('perf-gear', { gear: 2, fps: Math.round(1 / avg) });
      }
    }
  } else if (avg < 0.0175 && DPR < MAXDPR) {
    perfStrikes = 0;
    DPR = Math.min(MAXDPR, DPR + 0.06);
    applyDpr();
  }
}

let shadowTick = 0;
const SHADOW_EVERY = MOBILE_GPU ? Math.max(1, Q.shadowHz || 1) : 1;
let last = performance.now();
let fpsAvg = 0, fpsFrames = 0, fpsT = 0;

// Samples the real framebuffer a few times a minute. If the canvas comes back
// almost pure white we log a 'blank-frame' event with the build and GPU, so a
// white screen leaves a record on the device instead of vanishing on reload.
let blankAt = 0;
const blankCv = document.createElement('canvas');
blankCv.width = blankCv.height = 12;
const blankCtx = blankCv.getContext('2d', { willReadFrequently: true });
function checkBlankFrame(now) {
  if (now - blankAt < 4000) return;
  blankAt = now;
  try {
    if (!blankCtx) return;
    blankCtx.drawImage(canvas, 0, 0, 12, 12);
    const d = blankCtx.getImageData(0, 0, 12, 12).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238) white++;
    }
    if (white > 120) { blankFrames++; recordDiag('blank-frame', { msg: white + '/144 white pixels' }); }
  } catch (e) {}
}
// Warm the shader cache before the first wave: otherwise the driver compiles
// every dinosaur program the moment the pack appears, which is exactly the
// stutter players feel at wave start. One of each species is built, compiled
// off-screen and thrown away.
function prewarmShaders() {
  const warm = [];
  try {
    for (const t of Object.keys(ENEMIES)) {
      if (!ENEMIES[t] || !ENEMIES[t].kind) continue;
      try {
        const e = { type: t, def: ENEMIES[t], x: -9000, y: -9000, vx: 0, vy: 0, r: ENEMIES[t].r, angle: 0, spawnT: 1, mesh: null };
        const m = makeEnemyMesh(e);
        m.position.set(0, -6000, 0);
        warm.push(m);
      } catch (err) {}
    }
    renderer.compile(scene, camera);
  } catch (err) {}
  for (const m of warm) { try { scene.remove(m); } catch (e) {} }
}

function frame(now) {
  // Backgrounded tab: skip simulation and rendering entirely. Phones were
  // burning battery and dropping the player into a wave they never saw.
  // (the renderer.info check keeps a quirky webview that reports "hidden" at
  // boot from never drawing the first frame at all)
  if (document.hidden && renderer.info.render.frame > 0) { last = now; requestAnimationFrame(frame); return; }
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  fpsFrames++;
  fpsT += dt;
  if (fpsT >= 1) { fpsAvg = fpsFrames / fpsT; fpsFrames = 0; fpsT = 0; }

  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }

  if (G.state === 'playing') update(dt);
  else if (G.player) {
    G.time += dt;
    updateParticles(dt);
    if (G.state !== 'over' && G.state !== 'paused') updateCamera(dt);
    if (G.player) { G.player.bob += dt * 6; G.bro.bob += dt * 6; }
    G.shake = Math.max(0, G.shake - dt * 40);
    G.flash = Math.max(0, G.flash - dt * 2.6);
  }

  syncScene(dt);
  if (holoGridMesh) holoGridMesh.material.map.offset.y = (G.time * 0.012) % 1;
  tunePixelRatio(dt);
  // shadow map at a lower rate than the view (the sun never moves)
  shadowTick++;
  if (renderer.shadowMap.enabled && shadowTick % SHADOW_EVERY === 0) renderer.shadowMap.needsUpdate = true;
  if (!contextLost) renderer.render(scene, camera);
  if (!contextLost && G.state === 'playing') checkBlankFrame(now);
  drawHUD();
  requestAnimationFrame(frame);
}

resize();
loadProgress();
buildArena(MBY[G.mapId] || MAPS[0]);
resetRun();
checkAchievements();
showMenu();
// Compile the dinosaur shaders once the menu is already on screen, so the
// first wave does not stall and the menu never waits on the driver.
setTimeout(prewarmShaders, 400);
requestAnimationFrame(frame);

recordDiag('boot');
window.addEventListener('error', (e) => recordDiag('js-error', { msg: String(e.message || e.type).slice(0, 140) }));
window.addEventListener('unhandledrejection', (e) => recordDiag('promise', { msg: String((e.reason && e.reason.message) || e.reason || '').slice(0, 140) }));

window.__GUNBROS = G;
window.__GUNBROS_RENDERER = renderer;
window.__GUNBROS_CAM = camera;
window.__GUNBROS_BOOM = boom;
window.__GUNBROS_SMOKE = smokeCloud;
window.__GUNBROS_IMPACT = impactFx;
window.__GUNBROS_SAVE = saveProgress;
window.__GUNBROS_LOAD = loadProgress;
window.__GUNBROS_SPAWN = spawnEnemy;
window.__GUNBROS_ABILITY = useAbility;
window.__GUNBROS_SHOP = openShop;
window.__GUNBROS_WAVE = beginWave;
window.__GUNBROS_WAVESPEC = (n) => ({ len: waveDuration(n), field: fieldTarget(n), boss: bossForWave(n) });
window.__GUNBROS_STEP = (dt) => { update(dt || 0.05); syncScene(0.016); drawHUD(); };
window.__GUNBROS_KILL = (e) => killEnemy(e);
window.__GUNBROS_SPECIES = dinoSpecies;
window.__GUNBROS_DIAG = () => ({ build: BUILD, rows: diagReport() });
window.__GUNBROS_GFX = () => ({
  quality: QUALITY, auto: autoQuality(), dpr: renderer.getPixelRatio(),
  shadows: renderer.shadowMap.enabled, env: !!scene.environment,
  halfFloat: HALF_FLOAT_RT, cap: enemyCap(), smoke: MAXSMOKE, textures: renderer.info.memory.textures,
  gear: GEAR, fx: FX_SCALE, fps: +fpsAvg.toFixed(1),
  calls: renderer.info.render.calls, triangles: renderer.info.render.triangles
});
window.__GUNBROS_CLEAR = () => { for (const e of G.enemies) { if (e.mesh) scene.remove(e.mesh); e.dead = true; } G.enemies.length = 0; };
window.__GUNBROS_MAP = () => ({
  id: currentMapId, w: WORLD.w, h: WORLD.h,
  obstacles: arenaObstacles.length, boxes: arenaObstacles.filter(o => o.box).length,
  props: arenaGroup.children.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles
});
window.__GUNBROS_BOXES = () => arenaObstacles.filter(o => o.box).map(o => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
window.__GUNBROS_BLOCKED = (x, z, p) => pointBlocked(x, z, p || 0);
window.__GUNBROS_FIRE = (ang) => shoot(G.player, activeWeapon(), ang === undefined ? G.player.angle : ang);
window.__GUNBROS_HIT = (x0, z0, x1, z1, pad) => {
  const h = segmentHit(x0, z0, x1, z1, pad || 4, true);
  return { hit: h.hit, t: h.t, x: h.x, z: h.z };
};
