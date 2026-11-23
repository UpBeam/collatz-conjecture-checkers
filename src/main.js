/**
 * Collatz Conjecture Checkers — Main Controller (Icon-First, Zero-Slop UI)
 */

import {
  BOARD_SIZE,
  DIRECTIONS,
  countPieces,
  createInitialState,
  executeMove,
  getBoardHash,
  isValidMove,
  previewMove,
} from './engine.js';
import { chooseAIMove } from './ai.js';
import { GameHistory } from './history.js';
import { SoundEngine } from './audio.js';
import { FXLayer } from './fx.js';
import { MonetizationManager, THEMES } from './monetization.js';
import { TUTORIAL_STEPS } from './tutorial.js';
import { ICONS } from './icons.js';

const DIR_ARROWS = {
  n: '↑', ne: '↗', e: '→', se: '↘',
  s: '↓', sw: '↙', w: '←', nw: '↖',
};

const MODE_META = {
  pvp:         { label: '2P Local',    pips: 0 },
  'ai-easy':   { label: 'AI · Easy',   pips: 1 },
  'ai-medium': { label: 'AI · Medium', pips: 2 },
  'ai-hard':   { label: 'AI · Hard',   pips: 3 },
};

const MODE_ORDER = ['ai-easy', 'ai-medium', 'ai-hard', 'pvp'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CollatzGameApp {
  constructor() {
    this.sound = new SoundEngine();
    this.monetization = new MonetizationManager();
    this.monetization.applySavedTheme();
    this.sound.setTheme(this.monetization.currentTheme);

    this.mode = 'ai-medium';
    this.startingRows = 2; // 2 = Balanced (8 pieces), 3 = Classic (12 pieces)
    this.fastMode = false;
    this.history = new GameHistory(createInitialState(BOARD_SIZE, this.startingRows));
    this.isAnimating = false;
    this.isReplaying = false;
    this.matchStats = { captures: 0, bounces: 0 };

    this.selectedCell = null;
    this.dragState = null;
    this.lastAimDirId = null;

    this.tutorialActive = false;
    this.tutorialIndex = 0;

    this.el = {
      boardFrame: document.getElementById('board-frame'),
      boardGrid: document.getElementById('board-grid'),
      fxCanvas: document.getElementById('fx-canvas'),
      dirWheel: document.getElementById('dir-wheel'),
      telemetry: document.getElementById('telemetry-bar'),
      pillP1: document.getElementById('pill-p1'),
      pillP2: document.getElementById('pill-p2'),
      p1Count: document.getElementById('p1-count'),
      p2Count: document.getElementById('p2-count'),
      turnBadge: document.getElementById('turn-badge'),
      btnUndo: document.getElementById('btn-undo'),
      btnRedo: document.getElementById('btn-redo'),
      btnMode: document.getElementById('btn-mode'),
      btnNew: document.getElementById('btn-new'),
      btnSound: document.getElementById('btn-sound'),
      btnThemes: document.getElementById('btn-themes'),
      btnHistory: document.getElementById('btn-history'),
      btnTutorial: document.getElementById('btn-tutorial'),
      btnSettings: document.getElementById('btn-settings'),
      adBanner: document.getElementById('ad-banner-slot'),
      btnRemoveAds: document.getElementById('btn-remove-ads'),
      toast: document.getElementById('toast'),
      // Settings toggles
      toggleSound: document.getElementById('toggle-sound'),
      toggleHaptics: document.getElementById('toggle-haptics'),
      toggleFast: document.getElementById('toggle-fast'),
      // Modals
      themeList: document.getElementById('theme-list'),
      iapBox: document.getElementById('iap-box'),
      historyList: document.getElementById('history-list'),
      btnReplayPlay: document.getElementById('btn-replay-play'),
      victoryIcon: document.getElementById('victory-icon'),
      // Tutorial
      tutBanner: document.getElementById('tutorial-banner'),
      tutTag: document.getElementById('tutorial-step-tag'),
      tutTitle: document.getElementById('tutorial-title'),
      tutBody: document.getElementById('tutorial-body'),
      btnTutSkip: document.getElementById('btn-tutorial-skip'),
      btnTutNext: document.getElementById('btn-tutorial-next'),
    };

    this.fx = new FXLayer(this.el.fxCanvas, this.el.boardFrame);
    this.cellEls = [];

    this.injectIcons();
    this.buildBoardDOM();
    this.buildDirWheelDOM();
    this.bindEvents();
    this.updateAdSlot();
    this.renderThemesModal();
    this.syncUI();
  }

  get state() {
    return this.history.state;
  }

  get speedScale() {
    return this.fastMode ? 1.85 : 1;
  }

  isAITurn(st = this.state) {
    return !this.tutorialActive && this.mode.startsWith('ai-') && st.currentPlayer === 2 && st.winner === 0;
  }

  injectIcons() {
    this.el.btnTutorial.innerHTML = ICONS.help;
    this.el.btnHistory.innerHTML = ICONS.history;
    this.el.btnThemes.innerHTML = ICONS.themes;
    this.el.btnSettings.innerHTML = ICONS.settings;
    this.el.btnUndo.innerHTML = ICONS.undo;
    this.el.btnRedo.innerHTML = ICONS.redo;
    this.el.btnNew.innerHTML = ICONS.restart;
    this.el.btnReplayPlay.innerHTML = `${ICONS.play}<span>Replay</span>`;
    this.el.victoryIcon.innerHTML = ICONS.trophy;

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      if (btn.classList.contains('icon-btn')) {
        btn.innerHTML = ICONS.close;
      }
    });
  }

  /* ---------------- DOM Construction ---------------- */

  buildBoardDOM() {
    this.el.boardGrid.innerHTML = '';
    this.cellEls = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE));

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = document.createElement('div');
        cell.className = `cell ${(x + y) % 2 === 0 ? 'light' : 'dark'}`;
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Column ${x + 1}, Row ${y + 1}`);
        this.el.boardGrid.appendChild(cell);
        this.cellEls[x][y] = cell;
      }
    }
  }

  buildDirWheelDOM() {
    this.el.dirWheel.innerHTML = '';
    const radius = 52;
    for (const dir of DIRECTIONS) {
      const btn = document.createElement('button');
      btn.className = 'dir-btn';
      btn.dataset.dir = dir.id;
      btn.textContent = DIR_ARROWS[dir.id];
      btn.setAttribute('aria-label', dir.label);
      const rad = (dir.angle * Math.PI) / 180;
      btn.style.setProperty('--tx', `${Math.round(Math.cos(rad) * radius)}px`);
      btn.style.setProperty('--ty', `${Math.round(Math.sin(rad) * radius)}px`);

      btn.addEventListener('pointerenter', () => {
        if (this.selectedCell) {
          this.showMovePreview(this.selectedCell.x, this.selectedCell.y, dir);
        }
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.selectedCell) {
          const { x, y } = this.selectedCell;
          this.clearSelection();
          this.commitMove(x, y, dir.dx, dir.dy);
        }
      });

      this.el.dirWheel.appendChild(btn);
    }
  }

  /* ---------------- Event Binding ---------------- */

  bindEvents() {
    this.el.boardGrid.addEventListener('pointerdown', (e) => this.onBoardPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onWindowPointerMove(e));
    window.addEventListener('pointerup', () => this.onWindowPointerUp());

    document.addEventListener('pointerdown', (e) => {
      if (!this.el.boardFrame.contains(e.target) && this.selectedCell) {
        this.clearSelection();
      }
    });

    this.el.btnUndo.addEventListener('click', () => this.handleUndo());
    this.el.btnRedo.addEventListener('click', () => this.handleRedo());
    this.el.btnNew.addEventListener('click', () => this.startNewMatch());
    this.el.btnSettings.addEventListener('click', () => {
      this.syncSettingsModal();
      this.openModal('modal-settings');
    });
    this.el.btnThemes.addEventListener('click', () => {
      this.renderThemesModal();
      this.openModal('modal-themes');
    });
    this.el.btnHistory.addEventListener('click', () => {
      this.renderHistoryModal();
      this.openModal('modal-history');
    });
    this.el.btnTutorial.addEventListener('click', () => this.startTutorial());

    // Quick-cycle opponent mode on dock icon click
    this.el.btnMode.addEventListener('click', () => {
      const idx = MODE_ORDER.indexOf(this.mode);
      this.setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length]);
    });

    this.el.btnSound.addEventListener('click', () => this.toggleSound());

    this.el.btnRemoveAds.addEventListener('click', () => {
      this.renderThemesModal();
      this.openModal('modal-themes');
    });

    // Modal close buttons & backdrop click
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.add('hidden');
      });
    });

    // Settings modal controls
    document.querySelectorAll('#mode-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMode(btn.dataset.mode);
        this.syncSettingsModal();
      });
    });
    document.querySelectorAll('#setup-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rows = Number(btn.dataset.rows);
        if (this.startingRows !== rows) {
          this.startingRows = rows;
          this.exitTutorial(false);
          this.startNewMatch();
          this.syncSettingsModal();
          this.showToast(rows === 2 ? 'Balanced (8)' : 'Classic (12)');
        }
      });
    });
    this.el.toggleSound.addEventListener('click', () => this.toggleSound());
    this.el.toggleHaptics.addEventListener('click', () => {
      this.sound.setHapticsEnabled(!this.sound.hapticsEnabled);
      this.syncSettingsModal();
      if (this.sound.hapticsEnabled) this.sound.haptic(10);
    });
    this.el.toggleFast.addEventListener('click', () => {
      this.fastMode = !this.fastMode;
      this.syncSettingsModal();
      this.sound.playSelect();
    });

    // Theme Pack IAP
    document.getElementById('btn-unlock-pack').addEventListener('click', async () => {
      const res = await this.monetization.purchaseThemePack();
      this.showToast(res.message);
      if (res.ok) {
        this.sound.playVictory();
        this.renderThemesModal();
        this.updateAdSlot();
      }
    });
    document.getElementById('btn-restore-iap').addEventListener('click', async () => {
      const res = await this.monetization.restorePurchases();
      this.showToast(res.message);
      this.renderThemesModal();
      this.updateAdSlot();
    });

    // History & Victory
    this.el.btnReplayPlay.addEventListener('click', () => {
      this.closeModal('modal-history');
      this.playFullReplay();
    });
    document.getElementById('btn-victory-rematch').addEventListener('click', () => {
      this.closeModal('modal-victory');
      this.startNewMatch();
    });
    document.getElementById('btn-victory-replay').addEventListener('click', () => {
      this.closeModal('modal-victory');
      this.playFullReplay();
    });

    // Tutorial
    this.el.btnTutSkip.addEventListener('click', () => this.exitTutorial(true));
    this.el.btnTutNext.addEventListener('click', () => this.advanceTutorial());
  }

  setMode(newMode) {
    if (this.mode === newMode) return;
    this.mode = newMode;
    this.exitTutorial(false);
    this.startNewMatch();
    this.showToast(MODE_META[newMode].label);
  }

  toggleSound() {
    this.sound.setEnabled(!this.sound.enabled);
    if (this.sound.enabled) this.sound.playSelect();
    this.syncSoundControls();
  }

  syncSoundControls() {
    this.el.btnSound.innerHTML = this.sound.enabled ? ICONS.soundOn : ICONS.soundOff;
    this.el.btnSound.setAttribute('data-tip', this.sound.enabled ? 'Sound on' : 'Sound off');
    this.el.toggleSound.setAttribute('aria-pressed', String(this.sound.enabled));
  }

  syncSettingsModal() {
    document.querySelectorAll('#mode-segmented .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });
    document.querySelectorAll('#setup-segmented .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.rows) === this.startingRows);
    });
    this.syncSoundControls();
    this.el.toggleHaptics.setAttribute('aria-pressed', String(this.sound.hapticsEnabled));
    this.el.toggleFast.setAttribute('aria-pressed', String(this.fastMode));
  }

  /* ---------------- Drag-to-Aim & Tap-to-Aim ---------------- */

  getCellFromPoint(clientX, clientY) {
    const rect = this.el.boardGrid.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * BOARD_SIZE);
    const y = Math.floor(((clientY - rect.top) / rect.height) * BOARD_SIZE);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
    return { x, y };
  }

  getDirectionFromVector(dxPx, dyPx) {
    const angleDeg = (Math.atan2(dyPx, dxPx) * 180) / Math.PI;
    let best = DIRECTIONS[0];
    let bestDiff = Infinity;
    for (const dir of DIRECTIONS) {
      let diff = Math.abs(angleDeg - dir.angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = dir;
      }
    }
    return best;
  }

  onBoardPointerDown(e) {
    if (this.isAnimating || this.isReplaying || this.isAITurn()) return;
    if (this.state.winner !== 0) return;

    const hit = this.getCellFromPoint(e.clientX, e.clientY);
    if (!hit) return;

    const pIdx = this.state.currentPlayer - 1;
    if (this.state.board[hit.x][hit.y][pIdx] <= 0) {
      this.clearSelection();
      return;
    }

    e.preventDefault();
    this.sound.ensureContext();
    this.sound.playSelect();

    this.dragState = {
      x: hit.x,
      y: hit.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasDragged: false,
      aimedDir: null,
    };
    this.lastAimDirId = null;
    this.clearSelection();
    this.cellEls[hit.x][hit.y].classList.add('selected');
  }

  onWindowPointerMove(e) {
    if (!this.dragState) return;
    const dxPx = e.clientX - this.dragState.startClientX;
    const dyPx = e.clientY - this.dragState.startClientY;
    const dist = Math.hypot(dxPx, dyPx);

    if (dist >= 18) {
      this.dragState.hasDragged = true;
      const dir = this.getDirectionFromVector(dxPx, dyPx);
      this.dragState.aimedDir = dir;
      if (dir.id !== this.lastAimDirId) {
        this.lastAimDirId = dir.id;
        this.sound.playAimTick();
        this.showMovePreview(this.dragState.x, this.dragState.y, dir);
      }
    } else if (this.dragState.hasDragged) {
      this.dragState.aimedDir = null;
      this.lastAimDirId = null;
      this.clearPreviewHighlights();
    }
  }

  onWindowPointerUp() {
    if (!this.dragState) return;
    const ds = this.dragState;
    this.dragState = null;

    if (ds.hasDragged && ds.aimedDir) {
      this.clearSelection();
      this.commitMove(ds.x, ds.y, ds.aimedDir.dx, ds.aimedDir.dy);
      return;
    }

    this.openDirWheel(ds.x, ds.y);
  }

  openDirWheel(x, y) {
    this.selectedCell = { x, y };
    this.clearPreviewHighlights();
    this.cellEls[x][y].classList.add('selected');

    const pctX = Math.max(16, Math.min(84, ((x + 0.5) / BOARD_SIZE) * 100));
    const pctY = Math.max(16, Math.min(84, ((y + 0.5) / BOARD_SIZE) * 100));
    this.el.dirWheel.style.left = `${pctX}%`;
    this.el.dirWheel.style.top = `${pctY}%`;
    this.el.dirWheel.classList.remove('hidden');
  }

  clearPreviewHighlights() {
    this.fx.clearPreview();
    this.el.telemetry.classList.remove('visible');
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        this.cellEls[x][y].classList.remove('in-line', 'spawn-target', 'land-target');
      }
    }
  }

  clearSelection() {
    this.selectedCell = null;
    this.el.dirWheel.classList.add('hidden');
    this.clearPreviewHighlights();
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        this.cellEls[x][y].classList.remove('selected');
      }
    }
  }

  showMovePreview(x, y, dir) {
    this.clearPreviewHighlights();
    const prev = previewMove(this.state, x, y, dir.dx, dir.dy);
    if (!prev) return;

    for (const c of prev.line) {
      this.cellEls[c.x][c.y].classList.add('in-line');
    }
    for (const sp of prev.spawns) {
      this.cellEls[sp.toX][sp.toY].classList.add('spawn-target');
    }
    const lastStep = prev.hopSteps[prev.hopSteps.length - 1];
    if (lastStep) {
      this.cellEls[lastStep.toX][lastStep.toY].classList.add('land-target');
    }

    this.fx.setPreview({
      originX: x,
      originY: y,
      dx: dir.dx,
      dy: dir.dy,
      hopSteps: prev.hopSteps,
    });

    // Silent icon-only telemetry (no prose sentences)
    const s = prev.summary;
    const chips = [
      `<span class="telemetry-chip">${DIR_ARROWS[dir.id]}</span>`,
      `<span class="telemetry-bin">${s.binaryBefore}₂</span>`,
      `<span class="telemetry-chip" title="Hops">${ICONS.hop}${s.hops}</span>`,
    ];
    if (s.opponentCaptures > 0) {
      chips.push(`<span class="telemetry-chip accent" title="Captures">${ICONS.capture}+${s.opponentCaptures}</span>`);
    }
    if (s.bounces > 0) {
      chips.push(`<span class="telemetry-chip accent" title="Bounces">${ICONS.bounce}${s.bounces}</span>`);
    }
    this.el.telemetry.innerHTML = chips.join('');
    this.el.telemetry.classList.add('visible');
  }

  /* ---------------- Move Execution & Animation ---------------- */

  async commitMove(x, y, dx, dy) {
    if (this.isAnimating) return;
    const currentState = this.state;
    if (!isValidMove(currentState, x, y, dx, dy)) return;

    this.isAnimating = true;
    this.clearSelection();

    const { nextState, events, summary } = executeMove(currentState, x, y, dx, dy);

    // Super-Ko: block moves that repeat a previously seen board state
    if (!this.tutorialActive) {
      const seen = this.history.getSeenHashes();
      const nextHash = getBoardHash(nextState.board, nextState.currentPlayer);
      if (seen.has(nextHash)) {
        this.isAnimating = false;
        this.sound.playAimTick();
        this.showToast('Repeat blocked (Ko)');
        return;
      }
    }

    await this.playMoveEvents(events, this.speedScale);

    this.history.push(nextState, { x, y, dx, dy }, summary, events);
    this.matchStats.captures += summary.opponentCaptures;
    this.matchStats.bounces += summary.bounces;

    this.isAnimating = false;
    this.syncUI();

    if (this.tutorialActive) {
      this.el.btnTutNext.textContent =
        this.tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Play' : 'Next';
      return;
    }

    if (nextState.winner !== 0) {
      this.handleVictory(nextState.winner);
      return;
    }

    if (this.isAITurn(nextState)) {
      this.runAITurn();
    }
  }

  async playMoveEvents(events, speedScale = 1) {
    const colors = this.fx.getThemeColors();

    for (const ev of events) {
      if (ev.type === 'select_line') {
        for (const c of ev.line) {
          this.cellEls[c.x][c.y].classList.add('in-line');
        }
        await sleep(95 / speedScale);
      } else if (ev.type === 'replicate') {
        this.renderBoard(ev.boardAfter, ev.spawns.map((s) => `${s.toX},${s.toY}`));
        this.sound.playReplicate(ev.spawns.length);
        const col = ev.player === 1 ? colors.p1 : colors.p2;
        for (const sp of ev.spawns) {
          this.fx.spawnRing(sp.toX, sp.toY, col, 0.52);
          if (sp.bounced) {
            this.fx.spawnWallSparks(sp.toX, sp.toY, sp.bouncedX, sp.bouncedY, colors.accent);
            this.sound.playBounce();
          }
        }
        await sleep(230 / speedScale);
      } else if (ev.type === 'hop_start') {
        this.renderBoard(ev.boardAfter);
        if (ev.isDoubleCarry) {
          this.sound.playDoubleCarry();
          this.fx.spawnRing(ev.x, ev.y, colors.accent, 0.72);
          await sleep(140 / speedScale);
        }
      } else if (ev.type === 'hop_step') {
        const hopMs = Math.max(70, 140 / speedScale);
        await this.fx.animateHopArc(ev.fromX, ev.fromY, ev.toX, ev.toY, ev.player, hopMs);

        if (ev.bounced) {
          this.sound.playBounce();
          this.fx.spawnWallSparks(ev.toX, ev.toY, ev.bouncedX, ev.bouncedY, colors.accent);
          this.fx.shake(2.5, 85);
        }

        this.renderBoard(ev.boardAfter, ev.landed ? [`${ev.toX},${ev.toY}`] : []);

        if (ev.landed) {
          this.sound.playLand();
          const col = ev.player === 1 ? colors.p1 : colors.p2;
          this.fx.spawnRing(ev.toX, ev.toY, col, 0.56);
        } else {
          const isOppCapture = ev.eaten !== ev.player;
          this.sound.playHop(ev.stepIndex, isOppCapture);
          const eatenCol = ev.eaten === 1 ? colors.p1 : colors.p2;
          this.fx.spawnBurst(ev.toX, ev.toY, eatenCol, isOppCapture ? 14 : 8, isOppCapture ? 3.2 : 2.1);
          if (isOppCapture) {
            this.fx.spawnRing(ev.toX, ev.toY, colors.accent, 0.68);
            this.fx.shake(3.5, 95);
          }
        }
      } else if (ev.type === 'turn_end') {
        this.clearPreviewHighlights();
      }
    }
  }

  async runAITurn() {
    await sleep(340 / this.speedScale);
    if (this.isAnimating || !this.isAITurn()) return;

    const diff = this.mode.replace('ai-', '');
    const seen = this.history.getSeenHashes();
    const move = chooseAIMove(this.state, diff, seen);
    if (move) {
      await this.commitMove(move.x, move.y, move.dx, move.dy);
    } else {
      // No legal non-repeating move -> active player loses by Super-Ko
      this.handleVictory(1);
    }
  }

  /* ---------------- Rendering ---------------- */

  renderBoard(board, popKeys = []) {
    const popSet = new Set(popKeys);
    const activePlayer = this.state.currentPlayer;
    const canInteract = !this.isAnimating && !this.isReplaying && !this.isAITurn() && this.state.winner === 0;

    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        const cellEl = this.cellEls[x][y];
        const [p1, p2] = board[x][y];
        const hasOwn = canInteract && (activePlayer === 1 ? p1 > 0 : p2 > 0);
        cellEl.classList.toggle('selectable', hasOwn);

        const total = p1 + p2;
        if (total === 0) {
          cellEl.innerHTML = '';
          continue;
        }

        const popClass = popSet.has(`${x},${y}`) ? ' pop-in' : '';
        let html = '<div class="piece-stack">';

        if (p1 === 1 && p2 === 0) {
          html += `<div class="piece p1${popClass}"></div>`;
        } else if (p2 === 1 && p1 === 0) {
          html += `<div class="piece p2${popClass}"></div>`;
        } else {
          const pieces = [];
          for (let k = 0; k < Math.min(p1, 2); k++) pieces.push('p1');
          for (let k = 0; k < Math.min(p2, 2); k++) pieces.push('p2');
          const slots = ['slot-a', 'slot-b', 'slot-c'];
          pieces.slice(0, 3).forEach((cls, idx) => {
            html += `<div class="piece ${cls} mini ${slots[idx]}${popClass}"></div>`;
          });
          if (p1 >= 2 || p2 >= 2) {
            html += `<span class="piece-count-badge">${Math.max(p1, p2)}</span>`;
          }
        }

        html += '</div>';
        cellEl.innerHTML = html;
      }
    }
  }

  syncUI() {
    const st = this.state;
    this.renderBoard(st.board);

    const counts = countPieces(st.board);
    this.el.p1Count.textContent = counts.p1;
    this.el.p2Count.textContent = counts.p2;
    this.el.turnBadge.textContent = st.winner ? 'End' : String(st.turnNumber);

    this.el.pillP1.classList.toggle('active-turn', st.winner === 0 && st.currentPlayer === 1);
    this.el.pillP2.classList.toggle('active-turn', st.winner === 0 && st.currentPlayer === 2);

    const meta = MODE_META[this.mode];
    this.el.pillP2.setAttribute('data-tip', meta.label);

    const pipsHtml = meta.pips > 0
      ? `<span class="mode-pips">${'<span class="mode-pip"></span>'.repeat(meta.pips)}</span>`
      : '';
    this.el.btnMode.innerHTML = `${this.mode === 'pvp' ? ICONS.pvp : ICONS.ai}${pipsHtml}`;
    this.el.btnMode.setAttribute('data-tip', `Opponent: ${meta.label}`);

    this.syncSoundControls();

    this.el.btnUndo.disabled = this.isAnimating || this.tutorialActive || !this.history.canUndo();
    this.el.btnRedo.disabled = this.isAnimating || this.tutorialActive || !this.history.canRedo();
  }

  /* ---------------- Undo / Redo / Replay / New Match ---------------- */

  startNewMatch() {
    this.isReplaying = false;
    this.clearSelection();
    this.history.reset(createInitialState(BOARD_SIZE, this.startingRows));
    this.matchStats = { captures: 0, bounces: 0 };
    this.sound.playSelect();
    this.syncUI();
  }

  handleUndo() {
    if (this.isAnimating || !this.history.canUndo()) return;
    this.clearSelection();
    const steps = this.mode.startsWith('ai-') && this.history.cursor >= 2 ? 2 : 1;
    this.history.undo(steps);
    this.sound.playSelect();
    this.syncUI();
  }

  handleRedo() {
    if (this.isAnimating || !this.history.canRedo()) return;
    this.clearSelection();
    const steps = this.mode.startsWith('ai-') ? 2 : 1;
    this.history.redo(steps);
    this.sound.playSelect();
    this.syncUI();
  }

  renderHistoryModal() {
    this.el.historyList.innerHTML = '';
    this.history.entries.forEach((entry, idx) => {
      const btn = document.createElement('button');
      btn.className = `history-row${idx === this.history.cursor ? ' active' : ''}`;
      if (idx === 0) {
        const initCount = this.startingRows * 4;
        btn.innerHTML = `<span>0 · Start</span><span>${initCount} – ${initCount}</span>`;
      } else {
        const s = entry.summary;
        const dot = `<span class="history-dot p${s.player}"></span>`;
        const extras = [];
        if (s.opponentCaptures) extras.push(`+${s.opponentCaptures}`);
        if (s.bounces) extras.push(`${s.bounces}b`);
        btn.innerHTML = `<span>${dot}${idx} · (${s.originX + 1},${s.originY + 1}) ${DIR_ARROWS[s.dirId]}</span><span>${extras.join(' · ') || `${s.hops}`}</span>`;
      }
      btn.addEventListener('click', () => {
        this.history.jumpTo(idx);
        this.syncUI();
        this.renderHistoryModal();
        this.sound.playSelect();
      });
      this.el.historyList.appendChild(btn);
    });
  }

  async playFullReplay() {
    if (this.history.entries.length <= 1 || this.isAnimating) return;
    this.isReplaying = true;
    this.isAnimating = true;

    this.renderBoard(this.history.entries[0].state.board);
    await sleep(360);

    for (let i = 1; i < this.history.entries.length; i++) {
      const entry = this.history.entries[i];
      this.history.cursor = i;
      await this.playMoveEvents(entry.events, 1.6);
      await sleep(180);
    }

    this.isReplaying = false;
    this.isAnimating = false;
    this.syncUI();
  }

  handleVictory(winner) {
    this.sound.playVictory();
    this.fx.spawnVictoryConfetti();
    this.monetization.onMatchCompleted();

    document.getElementById('victory-title').textContent =
      winner === 1 ? 'Player 1 Wins' : winner === 2 ? 'Player 2 Wins' : 'Draw';
    document.getElementById('stat-turns').textContent = this.history.moveCount;
    document.getElementById('stat-captures').textContent = this.matchStats.captures;
    document.getElementById('stat-bounces').textContent = this.matchStats.bounces;

    setTimeout(() => this.openModal('modal-victory'), 480);
  }

  /* ---------------- Visual Themes & Monetization ---------------- */

  renderThemesModal() {
    this.el.themeList.innerHTML = '';
    for (const theme of THEMES) {
      const unlocked = this.monetization.canUseTheme(theme.id);
      const selected = this.monetization.currentTheme === theme.id;

      const card = document.createElement('button');
      card.className = `theme-card${selected ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="theme-swatch">
          ${theme.swatches.map((c) => `<div style="background:${c}"></div>`).join('')}
        </div>
        <div class="theme-info">
          <strong>${theme.name}</strong>
          <span>${theme.desc}</span>
        </div>
        <span class="theme-status">
          ${selected ? ICONS.check : unlocked ? '' : `${ICONS.lock}$0.99`}
        </span>
      `;
      card.addEventListener('click', () => {
        if (!unlocked) {
          this.showToast('Unlock Theme Pack below');
          this.sound.playAimTick();
          return;
        }
        this.monetization.setTheme(theme.id);
        this.sound.setTheme(theme.id);
        this.sound.playSelect();
        this.renderThemesModal();
        this.syncUI();
      });
      this.el.themeList.appendChild(card);
    }

    this.el.iapBox.style.display = this.monetization.packUnlocked ? 'none' : 'block';
  }

  updateAdSlot() {
    const show = this.monetization.shouldShowGentleBanner();
    this.el.adBanner.classList.toggle('hidden', !show);
  }

  /* ---------------- Interactive Tutorial ---------------- */

  startTutorial() {
    this.tutorialActive = true;
    this.tutorialIndex = 0;
    this.loadTutorialStep();
    this.el.tutBanner.classList.remove('hidden');
  }

  loadTutorialStep() {
    const step = TUTORIAL_STEPS[this.tutorialIndex];
    this.history.reset(step.buildState());
    this.el.tutTag.textContent = step.tag;
    this.el.tutTitle.textContent = step.title;
    this.el.tutBody.textContent = step.body;
    this.el.btnTutNext.textContent =
      this.tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Play' : 'Skip';
    this.syncUI();

    if (step.hintCell) {
      this.cellEls[step.hintCell.x][step.hintCell.y].classList.add('selected');
    }
  }

  advanceTutorial() {
    if (this.tutorialIndex < TUTORIAL_STEPS.length - 1) {
      this.tutorialIndex += 1;
      this.loadTutorialStep();
    } else {
      this.exitTutorial(true);
    }
  }

  exitTutorial(resetToMatch) {
    this.tutorialActive = false;
    this.el.tutBanner.classList.add('hidden');
    if (resetToMatch) {
      this.startNewMatch();
    }
  }

  /* ---------------- Helpers ---------------- */

  openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  showToast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('show');
    }, 2000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__collatzApp = new CollatzGameApp();
});
