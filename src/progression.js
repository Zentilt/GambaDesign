// Roguelite progression state management

import { STAGE_COUNT, BOSS_STAGE_EVERY, MAX_BALLS_PER_RUN } from './constants.js';
import { PERMANENT_UNLOCKS } from './upgrades.js';

/** Global persistent save state (stored in localStorage) */
const SAVE_KEY = 'gambadesign_save';

const DEFAULT_SAVE = {
  totalRuns: 0,
  bestScore: 0,
  totalGoldEarned: 0,
  permanentGold: 0,
  unlockedCreatures: [],
  unlockedRelics: [],
  purchasedUnlocks: [],
  highestStage: 0,
  bossesDefeated: 0,
  totalSynergiesActivated: 0,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...DEFAULT_SAVE, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_SAVE };
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (_) { /* ignore */ }
}

export function resetSave() {
  localStorage.removeItem(SAVE_KEY);
}

/** Run state – reset each run */
export function createRunState(save, path, machineUpgrades) {
  return {
    path,
    stage: 1,
    score: 0,
    gold: 10 + (save.purchasedUnlocks.includes('extra_starting_gold') ? 10 : 0),
    ballsRemaining: MAX_BALLS_PER_RUN + (machineUpgrades.extra_ball_count || 0),
    creatures: save.purchasedUnlocks.includes('starting_slime') ? ['slime'] : [],
    relics: [],
    tempUpgrades: [],
    machineUpgrades: { ...machineUpgrades },
    synergiesActive: [],
    comboCount: 0,
    totalPegHits: 0,
    totalBumperHits: 0,
    ballsUsed: 0,
    stagesCleared: 0,
  };
}

/** Is the current stage a boss stage? */
export function isBossStage(stage) {
  return stage % BOSS_STAGE_EVERY === 0;
}

/** Is the run complete? */
export function isRunComplete(runState) {
  return runState.stage > STAGE_COUNT;
}

/** Check whether the player has lost this run */
export function isRunLost(runState) {
  return runState.ballsRemaining <= 0 && runState.stage <= STAGE_COUNT;
}

/** Advance to the next stage */
export function advanceStage(runState) {
  runState.stage++;
  runState.stagesCleared++;
  runState.comboCount = 0;
}

/** Apply end-of-run persistent rewards to save */
export function applyRunRewards(save, runState) {
  save.totalRuns++;
  save.totalGoldEarned += runState.gold;
  save.permanentGold += Math.floor(runState.gold * 0.2);   // 20 % of run gold → permanent
  if (runState.score > save.bestScore) save.bestScore = runState.score;
  if (runState.stagesCleared > save.highestStage) save.highestStage = runState.stagesCleared;
  save.bossesDefeated += runState.bossesDefeated || 0;
  save.totalSynergiesActivated += runState.synergiesActive.length;

  // Unlock creatures/relics collected this run
  for (const id of runState.creatures) {
    if (!save.unlockedCreatures.includes(id)) save.unlockedCreatures.push(id);
  }
  for (const id of runState.relics) {
    if (!save.unlockedRelics.includes(id)) save.unlockedRelics.push(id);
  }

  writeSave(save);
}

/** Purchase a permanent unlock */
export function purchaseUnlock(save, unlockId) {
  const unlock = PERMANENT_UNLOCKS.find(u => u.id === unlockId);
  if (!unlock) return false;
  if (save.purchasedUnlocks.includes(unlockId)) return false;
  if (save.permanentGold < unlock.cost) return false;
  save.permanentGold -= unlock.cost;
  save.purchasedUnlocks.push(unlockId);
  writeSave(save);
  return true;
}
