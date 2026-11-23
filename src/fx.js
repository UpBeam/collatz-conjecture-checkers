/**
 * High-DPI Canvas FX Layer — Tactile, Restrained Physical Juice
 * Handles:
 *  - Crisp aim trajectory dashed path & directional vector
 *  - Expanding contact rings on captures & landings
 *  - Tight directional sparks on wall reflections
 *  - Parabolic leaping piece orb with subtle comet trail
 */

export class FXLayer {
  constructor(canvas, boardFrame) {
    this.canvas = canvas;
    this.boardFrame = boardFrame;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.rings = [];
    this.trails = [];
    this.preview = null;
    this.activeHopper = null;
    this.size = 400;
    this.boardSize = 8;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setBoardSize(n) {
    this.boardSize = n;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = rect.width || 400;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  cellCenter(gx, gy) {
    const cellSize = this.size / this.boardSize;
    return {
      x: (gx + 0.5) * cellSize,
      y: (gy + 0.5) * cellSize,
      cellSize,
    };
  }

  getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      p1: styles.getPropertyValue('--p1-main').trim() || '#e5484d',
      p2: styles.getPropertyValue('--p2-main').trim() || '#3b9eff',
      accent: styles.getPropertyValue('--accent').trim() || '#d9a036',
      ink: styles.getPropertyValue('--ink').trim() || '#eceef2',
    };
  }

  shake(intensity = 3, durationMs = 100) {
    if (!this.boardFrame) return;
    const dx = (Math.random() - 0.5) * intensity * 2;
    const dy = (Math.random() - 0.5) * intensity * 2;
    this.boardFrame.style.transform = `translate(${dx}px, ${dy}px)`;
    setTimeout(() => {
      this.boardFrame.style.transform = '';
    }, durationMs);
  }

  spawnRing(gx, gy, color, maxScale = 0.65) {
    const { x, y, cellSize } = this.cellCenter(gx, gy);
    this.rings.push({
      x,
      y,
      radius: cellSize * 0.24,
      maxRadius: cellSize * maxScale,
      color,
      life: 1,
      decay: 0.055,
    });
  }

  spawnBurst(gx, gy, color, count = 10, speed = 2.6) {
    const { x, y } = this.cellCenter(gx, gy);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const spd = speed * (0.45 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: 1.8 + Math.random() * 2.4,
        color,
        life: 1,
        decay: 0.032 + Math.random() * 0.02,
      });
    }
  }

  spawnWallSparks(gx, gy, bouncedX, bouncedY, color) {
    const { x, y } = this.cellCenter(gx, gy);
    let sx = x;
    let sy = y;
    if (bouncedX) sx = gx === 0 ? 2 : this.size - 2;
    if (bouncedY) sy = gy === 0 ? 2 : this.size - 2;

    this.rings.push({
      x: sx,
      y: sy,
      radius: 4,
      maxRadius: 24,
      color,
      life: 1,
      decay: 0.07,
    });

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 2.8;
      this.particles.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: 1.5 + Math.random() * 2,
        color,
        life: 1,
        decay: 0.04 + Math.random() * 0.02,
      });
    }
  }

  spawnVictoryConfetti() {
    const colors = this.getThemeColors();
    const palette = [colors.p1, colors.p2, colors.accent];
    for (let i = 0; i < 48; i++) {
      this.particles.push({
        x: this.size * (0.18 + Math.random() * 0.64),
        y: this.size * (0.18 + Math.random() * 0.32),
        vx: (Math.random() - 0.5) * 5,
        vy: -1.8 - Math.random() * 4.2,
        gravity: 0.13,
        radius: 2.5 + Math.random() * 2.5,
        color: palette[i % palette.length],
        life: 1,
        decay: 0.013 + Math.random() * 0.008,
      });
    }
  }

  setPreview(previewData) {
    this.preview = previewData;
  }

  clearPreview() {
    this.preview = null;
  }

  animateHopArc(fromX, fromY, toX, toY, player, durationMs = 145) {
    return new Promise((resolve) => {
      const colors = this.getThemeColors();
      const color = player === 1 ? colors.p1 : colors.p2;
      const start = this.cellCenter(fromX, fromY);
      const end = this.cellCenter(toX, toY);
      const startTime = performance.now();

      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const ease = 1 - (1 - t) * (1 - t);
        const arcHeight = Math.sin(t * Math.PI) * (start.cellSize * 0.38);
        const x = start.x + (end.x - start.x) * ease;
        const y = start.y + (end.y - start.y) * ease - arcHeight;
        const scale = 1 + Math.sin(t * Math.PI) * 0.2;

        this.activeHopper = { x, y, radius: start.cellSize * 0.35 * scale, color };
        this.trails.push({ x, y, radius: start.cellSize * 0.14, color, life: 0.7, decay: 0.08 });

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this.activeHopper = null;
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }

  drawPreview(ctx) {
    if (!this.preview) return;
    const colors = this.getThemeColors();
    const { hopSteps, originX, originY, dx, dy } = this.preview;

    if (hopSteps && hopSteps.length > 0) {
      ctx.save();
      ctx.beginPath();
      const first = this.cellCenter(hopSteps[0].fromX, hopSteps[0].fromY);
      ctx.moveTo(first.x, first.y);
      for (let i = 0; i < Math.min(hopSteps.length, 12); i++) {
        const pt = this.cellCenter(hopSteps[i].toX, hopSteps[i].toY);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2.25;
      ctx.setLineDash([5, 5]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    const orig = this.cellCenter(originX, originY);
    const arrowLen = orig.cellSize * 0.82;
    const tipX = orig.x + dx * arrowLen;
    const tipY = orig.y + dy * arrowLen;

    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.fillStyle = colors.ink;
    ctx.lineWidth = 2.75;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(orig.x, orig.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const angle = Math.atan2(dy, dx);
    const headLen = 9;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  loop() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    this.drawPreview(ctx);

    // Expanding contact rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= r.decay;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const curR = r.radius + (r.maxRadius - r.radius) * (1 - r.life);
      ctx.save();
      ctx.globalAlpha = r.life * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, curR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Subtle trails
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.life -= tr.decay;
      if (tr.life <= 0) {
        this.trails.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = tr.life * 0.35;
      ctx.fillStyle = tr.color;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.radius * tr.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Active hopper
    if (this.activeHopper) {
      const h = this.activeHopper;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Crisp particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.gravity) p.vy += p.gravity;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(this.loop);
  }
}
