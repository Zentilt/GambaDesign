// Ball physics simulation

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  PHYSICS_STEP, GRAVITY_PPS2,
  FRICTION_PER_STEP, MAX_BALL_SPEED,
  PEG_RESTITUTION, BUMPER_RESTITUTION, WALL_RESTITUTION, BARRIER_RESTITUTION,
  BALL_RADIUS, SLOT_HEIGHT,
} from './constants.js';
import { dist, clamp, rand, lineCircleIntersect } from './utils.js';

const STEP_SCALE = 1 / PHYSICS_STEP;
const ROLL_FRICTION_PER_STEP = 0.9;
const MIN_ROLL_SPEED = 12;
const ROLL_FRAMES = 18;
const COLLISION_EPSILON = 0.0001;
const MAX_COLLISION_ITERATIONS = 3;
const COLLISION_SAFETY_OFFSET = 0.001;
const COLLISION_SEPARATION_OFFSET = 0.35;

export class Ball {
  constructor(x, y, vx = 0, vy = 1, runState = null) {
    this.x  = x;
    this.y  = y;
    this.vx = (vx + rand(-0.5, 0.5)) * STEP_SCALE;
    this.vy = vy * STEP_SCALE;
    this.radius = BALL_RADIUS;
    this.active = true;
    this.rolling = false;
    this.landed = false;
    this.slotIndex = -1;
    this.slotBounds = null;
    this.rollFrames = 0;
    this.trail = [];
    this.trailLen = 12;

    // Active modifiers derived from runState
    this.isFireball  = runState ? runState.tempUpgrades.includes('fireball_run') : false;
    this.hasIceTrail = runState ? (runState.tempUpgrades.includes('ice_trail_run') || runState.relics.includes('ice_crystal')) : false;
    this.hasMagnet   = runState ? (runState.tempUpgrades.includes('magnetic_ball') || runState.relics.includes('magnet')) : false;
    this.slowFactor  = runState && runState.creatures.includes('turtle') ? 0.88 : 1.0;

    // Counters
    this.pegHits     = 0;
    this.bumperHits  = 0;
    this.comboWindow = 0;   // frames since last peg hit
    this.combo       = 0;
    this.speedStreak = 0;   // for Wolf creature

    // Visual
    this.glowColor = this.isFireball ? '#ff5722' : (this.hasIceTrail ? '#64b5f6' : '#f0c040');
    this.glowIntensity = 0;

    // Time-based effects
    this.igniteTimer = 0;
    this.slowTimer   = 0;
    this.phantomTimer = 0;  // phase-through timer (Ghost creature)
    this._portalCooldown = 0;
  }

