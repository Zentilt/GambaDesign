// Pachinko board generation and physics

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  PEG_ROWS, PEG_COLS, PEG_SPACING,
  BOARD_OFFSET_X, BOARD_OFFSET_Y,
  PEG_RADIUS, BUMPER_RADIUS,
  SLOT_COUNT, SLOT_HEIGHT,
  THEMES,
} from './constants.js';
import { rand, randInt, pick, shuffle } from './utils.js';

/** Theme-specific color palettes */
const THEME_PALETTES = {
  'Forest':             { bg: '#0d1f0d', peg: '#4a7a3a', bumper: '#8bc34a', slot: '#2d5a1b', border: '#1a3d0a' },
  'Ocean':              { bg: '#0a1a2f', peg: '#1e6b8c', bumper: '#00bcd4', slot: '#0d3d5e', border: '#0a2a40' },
  'Volcano':            { bg: '#1a0800', peg: '#8b2500', bumper: '#ff5722', slot: '#3d1100', border: '#5a1500' },
  'Sky':                { bg: '#0a1530', peg: '#3a6db5', bumper: '#64b5f6', slot: '#1a3a6d', border: '#0a2050' },
  'Crystal Cave':       { bg: '#0d0a1f', peg: '#7b1fa2', bumper: '#ce93d8', slot: '#3d1a5a', border: '#1a0a3d' },
  'Ancient Ruins':      { bg: '#1a1505', peg: '#7d6e50', bumper: '#d4a847', slot: '#3d3010', border: '#2d2010' },
  'Mechanical Factory': { bg: '#0d0d0d', peg: '#546e7a', bumper: '#90a4ae', slot: '#1a2a2a', border: '#1a1a1a' },
  'Space Station':      { bg: '#050510', peg: '#1a237e', bumper: '#536dfe', slot: '#0d0d30', border: '#0a0a20' },
};

/** Slot value configurations: [value, label, color] */
const SLOT_CONFIGS = {
  standard: [
    [  2, '2×',   '#3a7a3a'],
    [  1, '1×',   '#555555'],
    [  5, '5×',   '#7a5a1a'],
    [ 10, '10×',  '#1a5a7a'],
    [ 20, '20×',  '#7a1a7a'],
    [ 10, '10×',  '#1a5a7a'],
    [  5, '5×',   '#7a5a1a'],
    [  1, '1×',   '#555555'],
    [  2, '2×',   '#3a7a3a'],
  ],
  danger: [
    [  0, 'FAIL', '#5a1a1a'],
    [  3, '3×',   '#3a6a3a'],
    [ 15, '15×',  '#1a5a8a'],
    [ 50, '50×',  '#7a3a9a'],
    [100, '100×', '#9a6a00'],
    [ 50, '50×',  '#7a3a9a'],
    [ 15, '15×',  '#1a5a8a'],
    [  3, '3×',   '#3a6a3a'],
    [  0, 'FAIL', '#5a1a1a'],
  ],
};

/** Generate an array of pegs for the board */
function generatePegs(bonusPegs = 0, machineUpgrades = {}) {
  const pegs = [];

  for (let row = 0; row < PEG_ROWS; row++) {
    const offset = (row % 2 === 0) ? 0 : PEG_SPACING / 2;
    const cols = (row % 2 === 0) ? PEG_COLS : PEG_COLS - 1;
    for (let col = 0; col < cols; col++) {
      pegs.push({
        x: BOARD_OFFSET_X + offset + col * PEG_SPACING,
        y: BOARD_OFFSET_Y + row * (PEG_SPACING * 0.85),
        radius: PEG_RADIUS,
        type: 'peg',
        id: pegs.length,
        isGolden: false,
        isWeb: false,
        hitCount: 0,
      });
    }
  }

  // Bonus pegs (e.g. Mushroom creature)
  for (let i = 0; i < bonusPegs; i++) {
    pegs.push({
      x: rand(BOARD_OFFSET_X + 10, CANVAS_WIDTH - BOARD_OFFSET_X - 10),
      y: rand(BOARD_OFFSET_Y + 20, CANVAS_HEIGHT - SLOT_HEIGHT - 60),
      radius: PEG_RADIUS,
      type: 'peg',
      id: pegs.length,
      isGolden: false,
      isWeb: false,
      hitCount: 0,
    });
  }

  return pegs;
}

