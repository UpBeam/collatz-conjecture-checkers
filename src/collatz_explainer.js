/**
 * Interactive Visual Collatz Conjecture Explainer
 *
 * Demonstrates the exact 1-to-1 equivalence between a Collatz Conjecture Checkers
 * move on a 1D line and the binary Collatz step (3n + 1) / 2^k:
 *   1. Pieces on a line represent binary bits of an odd integer n (LSB on left).
 *   2. Replicating each piece 1 tile right computes n + 2n = 3n.
 *   3. Hopping the backmost piece (and resolving double carries) computes +1
 *      and strips trailing zeros (÷ 2^k), landing on the next odd Collatz number!
 */

const STRIP_LEN = 10;

function toBits(n) {
  const bits = new Array(STRIP_LEN).fill(0);
  let v = n;
  for (let i = 0; i < STRIP_LEN && v > 0; i++) {
    bits[i] = v & 1;
    v >>= 1;
  }
  return bits;
}

function fromBits(bits) {
  let n = 0;
  for (let i = 0; i < bits.length; i++) {
    n += bits[i] * (1 << i);
  }
  return n;
}

function normalizeOdd(bits) {
  // Find index of lowest set bit (trailing zeros = ÷ 2^k)
  const first = bits.findIndex((b) => b > 0);
  if (first <= 0) return { bits: [...bits], shift: 0 };
  const shifted = new Array(STRIP_LEN).fill(0);
  for (let i = first; i < bits.length; i++) {
    shifted[i - first] = bits[i];
  }
  return { bits: shifted, shift: first };
}

