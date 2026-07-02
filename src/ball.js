// Ball physics simulation

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  GRAVITY, DAMPING, FRICTION,
  BALL_RADIUS, PEG_RADIUS, BUMPER_RADIUS,
  SLOT_HEIGHT,
} from './constants.js';
import { dist, clamp, rand } from './utils.js';

export class Ball {
  constructor(x, y, vx = 0, vy = 1, runState = null) {
    this.x  = x;
    this.y  = y;
    this.vx = vx + rand(-0.5, 0.5);
    this.vy = vy;
    this.radius = BALL_RADIUS;
    this.active = true;
    this.landed = false;
    this.slotIndex = -1;
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
  }

  update(board, runState, eventEmitter) {
    if (!this.active || this.landed) return;

    // Store trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailLen) this.trail.shift();

    // Apply gravity
    this.vy += GRAVITY;

    // Slow from Time Crystal relic
    if (this.slowTimer > 0) {
      this.vx *= 0.97;
      this.vy *= 0.97;
      this.slowTimer--;
    }

    // Magnetic attraction toward bumpers
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
        const strength = runState.synergiesActive.includes('magnetic_cat') ? 0.06 : 0.03;
        this.vx += (dx / len) * strength;
        this.vy += (dy / len) * strength;
      }
    }

    // Apply friction
    this.vx *= FRICTION;

    // Move
    this.x += this.vx * this.slowFactor;
    this.y += this.vy * this.slowFactor;

    // Combo window decay
    if (this.comboWindow > 0) {
      this.comboWindow--;
    } else {
      this.combo = 0;
    }

    // Glow decay
    if (this.glowIntensity > 0) this.glowIntensity = Math.max(0, this.glowIntensity - 2);

    // Wall collisions
    if (this.x - this.radius < 0) {
      this.x  = this.radius;
      this.vx = Math.abs(this.vx) * DAMPING;
    }
    if (this.x + this.radius > CANVAS_WIDTH) {
      this.x  = CANVAS_WIDTH - this.radius;
      this.vx = -Math.abs(this.vx) * DAMPING;
    }

    // Peg collisions
    for (const peg of board.pegs) {
      const d = dist(this.x, this.y, peg.x, peg.y);
      const minDist = this.radius + peg.radius;
      if (d < minDist && d > 0) {
        this._resolveCircleCollision(peg, d, minDist, DAMPING);
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
          // Web slows ball briefly
          this.vx *= 0.5;
          this.vy *= 0.5;
          eventEmitter && eventEmitter('🕷️ Web slows the ball!', 'creature');
        }

        // Wolf speed streak
        if (runState.creatures.includes('wolf')) {
          this.speedStreak++;
          if (this.speedStreak >= 5) {
            const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            this.vx = (this.vx / mag) * (mag * 1.4);
            this.vy = (this.vy / mag) * (mag * 1.4);
            this.speedStreak = 0;
            eventEmitter && eventEmitter('🐺 Wolf speed burst!', 'creature');
          }
        }

        // Triple bounce at every 3rd hit
        if (runState.tempUpgrades.includes('triple_bounce') && this.pegHits % 3 === 0) {
          runState.bonusScore = (runState.bonusScore || 0) + 30;
          eventEmitter && eventEmitter('🎯 Triple bounce!', 'highlight');
        }

        // Dragon chain reaction at every 10th hit
        if (runState.creatures.includes('dragon') && this.pegHits % 10 === 0) {
          this._triggerChainReaction(board, runState, eventEmitter);
        }
      }
    }

    // Bumper collisions
    for (const bumper of board.bumpers) {
      const d = dist(this.x, this.y, bumper.x, bumper.y);
      const minDist = this.radius + bumper.radius;
      if (d < minDist && d > 0) {
        this._resolveCircleCollision(bumper, d, minDist, 1.2);  // bumpers bounce harder
        bumper.hitCount++;
        this.bumperHits++;
        this.comboWindow = 30;
        this.combo++;
        this.glowIntensity = 30;

        if (runState.creatures.includes('crab')) {
          this.vx *= 1.4;
        }

        if (this.isFireball || bumper.isIgnited) {
          bumper.isIgnited = true;
          bumper.igniteTimer = 180;
          runState.bonusScore = (runState.bonusScore || 0) + 50;
          eventEmitter && eventEmitter('🔥 Bumper ignited!', 'highlight');
        }

        // Ball split on first bumper hit
        if (runState.tempUpgrades.includes('ball_split_run') && this.bumperHits === 1) {
          runState.pendingBalls = (runState.pendingBalls || 0) + 1;
          eventEmitter && eventEmitter('⚡ Ball splits!', 'highlight');
        }

        // Splitter relic
        if (runState.relics.includes('splitter') && this.bumperHits === 1) {
          runState.pendingBalls = (runState.pendingBalls || 0) + 1;
          eventEmitter && eventEmitter('⚡ Splitter activates!', 'relic');
        }

        // Chain explosion at combo 5+
        const chainThreshold = runState.tempUpgrades.includes('chain_explosion_run') ? 5 : 8;
        if (this.combo >= chainThreshold && runState.relics.includes('chain_bomb')) {
          runState.bonusScore = (runState.bonusScore || 0) + 200;
          eventEmitter && eventEmitter('💥 CHAIN EXPLOSION!', 'danger');
        }

        // Slime: every 5th bumper hit = bonus ball
        if (runState.creatures.includes('slime') && this.bumperHits % 5 === 0) {
          runState.pendingBalls = (runState.pendingBalls || 0) + 1;
          eventEmitter && eventEmitter('🟢 Slime spawns a ball!', 'creature');
        }

        // Queen Bee: gold peg bonus ball
        if (runState.creatures.includes('bee') && bumper.isIgnited) {
          runState.pendingBalls = (runState.pendingBalls || 0) + 1;
          eventEmitter && eventEmitter('🐝 Queen Bee activates!', 'creature');
        }

        // Time Crystal slow
        if (runState.relics.includes('time_crystal')) {
          this.slowTimer = 120;
        }

        eventEmitter && eventEmitter(`Combo ×${this.combo}`, 'highlight');
      }
    }

    // Portal collisions
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
    if (this._portalCooldown > 0) this._portalCooldown--;

    // Check if ball has reached the slot area
    const slotY = CANVAS_HEIGHT - SLOT_HEIGHT;
    if (this.y + this.radius >= slotY) {
      this._land(board.slots);
    }

    // Auto-multiplier: increase slot values over time
    if (runState.tempUpgrades.includes('auto_multiplier_run') || runState.relics.includes('auto_multiplier')) {
      runState._autoMulTimer = (runState._autoMulTimer || 0) + 1;
      const interval = runState.relics.includes('auto_multiplier') ? 600 : 480;
      if (runState._autoMulTimer >= interval) {
        runState._autoMulTimer = 0;
        board.slots.forEach(s => { s.value += 1; });
        eventEmitter && eventEmitter('✖️ Auto-multiplier +1!', 'relic');
      }
    }
  }

  _resolveCircleCollision(obstacle, d, minDist, bounceFactor) {
    const nx = (this.x - obstacle.x) / d;
    const ny = (this.y - obstacle.y) / d;
    const overlap = minDist - d;
    this.x += nx * overlap;
    this.y += ny * overlap;
    const dot = this.vx * nx + this.vy * ny;
    this.vx -= 2 * dot * nx * bounceFactor;
    this.vy -= 2 * dot * ny * bounceFactor;
    this.vx *= DAMPING;
    this.vy *= DAMPING;
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
export function updateBumpers(bumpers) {
  for (const b of bumpers) {
    if (b.igniteTimer > 0) {
      b.igniteTimer--;
      if (b.igniteTimer === 0) b.isIgnited = false;
    }
  }
}
