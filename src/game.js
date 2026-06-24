// game.js — state, the single requestAnimationFrame loop, neon rendering,
// screen shake, particle bursts and win state. Wires the panel + audio together.

import { Ball } from './ball.js';
import { buildRings, innermostAlive, collide, outlineSegments } from './rings.js';
import { AudioEngine } from './audio.js';
import { Panel } from './panel.js';

const TAU = Math.PI * 2;

class Game {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioEngine();

    this.rings = [];
    this.balls = [];
    this.particles = [];
    this.running = false;
    this.won = false;
    this.maxSize = 0;            // for the "Size:" readout
    this.shakeAmount = 0;
    this.hueShift = 0;
    this.last = 0;

    this.cx = 0; this.cy = 0;    // viewport center (screen px); world center is (0,0)
    this.cam = 1;                // camera zoom (world units -> screen px)
    // Cap render resolution: a 120Hz phone at dpr 3 has ~9ms just to fill the
    // canvas, which alone blows the frame budget. 1.5 stays crisp and fast.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Keys that change the arena's geometry — these need the rings rebuilt.
    const GEOMETRY = ['shape', 'viewMode', 'ringCount', 'ringSpacing',
                      'innerRadius', 'thickness', 'gapWidth'];

    this.panel = new Panel(document.getElementById('controls'), (cfg, key) => {
      this.audio.applyConfig(cfg);
      if (key === 'rotationSpeed' || key === 'alternateSpin') this.applyMotion();
      // While paused, rebuild the preview live so geometry/view edits are
      // visible immediately. While running, geometry waits for Reset (per SPEC),
      // but viewMode still applies live because the camera re-targets each frame.
      if (!this.running && key && GEOMETRY.includes(key)) this.reset(false);
      else if (!this.running) this.cam = this._camTarget();
    });

