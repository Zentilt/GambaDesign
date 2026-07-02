// Core game engine

import { CANVAS_WIDTH, CANVAS_HEIGHT, SLOT_COUNT, STAGE_COUNT } from './constants.js';
import { rand, randInt, pick, shuffle, weightedPick, formatNum } from './utils.js';
import { Ball, updateBumpers } from './ball.js';
import { buildBoard, resolveSlot } from './board.js';
import { drawBoard, drawLaunchZone, spawnFloatScore } from './renderer.js';
import { CREATURES, getCreature } from './creatures.js';
import { RELICS, getRelic, getActiveSynergies } from './relics.js';
import { TEMP_UPGRADES, MACHINE_UPGRADES, PERMANENT_UNLOCKS } from './upgrades.js';
import {
  loadSave, writeSave, applyRunRewards,
  createRunState, isBossStage, advanceStage,
} from './progression.js';
import { RARITY_WEIGHTS } from './constants.js';

export class Game {
  constructor() {
    this.canvas   = document.getElementById('game-canvas');
    this.ctx      = this.canvas.getContext('2d');
    this.canvas.width  = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    this.save    = loadSave();
    this.runState = null;
    this.board   = null;
    this.balls   = [];
    this.mouseX  = null;
    this.dropping = false;
    this.animId  = null;
    this.eventLog = [];
    this.machineUpgrades = {};  // persistent machine upgrades for current run attempt

    this._bindEvents();
    this._showScreen('menu');
    this._renderMenu();
  }

  // ─── Screen management ─────────────────────────────────────

  _showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  // ─── Event binding ──────────────────────────────────────────

