// Canvas renderer for the pachinko board

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  SLOT_HEIGHT, BUMPER_RADIUS, PEG_RADIUS,
  BOARD_OFFSET_Y,
} from './constants.js';
import { RARITY_COLORS } from './constants.js';

export function drawBoard(ctx, board) {
  const { palette, pegs, bumpers, portals, barriers = [], slots } = board;

  // Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle grid lines
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let y = BOARD_OFFSET_Y; y < CANVAS_HEIGHT - SLOT_HEIGHT; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // Portals
  for (const portal of portals) {
    const isEntry = portal.id % 2 === 0;
    const color = isEntry ? '#536dfe' : '#ce93d8';
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.radius, 0, Math.PI * 2);
    ctx.fillStyle = color + '88';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isEntry ? 'IN' : 'OUT', portal.x, portal.y);
  }

  // Boss barriers
  for (const barrier of barriers) {
    ctx.save();
    ctx.strokeStyle = '#ff8a65';
    ctx.lineWidth = barrier.thickness;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff7043';
    ctx.beginPath();
    ctx.moveTo(barrier.x1, barrier.y);
    ctx.lineTo(barrier.x2, barrier.y);
    ctx.stroke();
    ctx.restore();
  }

  // Pegs
  for (const peg of pegs) {
    ctx.save();
    if (peg.isGolden) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ffd700';
    } else if (peg.isWeb) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#888';
    }
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);

    if (peg.isGolden) {
      ctx.fillStyle = '#ffd700';
    } else if (peg.isWeb) {
      ctx.fillStyle = '#6a6a6a';
    } else {
      ctx.fillStyle = peg.hitCount > 0 ? palette.bumper : palette.peg;
    }
    ctx.fill();
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Bumpers
  for (const bumper of bumpers) {
    ctx.save();
    const glowColor = bumper.isIgnited ? '#ff5722' : palette.bumper;
    if (bumper.hitCount > 0 || bumper.isIgnited) {
      ctx.shadowBlur = bumper.isIgnited ? 24 : 12;
      ctx.shadowColor = glowColor;
    }
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      bumper.x - 4, bumper.y - 4, 2,
      bumper.x, bumper.y, bumper.radius
    );
    const base = bumper.isIgnited ? '#ff8a50' : palette.bumper;
    const dark = bumper.isIgnited ? '#bf360c' : palette.border;
    grad.addColorStop(0, base);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Slots
  const slotW = CANVAS_WIDTH / slots.length;
  for (const slot of slots) {
    ctx.fillStyle = slot.color;
    ctx.fillRect(slot.x + 1, slot.y, slot.width - 2, slot.height);

    if (slot.isJackpot) {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffd700';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(slot.x + 1, slot.y, slot.width - 2, slot.height);
      ctx.restore();
    }

    if (slot.isLava) {
      // Animated lava shimmer (static approximation)
      ctx.fillStyle = '#ff5722aa';
      ctx.fillRect(slot.x + 1, slot.y + slot.height * 0.6, slot.width - 2, slot.height * 0.4);
    }

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${slot.isJackpot ? 14 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.label, slot.x + slotW / 2, slot.y + slot.height / 2);
  }

  // Divider line above slots
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT - SLOT_HEIGHT);
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - SLOT_HEIGHT);
  ctx.stroke();

  // Boss stage indicator
  if (board.isBoss && board.bossModifiers) {
    ctx.fillStyle = '#e74c3c33';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - SLOT_HEIGHT);
  }
}

/** Highlight the launch zone at the top of the board */
export function drawLaunchZone(ctx, mouseX) {
  if (mouseX === null) return;
  ctx.save();
  ctx.strokeStyle = '#f0c04066';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(mouseX, 0);
  ctx.lineTo(mouseX, 30);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(mouseX, 20, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#f0c04088';
  ctx.fill();
  ctx.restore();
}

/** Draw a floating score popup */
export function spawnFloatScore(container, x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-score';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
