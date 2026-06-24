// rings.js — concentric barriers ("walls") the balls are trapped inside, plus
// the hand-rolled circle-vs-arc / square collision. No physics engine (SPEC §4).
//
// A barrier is a circle OR an axis-aligned square that has been rotated by
// `rotation`, with a missing wedge ("gap") of angular width `gapWidth` centered
// on `gapCenter` (measured in the barrier's own un-rotated frame). When a ball's
// local angle falls inside that wedge it passes straight through and the barrier
// is removed ("eliminated"). Otherwise it reflects off the wall.
//
// Modeling the square's gap as an angular wedge (rather than a fixed perimeter
// slot) lets circle and square share one gap test and one renderer.

const TAU = Math.PI * 2;

export class Ring {
  constructor({ shape, size, thickness, gapCenter, gapWidth, rotation, rotationSpeed }) {
    this.shape = shape;             // 'circle' | 'square'
    this.size = size;               // circle radius, or square half-extent
    this.thickness = thickness;
    this.gapCenter = gapCenter;     // radians, in the un-rotated frame
    this.gapWidth = gapWidth;       // radians
    this.rotation = rotation;
    this.rotationSpeed = rotationSpeed;
    this.alive = true;
    this.flash = 0;                 // 0..1 hit-flash, decays in game render
  }

  update(dt) {
    this.rotation += this.rotationSpeed * dt;
    if (this.rotation > TAU) this.rotation -= TAU;
    if (this.rotation < 0) this.rotation += TAU;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
  }

  // Is the local angle `a` inside the (un-rotated) gap wedge? Handles wrap.
  inGap(a) {
    let d = Math.abs(normalizeAngle(a - this.gapCenter));
    return d <= this.gapWidth / 2;
  }

  // Distance from center to this barrier's wall along local-frame angle `a`.
  // For a circle this is just `size`; for a square it's the ray/box intersection.
  radiusAtAngle(a) {
    if (this.shape === 'circle') return this.size;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const tx = c > 1e-6 ? this.size / c : Infinity;
    const ty = s > 1e-6 ? this.size / s : Infinity;
    return Math.min(tx, ty);
  }
}

export function normalizeAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

// Build the concentric barrier stack from config.
export function buildRings(cfg) {
  const rings = [];
  const gapWidth = (cfg.gapWidth * Math.PI) / 180;
  for (let i = 0; i < cfg.ringCount; i++) {
    const dir = cfg.alternateSpin && i % 2 === 1 ? -1 : 1;
    rings.push(new Ring({
      shape: cfg.shape,
      size: cfg.innerRadius + i * cfg.ringSpacing,
      thickness: cfg.thickness,
      gapCenter: Math.random() * TAU,
      gapWidth,
      rotation: Math.random() * TAU,
      rotationSpeed: dir * cfg.rotationSpeed,
    }));
  }
  return rings;
}

// The barrier a ball is currently trapped by = smallest alive one it hasn't
// escaped yet. Balls start at center, inside all of them.
export function innermostAlive(rings) {
  let best = null;
  for (const r of rings) {
    if (r.alive && (!best || r.size < best.size)) best = r;
  }
  return best;
}

// Test/resolve one ball against one barrier. Mutates ball on bounce, returns:
//   'bounce'  reflected off a wall (play note, shake)
//   'escape'  passed through the gap; ring marked dead (play note, shake)
//   null      no interaction this frame
// Ball coords are relative to arena center (cx, cy passed separately).
export function collide(ring, ball, cx, cy) {
  // Ball position in the barrier's local (un-rotated) frame.
  const rx = ball.x - cx;
  const ry = ball.y - cy;
  const cos = Math.cos(-ring.rotation);
  const sin = Math.sin(-ring.rotation);
  const lx = rx * cos - ry * sin;
  const ly = rx * sin + ry * cos;

  const dist = Math.hypot(lx, ly);
  if (dist < 1e-6) return null;
  const angle = Math.atan2(ly, lx);

  // How far out is the wall along this ball's bearing?
  const wall = ring.radiusAtAngle(angle);

  // Only interact when the ball is reaching the wall from inside.
  if (dist + ball.radius < wall) return null;

  if (ring.inGap(angle)) {
    ring.alive = false;          // wall eliminated — ball flies out
    ring.flash = 1;
    return 'escape';
  }

  // Bounce. Compute the inward wall normal in the local frame, then rotate to
  // world. Circle: radial. Square: face whose coordinate is maxed out.
  let nlx, nly;
  if (ring.shape === 'circle') {
    nlx = lx / dist;
    nly = ly / dist;
  } else {
    if (Math.abs(lx) >= Math.abs(ly)) { nlx = Math.sign(lx); nly = 0; }
    else { nlx = 0; nly = Math.sign(ly); }
  }
  // Normal back into world frame (rotate by +rotation).
  const wcos = Math.cos(ring.rotation);
  const wsin = Math.sin(ring.rotation);
  const nx = nlx * wcos - nly * wsin;
  const ny = nlx * wsin + nly * wcos;

  // Reflect velocity about the normal: v' = v - 2(v·n)n.
  const vdotn = ball.vx * nx + ball.vy * ny;
  if (vdotn > 0) {               // only reflect if moving outward into the wall
    ball.vx -= 2 * vdotn * nx;
    ball.vy -= 2 * vdotn * ny;
  }

  // Push the ball just inside the wall so it can't stick / tunnel.
  const overlap = dist + ball.radius - wall + 0.5;
  ball.x -= nx * overlap;
  ball.y -= ny * overlap;

  ring.flash = 1;
  return 'bounce';
}

// Sample a barrier outline into world-space points, skipping the gap wedge.
// Returns an array of polyline segments (each an array of {x,y}). Used for
// rendering both shapes identically.
export function outlineSegments(ring, cx, cy, steps = 160) {
  const segments = [];
  let current = null;
  const wcos = Math.cos(ring.rotation);
  const wsin = Math.sin(ring.rotation);
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI + (i / steps) * TAU;
    if (ring.inGap(a)) { current = null; continue; }
    const r = ring.radiusAtAngle(a);
    const lx = Math.cos(a) * r;
    const ly = Math.sin(a) * r;
    const x = cx + lx * wcos - ly * wsin;
    const y = cy + lx * wsin + ly * wcos;
    if (!current) { current = []; segments.push(current); }
    current.push({ x, y });
  }
  return segments;
}