  _bindEvents() {
    // Main menu
    document.getElementById('btn-new-run').addEventListener('click', () => this._startPathSelection());
    document.getElementById('btn-collection').addEventListener('click', () => this._showCollection());
    document.getElementById('btn-shop').addEventListener('click', () => this._showShop());

    // Canvas
    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
    });
    this.canvas.addEventListener('mouseleave', () => { this.mouseX = null; });
    this.canvas.addEventListener('click', e => {
      if (!this.dropping && this.runState && this.runState.ballsRemaining > 0) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        this._dropBall(x);
      }
    });

    // Back buttons
    document.querySelectorAll('.btn-back').forEach(b => {
      b.addEventListener('click', () => this._showScreen('menu'));
    });
  }

  // ─── Main Menu ──────────────────────────────────────────────

  _renderMenu() {
    const el = document.getElementById('menu-save-info');
    if (el) {
      el.textContent = `Runs: ${this.save.totalRuns} | Best: ${formatNum(this.save.bestScore)} | Stage: ${this.save.highestStage}`;
    }
  }

  // ─── Path Selection ─────────────────────────────────────────

  _startPathSelection() {
    this._showScreen('path');
    document.getElementById('btn-path-safe').onclick   = () => this._startRun('safe');
    document.getElementById('btn-path-danger').onclick = () => this._startRun('danger');
  }

  // ─── Start Run ──────────────────────────────────────────────

  _startRun(path) {
    this.machineUpgrades = {};
    this.runState = createRunState(this.save, path, this.machineUpgrades);
    this.balls    = [];
    this.dropping = false;
    this.eventLog = [];

    this.board = buildBoard({
      path,
      stage: this.runState.stage,
      creatureIds: this.runState.creatures,
      relicIds:    this.runState.relics,
      machineUpgrades: this.machineUpgrades,
      isBoss: isBossStage(this.runState.stage),
    });

    this._checkSynergies();
    this._showScreen('game');
    this._updateHUD();
    this._renderCreatures();
    this._renderRelics();
    this._renderBoard();

    if (this.animId) cancelAnimationFrame(this.animId);
    this._gameLoop();
  }

  // ─── Game Loop ──────────────────────────────────────────────

  _gameLoop() {
    this.animId = requestAnimationFrame(() => this._gameLoop());
    const ctx = this.ctx;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBoard(ctx, this.board);

    // Update & draw balls
    for (const ball of this.balls) {
      ball.update(this.board, this.runState, (msg, type) => this._log(msg, type));
      ball.draw(ctx);
    }

    updateBumpers(this.board.bumpers);

    // Spawn pending balls (from splits, etc.)
    if (this.runState.pendingBalls > 0) {
      const activeBall = this.balls.find(b => b.active);
      if (activeBall) {
        this.balls.push(new Ball(activeBall.x, activeBall.y, rand(-3, 3), rand(0, 2), this.runState));
        this.runState.pendingBalls--;
      }
    }

    drawLaunchZone(ctx, this.dropping ? null : this.mouseX);

    // Check if all balls have landed
    const allLanded = this.balls.length > 0 && this.balls.every(b => b.landed);
    if (allLanded && this.dropping) {
      this._resolveLanding();
    }
  }

  // ─── Drop Ball ──────────────────────────────────────────────

  _dropBall(x) {
    if (this.runState.ballsRemaining <= 0) return;
    this.dropping = true;
    this.runState.ballsRemaining--;
    this.runState.ballsUsed++;
    this.runState.bonusScore = 0;
    this.runState.bonusGold  = 0;
    this.runState.pendingBalls = 0;
    this.runState._autoMulTimer = 0;

    const ball = new Ball(x, 20, 0, 2, this.runState);
    this.balls = [ball];

    // Extra ball temp upgrade
    if (this.runState.tempUpgrades.includes('extra_ball_run')) {
      this.balls.push(new Ball(x + rand(-20, 20), 20, rand(-1, 1), 2, this.runState));
    }

    this._hideOverlay();
    this._updateHUD();
  }

  // ─── Resolve Landing ────────────────────────────────────────

  _resolveLanding() {
    this.dropping = false;
    let totalScore = 0;
    let totalGold  = 0;
    let extraBalls = 0;

    for (const ball of this.balls) {
      if (ball.slotIndex < 0) continue;
      const { score, gold, extraBall } = resolveSlot(
        ball.slotIndex,
        this.board.slots,
        10,
        this.runState,
        (msg, type) => this._log(msg, type)
      );
      totalScore += score;
      totalGold  += gold;
      if (extraBall) extraBalls++;

      // Show float score on canvas
      const rect = this.canvas.getBoundingClientRect();
      const slot  = this.board.slots[ball.slotIndex];
      spawnFloatScore(
        document.getElementById('panel-center'),
        rect.left - document.getElementById('panel-center').getBoundingClientRect().left + ball.x,
        rect.top  - document.getElementById('panel-center').getBoundingClientRect().top  + slot.y - 20,
        `+${formatNum(score)}`
      );
    }

    // Bonus from peg/bumper interactions
    totalScore += (this.runState.bonusScore || 0);
    totalGold  += (this.runState.bonusGold  || 0);

    // Lava phoenix synergy cascade bonus
    if (this.runState.synergiesActive.includes('lava_phoenix_cascade')) {
      totalScore = Math.floor(totalScore * 2);
      totalGold  = Math.floor(totalGold  * 1.5);
      this._log('🌋🔥 Lava Phoenix Cascade! Score doubled!', 'relic');
    }

    this.runState.score += totalScore;
    this.runState.gold  += totalGold;
    this.runState.ballsRemaining += extraBalls;

    this._log(`Drop complete: +${formatNum(totalScore)} score, +${totalGold} gold`, 'highlight');
    this._updateHUD();
    this._updateCombo();

    // Check for run continuation
    if (this.runState.ballsRemaining <= 0) {
      setTimeout(() => this._stageComplete(), 1000);
    } else {
      this._showDropHint();
    }
  }

  // ─── Stage Complete ──────────────────────────────────────────

  _stageComplete() {
    const run = this.runState;

    if (isBossStage(run.stage)) {
      run.bossesDefeated = (run.bossesDefeated || 0) + 1;
      this._log('👑 BOSS DEFEATED!', 'danger');
    }

    advanceStage(run);

    if (run.stage > STAGE_COUNT) {
      this._endRun(true);
      return;
    }

    // Award stage rewards then show upgrade/reward screens
    this._showRewardScreen(() => {
      this._showUpgradeScreen(() => {
        this._nextStage();
      });
    });
  }

  // ─── Next Stage ──────────────────────────────────────────────

  _nextStage() {
    const run = this.runState;
    run.ballsRemaining = 3 + (this.machineUpgrades.extra_ball_count || 0);
    run.bonusScore = 0;

    this.board = buildBoard({
      path:       run.path,
      stage:      run.stage,
      creatureIds: run.creatures,
      relicIds:   run.relics,
      machineUpgrades: this.machineUpgrades,
      isBoss:     isBossStage(run.stage),
    });

    this._checkSynergies();
    this._showScreen('game');
    this._updateHUD();
    this._renderCreatures();
    this._renderRelics();
    this._renderBoard();
    this._showDropHint();
  }

  // ─── End Run ────────────────────────────────────────────────

  _endRun(victory) {
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    applyRunRewards(this.save, this.runState);

    const screen = document.getElementById('screen-gameover');
    const title  = screen.querySelector('.gameover-title');
    title.textContent = victory ? '🏆 VICTORY!' : '💀 GAME OVER';
    title.className   = 'gameover-title ' + (victory ? 'win' : 'loss');

    screen.querySelector('#go-score').textContent  = formatNum(this.runState.score);
    screen.querySelector('#go-stage').textContent  = this.runState.stagesCleared;
    screen.querySelector('#go-gold').textContent   = this.runState.gold;
    screen.querySelector('#go-perm-gold').textContent = this.save.permanentGold;

    this._showScreen('gameover');

    document.getElementById('btn-play-again').onclick = () => this._startPathSelection();
    document.getElementById('btn-main-menu').onclick  = () => { this._renderMenu(); this._showScreen('menu'); };
  }

  // ─── Reward Screen ───────────────────────────────────────────

  _showRewardScreen(onDone) {
    this._showScreen('reward');
    const container = document.getElementById('reward-options');
    container.innerHTML = '';

    // Offer 3 choices: creature, relic, temp upgrade
    const choices = this._generateRewardChoices();

    for (const choice of choices) {
      const card = document.createElement('div');
      card.className = 'reward-card';
      card.innerHTML = `
        <div class="reward-icon">${choice.icon}</div>
        <h3>${choice.name}</h3>
        <p>${choice.description}</p>
        <p style="margin-top:8px;font-size:11px;color:var(--rarity-${choice.rarity || 'common'})">${choice.rarity || ''}</p>
      `;
      card.addEventListener('click', () => {
        this._applyReward(choice);
        onDone();
      });
      container.appendChild(card);
    }

    // Skip button
    const skipBtn = document.getElementById('btn-skip-reward');
    if (skipBtn) skipBtn.onclick = () => onDone();
  }

  _generateRewardChoices() {
    const choices = [];
    const run = this.runState;

    // One creature (not already owned)
    const available = CREATURES.filter(c => !run.creatures.includes(c.id));
    if (available.length > 0) {
      choices.push(this._pickByRarity(available));
    }

    // One relic (not already owned)
    const availRelics = RELICS.filter(r => !run.relics.includes(r.id));
    if (availRelics.length > 0) {
      choices.push(this._pickByRarity(availRelics));
    }

    // One temp upgrade
    const availUpgrades = TEMP_UPGRADES.filter(u => !run.tempUpgrades.includes(u.id));
    if (availUpgrades.length > 0) {
      choices.push(pick(availUpgrades));
    }

    return shuffle(choices).slice(0, 3);
  }

  _pickByRarity(items) {
    const weighted = items.map(item => ({
      item,
      weight: RARITY_WEIGHTS[item.rarity] || 10,
    }));
    return weightedPick(weighted);
  }

  _applyReward(choice) {
    const run = this.runState;
    if (CREATURES.find(c => c.id === choice.id)) {
      if (!run.creatures.includes(choice.id)) run.creatures.push(choice.id);
      this._log(`Gained creature: ${choice.icon} ${choice.name}`, 'creature');
    } else if (RELICS.find(r => r.id === choice.id)) {
      if (!run.relics.includes(choice.id)) run.relics.push(choice.id);
      this._log(`Gained relic: ${choice.icon} ${choice.name}`, 'relic');
    } else if (TEMP_UPGRADES.find(u => u.id === choice.id)) {
      if (!run.tempUpgrades.includes(choice.id)) run.tempUpgrades.push(choice.id);
      this._log(`Gained upgrade: ${choice.icon} ${choice.name}`, 'highlight');
    }
    this._checkSynergies();
  }

  // ─── Upgrade Screen ──────────────────────────────────────────

  _showUpgradeScreen(onDone) {
    this._showScreen('upgrade');
    const grid = document.getElementById('upgrade-grid');
    grid.innerHTML = '';

    // Show affordable machine upgrades
    const upgrades = MACHINE_UPGRADES.filter(u => {
      const currentCount = this._getMachineUpgradeCount(u.id);
      return this.runState.gold >= u.cost && currentCount < u.maxCount;
    }).slice(0, 6);

    if (upgrades.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center">No upgrades available.<br>Save your gold!</p>';
    }

    for (const upg of upgrades) {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="upgrade-icon">${upg.icon}</div>
        <h3>${upg.name}</h3>
        <p>${upg.description}</p>
        <div class="upgrade-cost">💰 ${upg.cost} gold</div>
      `;
      card.addEventListener('click', () => {
        if (this.runState.gold >= upg.cost) {
          this.runState.gold -= upg.cost;
          this._applyMachineUpgrade(upg);
          this._log(`Purchased: ${upg.icon} ${upg.name}`, 'highlight');
          this._updateHUD();
          card.style.opacity = '0.4';
          card.style.pointerEvents = 'none';
        }
      });
      grid.appendChild(card);
    }

    document.getElementById('btn-continue-upgrade').onclick = () => onDone();
  }

  _getMachineUpgradeCount(upgradeId) {
    return this.machineUpgrades[upgradeId + '_count'] || 0;
  }

  _applyMachineUpgrade(upg) {
    const key = upg.id + '_count';
    this.machineUpgrades[key] = (this.machineUpgrades[key] || 0) + 1;

    switch (upg.effect) {
      case 'add_bumper':
        this.machineUpgrades.bumper_count = (this.machineUpgrades.bumper_count || 0) + 1;
        break;
      case 'add_portal_pair':
        this.machineUpgrades.portal_count = (this.machineUpgrades.portal_count || 0) + 1;
        break;
      case 'upgrade_slot': {
        const slots = this.machineUpgrades.multiplied_slots || [];
        const idx = randInt(0, SLOT_COUNT - 1);
        if (!slots.includes(idx)) slots.push(idx);
        this.machineUpgrades.multiplied_slots = slots;
        break;
      }
      case 'recycle_slot':
        this.machineUpgrades.recycle_slot = true;
        break;
      case 'extra_ball':
        this.machineUpgrades.extra_ball_count = (this.machineUpgrades.extra_ball_count || 0) + 1;
        break;
    }
  }

  // ─── Synergy Check ───────────────────────────────────────────

  _checkSynergies() {
    const run = this.runState;
    const prev = [...(run.synergiesActive || [])];
    run.synergiesActive = getActiveSynergies(run.creatures, run.relics).map(s => s.effect);

    // Announce newly activated synergies
    for (const s of getActiveSynergies(run.creatures, run.relics)) {
      if (!prev.includes(s.effect)) {
        this._showSynergyBanner(s);
        this._log(`⚡ SYNERGY: ${s.icon} ${s.name}`, 'relic');
      }
    }
  }

  _showSynergyBanner(synergy) {
    let banner = document.querySelector('.synergy-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'synergy-banner';
      document.body.appendChild(banner);
    }
    banner.textContent = `⚡ SYNERGY ACTIVATED: ${synergy.icon} ${synergy.name}`;
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, 3500);
  }

  // ─── HUD Updates ─────────────────────────────────────────────

  _updateHUD() {
    const run = this.runState;
    if (!run) return;
    document.getElementById('hud-score').textContent  = formatNum(run.score);
    document.getElementById('hud-gold').textContent   = run.gold;
    document.getElementById('hud-stage').textContent  = `${run.stage} / ${STAGE_COUNT}`;
    document.getElementById('hud-balls').textContent  = run.ballsRemaining;
    document.getElementById('hud-path').textContent   = run.path === 'danger' ? '⚠️ DANGER' : '🛡️ SAFE';

    const isBoss = isBossStage(run.stage);
    const bossEl = document.getElementById('boss-indicator');
    if (bossEl) bossEl.style.display = isBoss ? 'block' : 'none';

    const progress = ((run.stage - 1) / STAGE_COUNT) * 100;
    document.querySelector('.progress-bar').style.width = progress + '%';
  }

  _updateCombo() {
    const activeBall = this.balls.find(b => b.active || b.landed);
    if (activeBall) {
      document.getElementById('hud-combo').textContent = activeBall.combo > 1 ? `Combo ×${activeBall.combo}` : '';
    }
  }

  _renderCreatures() {
    const list = document.getElementById('creature-list');
    if (!list) return;
    list.innerHTML = '';
    for (const id of this.runState.creatures) {
      const c = getCreature(id);
      if (!c) continue;
      const card = document.createElement('div');
      card.className = 'creature-card';
      card.innerHTML = `
        <div class="creature-icon">${c.icon}</div>
        <div class="creature-info">
          <div class="creature-name">${c.name}</div>
          <div class="creature-ability">${c.ability}</div>
        </div>`;
      list.appendChild(card);
    }
  }

  _renderRelics() {
    const list = document.getElementById('relic-list');
    if (!list) return;
    list.innerHTML = '';
    for (const id of this.runState.relics) {
      const r = getRelic(id);
      if (!r) continue;
      const card = document.createElement('div');
      card.className = `relic-card rarity-${r.rarity}`;
      card.innerHTML = `
        <span>${r.icon}</span>
        <span>${r.name}</span>
        <div class="relic-tooltip">${r.description}</div>`;
      list.appendChild(card);
    }
  }

  _renderBoard() {
    const ctx = this.ctx;
    drawBoard(ctx, this.board);
    drawLaunchZone(ctx, this.mouseX);
    if (this.board.isBoss) {
      document.getElementById('boss-indicator').style.display = 'block';
      const mods = this.board.bossModifiers || [];
      document.getElementById('boss-rules').textContent = mods.map(m => m.label).join(', ');
    }
  }

  _showDropHint() {
    const overlay = document.getElementById('canvas-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.querySelector('.canvas-message').textContent = '🎯 Click to drop ball';
    }
  }

  _hideOverlay() {
    const overlay = document.getElementById('canvas-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ─── Event Log ───────────────────────────────────────────────

  _log(message, type = 'default') {
    const log = document.getElementById('event-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    // Keep log from growing too large
    while (log.children.length > 60) log.removeChild(log.firstChild);
  }

  // ─── Collection Screen ───────────────────────────────────────

  _showCollection() {
    this._showScreen('collection');
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const c of CREATURES) {
      const owned = this.save.unlockedCreatures.includes(c.id);
      const card = document.createElement('div');
      card.className = 'creature-card';
      card.style.opacity = owned ? '1' : '0.35';
      card.style.filter  = owned ? 'none' : 'grayscale(1)';
      card.innerHTML = `
        <div class="creature-icon">${c.icon}</div>
        <div class="creature-info">
          <div class="creature-name">${c.name} <span style="color:var(--rarity-${c.rarity});font-size:11px">${c.rarity}</span></div>
          <div class="creature-ability">${owned ? c.ability : '???'}</div>
        </div>`;
      grid.appendChild(card);
    }
  }

  // ─── Shop Screen ─────────────────────────────────────────────

  _showShop() {
    this._showScreen('shop');
    document.getElementById('shop-perm-gold').textContent = this.save.permanentGold;
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const unlock of PERMANENT_UNLOCKS) {
      const owned = this.save.purchasedUnlocks.includes(unlock.id);
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.style.opacity = owned ? '0.4' : '1';
      card.innerHTML = `
        <div class="upgrade-icon">${unlock.icon}</div>
        <h3>${unlock.name}</h3>
        <p>${unlock.description}</p>
        <div class="upgrade-cost">${owned ? '✅ Owned' : `💎 ${unlock.cost} perm. gold`}</div>
      `;
      if (!owned) {
        card.addEventListener('click', () => {
          if (this.save.permanentGold >= unlock.cost) {
            this.save.permanentGold -= unlock.cost;
            this.save.purchasedUnlocks.push(unlock.id);
            writeSave(this.save);
            this._showShop();
          } else {
            this._log('Not enough permanent gold!', 'danger');
          }
        });
      }
      grid.appendChild(card);
    }
  }
}