/** Generate bumpers */
function generateBumpers(count, machineUpgrades = {}) {
  const bumpers = [];
  const slots = [
    { x: CANVAS_WIDTH * 0.25, y: BOARD_OFFSET_Y + PEG_ROWS * (PEG_SPACING * 0.85) * 0.3 },
    { x: CANVAS_WIDTH * 0.75, y: BOARD_OFFSET_Y + PEG_ROWS * (PEG_SPACING * 0.85) * 0.3 },
    { x: CANVAS_WIDTH * 0.5,  y: BOARD_OFFSET_Y + PEG_ROWS * (PEG_SPACING * 0.85) * 0.55 },
    { x: CANVAS_WIDTH * 0.3,  y: BOARD_OFFSET_Y + PEG_ROWS * (PEG_SPACING * 0.85) * 0.7 },
    { x: CANVAS_WIDTH * 0.7,  y: BOARD_OFFSET_Y + PEG_ROWS * (PEG_SPACING * 0.85) * 0.7 },
  ];
  const shuffled = shuffle([...slots]);
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    bumpers.push({
      x: shuffled[i].x + rand(-20, 20),
      y: shuffled[i].y + rand(-10, 10),
      radius: BUMPER_RADIUS,
      type: 'bumper',
      id: bumpers.length,
      isIgnited: false,
      igniteTimer: 0,
      hitCount: 0,
    });
  }
  return bumpers;
}

/** Generate portals */
function generatePortals(count) {
  const portals = [];
  for (let i = 0; i < count; i++) {
    const entrance = {
      x: rand(60, CANVAS_WIDTH - 60),
      y: rand(BOARD_OFFSET_Y + 50, CANVAS_HEIGHT - SLOT_HEIGHT - 80),
      radius: 14,
      type: 'portal',
      id: i * 2,
      pair: i * 2 + 1,
    };
    const exit = {
      x: rand(60, CANVAS_WIDTH - 60),
      y: rand(BOARD_OFFSET_Y + 50, CANVAS_HEIGHT - SLOT_HEIGHT - 80),
      radius: 14,
      type: 'portal',
      id: i * 2 + 1,
      pair: i * 2,
    };
    portals.push(entrance, exit);
  }
  return portals;
}

/** Generate slots at the bottom of the board */
function generateSlots(path, jackpotSlotIndex = -1, recycleSlotIndex = -1, multipliedSlots = []) {
  const config = path === 'danger' ? SLOT_CONFIGS.danger : SLOT_CONFIGS.standard;
  const slotWidth = CANVAS_WIDTH / SLOT_COUNT;

  return config.map(([ baseValue, label, color ], i) => {
    let value = baseValue;
    let multiplier = 1;

    if (multipliedSlots.includes(i)) {
      multiplier = 2;
      value = baseValue * 2;
    }

    const isJackpot = i === jackpotSlotIndex;
    const isRecycle = i === recycleSlotIndex;

    if (isJackpot) {
      value = 0;   // handled specially
      multiplier = 10;
    }

    return {
      x: i * slotWidth,
      y: CANVAS_HEIGHT - SLOT_HEIGHT,
      width: slotWidth,
      height: SLOT_HEIGHT,
      baseValue,
      value,
      multiplier,
      label: isJackpot ? 'JACKPOT' : (isRecycle ? '↺' : label),
      color: isJackpot ? '#9a6a00' : (isRecycle ? '#1a7a7a' : color),
      isJackpot,
      isRecycle,
      isLava: false,
      index: i,
    };
  });
}

/**
 * Build a complete board configuration.
 *
 * @param {Object} opts
 * @param {string}   opts.path              'safe' | 'danger'
 * @param {number}   opts.stage             Current stage number
 * @param {string[]} opts.creatureIds       Active creature IDs
 * @param {string[]} opts.relicIds          Active relic IDs
 * @param {Object}   opts.machineUpgrades   Machine upgrade counts
 * @param {boolean}  opts.isBoss            Boss stage flag
 * @returns {Object} board
 */
