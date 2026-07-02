// Utility helpers

/** Return a random float in [min, max) */
export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/** Return a random integer in [min, max] */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Weighted random pick: items = [{ item, weight }] */
export function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1].item;
}

/** Shuffle array in-place using Fisher-Yates */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Clamp value between lo and hi */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Distance between two points */
export function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** First intersection t in [0, 1] for a line segment against a circle */
export function lineCircleIntersect(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);

  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

/** Closest point on a line segment */
export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return {
    x: ax + dx * t,
    y: ay + dy * t,
    t,
  };
}

/** Capitalize first letter */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a number with commas */
export function formatNum(n) {
  return n.toLocaleString();
}
