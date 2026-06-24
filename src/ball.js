// ball.js — ball state + integration. Position is in canvas pixels relative to
// the shared arena center (handled by game.js). No engine: plain Euler steps,
// substepped by the caller for stability at high speed / high gravity.

export class Ball {
  constructor(x, y, vx, vy, radius) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.hue = 0;            // assigned by game for per-ball color
    this.trail = [];         // recent positions for the motion streak
    this.alive = true;
  }

  // Advance one (sub)step. gravity is px/s^2 in +y (down).
  integrate(dt, gravity) {
    this.vy += gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  recordTrail() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 14) this.trail.shift();
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }
}