    this._initDom();
    this._resize();
    this.reset(false);          // show the neon arena as a static preview
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame((t) => this._frame(t));
  }

  get config() { return this.panel.config; }

  _initDom() {
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('resetBtn').addEventListener('click', () => this.reset(true));

    // JSON import / export.
    const jsonBox = document.getElementById('jsonBox');
    document.getElementById('exportBtn').addEventListener('click', () => {
      jsonBox.value = this.panel.toJSON();
      this._toast('Config exported to the box below ↓');
    });
    document.getElementById('importBtn').addEventListener('click', () => {
      try {
        this.panel.fromJSON(jsonBox.value);
        this.reset(false);
        this._toast('Config imported ✓');
      } catch (e) {
        this._toast('Invalid JSON: ' + e.message, true);
      }
    });

    // Audio upload.
    const file = document.getElementById('audioFile');
    file.addEventListener('change', async () => {
      if (!file.files.length) return;
      this._toast('Analyzing melody…');
      const res = await this.audio.extractFromFile(file.files[0]);
      this._toast(res.message, !res.ok);
    });
    document.getElementById('useBuiltin').addEventListener('click', () => {
      this.audio.setSource('built-in');
      this._toast('Using built-in scale.');
    });

    // Collapsible panel for mobile.
    document.getElementById('togglePanel').addEventListener('click', () => {
      document.getElementById('panel').classList.toggle('collapsed');
    });

    // Click/tap the stage to drop an extra ball where you tap (screen -> world).
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.running) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - this.cx) / this.cam;
      const y = (e.clientY - rect.top - this.cy) / this.cam;
      this.spawnBall(x, y);
    });
  }

  _resize() {
    const wrap = document.getElementById('stageWrap');
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.viewW = w; this.viewH = h;
    this.cx = w / 2;            // viewport center (screen px); arena center is world (0,0)
    this.cy = h / 2;
    // Snap the camera to the new viewport so nothing clips after a resize/rotate.
    if (this.rings && this.rings.length) this.cam = this._camTarget();
  }

  // Full arena radius in world units (unscaled, the simulation's own space).
  _outerSize() {
    const c = this.config;
    return c.innerRadius + (c.ringCount - 1) * c.ringSpacing + c.thickness / 2;
  }

  // Camera zoom = (screen half-extent) / (world radius we want to fill).
  //  • 'fit'  — always frame the whole arena: one fixed screen size, never clips.
  //  • 'zoom' — frame only the current innermost wall, so each break (which makes
  //             a bigger wall the innermost) zooms the camera out.
  _camTarget() {
    const avail = Math.min(this.viewW, this.viewH) / 2 - 16;
    let focus = this._outerSize();
    if (this.config.viewMode === 'zoom') {
      const inner = innermostAlive(this.rings);
      if (inner) focus = (inner.size + this.config.thickness) * 1.18;
    }
    return Math.max(0.02, avail / focus);
  }

  applyMotion() {
    // Re-apply spin direction/speed to existing rings live.
    const cfg = this.config;
    this.rings.forEach((r, i) => {
      const dir = cfg.alternateSpin && i % 2 === 1 ? -1 : 1;
      r.rotationSpeed = dir * cfg.rotationSpeed;
    });
  }

  async start() {
    await this.audio.resume();
    this.audio.applyConfig(this.config);
    if (!this.rings.length || this.won) this.reset(false);
    this.running = true;
    document.getElementById('panel').classList.add('collapsed');
    this._toast('');
  }

  reset(autostart) {
    this.rings = buildRings(this.config);
    this.balls = [];
    this.particles = [];
    this.won = false;
    this.maxSize = this.config.ballRadius;
    this.audio.reset();
    this.cam = this._camTarget();      // snap camera on a fresh layout
    for (let i = 0; i < this.config.ballCount; i++) {
      this.spawnBall(0, -this.config.innerRadius * 0.3);   // world coords (center = 0,0)
    }
    this.running = autostart ? true : this.running;
    this._updateReadout();
  }

  // x,y are world coords relative to the arena center.
  spawnBall(x, y) {
    const cfg = this.config;
    const ang = Math.random() * TAU;
    const sp = cfg.ballSpeed;
    const b = new Ball(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, cfg.ballRadius);
    // Give it a slight initial upward kick so it visibly "drops" under gravity.
    if (cfg.gravity > 0) b.vy = -Math.abs(b.vy) * 0.5 - 60;
    b.hue = (cfg.hue + Math.random() * 60) % 360;
    this.balls.push(b);
    if (this.balls.length > 200) this.balls.shift(); // safety cap
  }

  _frame(t) {
    const dt = Math.min(0.033, (this.last ? (t - this.last) : 16) / 1000);
    this.last = t;
    if (this.running) this._update(dt);
    this._render(dt);
    requestAnimationFrame((nt) => this._frame(nt));
  }

  _update(dt) {
    const cfg = this.config;
    this.hueShift += cfg.hueCycle * dt;

    for (const r of this.rings) r.update(dt);

    // Substep integration for stable collisions at speed. Arena center = (0,0)
    // in world coords; the camera handles mapping to the screen.
    const sub = 3;
    const sdt = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const ball of this.balls) {
        ball.integrate(sdt, cfg.gravity);
        const ring = innermostAlive(this.rings);
        if (ring) {
          const res = collide(ring, ball, 0, 0);
          if (res === 'bounce' || res === 'escape') {
            this._onHit(ball, ring, res);
          }
        } else {
          // No walls left: keep the ball inside the view so the win lingers.
          this._containInView(ball);
        }
      }
    }

    // Ease the camera toward its target so 'zoom' mode glides out on each break.
    const target = this._camTarget();
    this.cam += (target - this.cam) * Math.min(1, dt * 4);

    for (const ball of this.balls) ball.recordTrail();

    // Particles.
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 40);

    if (!this.won && innermostAlive(this.rings) === null && this.rings.length) {
      this.won = true;
      this._kaboom();
      this._toast('★ ESCAPED ALL WALLS ★');
    }
    this._updateReadout();
  }

  _onHit(ball, ring, kind) {
    const cfg = this.config;
    this.audio.bounce(kind === 'escape' ? 700 : 0);

    // Restitution / energy.
    if (cfg.bounciness !== 1) {
      ball.vx *= cfg.bounciness;
      ball.vy *= cfg.bounciness;
    }
    if (cfg.growOnBounce) {
      ball.radius += cfg.growAmount;
      this.maxSize = Math.max(this.maxSize, ball.radius);
    }
    this.shakeAmount = Math.min(this.shakeAmount + cfg.shake * (kind === 'escape' ? 1.6 : 1), cfg.shake * 2);
    if (cfg.particles) this._burst(ball.x, ball.y, ball.hue, kind === 'escape' ? 24 : 10);
  }

  _containInView(ball) {
    const r = ball.radius;
    const hx = this.viewW / 2 / this.cam - r;   // world-space view bounds
    const hy = this.viewH / 2 / this.cam - r;
    if (ball.x < -hx) { ball.x = -hx; ball.vx = Math.abs(ball.vx); }
    if (ball.x > hx)  { ball.x = hx;  ball.vx = -Math.abs(ball.vx); }
    if (ball.y < -hy) { ball.y = -hy; ball.vy = Math.abs(ball.vy); }
    if (ball.y > hy)  { ball.y = hy;  ball.vy = -Math.abs(ball.vy) * 0.9; }
  }

  _burst(x, y, hue, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.4, hue,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  _kaboom() {
    this.shakeAmount = this.config.shake * 3;
    for (const b of this.balls) this._burst(b.x, b.y, b.hue, 60);
  }

  _updateReadout() {
    const ro = document.getElementById('readout');
    const alive = this.rings.filter((r) => r.alive).length;
    let txt = `Walls: ${alive}/${this.rings.length}`;
    if (this.config.growOnBounce) txt += `   Size: ${this.maxSize.toFixed(2)}`;
    txt += `   Balls: ${this.balls.length}`;
    ro.textContent = txt;
  }

  // ---- rendering ----------------------------------------------------------

  _render(dt) {
    const ctx = this.ctx;
    const cfg = this.config;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Trail: fade the previous frame instead of clearing for motion streaks.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(6,4,16,${1 - cfg.trail})`;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Screen shake.
    let sx = 0, sy = 0;
    if (this.shakeAmount > 0.1) {
      sx = (Math.random() * 2 - 1) * this.shakeAmount;
      sy = (Math.random() * 2 - 1) * this.shakeAmount;
    }

    // Camera: center the world (0,0) on the viewport and apply zoom. All world
    // geometry is drawn around the origin from here on.
    ctx.save();
    ctx.translate(this.cx + sx, this.cy + sy);
    ctx.scale(this.cam, this.cam);

    const baseHue = (cfg.hue + this.hueShift) % 360;
    ctx.globalCompositeOperation = 'lighter';

    this._renderRings(ctx, cfg, baseHue);
    this._renderParticles(ctx);
    this._renderBalls(ctx, cfg);

    ctx.restore();

    if (this.won) this._renderWin(ctx, baseHue);
  }

  _renderRings(ctx, cfg, baseHue) {
    // Neon glow via two strokes (wide translucent + bright core) under
    // `lighter` compositing — no shadowBlur, so it stays fast with many walls.
    ctx.lineCap = 'round';
    const glow = cfg.glow;
    // Keep walls at least ~1px on screen even when the camera is zoomed way out
    // (lineWidth is in world units, so it gets multiplied by cam).
    const minW = 0.9 / this.cam;
    let idx = 0;
    for (const ring of this.rings) {
      if (!ring.alive) continue;
      const hue = (baseHue + idx * 28) % 360;
      const flash = ring.flash;
      const light = 55 + flash * 30;
      const coreW = Math.max(ring.thickness + flash * 3, minW);
      const glowW = coreW + glow * 0.85;

      // Build the (gap-skipping) path once, stroke it twice. World center = 0,0.
      let path;
      if (ring.shape === 'circle') {
        path = new Path2D();
        const start = ring.gapCenter + ring.gapWidth / 2 + ring.rotation;
        const end = ring.gapCenter - ring.gapWidth / 2 + ring.rotation + TAU;
        path.arc(0, 0, ring.size, start, end);
      } else {
        path = new Path2D();
        for (const seg of outlineSegments(ring, 0, 0, 72)) {
          if (seg.length < 2) continue;
          path.moveTo(seg[0].x, seg[0].y);
          for (let i = 1; i < seg.length; i++) path.lineTo(seg[i].x, seg[i].y);
        }
      }

      ctx.lineWidth = glowW;
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${0.1 + flash * 0.3})`;
      ctx.stroke(path);
      ctx.lineWidth = coreW;
      ctx.strokeStyle = `hsl(${hue}, 100%, ${light}%)`;
      ctx.stroke(path);
      idx++;
    }
  }

  _renderParticles(ctx) {
    for (const p of this.particles) {
      const a = Math.max(0, p.life);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + a * 2, 0, TAU);
      ctx.fill();
    }
  }

  _renderBalls(ctx, cfg) {
    for (const ball of this.balls) {
      // Trail streak.
      for (let i = 0; i < ball.trail.length; i++) {
        const tp = ball.trail[i];
        const a = (i / ball.trail.length) * 0.5;
        ctx.fillStyle = `hsla(${ball.hue}, 100%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, ball.radius * (i / ball.trail.length), 0, TAU);
        ctx.fill();
      }
      ctx.shadowColor = `hsl(${ball.hue}, 100%, 65%)`;
      ctx.shadowBlur = cfg.glow * 0.5 + 4;
      ctx.fillStyle = `hsl(${ball.hue}, 100%, 70%)`;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, TAU);
      ctx.fill();
      // Hot core.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _renderWin(ctx, hue) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowBlur = 30;
    ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
    ctx.fillText('ESCAPED!', this.viewW / 2, this.viewH / 2);
    ctx.restore();
  }

  _toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
    el.style.opacity = msg ? '1' : '0';
  }
}

window.addEventListener('DOMContentLoaded', () => new Game());
