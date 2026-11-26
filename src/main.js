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
import { CollatzExplainer } from './collatz_explainer.js';
import {
  buildDailyShareText,
  buildReplayUrl,
  buildVictoryShareText,
  decodeReplay,
} from './share.js';
import { generateDailyPuzzle } from './daily.js';

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

const BOARD_SETUPS = {
  balanced: { size: 8,  rows: 2, label: '8×8 · Balanced' },
  classic:  { size: 8,  rows: 3, label: '8×8 · Classic' },
  grand:    { size: 10, rows: 3, label: '10×10 · Grand' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CollatzGameApp {
  constructor() {
    this.sound = new SoundEngine();
    this.monetization = new MonetizationManager();
    this.monetization.applySavedTheme();
    this.sound.setTheme(this.monetization.currentTheme);

    this.mode = 'ai-medium';
    this.setupId = 'balanced';
    this.fastMode = false;
    const initCfg = BOARD_SETUPS[this.setupId];
    this.history = new GameHistory(createInitialState(initCfg.size, initCfg.rows));
    this.isAnimating = false;
    this.isReplaying = false;
    this.matchStats = { captures: 0, bounces: 0, maxHop: 0 };

    this.selectedCell = null;
    this.dragState = null;
    this.lastAimDirId = null;

    this.tutorialActive = false;
    this.tutorialIndex = 0;

    this.dailyActive = false;
    this.dailyPuzzle = null;
    this.dailyAttempts = 0;
    this.dailySolved = false;
    this.dailySolveSummary = null;

    this.demoActive = false;
    this.demoPaused = false;
    this.demoSpeedIdx = 0; // 0 => 0.7x, 1 => 1.0x, 2 => 1.6x
    this.demoRunId = 0;

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
      btnDemo: document.getElementById('btn-demo'),
      btnDaily: document.getElementById('btn-daily'),
      btnCollatz: document.getElementById('btn-collatz'),
      btnCollatzDemo: document.getElementById('btn-collatz-demo'),
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
      btnShareReplay: document.getElementById('btn-share-replay'),
      btnVictoryShare: document.getElementById('btn-victory-share'),
      victoryIcon: document.getElementById('victory-icon'),
      // Demo Mode
      demoBanner: document.getElementById('demo-banner'),
      demoTitle: document.getElementById('demo-title'),
      demoPhase: document.getElementById('demo-phase'),
      demoMath: document.getElementById('demo-math'),
      demoBody: document.getElementById('demo-body'),
      btnDemoPause: document.getElementById('btn-demo-pause'),
      btnDemoStep: document.getElementById('btn-demo-step'),
      btnDemoSpeed: document.getElementById('btn-demo-speed'),
      btnDemoTakeover: document.getElementById('btn-demo-takeover'),
      btnDemoExit: document.getElementById('btn-demo-exit'),
      // Daily Puzzle
      dailyBanner: document.getElementById('daily-banner'),
      dailyTitle: document.getElementById('daily-title'),
      dailyMeta: document.getElementById('daily-meta'),
      dailyBody: document.getElementById('daily-body'),
      btnDailyExit: document.getElementById('btn-daily-exit'),
      btnDailyAction: document.getElementById('btn-daily-action'),
      // Tutorial
      tutBanner: document.getElementById('tutorial-banner'),
      tutTag: document.getElementById('tutorial-step-tag'),
      tutTitle: document.getElementById('tutorial-title'),
      tutBody: document.getElementById('tutorial-body'),
      btnTutSkip: document.getElementById('btn-tutorial-skip'),
      btnTutNext: document.getElementById('btn-tutorial-next'),
    };

    this.fx = new FXLayer(this.el.fxCanvas, this.el.boardFrame);
    this.explainer = new CollatzExplainer(
      document.getElementById('collatz-explainer-root'),
      this.sound
    );
    this.cellEls = [];

    this.injectIcons();
    this.buildBoardDOM();
    this.buildDirWheelDOM();
    this.bindEvents();
    this.updateAdSlot();
    this.renderThemesModal();
    this.syncUI();
    this.handleUrlHash();
  }

  get state() {
    return this.history.state;
  }

  get speedScale() {
    return this.fastMode ? 1.85 : 1;
  }

  isAITurn(st = this.state) {
    return (
      !this.tutorialActive &&
      !this.dailyActive &&
      !this.demoActive &&
      this.mode.startsWith('ai-') &&
      st.currentPlayer === 2 &&
      st.winner === 0
    );
  }

  injectIcons() {
    this.el.btnDemo.innerHTML = ICONS.demo;
    this.el.btnDaily.innerHTML = ICONS.daily;
    this.el.btnCollatz.innerHTML = ICONS.collatz;
    this.el.btnTutorial.innerHTML = ICONS.help;
    this.el.btnHistory.innerHTML = ICONS.history;
    this.el.btnThemes.innerHTML = ICONS.themes;
    this.el.btnSettings.innerHTML = ICONS.settings;
    this.el.btnUndo.innerHTML = ICONS.undo;
    this.el.btnRedo.innerHTML = ICONS.redo;
    this.el.btnNew.innerHTML = ICONS.restart;
    this.el.btnDemoPause.innerHTML = ICONS.pause;
    this.el.btnDemoStep.innerHTML = ICONS.step;
    this.el.btnReplayPlay.innerHTML = `${ICONS.play}<span>Replay</span>`;
    this.el.btnShareReplay.innerHTML = `${ICONS.share}<span>Share</span>`;
    this.el.btnVictoryShare.innerHTML = `${ICONS.share}<span>Share</span>`;
    this.el.victoryIcon.innerHTML = ICONS.trophy;

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      if (btn.classList.contains('icon-btn')) {
        btn.innerHTML = ICONS.close;
      }
    });
  }

  /* ---------------- DOM Construction ---------------- */

  buildBoardDOM(size = this.state.size) {
    this.el.boardGrid.style.setProperty('--board-size', String(size));
    this.el.boardGrid.setAttribute('aria-label', `${size} by ${size} Collatz Checkers Board`);
    this.el.boardGrid.innerHTML = '';
    this.cellEls = Array.from({ length: size }, () => new Array(size));
    this.fx.setBoardSize(size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
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
    this.el.btnDemo.addEventListener('click', () => this.startDemoMode());
    this.el.btnCollatzDemo.addEventListener('click', () => {
      this.closeModal('modal-collatz');
      this.startDemoMode();
    });
    this.el.btnDaily.addEventListener('click', () => this.startDailyPuzzle());
    this.el.btnCollatz.addEventListener('click', () => {
      this.sound.playSelect();
      this.openModal('modal-collatz');
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
        const id = btn.dataset.setup;
        if (this.setupId !== id && BOARD_SETUPS[id]) {
          this.setupId = id;
          this.exitTutorial(false);
          this.startNewMatch();
          this.syncSettingsModal();
          this.showToast(BOARD_SETUPS[id].label);
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
    this.el.btnShareReplay.addEventListener('click', () => this.shareCurrentReplay());
    this.el.btnVictoryShare.addEventListener('click', () => this.shareVictoryCard());
    document.getElementById('btn-victory-rematch').addEventListener('click', () => {
      this.closeModal('modal-victory');
      this.startNewMatch();
    });
    document.getElementById('btn-victory-replay').addEventListener('click', () => {
      this.closeModal('modal-victory');
      this.playFullReplay();
    });

    // Daily Puzzle
    this.el.btnDailyExit.addEventListener('click', () => this.exitDailyPuzzle(true));
    this.el.btnDailyAction.addEventListener('click', () => {
      if (this.dailySolved) {
        this.shareDailyResult();
      } else if (this.dailyPuzzle) {
        // Show subtle hint: highlight the piece to move
        const sol = this.dailyPuzzle.solution;
        this.clearSelection();
        this.cellEls[sol.x][sol.y].classList.add('selected');
        this.sound.playSelect();
        this.showToast('Hint: move the highlighted piece');
      }
    });

    // Demo Mode controls
    this.el.btnDemoPause.addEventListener('click', () => this.toggleDemoPause());
    this.el.btnDemoStep.addEventListener('click', () => this.stepDemoOnce());
    this.el.btnDemoSpeed.addEventListener('click', () => this.cycleDemoSpeed());
    this.el.btnDemoTakeover.addEventListener('click', () => this.exitDemoMode(false));
    this.el.btnDemoExit.addEventListener('click', () => this.exitDemoMode(true));

    // Keyboard shortcuts (itch.io & desktop polish)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
        if (openModal) {
          openModal.classList.add('hidden');
          return;
        }
        if (this.demoActive) this.exitDemoMode(true);
        else if (this.tutorialActive) this.exitTutorial(true);
        else if (this.dailyActive) this.exitDailyPuzzle(true);
        else this.clearSelection();
      } else if (e.key === ' ' && this.demoActive) {
        e.preventDefault();
        this.toggleDemoPause();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !this.demoActive) {
        e.preventDefault();
        this.handleUndo();
      }
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
      btn.classList.toggle('active', btn.dataset.setup === this.setupId);
    });
    this.syncSoundControls();
    this.el.toggleHaptics.setAttribute('aria-pressed', String(this.sound.hapticsEnabled));
    this.el.toggleFast.setAttribute('aria-pressed', String(this.fastMode));
  }

  /* ---------------- Drag-to-Aim & Tap-to-Aim ---------------- */

  getCellFromPoint(clientX, clientY) {
    const size = this.state.size;
    const rect = this.el.boardGrid.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((clientY - rect.top) / rect.height) * size);
    if (x < 0 || x >= size || y < 0 || y >= size) return null;
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
    if (this.isAnimating || this.isReplaying || this.demoActive || this.isAITurn()) return;
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
    const size = this.state.size;
    this.selectedCell = { x, y };
    this.clearPreviewHighlights();
    this.cellEls[x][y].classList.add('selected');

    const pctX = Math.max(16, Math.min(84, ((x + 0.5) / size) * 100));
    const pctY = Math.max(16, Math.min(84, ((y + 0.5) / size) * 100));
    this.el.dirWheel.style.left = `${pctX}%`;
    this.el.dirWheel.style.top = `${pctY}%`;
    this.el.dirWheel.classList.remove('hidden');
  }

  clearPreviewHighlights() {
    this.fx.clearPreview();
    this.el.telemetry.classList.remove('visible');
    const size = this.cellEls.length;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        this.cellEls[x][y].classList.remove('in-line', 'spawn-target', 'land-target');
      }
    }
  }

  clearSelection() {
    this.selectedCell = null;
    this.el.dirWheel.classList.add('hidden');
    this.clearPreviewHighlights();
    const size = this.cellEls.length;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
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
    if (!this.tutorialActive && !this.dailyActive) {
      const seen = this.history.getSeenHashes();
      const nextHash = getBoardHash(nextState.board, nextState.currentPlayer);
      if (seen.has(nextHash)) {
        this.isAnimating = false;
        this.sound.playAimTick();
        this.showToast('Repeat blocked (Ko)');
        return;
      }
    }

    await this.playMoveEvents(events, this.demoActive ? this.getDemoSpeed() : this.speedScale, {
      narrate: this.demoActive,
      boardBefore: currentState.board,
      summary,
    });

    this.history.push(nextState, { x, y, dx, dy }, summary, events);
    this.matchStats.captures += summary.opponentCaptures;
    this.matchStats.bounces += summary.bounces;
    if (summary.hops > this.matchStats.maxHop) {
      this.matchStats.maxHop = summary.hops;
    }

    this.isAnimating = false;
    this.syncUI();

    if (this.demoActive) {
      return;
    }

    if (this.dailyActive) {
      await this.handleDailyMoveResult(nextState, summary);
      return;
    }

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

  async playMoveEvents(events, speedScale = 1, opts = {}) {
    const colors = this.fx.getThemeColors();
    const narrate = Boolean(opts.narrate);
    let activeLine = null;
    let activePlayer = 1;
    let lineDecimal = 0;

    const extractBits = (board, line, player) => {
      const pIdx = player - 1;
      return line.map((c) => board[c.x][c.y][pIdx]);
    };

    const bitsToInt = (bits) => {
      // Trim leading zeros before first piece so the binary number starts at the backmost piece (LSB = 1)
      const first = bits.findIndex((b) => b > 0);
      if (first === -1) return 0;
      let val = 0;
      for (let i = first; i < bits.length; i++) {
        val += bits[i] * (1 << (i - first));
      }
      return val;
    };

    for (const ev of events) {
      if (ev.type === 'select_line') {
        activeLine = ev.line;
        activePlayer = ev.player;
        for (const c of ev.line) {
          this.cellEls[c.x][c.y].classList.add('in-line');
        }
        if (narrate && opts.boardBefore) {
          const bits = extractBits(opts.boardBefore, ev.line, ev.player);
          lineDecimal = bitsToInt(bits);
          this.fx.setBinaryOverlay({ line: ev.line, bits, player: ev.player });
          const who = ev.player === 1 ? 'Red' : 'Blue';
          const dirArrow = DIR_ARROWS[opts.summary?.dirId] || '→';
          const activeCount = bits.filter((b) => b > 0).length;
          this.el.demoPhase.textContent = `Line ${dirArrow}`;
          this.el.demoMath.textContent = `n = ${lineDecimal}`;
          this.el.demoBody.textContent = `${who} selects line ${dirArrow} (${activeCount} piece${activeCount === 1 ? '' : 's'}).`;
          await sleep(480 / speedScale);
        } else {
          await sleep(95 / speedScale);
        }
      } else if (ev.type === 'replicate') {
        this.renderBoard(ev.boardAfter, ev.spawns.map((s) => `${s.toX},${s.toY}`));
        this.sound.playReplicate(ev.spawns.length);
        const col = ev.player === 1 ? colors.p1 : colors.p2;
        let anyBounced = false;
        for (const sp of ev.spawns) {
          this.fx.spawnRing(sp.toX, sp.toY, col, 0.52);
          if (sp.bounced) {
            anyBounced = true;
            this.fx.spawnWallSparks(sp.toX, sp.toY, sp.bouncedX, sp.bouncedY, colors.accent);
            this.sound.playBounce();
          }
        }
        if (narrate && activeLine) {
          const bits = extractBits(ev.boardAfter, activeLine, activePlayer);
          this.fx.setBinaryOverlay({ line: activeLine, bits, player: activePlayer });
          const firstSp = ev.spawns[0];
          if (firstSp) {
            this.fx.spawnCallout(firstSp.toX, firstSp.toY, anyBounced ? '+2n · reflect' : '+2n', colors.accent);
          }
          this.el.demoPhase.textContent = '1. Clone (+2n)';
          this.el.demoMath.textContent = `${lineDecimal} + ${2 * lineDecimal} = ${3 * lineDecimal}`;
          this.el.demoBody.textContent = `Each piece clones 1 tile ahead${anyBounced ? ' (reflecting off wall)' : ''}.`;
          await sleep(620 / speedScale);
        } else {
          await sleep(230 / speedScale);
        }
      } else if (ev.type === 'hop_start') {
        this.renderBoard(ev.boardAfter);
        if (ev.isDoubleCarry) {
          this.sound.playDoubleCarry();
          this.fx.spawnRing(ev.x, ev.y, colors.accent, 0.72);
          if (narrate) {
            this.fx.spawnCallout(ev.x, ev.y, 'carry', colors.accent);
            this.el.demoPhase.textContent = '3. Double Carry';
            this.el.demoBody.textContent = 'Leftover double stack resolves by jumping forward.';
            await sleep(420 / speedScale);
          } else {
            await sleep(140 / speedScale);
          }
        } else if (narrate) {
          this.el.demoPhase.textContent = '2. Hop (+1)';
          this.el.demoMath.textContent = `${3 * lineDecimal} + 1`;
          this.el.demoBody.textContent = 'Back piece hops forward, eating 1 per occupied square until empty.';
          await sleep(300 / speedScale);
        }
      } else if (ev.type === 'hop_step') {
        const hopMs = Math.max(70, (narrate ? 175 : 140) / speedScale);
        await this.fx.animateHopArc(ev.fromX, ev.fromY, ev.toX, ev.toY, ev.player, hopMs);

        if (ev.bounced) {
          this.sound.playBounce();
          this.fx.spawnWallSparks(ev.toX, ev.toY, ev.bouncedX, ev.bouncedY, colors.accent);
          this.fx.shake(2.5, 85);
          if (narrate) this.fx.spawnCallout(ev.toX, ev.toY, 'bounce', colors.accent);
        }

        this.renderBoard(ev.boardAfter, ev.landed ? [`${ev.toX},${ev.toY}`] : []);
        if (narrate && activeLine) {
          const bits = extractBits(ev.boardAfter, activeLine, activePlayer);
          this.fx.setBinaryOverlay({ line: activeLine, bits, player: activePlayer });
        }

        if (ev.landed) {
          this.sound.playLand();
          const col = ev.player === 1 ? colors.p1 : colors.p2;
          this.fx.spawnRing(ev.toX, ev.toY, col, 0.56);
          if (narrate) {
            this.el.demoBody.textContent = `Landed on empty square (${ev.stepIndex + 1} hop${ev.stepIndex === 0 ? '' : 's'}).`;
            await sleep(340 / speedScale);
          }
        } else {
          const isOppCapture = ev.eaten !== ev.player;
          this.sound.playHop(ev.stepIndex, isOppCapture);
          const eatenCol = ev.eaten === 1 ? colors.p1 : colors.p2;
          this.fx.spawnBurst(ev.toX, ev.toY, eatenCol, isOppCapture ? 14 : 8, isOppCapture ? 3.2 : 2.1);
          if (isOppCapture) {
            this.fx.spawnRing(ev.toX, ev.toY, colors.accent, 0.68);
            this.fx.shake(3.5, 95);
            if (narrate) this.fx.spawnCallout(ev.toX, ev.toY, 'capture', colors.accent);
          }
        }
      } else if (ev.type === 'turn_end') {
        this.clearPreviewHighlights();
        if (narrate) {
          this.fx.clearBinaryOverlay();
        }
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
    const size = board.length;
    if (this.cellEls.length !== size) {
      this.buildBoardDOM(size);
    }
    const popSet = new Set(popKeys);
    const activePlayer = this.state.currentPlayer;
    const canInteract = !this.isAnimating && !this.isReplaying && !this.isAITurn() && this.state.winner === 0;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
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

    this.el.btnUndo.disabled = this.isAnimating || this.tutorialActive || this.dailyActive || !this.history.canUndo();
    this.el.btnRedo.disabled = this.isAnimating || this.tutorialActive || this.dailyActive || !this.history.canRedo();
  }

  /* ---------------- Undo / Redo / Replay / New Match ---------------- */

  startNewMatch() {
    this.isReplaying = false;
    this.exitDemoMode(false);
    this.exitDailyPuzzle(false);
    this.clearSelection();
    const cfg = BOARD_SETUPS[this.setupId];
    this.history.reset(createInitialState(cfg.size, cfg.rows));
    this.buildBoardDOM(cfg.size);
    this.matchStats = { captures: 0, bounces: 0, maxHop: 0 };
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
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
        const initCounts = countPieces(entry.state.board);
        btn.innerHTML = `<span>0 · Start</span><span>${initCounts.p1} – ${initCounts.p2}</span>`;
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

  /* ---------------- Shareable Replays & Daily Puzzle ---------------- */

  async copyText(text, successMsg = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(successMsg);
      this.sound.playSelect();
    } catch {
      window.prompt('Copy to share:', text);
    }
  }

  getRecordedMoves() {
    return this.history.entries.slice(1).map((e) => e.move).filter(Boolean);
  }

  shareCurrentReplay() {
    const moves = this.getRecordedMoves();
    if (moves.length === 0) {
      this.showToast('Play at least one move first');
      return;
    }
    const url = buildReplayUrl(this.setupId, moves);
    this.copyText(url, 'Replay link copied');
  }

  shareVictoryCard() {
    const moves = this.getRecordedMoves();
    const replayUrl = buildReplayUrl(this.setupId, moves);
    const text = buildVictoryShareText({
      winner: this.state.winner,
      modeLabel: MODE_META[this.mode].label,
      setupLabel: BOARD_SETUPS[this.setupId].label,
      turns: this.history.moveCount,
      captures: this.matchStats.captures,
      bounces: this.matchStats.bounces,
      maxHop: this.matchStats.maxHop,
      replayUrl,
    });
    this.copyText(text, 'Result & replay copied');
  }

  handleUrlHash() {
    const hash = window.location.hash || '';
    if (hash === '#daily') {
      this.startDailyPuzzle();
      return;
    }
    if (hash.startsWith('#r=')) {
      const decoded = decodeReplay(hash.slice(3));
      if (!decoded || decoded.moves.length === 0) return;

      this.setupId = decoded.setupId;
      const cfg = BOARD_SETUPS[this.setupId];
      let st = createInitialState(cfg.size, cfg.rows);
      this.history.reset(st);
      this.buildBoardDOM(cfg.size);

      for (const m of decoded.moves) {
        if (!isValidMove(st, m.x, m.y, m.dx, m.dy)) break;
        const { nextState, events, summary } = executeMove(st, m.x, m.y, m.dx, m.dy);
        this.history.push(nextState, m, summary, events);
        st = nextState;
      }

      this.syncUI();
      this.showToast('Shared replay');
      setTimeout(() => this.playFullReplay(), 350);
    }
  }

  startDailyPuzzle() {
    this.exitTutorial(false);
    this.dailyPuzzle = generateDailyPuzzle();
    this.dailyActive = true;
    this.dailyAttempts = 0;
    this.dailySolved = false;
    this.dailySolveSummary = null;

    this.history.reset(this.dailyPuzzle.state);
    this.buildBoardDOM(this.dailyPuzzle.state.size);
    this.el.dailyTitle.textContent = `Daily #${this.dailyPuzzle.dayNumber}`;
    this.el.dailyMeta.textContent = '1-move wipeout';
    this.el.dailyBody.textContent = 'Eliminate every blue piece in a single move.';
    this.el.btnDailyAction.textContent = 'Hint';
    this.el.dailyBanner.classList.remove('hidden');
    this.syncUI();
    this.sound.playSelect();
  }

  async handleDailyMoveResult(nextState, summary) {
    this.dailyAttempts += 1;
    if (nextState.winner === 1) {
      this.dailySolved = true;
      this.dailySolveSummary = summary;
      this.sound.playVictory();
      this.fx.spawnVictoryConfetti();
      const tries = this.dailyAttempts === 1 ? '1 try' : `${this.dailyAttempts} tries`;
      this.el.dailyMeta.textContent = `Solved · ${tries}`;
      this.el.dailyBody.textContent = `${summary.hops}-hop · ${summary.bounces} bounce${summary.bounces === 1 ? '' : 's'} · ${summary.opponentCaptures} wiped.`;
      this.el.btnDailyAction.innerHTML = `${ICONS.share}<span>Share</span>`;
      return;
    }

    // Missed wipeout — reset puzzle cleanly after a short beat so player can retry immediately
    this.el.dailyMeta.textContent = `Tries: ${this.dailyAttempts}`;
    this.showToast('Not a full wipeout — try again');
    await sleep(650);
    if (!this.dailyActive || this.dailySolved) return;
    this.history.reset(this.dailyPuzzle.state);
    this.syncUI();
  }

  shareDailyResult() {
    if (!this.dailyPuzzle || !this.dailySolveSummary) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const text = buildDailyShareText({
      dayNumber: this.dailyPuzzle.dayNumber,
      attempts: this.dailyAttempts,
      hops: this.dailySolveSummary.hops,
      bounces: this.dailySolveSummary.bounces,
      captures: this.dailySolveSummary.opponentCaptures,
      dailyUrl: `${base}#daily`,
    });
    this.copyText(text, 'Daily result copied');
  }

  exitDailyPuzzle(resetToMatch) {
    if (!this.dailyActive) return;
    this.dailyActive = false;
    this.el.dailyBanner.classList.add('hidden');
    if (resetToMatch) {
      this.startNewMatch();
    }
  }

  /* ---------------- AI vs AI Live Demo Mode ---------------- */

  getDemoSpeed() {
    return [0.7, 1.0, 1.6][this.demoSpeedIdx] || 0.7;
  }

  startDemoMode() {
    this.exitTutorial(false);
    this.exitDailyPuzzle(false);
    this.demoActive = true;
    this.demoPaused = false;
    this.demoRunId += 1;
    const runId = this.demoRunId;

    const cfg = BOARD_SETUPS[this.setupId];
    this.history.reset(createInitialState(cfg.size, cfg.rows));
    this.buildBoardDOM(cfg.size);
    this.matchStats = { captures: 0, bounces: 0, maxHop: 0 };

    this.el.btnDemoPause.innerHTML = ICONS.pause;
    this.el.btnDemoSpeed.textContent = `${this.getDemoSpeed().toFixed(1)}×`;
    this.el.demoPhase.textContent = 'Starting';
    this.el.demoMath.textContent = '3n + 1';
    this.el.demoBody.textContent = 'Watching two AIs play with live binary Collatz overlays.';
    this.el.demoBanner.classList.remove('hidden');
    this.syncUI();
    this.sound.playSelect();

    this.runDemoLoop(runId);
  }

  async runDemoLoop(runId) {
    await sleep(450);
    while (this.demoActive && this.demoRunId === runId) {
      if (this.demoPaused) {
        await sleep(160);
        continue;
      }
      if (this.state.winner !== 0) {
        const who = this.state.winner === 1 ? 'Red AI' : this.state.winner === 2 ? 'Blue AI' : 'Draw';
        this.el.demoPhase.textContent = 'Finished';
        this.el.demoBody.textContent = `${who} wins in ${this.history.moveCount} turns. Restarting demo…`;
        this.sound.playVictory();
        this.fx.spawnVictoryConfetti();
        await sleep(2600);
        if (!this.demoActive || this.demoRunId !== runId || this.demoPaused) continue;
        const cfg = BOARD_SETUPS[this.setupId];
        this.history.reset(createInitialState(cfg.size, cfg.rows));
        this.buildBoardDOM(cfg.size);
        this.syncUI();
        await sleep(450);
        continue;
      }

      await this.executeDemoTurn();
      await sleep(520 / this.getDemoSpeed());
    }
  }

  async executeDemoTurn() {
    if (!this.demoActive || this.isAnimating || this.state.winner !== 0) return;
    const seen = this.history.getSeenHashes();
    const diff = this.state.currentPlayer === 1 ? 'hard' : 'medium';
    const move = chooseAIMove(this.state, diff, seen);
    if (!move) {
      const winner = this.state.currentPlayer === 1 ? 2 : 1;
      this.history.entries[this.history.cursor].state.winner = winner;
      this.syncUI();
      return;
    }
    await this.commitMove(move.x, move.y, move.dx, move.dy);
  }

  toggleDemoPause() {
    if (!this.demoActive) return;
    this.demoPaused = !this.demoPaused;
    this.el.btnDemoPause.innerHTML = this.demoPaused ? ICONS.play : ICONS.pause;
    this.sound.playSelect();
  }

  async stepDemoOnce() {
    if (!this.demoActive || this.isAnimating) return;
    if (!this.demoPaused) {
      this.demoPaused = true;
      this.el.btnDemoPause.innerHTML = ICONS.play;
    }
    await this.executeDemoTurn();
  }

  cycleDemoSpeed() {
    this.demoSpeedIdx = (this.demoSpeedIdx + 1) % 3;
    this.el.btnDemoSpeed.textContent = `${this.getDemoSpeed().toFixed(1)}×`;
    this.sound.playSelect();
  }

  exitDemoMode(resetToMatch) {
    if (!this.demoActive) return;
    this.demoActive = false;
    this.demoPaused = false;
    this.demoRunId += 1;
    this.fx.clearBinaryOverlay();
    this.el.demoBanner.classList.add('hidden');
    if (resetToMatch) {
      this.startNewMatch();
    } else {
      // Take over from the live demo position!
      this.syncUI();
      this.showToast('You took over the board');
      if (this.isAITurn()) {
        this.runAITurn();
      }
    }
  }

  /* ---------------- Interactive Tutorial ---------------- */

  startTutorial() {
    this.exitDemoMode(false);
    this.exitDailyPuzzle(false);
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
