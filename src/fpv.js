/**
 * Collatz Conjecture Checkers — First-Person 3D Renderer (Zero Dependencies)
 *
 * True 3D perspective camera (yaw, pitch, position, FOV) rendered on high-DPI Canvas:
 *  - Tactical Low-Angle POV (perched behind your back rank looking across the board)
 *  - Piece-Shoulder Aim POV (swoops down behind the selected piece looking down the line)
 *  - First-Person Hop Cam (rides the jumping piece's parabolic arc & whips around wall bounces!)
 *  - Exact ray-plane (z = 0) picking so clicking & dragging directly on 3D tiles works natively.
 *  - Theme-aware: reads CSS custom properties from Obsidian, Walnut, and Drafting Paper themes.
 */

export class FirstPersonView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.active = false;
    this.boardSize = 8;
    this.board = null;
    this.activePlayer = 1;
    this.selectedCell = null;
    this.preview = null; // { line, spawns, hopSteps, originX, originY, dx, dy }

    // Camera state (world units: 1 unit = 1 board tile, board spans [0..boardSize] in X and Y, Z is up)
    this.cam = { x: 4, y: 11.4, z: 4.4, yaw: -Math.PI / 2, pitch: -0.44 };
    this.targetCam = { x: 4, y: 11.4, z: 4.4, yaw: -Math.PI / 2, pitch: -0.44 };
    this.camLerp = 0.14;
    this.fov = 58 * (Math.PI / 180);

    // Hop-cam & 3D FX state
    this.riding = false;
    this.hopper = null; // { x, y, z, player }
    this.particles = [];
    this.rings = [];
    this.w = 500;
    this.h = 500;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setActive(flag) {
    this.active = flag;
    if (flag) {
      this.resize();
      this.setOverviewCamera(this.activePlayer, true);
    }
  }

  setBoard(board, boardSize, activePlayer = 1) {
    this.board = board;
    this.boardSize = boardSize;
    this.activePlayer = activePlayer;
    if (!this.riding && !this.selectedCell) {
      this.setOverviewCamera(activePlayer, false);
    }
  }

  setSelectedCell(cell) {
    this.selectedCell = cell;
    if (!cell && !this.riding) {
      this.setOverviewCamera(this.activePlayer, false);
    }
  }

  setPreview(preview) {
    this.preview = preview;
    if (preview && !this.riding) {
      this.setAimCamera(preview.originX, preview.originY, preview.dx, preview.dy);
    }
  }

  clearPreview() {
    this.preview = null;
    if (!this.riding && !this.selectedCell) {
      this.setOverviewCamera(this.activePlayer, false);
    }
  }

  setOverviewCamera(player = 1, snap = false) {
    const mid = this.boardSize / 2;
    // Slight low-angle tabletop POV from the active player's side (or always Red's side in AI mode)
    const dist = this.boardSize * 0.62;
    const isP2 = player === 2;
    const t = {
      x: mid,
      y: isP2 ? -dist * 0.55 : this.boardSize + dist * 0.55,
      z: this.boardSize * 0.54,
      yaw: isP2 ? Math.PI / 2 : -Math.PI / 2,
      pitch: -0.58,
    };
    this.targetCam = t;
    this.camLerp = 0.12;
    if (snap) this.cam = { ...t };
  }

  setAimCamera(gx, gy, dx, dy) {
    const wx = gx + 0.5;
    const wy = gy + 0.5;
    const yaw = Math.atan2(dy, dx);
    const back = 2.6;
    this.targetCam = {
      x: wx - Math.cos(yaw) * back,
      y: wy - Math.sin(yaw) * back,
      z: 2.35,
      yaw,
      pitch: -0.44,
    };
    this.camLerp = 0.16;
  }

  /**
   * First-Person Hop Cam! Smoothly rides behind/over the jumping piece along its parabolic arc.
   */
  animateHopRide(fromX, fromY, toX, toY, dx, dy, player, durationMs = 210) {
    return new Promise((resolve) => {
      this.riding = true;
      const sx = fromX + 0.5;
      const sy = fromY + 0.5;
      const ex = toX + 0.5;
      const ey = toY + 0.5;
      const yaw = Math.atan2(dy, dx);
      const startTime = performance.now();

      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const ease = 1 - (1 - t) * (1 - t);
        const px = sx + (ex - sx) * ease;
        const py = sy + (ey - sy) * ease;
        const arcZ = Math.sin(t * Math.PI) * 1.15;

        this.hopper = { x: px, y: py, z: arcZ + 0.14, player };

        // Camera rides right behind the hopping piece, lifting with the jump!
        const followBack = 2.1;
        this.targetCam = {
          x: px - Math.cos(yaw) * followBack,
          y: py - Math.sin(yaw) * followBack,
          z: 1.55 + arcZ * 0.65,
          yaw,
          pitch: -0.36 - arcZ * 0.08,
        };
        this.camLerp = 0.28;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this.hopper = null;
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }

  endHopRide(nextPlayer = 1) {
    this.riding = false;
    this.hopper = null;
    this.setOverviewCamera(nextPlayer, false);
  }

  spawnBurst3D(gx, gy, color, count = 16) {
    const cx = gx + 0.5;
    const cy = gy + 0.5;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 0.05 + Math.random() * 0.09;
      this.particles.push({
        x: cx,
        y: cy,
        z: 0.22,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        vz: 0.08 + Math.random() * 0.12,
        color,
        life: 1,
        decay: 0.032,
      });
    }
    this.rings.push({ x: cx, y: cy, r: 0.22, maxR: 0.85, color, life: 1, decay: 0.055 });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  getTheme() {
    const s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue('--bg-page').trim() || '#111318',
      frame: s.getPropertyValue('--board-frame').trim() || '#161920',
      light: s.getPropertyValue('--cell-light').trim() || '#242936',
      dark: s.getPropertyValue('--cell-dark').trim() || '#191d27',
      rule: s.getPropertyValue('--rule-strong').trim() || '#3b4254',
      p1: s.getPropertyValue('--p1-main').trim() || '#e5484d',
      p2: s.getPropertyValue('--p2-main').trim() || '#3b9eff',
      accent: s.getPropertyValue('--accent').trim() || '#d9a036',
      ink: s.getPropertyValue('--ink').trim() || '#eceef2',
    };
  }

  /* ---------------- 3D Camera Projection & Raycasting ---------------- */

  getCameraBasis() {
    const cy = Math.cos(this.cam.yaw);
    const sy = Math.sin(this.cam.yaw);
    const cp = Math.cos(this.cam.pitch);
    const sp = Math.sin(this.cam.pitch);

    // Forward vector
    const fwd = { x: cy * cp, y: sy * cp, z: sp };
    // Right vector (cross(fwd, worldUp(0,0,1)) normalized)
    const right = { x: -sy, y: cy, z: 0 };
    // Camera up vector (cross(right, fwd))
    const up = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    };
    const focal = (this.h * 0.5) / Math.tan(this.fov * 0.5);
    return { fwd, right, up, focal };
  }

  project(wx, wy, wz, basis) {
    const dx = wx - this.cam.x;
    const dy = wy - this.cam.y;
    const dz = wz - this.cam.z;

    const depth = dx * basis.fwd.x + dy * basis.fwd.y + dz * basis.fwd.z;
    if (depth < 0.15) return null;

    const rx = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
    const ry = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;

    return {
      sx: this.w * 0.5 + (rx / depth) * basis.focal,
      sy: this.h * 0.5 - (ry / depth) * basis.focal,
      depth,
      scale: basis.focal / depth,
    };
  }

  /**
   * Intersects a screen pointer coordinate with the z = 0 board plane -> { x, y } cell.
   */
  pickCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const basis = this.getCameraBasis();

    const ndcX = (sx - this.w * 0.5) / basis.focal;
    const ndcY = (this.h * 0.5 - sy) / basis.focal;

    // Ray direction in world space
    const dirX = basis.fwd.x + ndcX * basis.right.x + ndcY * basis.up.x;
    const dirY = basis.fwd.y + ndcX * basis.right.y + ndcY * basis.up.y;
    const dirZ = basis.fwd.z + ndcX * basis.right.z + ndcY * basis.up.z;

    if (Math.abs(dirZ) < 1e-4) return null;
    const t = -this.cam.z / dirZ;
    if (t <= 0) return null;

    const wx = this.cam.x + dirX * t;
    const wy = this.cam.y + dirY * t;
    const gx = Math.floor(wx);
    const gy = Math.floor(wy);
    if (gx < 0 || gx >= this.boardSize || gy < 0 || gy >= this.boardSize) return null;
    return { x: gx, y: gy, wx, wy };
  }

  projectCellToScreenPercent(gx, gy) {
    const basis = this.getCameraBasis();
    const p = this.project(gx + 0.5, gy + 0.5, 0.2, basis);
    if (!p) return { pctX: 50, pctY: 50 };
    return {
      pctX: Math.max(14, Math.min(86, (p.sx / this.w) * 100)),
      pctY: Math.max(16, Math.min(84, (p.sy / this.h) * 100)),
    };
  }

  /* ---------------- Smooth Angle Lerp ---------------- */

  stepCamera() {
    const k = this.camLerp;
    this.cam.x += (this.targetCam.x - this.cam.x) * k;
    this.cam.y += (this.targetCam.y - this.cam.y) * k;
    this.cam.z += (this.targetCam.z - this.cam.z) * k;
    this.cam.pitch += (this.targetCam.pitch - this.cam.pitch) * k;

    // Shortest-path yaw wrap
    let diff = this.targetCam.yaw - this.cam.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.cam.yaw += diff * k;
  }

  /* ---------------- 3D Drawing Primitives ---------------- */

  drawQuad(ctx, pts, fill, stroke = null, lineWidth = 1) {
    if (pts.some((p) => !p)) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  drawCylinderPiece(ctx, wx, wy, wz, radius, height, color, basis) {
    const bot = this.project(wx, wy, wz, basis);
    const top = this.project(wx, wy, wz + height, basis);
    if (!bot || !top) return;

    const rBot = Math.max(3, radius * bot.scale);
    const rTop = Math.max(3, radius * top.scale);
    const tilt = Math.max(0.28, Math.min(0.82, Math.abs(Math.sin(this.cam.pitch)) + 0.16));

    // Ground contact shadow
    const shadow = this.project(wx, wy, 0.01, basis);
    if (shadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
      ctx.beginPath();
      ctx.ellipse(shadow.sx, shadow.sy, rBot * 1.08, rBot * tilt * 1.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Extruded cylinder side body (darkened slightly for depth)
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(bot.sx, bot.sy, rBot, rBot * tilt, 0, 0, Math.PI);
    ctx.lineTo(top.sx - rTop, top.sy);
    ctx.ellipse(top.sx, top.sy, rTop, rTop * tilt, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();

    // Top beveled disc face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(top.sx, top.sy, rTop, rTop * tilt, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular rim & inner lathe groove
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = Math.max(1, rTop * 0.09);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(top.sx, top.sy, rTop * 0.64, rTop * tilt * 0.64, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const ctx = this.ctx;
    const theme = this.getTheme();
    const basis = this.getCameraBasis();
    const N = this.boardSize;

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    if (!this.board) return;

    // 1. Subtle 3D Board Base / Bumper Walls (height 0.28)
    const wallH = 0.28;
    const walls = [
      [[0, 0, 0], [N, 0, 0], [N, 0, wallH], [0, 0, wallH]],
      [[0, N, 0], [N, N, 0], [N, N, wallH], [0, N, wallH]],
      [[0, 0, 0], [0, N, 0], [0, N, wallH], [0, 0, wallH]],
      [[N, 0, 0], [N, N, 0], [N, N, wallH], [N, 0, wallH]],
    ];

    // Sort far walls behind board, near walls drawn lightly
    const wallDepths = walls.map((w) => {
      const mx = (w[0][0] + w[1][0]) / 2;
      const my = (w[0][1] + w[1][1]) / 2;
      const d = (mx - this.cam.x) ** 2 + (my - this.cam.y) ** 2;
      return { w, d };
    });
    wallDepths.sort((a, b) => b.d - a.d);

    // Draw the 2 far bumper walls first
    for (let i = 0; i < 2; i++) {
      const pts = wallDepths[i].w.map(([x, y, z]) => this.project(x, y, z, basis));
      this.drawQuad(ctx, pts, theme.frame, theme.rule, 1.2);
    }

    // 2. Floor Checkerboard Tiles
    const lineSet = new Set((this.preview?.line || []).map((c) => `${c.x},${c.y}`));
    const spawnSet = new Set((this.preview?.spawns || []).map((s) => `${s.toX},${s.toY}`));

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const pts = [
          this.project(x, y, 0, basis),
          this.project(x + 1, y, 0, basis),
          this.project(x + 1, y + 1, 0, basis),
          this.project(x, y + 1, 0, basis),
        ];
        const isLight = (x + y) % 2 === 0;
        const fill = isLight ? theme.light : theme.dark;
        this.drawQuad(ctx, pts, fill, 'rgba(255,255,255,0.04)', 0.75);

        const key = `${x},${y}`;
        if (lineSet.has(key)) {
          this.drawQuad(ctx, pts, 'rgba(217, 160, 54, 0.16)');
        }
        if (this.selectedCell && this.selectedCell.x === x && this.selectedCell.y === y) {
          this.drawQuad(ctx, pts, 'rgba(217, 160, 54, 0.22)', theme.accent, 2);
        }
        if (spawnSet.has(key)) {
          const c = this.project(x + 0.5, y + 0.5, 0.02, basis);
          if (c) {
            ctx.save();
            ctx.strokeStyle = theme.accent;
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.ellipse(c.sx, c.sy, 0.34 * c.scale, 0.34 * c.scale * 0.52, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    // 3. 3D Trajectory Laser Preview (if aiming)
    if (this.preview?.hopSteps?.length) {
      ctx.save();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      const first = this.preview.hopSteps[0];
      const p0 = this.project(first.fromX + 0.5, first.fromY + 0.5, 0.28, basis);
      if (p0) {
        ctx.moveTo(p0.sx, p0.sy);
        for (let i = 0; i < Math.min(this.preview.hopSteps.length, 10); i++) {
          const st = this.preview.hopSteps[i];
          const p = this.project(st.toX + 0.5, st.toY + 0.5, 0.28, basis);
          if (p) ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Painter's-Algorithm Sorted 3D Pieces (Back-to-Front)
    const drawList = [];
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const [p1, p2] = this.board[x][y];
        if (p1 === 0 && p2 === 0) continue;
        const depth = (x + 0.5 - this.cam.x) * basis.fwd.x + (y + 0.5 - this.cam.y) * basis.fwd.y;
        drawList.push({ x, y, p1, p2, depth });
      }
    }
    if (this.hopper) {
      const h = this.hopper;
      const depth = (h.x - this.cam.x) * basis.fwd.x + (h.y - this.cam.y) * basis.fwd.y;
      drawList.push({ isHopper: true, ...h, depth });
    }
    drawList.sort((a, b) => b.depth - a.depth);

    for (const item of drawList) {
      if (item.isHopper) {
        const col = item.player === 1 ? theme.p1 : theme.p2;
        this.drawCylinderPiece(ctx, item.x, item.y, item.z, 0.34, 0.18, col, basis);
        continue;
      }

      const cx = item.x + 0.5;
      const cy = item.y + 0.5;
      if (item.p1 === 1 && item.p2 === 0) {
        this.drawCylinderPiece(ctx, cx, cy, 0, 0.34, 0.18, theme.p1, basis);
      } else if (item.p2 === 1 && item.p1 === 0) {
        this.drawCylinderPiece(ctx, cx, cy, 0, 0.34, 0.18, theme.p2, basis);
      } else {
        // Shared or stacked double piece in 3D!
        let zOff = 0;
        for (let k = 0; k < item.p1; k++) {
          const ox = item.p2 > 0 ? -0.14 : 0;
          this.drawCylinderPiece(ctx, cx + ox, cy, zOff, 0.28, 0.16, theme.p1, basis);
          zOff += 0.16;
        }
        let zOff2 = 0;
        for (let k = 0; k < item.p2; k++) {
          const ox = item.p1 > 0 ? 0.14 : 0;
          this.drawCylinderPiece(ctx, cx + ox, cy, zOff2, 0.28, 0.16, theme.p2, basis);
          zOff2 += 0.16;
        }
      }
    }

    // 5. 3D Rings & Particles
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= r.decay;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const p = this.project(r.x, r.y, 0.04, basis);
      if (!p) continue;
      const rad = (r.r + (r.maxR - r.r) * (1 - r.life)) * p.scale;
      ctx.save();
      ctx.globalAlpha = r.life * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, rad, rad * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.z = Math.max(0.02, pt.z + pt.vz);
      pt.vz -= 0.012;
      pt.life -= pt.decay;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      const proj = this.project(pt.x, pt.y, pt.z, basis);
      if (!proj) continue;
      ctx.save();
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, Math.max(1.5, 0.07 * proj.scale * pt.life), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  loop() {
    if (this.active) {
      this.stepCamera();
      this.render();
    }
    requestAnimationFrame(this.loop);
  }
}