export class CollatzExplainer {
  constructor(rootEl, sound) {
    this.root = rootEl;
    this.sound = sound;
    this.bits = toBits(7); // Default classic hailstone seed: 7 -> 11 -> 17 -> 13 -> 5 -> 1
    this.phase = 'idle';   // 'idle' | 'replicated' | 'hopped'
    this.trail = [7];
    this.lastEq = 'n = 7';
    this.lastShift = 0;

    this.renderShell();
    this.bind();
    this.update();
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="cx-presets" id="cx-presets">
        <button class="seg-btn" data-seed="5">5</button>
        <button class="seg-btn active" data-seed="7">7</button>
        <button class="seg-btn" data-seed="9">9</button>
        <button class="seg-btn" data-seed="11">11</button>
        <button class="seg-btn" data-seed="15">15</button>
      </div>

      <div class="cx-readout">
        <div class="cx-eq" id="cx-eq">n = 7</div>
        <div class="cx-sub" id="cx-sub">Tap squares to toggle bits · LSB on left</div>
      </div>

      <div class="cx-strip" id="cx-strip" aria-label="Binary checker line"></div>

      <div class="cx-steps-legend">
        <div class="cx-pill" data-phase="idle"><strong>n</strong><span>Line</span></div>
        <div class="cx-pill" data-phase="replicated"><strong>+2n</strong><span>Clone →</span></div>
        <div class="cx-pill" data-phase="hopped"><strong>+1, ÷2ᵏ</strong><span>Hop &amp; Carry</span></div>
      </div>

      <div class="cx-spark-wrap">
        <svg id="cx-spark" class="cx-spark" viewBox="0 0 320 56" preserveAspectRatio="none"></svg>
        <div class="cx-trail" id="cx-trail">7</div>
      </div>

      <div class="cx-actions">
        <button class="btn primary" id="cx-step" style="flex: 1;">Step: Clone (+2n)</button>
        <button class="btn" id="cx-reset">Reset</button>
      </div>

      <p class="cx-caption">
        Every move clones your pieces 1 tile ahead (<strong>3n</strong>), then hops the back piece through carries (<strong>+1</strong>) to the next empty square. On the 8×8 board, two players collide in 8 directions with edge reflections.
      </p>
    `;

    this.elStrip = this.root.querySelector('#cx-strip');
    this.elEq = this.root.querySelector('#cx-eq');
    this.elSub = this.root.querySelector('#cx-sub');
    this.elStep = this.root.querySelector('#cx-step');
    this.elReset = this.root.querySelector('#cx-reset');
    this.elSpark = this.root.querySelector('#cx-spark');
    this.elTrail = this.root.querySelector('#cx-trail');
  }

  bind() {
    this.root.querySelectorAll('#cx-presets .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const seed = Number(btn.dataset.seed);
        this.setSeed(seed);
        this.sound?.playSelect();
      });
    });

    this.elStep.addEventListener('click', () => this.advancePhase());
    this.elReset.addEventListener('click', () => {
      this.setSeed(this.trail[0] || 7);
      this.sound?.playSelect();
    });
  }

  setSeed(n) {
    this.bits = toBits(n);
    this.phase = 'idle';
    this.trail = [n];
    this.lastEq = `n = ${n}`;
    this.lastShift = 0;

    this.root.querySelectorAll('#cx-presets .seg-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.seed) === n);
    });
    this.update();
  }

  toggleBit(idx) {
    if (this.phase !== 'idle') return;
    if (idx > 6) return; // keep room for 3n+1 expansion within 10 cells
    this.bits[idx] = this.bits[idx] ? 0 : 1;
    // Keep at least bit 0 or some bit set
    const val = fromBits(this.bits);
    if (val === 0) {
      this.bits[0] = 1;
    }
    const { bits: norm } = normalizeOdd(this.bits);
    this.bits = norm;
    const oddVal = fromBits(this.bits);
    this.trail = [oddVal];
    this.lastEq = `n = ${oddVal}`;
    this.root.querySelectorAll('#cx-presets .seg-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.seed) === oddVal);
    });
    this.sound?.playSelect();
    this.update();
  }

  advancePhase() {
    if (this.phase === 'idle') {
      const n = fromBits(this.bits);
      if (n <= 1) {
        this.setSeed(7);
        return;
      }
      // Phase 1: Replicate every piece 1 tile right (+2n => 3n)
      const next = [...this.bits];
      for (let i = STRIP_LEN - 2; i >= 0; i--) {
        if (this.bits[i] > 0) {
          next[i + 1] += 1;
        }
      }
      this.bits = next;
      this.phase = 'replicated';
      this.lastEq = `${n} + ${2 * n} = ${3 * n}`;
      this.sound?.playReplicate(3);
      this.update();
      return;
    }

    if (this.phase === 'replicated') {
      // Phase 2: Hop backmost piece + resolve any double carries (3n + 1)
      const valBefore = fromBits(this.bits);
      const next = [...this.bits];
      const back = next.findIndex((b) => b > 0);
      if (back !== -1) {
        // Lift backmost piece and hop right, eating 1 per occupied cell until empty
        next[back] -= 1;
        let idx = back + 1;
        while (idx < STRIP_LEN) {
          if (next[idx] === 0) {
            next[idx] = 1;
            break;
          }
          next[idx] -= 1;
          idx++;
        }
        // Resolve any remaining double pieces (Sam's carry rule)
        let guard = 0;
        while (guard++ < 16) {
          const dbl = next.findIndex((b) => b >= 2);
          if (dbl === -1) break;
          next[dbl] -= 2;
          let j = dbl + 1;
          while (j < STRIP_LEN) {
            if (next[j] === 0) {
              next[j] = 1;
              break;
            }
            next[j] -= 1;
            j++;
          }
        }
      }

      const afterHop = fromBits(next);
      const { bits: oddBits, shift } = normalizeOdd(next);
      const oddVal = fromBits(oddBits);

      this.bits = next;
      this.phase = 'hopped';
      this.lastShift = shift;
      this.lastEq = `${valBefore} + 1 = ${afterHop}  →  ÷${1 << shift} = ${oddVal}`;
      this.sound?.playHop(2, true);
      this.update();
      return;
    }

    if (this.phase === 'hopped') {
      // Normalize (strip trailing empty squares on left) for the next odd Collatz step
      const { bits: oddBits } = normalizeOdd(this.bits);
      this.bits = oddBits;
      const oddVal = fromBits(oddBits);
      this.trail.push(oddVal);
      this.phase = 'idle';
      this.lastEq = oddVal === 1 ? 'Reached 1!' : `n = ${oddVal}`;
      this.sound?.playLand();
      if (oddVal === 1) this.sound?.playVictory();
      this.update();
    }
  }

  renderSparkline() {
    const vals = this.trail;
    this.elTrail.textContent = vals.join(' → ');

    const w = 320;
    const h = 56;
    const padX = 12;
    const padY = 10;
    const maxV = Math.max(2, ...vals);

    if (vals.length === 1) {
      const y = h / 2;
      this.elSpark.innerHTML = `<circle cx="${padX}" cy="${y}" r="3.5" fill="var(--accent)"/>`;
      return;
    }

    const pts = vals.map((v, i) => {
      const x = padX + (i / (vals.length - 1)) * (w - padX * 2);
      const y = h - padY - ((v - 1) / Math.max(1, maxV - 1)) * (h - padY * 2);
      return { x, y };
    });

    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = pts
      .map((p, i) => {
        const isLast = i === pts.length - 1;
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 3.5 : 2.2}" fill="${isLast ? 'var(--accent)' : 'var(--ink-2)'}"/>`;
      })
      .join('');

    this.elSpark.innerHTML = `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }

  update() {
    this.elEq.textContent = this.lastEq;

    if (this.phase === 'idle') {
      const val = fromBits(this.bits);
      this.elSub.textContent = val === 1 ? 'Every tested number eventually reaches 1' : 'Tap squares to edit bits · LSB on left';
      this.elStep.textContent = val <= 1 ? 'Try 7 again' : '1. Clone right (+2n)';
    } else if (this.phase === 'replicated') {
      this.elSub.textContent = 'Each piece cloned 1 tile right (doubles = binary 2s)';
      this.elStep.textContent = '2. Hop back piece (+1)';
    } else {
      this.elSub.textContent = `Trailing ${this.lastShift} empty square${this.lastShift === 1 ? '' : 's'} = ÷${1 << this.lastShift}`;
      this.elStep.textContent = '3. Shift to next odd n';
    }

    this.root.querySelectorAll('.cx-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.phase === this.phase);
    });

    // Render 10-cell binary checker strip
    this.elStrip.innerHTML = '';
    for (let i = 0; i < STRIP_LEN; i++) {
      const count = this.bits[i];
      const cell = document.createElement('button');
      cell.className = `cx-cell${i % 2 === 0 ? ' light' : ' dark'}${this.phase === 'hopped' && i < this.lastShift ? ' faded' : ''}`;
      cell.type = 'button';
      cell.title = `2^${i} = ${1 << i}`;

      let inner = `<span class="cx-pow">${1 << i}</span>`;
      if (count === 1) {
        inner += `<span class="cx-disc"></span>`;
      } else if (count >= 2) {
        inner += `<span class="cx-disc dbl-a"></span><span class="cx-disc dbl-b"></span>`;
      }
      cell.innerHTML = inner;
      cell.addEventListener('click', () => this.toggleBit(i));
      this.elStrip.appendChild(cell);
    }

    this.renderSparkline();
  }
}