  update(board, runState, gravity = { x: 0, y: GRAVITY_PPS2 }, dt = PHYSICS_STEP, eventEmitter) {
    if (!this.active || this.landed) return;

    const stepScale = dt * STEP_SCALE;
    this._pushTrail();
    this._updateComboAndGlow(stepScale);

    if (this.rolling) {
      this._roll(board.slots, dt);
      this._tickPortalCooldown(stepScale);
      this._applyAutoMultiplier(board, runState, eventEmitter, stepScale);
      return;
    }

    this.vx += gravity.x * dt;
    this.vy += gravity.y * dt;

    if (this.slowTimer > 0) {
      const slowMul = Math.pow(0.97, stepScale);
      this.vx *= slowMul;
      this.vy *= slowMul;
      this.slowTimer = Math.max(0, this.slowTimer - stepScale);
    }

    if (this.hasMagnet && board.bumpers.length > 0) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const b of board.bumpers) {
        const d = dist(this.x, this.y, b.x, b.y);
        if (d < nearestDist) { nearestDist = d; nearest = b; }
      }
      if (nearest && nearestDist < 180) {
        const dx = nearest.x - this.x;
        const dy = nearest.y - this.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const strength = runState.synergiesActive.includes('magnetic_cat') ? 0.06 : 0.03;
          const accel = strength * STEP_SCALE * stepScale;
          this.vx += (dx / len) * accel;
          this.vy += (dy / len) * accel;
        }
      }
    }

    this.vx *= Math.pow(FRICTION_PER_STEP, stepScale);
    this._capSpeed();

    let remainingDt = dt;
    let iterations = 0;
    while (remainingDt > COLLISION_EPSILON && iterations < MAX_COLLISION_ITERATIONS && !this.rolling) {
      const startX = this.x;
      const startY = this.y;
      const endX = startX + this.vx * remainingDt * this.slowFactor;
      const endY = startY + this.vy * remainingDt * this.slowFactor;
      const collision = this._findEarliestCollision(startX, startY, endX, endY, board);

      if (!collision) {
        this.x = endX;
        this.y = endY;
        break;
      }

      const travelT = Math.max(0, collision.t - COLLISION_SAFETY_OFFSET);
      this.x = startX + (endX - startX) * travelT;
      this.y = startY + (endY - startY) * travelT;
      this._resolveCollision(collision, board, runState, eventEmitter);
      remainingDt *= 1 - collision.t;
      iterations++;
    }

    if (!this.rolling) {
      this._handlePortals(board, eventEmitter);

      const slotY = CANVAS_HEIGHT - SLOT_HEIGHT;
      if (this.y + this.radius >= slotY) {
        this._beginRoll(board.slots);
      }
    }

    this._tickPortalCooldown(stepScale);
    this._applyAutoMultiplier(board, runState, eventEmitter, stepScale);
  }

  _pushTrail() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailLen) this.trail.shift();
  }

  _updateComboAndGlow(stepScale) {
    if (this.comboWindow > 0) {
      this.comboWindow = Math.max(0, this.comboWindow - stepScale);
      if (this.comboWindow <= 0) this.combo = 0;
    } else {
      this.combo = 0;
    }

    if (this.glowIntensity > 0) {
      this.glowIntensity = Math.max(0, this.glowIntensity - 2 * stepScale);
    }
  }

  _tickPortalCooldown(stepScale) {
    if (this._portalCooldown > 0) {
      this._portalCooldown = Math.max(0, this._portalCooldown - stepScale);
    }
  }

  _applyAutoMultiplier(board, runState, eventEmitter, stepScale) {
    if (!(runState.tempUpgrades.includes('auto_multiplier_run') || runState.relics.includes('auto_multiplier'))) return;
    runState._autoMulTimer = (runState._autoMulTimer || 0) + stepScale;
    const interval = runState.relics.includes('auto_multiplier') ? 600 : 480;
    if (runState._autoMulTimer >= interval) {
      runState._autoMulTimer = 0;
      board.slots.forEach(s => { s.value += 1; });
      eventEmitter && eventEmitter('✖️ Auto-multiplier +1!', 'relic');
    }
  }

  _findEarliestCollision(startX, startY, endX, endY, board) {
    let earliest = this._sweepWalls(startX, startY, endX, endY);

    for (const peg of board.pegs) {
      const collision = this._sweepCircle(startX, startY, endX, endY, peg, this.radius + peg.radius, 'peg', PEG_RESTITUTION);
      if (collision && (!earliest || collision.t < earliest.t)) earliest = collision;
    }

    for (const bumper of board.bumpers) {
      const collision = this._sweepCircle(startX, startY, endX, endY, bumper, this.radius + bumper.radius, 'bumper', BUMPER_RESTITUTION);
      if (collision && (!earliest || collision.t < earliest.t)) earliest = collision;
    }

    for (const barrier of board.barriers || []) {
      const collision = this._sweepBarrier(startX, startY, endX, endY, barrier);
      if (collision && (!earliest || collision.t < earliest.t)) earliest = collision;
    }

    return earliest;
  }

  _sweepWalls(startX, startY, endX, endY) {
    let earliest = null;
    const dx = endX - startX;
    const dy = endY - startY;

    const checks = [
      { plane: this.radius, value: dx, start: startX, normal: { x: 1, y: 0 } },
      { plane: CANVAS_WIDTH - this.radius, value: dx, start: startX, normal: { x: -1, y: 0 } },
      { plane: this.radius, value: dy, start: startY, normal: { x: 0, y: 1 } },
    ];

    for (const check of checks) {
      if (check.value === 0) continue;
      const t = (check.plane - check.start) / check.value;
      if (t < 0 || t > 1) continue;

      // Ignore cases where the segment starts beyond a wall and ends back inside bounds;
      // those are recovery moves from prior correction, not fresh wall impacts.
      if (check.normal.x === 1 && endX >= this.radius) continue;
      if (check.normal.x === -1 && endX <= CANVAS_WIDTH - this.radius) continue;
      if (check.normal.y === 1 && endY >= this.radius) continue;

      const collision = {
        type: 'wall',
        t,
        nx: check.normal.x,
        ny: check.normal.y,
        restitution: WALL_RESTITUTION,
      };
      if (!earliest || collision.t < earliest.t) earliest = collision;
    }

    return earliest;
  }

  _sweepCircle(startX, startY, endX, endY, obstacle, minDist, type, restitution) {
    const t = lineCircleIntersect(startX, startY, endX, endY, obstacle.x, obstacle.y, minDist);
    if (t === null) return null;

    const cx = startX + (endX - startX) * t;
    const cy = startY + (endY - startY) * t;
    const nx = (cx - obstacle.x) / minDist;
    const ny = (cy - obstacle.y) / minDist;

    return {
      type,
      t,
      obstacle,
      nx,
      ny,
      restitution,
    };
  }

  _sweepBarrier(startX, startY, endX, endY, barrier) {
    const expanded = this.radius + barrier.thickness / 2;
    let earliest = null;
    const dy = endY - startY;

    const flatChecks = [
      { y: barrier.y - expanded, ny: -1 },
      { y: barrier.y + expanded, ny: 1 },
    ];

    if (dy !== 0) {
      for (const check of flatChecks) {
        const t = (check.y - startY) / dy;
        if (t < 0 || t > 1) continue;
        const xAt = startX + (endX - startX) * t;
        if (xAt >= Math.min(barrier.x1, barrier.x2) - expanded && xAt <= Math.max(barrier.x1, barrier.x2) + expanded) {
          const collision = {
            type: 'barrier',
            t,
            obstacle: barrier,
            nx: 0,
            ny: check.ny,
            restitution: BARRIER_RESTITUTION,
          };
          if (!earliest || collision.t < earliest.t) earliest = collision;
        }
      }
    }

    for (const pointX of [barrier.x1, barrier.x2]) {
      const t = lineCircleIntersect(startX, startY, endX, endY, pointX, barrier.y, expanded);
      if (t === null) continue;
      const cx = startX + (endX - startX) * t;
      const cy = startY + (endY - startY) * t;
      const d = dist(cx, cy, pointX, barrier.y);
      if (d === 0) continue;
      const collision = {
        type: 'barrier',
        t,
        obstacle: barrier,
        nx: (cx - pointX) / d,
        ny: (cy - barrier.y) / d,
        restitution: BARRIER_RESTITUTION,
      };
      if (!earliest || collision.t < earliest.t) earliest = collision;
    }

    return earliest;
  }

  _resolveCollision(collision, board, runState, eventEmitter) {
    this._bounceAlongNormal(collision.nx, collision.ny, collision.restitution, collision.type === 'peg' ? 0.15 : 0);

    if (collision.type === 'peg') {
      this._handlePegHit(collision.obstacle, board, runState, eventEmitter);
    } else if (collision.type === 'bumper') {
      this._handleBumperHit(collision.obstacle, runState, eventEmitter);
    }
  }

  _bounceAlongNormal(nx, ny, restitution, tangentialJitter = 0) {
    this.x += nx * COLLISION_SEPARATION_OFFSET;
    this.y += ny * COLLISION_SEPARATION_OFFSET;

    const dot = this.vx * nx + this.vy * ny;
    if (dot < 0) {
      this.vx -= (1 + restitution) * dot * nx;
      this.vy -= (1 + restitution) * dot * ny;
    }

    if (tangentialJitter > 0) {
      const jitter = rand(-tangentialJitter, tangentialJitter) * STEP_SCALE;
      this.vx += -ny * jitter;
      this.vy +=  nx * jitter;
    }

    this._capSpeed();
  }

  _handlePegHit(peg, board, runState, eventEmitter) {
    peg.hitCount++;
    this.pegHits++;
    this.comboWindow = 20;
    this.combo++;
    this.glowIntensity = 20;

    if (peg.isGolden) {
      eventEmitter && eventEmitter('✨ Golden peg hit! +20 gold', 'highlight');
      runState.bonusGold = (runState.bonusGold || 0) + 20;
    }

    if (peg.isWeb) {
      this.vx *= 0.5;
      this.vy *= 0.5;
      eventEmitter && eventEmitter('🕷️ Web slows the ball!', 'creature');
    }

    if (runState.creatures.includes('wolf')) {
      this.speedStreak++;
      if (this.speedStreak >= 5) {
        const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (mag > 0) {
          this.vx *= 1.4;
          this.vy *= 1.4;
        }
        this.speedStreak = 0;
        this._capSpeed();
        eventEmitter && eventEmitter('🐺 Wolf speed burst!', 'creature');
      }
    }

    if (runState.tempUpgrades.includes('triple_bounce') && this.pegHits % 3 === 0) {
      runState.bonusScore = (runState.bonusScore || 0) + 30;
      eventEmitter && eventEmitter('🎯 Triple bounce!', 'highlight');
    }

    if (runState.creatures.includes('dragon') && this.pegHits % 10 === 0) {
      this._triggerChainReaction(board, runState, eventEmitter);
    }
  }

  _handleBumperHit(bumper, runState, eventEmitter) {
    bumper.hitCount++;
    this.bumperHits++;
    this.comboWindow = 30;
    this.combo++;
    this.glowIntensity = 30;

    if (runState.creatures.includes('crab')) {
      this.vx *= 1.4;
      this._capSpeed();
    }

    if (this.isFireball || bumper.isIgnited) {
      bumper.isIgnited = true;
      bumper.igniteTimer = 180;
      runState.bonusScore = (runState.bonusScore || 0) + 50;
      eventEmitter && eventEmitter('🔥 Bumper ignited!', 'highlight');
    }

    if (runState.tempUpgrades.includes('ball_split_run') && this.bumperHits === 1) {
      runState.pendingBalls = (runState.pendingBalls || 0) + 1;
      eventEmitter && eventEmitter('⚡ Ball splits!', 'highlight');
    }

    if (runState.relics.includes('splitter') && this.bumperHits === 1) {
      runState.pendingBalls = (runState.pendingBalls || 0) + 1;
      eventEmitter && eventEmitter('⚡ Splitter activates!', 'relic');
    }

    const chainThreshold = runState.tempUpgrades.includes('chain_explosion_run') ? 5 : 8;
    if (this.combo >= chainThreshold && runState.relics.includes('chain_bomb')) {
      runState.bonusScore = (runState.bonusScore || 0) + 200;
      eventEmitter && eventEmitter('💥 CHAIN EXPLOSION!', 'danger');
    }

    if (runState.creatures.includes('slime') && this.bumperHits % 5 === 0) {
      runState.pendingBalls = (runState.pendingBalls || 0) + 1;
      eventEmitter && eventEmitter('🟢 Slime spawns a ball!', 'creature');
    }

    if (runState.creatures.includes('bee') && bumper.isIgnited) {
      runState.pendingBalls = (runState.pendingBalls || 0) + 1;
      eventEmitter && eventEmitter('🐝 Queen Bee activates!', 'creature');
    }

    if (runState.relics.includes('time_crystal')) {
      this.slowTimer = 120;
    }

    eventEmitter && eventEmitter(`Combo ×${this.combo}`, 'highlight');
  }

  _handlePortals(board, eventEmitter) {
    for (const portal of board.portals) {
      const d = dist(this.x, this.y, portal.x, portal.y);
      if (d < this.radius + portal.radius - 4) {
        const partner = board.portals.find(p => p.id === portal.pair);
        if (partner && !this._portalCooldown) {
          this.x = partner.x;
          this.y = partner.y;
          this._portalCooldown = 30;
          eventEmitter && eventEmitter('🌀 Portal teleport!', 'highlight');
        }
      }
    }
  }

  _beginRoll(slots) {
    const slotW = CANVAS_WIDTH / slots.length;
    const slotIndex = clamp(Math.floor(this.x / slotW), 0, slots.length - 1);
    const slot = slots[slotIndex];
    if (!slot) {
      this._land(slots);
      return;
    }

    this.rolling = true;
    this.y = CANVAS_HEIGHT - SLOT_HEIGHT - this.radius;
    this.vy = 0;
    this.rollFrames = ROLL_FRAMES;
    this.slotBounds = {
      left: slot.x + this.radius,
      right: slot.x + slot.width - this.radius,
    };
  }

  _roll(slots, dt) {
    const stepScale = dt * STEP_SCALE;
    this.y = CANVAS_HEIGHT - SLOT_HEIGHT - this.radius;
    this.vy = 0;
    this.vx *= Math.pow(ROLL_FRICTION_PER_STEP, stepScale);
    this.x += this.vx * dt;

    if (this.slotBounds) {
      if (this.x < this.slotBounds.left) {
        this.x = this.slotBounds.left;
        this.vx = Math.abs(this.vx) * WALL_RESTITUTION * 0.5;
      } else if (this.x > this.slotBounds.right) {
        this.x = this.slotBounds.right;
        this.vx = -Math.abs(this.vx) * WALL_RESTITUTION * 0.5;
      }
    }

    this.rollFrames -= stepScale;
    if (Math.abs(this.vx) < MIN_ROLL_SPEED || this.rollFrames <= 0) {
      this._land(slots);
    }
  }

  _capSpeed() {
    const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (mag > MAX_BALL_SPEED) {
      const scale = MAX_BALL_SPEED / mag;
      this.vx *= scale;
      this.vy *= scale;
    }
  }

  _triggerChainReaction(board, runState, eventEmitter) {
    let triggered = 0;
    for (const peg of board.pegs) {
      if (triggered >= 3) break;
      const d = dist(this.x, this.y, peg.x, peg.y);
      if (d < 80) {
        runState.bonusScore = (runState.bonusScore || 0) + 20;
        triggered++;
      }
    }
    if (triggered > 0) {
      eventEmitter && eventEmitter(`🐉 Dragon chain! ×${triggered}`, 'creature');
      if (runState.synergiesActive.includes('dragon_chain_bomb')) {
        runState.bonusScore = (runState.bonusScore || 0) + 300;
        eventEmitter && eventEmitter('🐉💥 Dragon Chain Bomb!', 'relic');
      }
    }
  }

  _land(slots) {
    this.rolling = false;
    this.landed = true;
    this.active = false;
    const slotW = CANVAS_WIDTH / slots.length;
    this.slotIndex = clamp(Math.floor(this.x / slotW), 0, slots.length - 1);
  }

  draw(ctx) {
    if (!this.active && !this.landed) return;

    // Draw trail
    if (this.trail.length > 1) {
      for (let i = 1; i < this.trail.length; i++) {
        const alpha = i / this.trail.length;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * alpha * 0.6, 0, Math.PI * 2);
        if (this.isFireball) {
          ctx.fillStyle = `rgba(255, 87, 34, ${alpha * 0.4})`;
        } else if (this.hasIceTrail) {
          ctx.fillStyle = `rgba(100, 181, 246, ${alpha * 0.35})`;
        } else {
          ctx.fillStyle = `rgba(240, 192, 64, ${alpha * 0.25})`;
        }
        ctx.fill();
      }
    }

    // Glow
    if (this.glowIntensity > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240, 192, 64, ${this.glowIntensity / 60})`;
      ctx.fill();
    }

    // Ball body
    const grad = ctx.createRadialGradient(
      this.x - 2, this.y - 2, 1,
      this.x, this.y, this.radius
    );
    if (this.isFireball) {
      grad.addColorStop(0, '#ffcc80');
      grad.addColorStop(1, '#e64a19');
    } else if (this.hasIceTrail) {
      grad.addColorStop(0, '#e3f2fd');
      grad.addColorStop(1, '#1565c0');
    } else {
      grad.addColorStop(0, '#fff9c4');
      grad.addColorStop(1, '#f57f17');
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#fff8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Update bumper ignite timers */
export function updateBumpers(bumpers, stepScale = 1) {
  for (const b of bumpers) {
    if (b.igniteTimer > 0) {
      b.igniteTimer = Math.max(0, b.igniteTimer - stepScale);
      if (b.igniteTimer <= 0) b.isIgnited = false;
    }
  }
}