export function buildBoard({
  path = 'safe',
  stage = 1,
  creatureIds = [],
  relicIds = [],
  machineUpgrades = {},
  isBoss = false,
} = {}) {
  const themeIdx = (stage - 1) % THEMES.length;
  const theme = THEMES[themeIdx];
  const palette = THEME_PALETTES[theme];

  const bumperCount = 1 + (machineUpgrades.bumper_count || 0) + (creatureIds.includes('octopus') ? 2 : 0);
  const bonusPegCount = creatureIds.includes('mushroom') ? 3 : 0;
  const portalCount = (machineUpgrades.portal_count || 0) + (relicIds.includes('lucky_portal') ? 1 : 0);
  const multipliedSlots = machineUpgrades.multiplied_slots || [];

  // Jackpot slot from Unicorn creature
  const jackpotSlotIndex = creatureIds.includes('unicorn') ? randInt(0, SLOT_COUNT - 1) : -1;

  // Recycle slot from machine upgrade
  const recycleSlotIndex = machineUpgrades.recycle_slot ? randInt(0, SLOT_COUNT - 1) : -1;

  const pegs    = generatePegs(bonusPegCount, machineUpgrades);
  const bumpers = generateBumpers(bumperCount, machineUpgrades);
  const portals = generatePortals(portalCount);
  const slots   = generateSlots(path, jackpotSlotIndex, recycleSlotIndex, multipliedSlots);

  // Golden peg (from relic)
  if (relicIds.includes('golden_peg') && pegs.length > 0) {
    const idx = randInt(0, pegs.length - 1);
    pegs[idx].isGolden = true;
  }

  // Web pegs (from Spider creature)
  if (creatureIds.includes('spider')) {
    const indices = shuffle([...Array(pegs.length).keys()]).slice(0, 2);
    indices.forEach(i => { pegs[i].isWeb = true; });
  }

  // Lava slot (from relic)
  if (relicIds.includes('lava_core')) {
    const lavaIdx = path === 'danger' ? 0 : SLOT_COUNT - 1;
    slots[lavaIdx].isLava = true;
    slots[lavaIdx].color  = '#8b2500';
    slots[lavaIdx].label  = 'LAVA🌋';
  }

  // Boss-specific modifiers
  const bossModifiers = isBoss ? generateBossModifiers(stage) : null;

  return {
    theme,
    palette,
    path,
    pegs,
    bumpers,
    portals,
    slots,
    isBoss,
    bossModifiers,
    stage,
  };
}

/** Generate boss stage special rules */
function generateBossModifiers(stage) {
  const allModifiers = [
    { type: 'moving_barriers',  label: 'Moving Barriers',   description: 'Barriers slide across the board.' },
    { type: 'gravity_shift',    label: 'Gravity Shift',     description: 'Gravity direction changes every 3 seconds.' },
    { type: 'rotating_hazards', label: 'Rotating Hazards',  description: 'Hazard rings rotate around the board.' },
    { type: 'time_limit',       label: 'Time Limit',        description: 'Ball must reach a slot within 15 seconds.' },
    { type: 'weak_points',      label: 'Weak Points',       description: 'Hit the glowing pegs to damage the boss.' },
  ];
  // Pick 1-2 modifiers based on stage
  const count = stage >= 10 ? 2 : 1;
  return shuffle([...allModifiers]).slice(0, count);
}

/** Resolve which slot a ball landed in and compute the score */
export function resolveSlot(slotIndex, slots, baseScorePerDrop, runState, eventEmitter) {
  const slot = slots[slotIndex];
  if (!slot) return { score: 0, gold: 0, extraBall: false };

  let score = baseScorePerDrop * slot.value;
  let gold  = slot.value;
  let extraBall = false;

  // Danger path bonuses
  if (runState.path === 'danger') {
    score = Math.floor(score * 1.5);
    gold  = Math.floor(gold  * 1.5);
  }

  // Jackpot
  if (slot.isJackpot) {
    score = baseScorePerDrop * 500;
    gold  = 50;
    eventEmitter && eventEmitter('JACKPOT! 🦄', 'relic');
  }

  // Recycle slot
  if (slot.isRecycle) {
    extraBall = true;
    eventEmitter && eventEmitter('↺ Ball recycled!', 'creature');
  }

  // Lava slot
  if (slot.isLava) {
    extraBall = true;
    score += 50;
    eventEmitter && eventEmitter('🌋 Lava bonus ball!', 'creature');
  }

  // Gold multiplier from Lucky Cat
  if (runState.creatures.includes('cat')) {
    gold = Math.floor(gold * 1.25);
  }

  // Gold Rush temp upgrade
  if (runState.tempUpgrades.includes('gold_rush')) {
    gold *= 2;
  }

  // Phoenix relaunch on loss (slot value 0, danger path FAIL)
  if (slot.value === 0 && !slot.isLava && !slot.isRecycle) {
    if (runState.creatures.includes('phoenix') && Math.random() < 0.35) {
      extraBall = true;
      eventEmitter && eventEmitter('🔥 Phoenix relaunches the ball!', 'creature');
    }
  }

  return { score: Math.floor(score), gold: Math.floor(gold), extraBall };
}
