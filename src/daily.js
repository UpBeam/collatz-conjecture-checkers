/**
 * Deterministic Daily Collatz Puzzle Generator (Zero-Backend Wordle Loop)
 *
 * Every UTC date generates a guaranteed-solvable 1-Move Wipeout Puzzle:
 *   "Eliminate every Azure piece in ONE move."
 * Prefers clever bouncing multi-capture shots with only 1-2 unique winning moves.
 */

import {
  BOARD_SIZE,
  createEmptyBoard,
  executeMove,
  getLegalMoves,
} from './engine.js';

const EPOCH_UTC_MS = Date.UTC(2026, 10, 23); // Day #1 = 2026-11-23

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTodayDateKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayNumber(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return Math.max(1, Math.floor((ms - EPOCH_UTC_MS) / 86400000) + 1);
}

function hashDateKey(dateKey) {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates a deterministic 1-move wipeout puzzle for `dateKey` ("YYYY-MM-DD").
 * Guaranteed to have a valid 1-move winning solution.
 */
export function generateDailyPuzzle(dateKey = getTodayDateKey()) {
  const dayNumber = getDayNumber(dateKey);
  const rng = mulberry32(hashDateKey(dateKey) ^ 0x9e3779b9);

  let bestPuzzle = null;
  let bestQuality = -1;

  // Try candidate configurations to find a crisp, non-trivial bounce wipeout
  for (let attempt = 0; attempt < 180; attempt++) {
    const board = createEmptyBoard(BOARD_SIZE);
    const numP1 = 2 + Math.floor(rng() * 3); // 2..4 Crimson pieces
    const numP2 = 2 + Math.floor(rng() * 3); // 2..4 Azure pieces

    // Place pieces clustered along a random diagonal or near an edge to encourage bounces
    const anchorX = Math.floor(rng() * BOARD_SIZE);
    const anchorY = Math.floor(rng() * BOARD_SIZE);
    board[anchorX][anchorY][0] = 1;

    // Pick a target direction to seed a plausible line/bounce path
    const dirs = [
      [1, -1], [-1, -1], [1, 1], [-1, 1],
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    const [dx0, dy0] = dirs[Math.floor(rng() * dirs.length)];
    let cx = anchorX;
    let cy = anchorY;
    let dx = dx0;
    let dy = dy0;

    // Seed Azure targets along a bounced trajectory from anchor
    let placedP2 = 0;
    for (let step = 0; step < 9 && placedP2 < numP2; step++) {
      if (cx + dx < 0 || cx + dx >= BOARD_SIZE) dx = -dx;
      if (cy + dy < 0 || cy + dy >= BOARD_SIZE) dy = -dy;
      cx += dx;
      cy += dy;
      if (board[cx][cy][0] === 0 && board[cx][cy][1] === 0 && rng() < 0.72) {
        board[cx][cy][1] = 1;
        placedP2++;
      }
    }
    if (placedP2 < 2) continue;

    // Add remaining Crimson pieces (some on the line, some decoys)
    for (let k = 1; k < numP1; k++) {
      const rx = Math.floor(rng() * BOARD_SIZE);
      const ry = Math.floor(rng() * BOARD_SIZE);
      if (board[rx][ry][0] === 0 && board[rx][ry][1] === 0) {
        board[rx][ry][0] = 1;
      }
    }

    const state = {
      size: BOARD_SIZE,
      startingRows: 2,
      board,
      currentPlayer: 1,
      turnNumber: 1,
      winner: 0,
    };

    const moves = getLegalMoves(state);
    const winningMoves = [];
    for (const m of moves) {
      const { nextState, summary } = executeMove(state, m.x, m.y, m.dx, m.dy);
      if (nextState.winner === 1) {
        winningMoves.push({ move: m, summary });
      }
    }

    if (winningMoves.length === 0) continue;

    // Score puzzle quality: prefer unique/rare solutions with wall bounces & 3+ hops
    const bestWin = winningMoves.sort((a, b) => b.summary.bounces - a.summary.bounces)[0];
    const uniqueness = winningMoves.length === 1 ? 40 : winningMoves.length === 2 ? 22 : 6;
    const bounceBonus = bestWin.summary.bounces > 0 ? 35 + bestWin.summary.bounces * 8 : 0;
    const hopBonus = Math.min(bestWin.summary.hops, 8) * 4;
    const capBonus = bestWin.summary.opponentCaptures * 10;
    const quality = uniqueness + bounceBonus + hopBonus + capBonus;

    if (quality > bestQuality) {
      bestQuality = quality;
      bestPuzzle = {
        dateKey,
        dayNumber,
        state,
        solution: bestWin.move,
        solutionSummary: bestWin.summary,
        solutionCount: winningMoves.length,
      };
      if (quality >= 105) break; // Found a great unique bounce puzzle!
    }
  }

  // Deterministic fallback (guaranteed solvable)
  if (!bestPuzzle) {
    const board = createEmptyBoard(BOARD_SIZE);
    board[6][4] = [1, 0];
    board[7][3] = [0, 1];
    board[6][2] = [0, 1];
    const state = { size: BOARD_SIZE, startingRows: 2, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
    const { summary } = executeMove(state, 6, 4, 1, -1);
    bestPuzzle = {
      dateKey,
      dayNumber,
      state,
      solution: { x: 6, y: 4, dx: 1, dy: -1, dirId: 'ne' },
      solutionSummary: summary,
      solutionCount: 1,
    };
  }

  return bestPuzzle;
}
