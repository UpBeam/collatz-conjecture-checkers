/**
 * Collatz Conjecture Checkers — Rule Tweak Simulator
 *
 * Tests Collatz-faithful tweaks to eliminate:
 *   1. Hard vs Hard Cold-War Standoff (infinite back-rank shuffling)
 *   2. Medium vs Medium Turn-2 Nuclear Blowout (P2 80% win rate)
 */

import {
  BOARD_SIZE,
  createEmptyBoard,
  createInitialState,
  countPieces,
  executeMove,
  getLegalMoves,
} from '../src/engine.js';

const CENTER_CELLS = [
  [3, 3], [4, 3],
  [3, 4], [4, 4],
];

function boardHash(board, currentPlayer) {
  let s = String(currentPlayer) + ':';
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      s += board[x][y][0] + ',' + board[x][y][1] + ';';
    }
  }
  return s;
}

function make8PieceState() {
  const board = createEmptyBoard();
  for (let r = 0; r < 2; r++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if ((r + x) % 2 === 0) board[x][r] = [0, 1];
      if ((r + x + 1) % 2 === 0) board[x][BOARD_SIZE - 1 - r] = [1, 0];
    }
  }
  return { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
}

function centerControl(board) {
  let p1 = 0, p2 = 0;
  for (const [x, y] of CENTER_CELLS) {
    p1 += board[x][y][0];
    p2 += board[x][y][1];
  }
  return { p1, p2 };
}

function evaluateVariantState(state, aiPlayer, cfg, hillPts) {
  if (state.winner === aiPlayer) return 100000;
  if (state.winner !== 0 && state.winner !== 3) return -100000;
  if (state.winner === 3) return 0;

  const { p1, p2 } = countPieces(state.board);
  const myPieces = aiPlayer === 1 ? p1 : p2;
  const oppPieces = aiPlayer === 1 ? p2 : p1;

  const pIdx = aiPlayer - 1;
  const oppIdx = 1 - pIdx;
  let positional = 0;

  for (let x = 0; x < state.size; x++) {
    for (let y = 0; y < state.size; y++) {
      const cell = state.board[x][y];
      if (cell[pIdx] > 0) {
        const d = Math.abs(x - 3.5) + Math.abs(y - 3.5);
        positional += (7 - d) * (cfg.hillTarget ? 1.5 : 0.6);
      }
      if (cell[oppIdx] > 0) {
        const d = Math.abs(x - 3.5) + Math.abs(y - 3.5);
        positional -= (7 - d) * (cfg.hillTarget ? 1.2 : 0.45);
      }
    }
  }

  let hillScore = 0;
  if (cfg.hillTarget) {
    const myH = aiPlayer === 1 ? hillPts[0] : hillPts[1];
    const oppH = aiPlayer === 1 ? hillPts[1] : hillPts[0];
    const cc = centerControl(state.board);
    const myC = aiPlayer === 1 ? cc.p1 : cc.p2;
    const oppC = aiPlayer === 1 ? cc.p2 : cc.p1;
    hillScore = (myH - oppH) * 38 + (myC > oppC ? 16 : oppC > myC ? -16 : 0);
  }

  const elim = oppPieces <= 3 ? (4 - oppPieces) * 18 : 0;
  return (myPieces - oppPieces) * 24 + positional + hillScore + elim;
}

function applyHill(nextState, mover, hillPts, cfg) {
  const nextHill = [hillPts[0], hillPts[1]];
  let winner = nextState.winner;
  if (cfg.hillTarget && winner === 0) {
    const cc = centerControl(nextState.board);
    if (mover === 1 && cc.p1 > cc.p2) nextHill[0] += 1;
    if (mover === 2 && cc.p2 > cc.p1) nextHill[1] += 1;
    if (nextHill[0] >= cfg.hillTarget) winner = 1;
    if (nextHill[1] >= cfg.hillTarget) winner = 2;
  }
  return {
    state: winner !== nextState.winner ? { ...nextState, winner } : nextState,
    hillPts: nextHill,
  };
}

function chooseVariantMove(state, difficulty, cfg, seenStates, hillPts) {
  let moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  const aiPlayer = state.currentPlayer;
  const candidates = [];

  for (const move of moves) {
    const { nextState: rawNext, summary } = executeMove(state, move.x, move.y, move.dx, move.dy);
    const hash = boardHash(rawNext.board, rawNext.currentPlayer);
    if (cfg.superKo && seenStates.has(hash)) continue;
    if (cfg.maxBounces != null && summary.bounces > cfg.maxBounces) continue;

    const { state: nextState, hillPts: nextHill } = applyHill(rawNext, aiPlayer, hillPts, cfg);
    const score =
      evaluateVariantState(nextState, aiPlayer, cfg, nextHill) +
      summary.opponentCaptures * 10;
    candidates.push({ move, nextState, nextHill, summary, score, hash });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  if (candidates[0].nextState.winner === aiPlayer) return candidates[0];

  if (difficulty === 'medium') {
    const best = candidates[0].score;
    const near = candidates.filter((c) => c.score >= best - 6).slice(0, 3);
    return near[Math.floor(Math.random() * near.length)];
  }

  // Hard: 2-ply alpha-beta over top 12 moves
  const top = candidates.slice(0, 12);
  let bestCand = top[0];
  let bestVal = -Infinity;
  let alpha = -Infinity;

  for (const cand of top) {
    const oppMoves = getLegalMoves(cand.nextState);
    if (oppMoves.length === 0) return cand;

    let worst = Infinity;
    let legalOpp = 0;
    for (const om of oppMoves) {
      const { nextState: oppRaw, summary: oppSum } = executeMove(cand.nextState, om.x, om.y, om.dx, om.dy);
      if (cfg.superKo && (seenStates.has(boardHash(oppRaw.board, oppRaw.currentPlayer)) || boardHash(oppRaw.board, oppRaw.currentPlayer) === cand.hash)) {
        continue;
      }
      if (cfg.maxBounces != null && oppSum.bounces > cfg.maxBounces) continue;
      legalOpp++;

      const { state: afterOpp, hillPts: afterHill } = applyHill(oppRaw, cand.nextState.currentPlayer, cand.nextHill, cfg);
      const val = evaluateVariantState(afterOpp, aiPlayer, cfg, afterHill);
      if (val < worst) worst = val;
      if (worst <= alpha) break;
    }

    if (legalOpp === 0) return cand; // Opponent has no legal non-repeating moves!

    // Tiny jitter for tie-breaking variety
    const finalScore = worst + cand.summary.opponentCaptures * 0.6 + Math.random() * 0.5;
    if (finalScore > bestVal) {
      bestVal = finalScore;
      bestCand = cand;
    }
    if (bestVal > alpha) alpha = bestVal;
  }

  return bestCand;
}

function runVariant(name, cfg, games, p1Diff, p2Diff, maxTurns = 120) {
  let p1w = 0, p2w = 0, draws = 0, timeouts = 0;
  let hillWins = 0, elimWins = 0;
  const turnList = [];
  let totalCaps = 0, totalBounces = 0, maxSingleCap = 0;

  for (let g = 0; g < games; g++) {
    let state = cfg.start8 ? make8PieceState() : createInitialState();
    let hillPts = [0, 0];
    const seen = new Set([boardHash(state.board, state.currentPlayer)]);
    let turns = 0;
    let wonByHill = false;

    while (state.winner === 0 && turns < maxTurns) {
      const diff = state.currentPlayer === 1 ? p1Diff : p2Diff;
      const chosen = chooseVariantMove(state, diff, cfg, seen, hillPts);
      if (!chosen) {
        // No legal moves (e.g. Super-Ko trapped) -> current player loses
        state = { ...state, winner: state.currentPlayer === 1 ? 2 : 1 };
        break;
      }
      totalCaps += chosen.summary.opponentCaptures;
      totalBounces += chosen.summary.bounces;
      if (chosen.summary.opponentCaptures > maxSingleCap) {
        maxSingleCap = chosen.summary.opponentCaptures;
      }

      const prevElimWinner = chosen.summary.winner;
      state = chosen.nextState;
      hillPts = chosen.nextHill;
      seen.add(chosen.hash);
      turns++;

      if (state.winner !== 0 && prevElimWinner === 0) {
        wonByHill = true;
      }
    }

    if (state.winner === 1) p1w++;
    else if (state.winner === 2) p2w++;
    else if (state.winner === 3) draws++;
    else timeouts++;

    if (state.winner === 1 || state.winner === 2) {
      turnList.push(turns);
      if (wonByHill) hillWins++;
      else elimWins++;
    }
  }

  turnList.sort((a, b) => a - b);
  const med = turnList.length ? turnList[Math.floor(turnList.length / 2)] : 'N/A';
  console.log(`\n=== ${name} [${p1Diff} vs ${p2Diff}, n=${games}] ===`);
  console.log(`  P1=${p1w} (${Math.round((p1w / games) * 100)}%) | P2=${p2w} (${Math.round((p2w / games) * 100)}%) | Draw=${draws} | Timeout=${timeouts}`);
  console.log(`  WinType: Elim=${elimWins}, Hill=${hillWins} | medTurns=${med} | caps/g=${(totalCaps / games).toFixed(1)} | maxCap=${maxSingleCap} | bounces/g=${(totalBounces / games).toFixed(1)}`);
}

console.log('Simulating Collatz-faithful rule tweaks...');
runVariant('V1: 12pc + Super-Ko', { start8: false, superKo: true, hillTarget: 0 }, 16, 'hard', 'hard');
runVariant('V2: 8pc + Super-Ko', { start8: true, superKo: true, hillTarget: 0 }, 16, 'hard', 'hard');
runVariant('V3: 12pc + Super-Ko + Center Hill (5pt)', { start8: false, superKo: true, hillTarget: 5 }, 20, 'hard', 'hard');
runVariant('V3: 12pc + Super-Ko + Center Hill (5pt)', { start8: false, superKo: true, hillTarget: 5 }, 30, 'medium', 'medium');
runVariant('V4: 8pc + Super-Ko + Center Hill (5pt)', { start8: true, superKo: true, hillTarget: 5 }, 20, 'hard', 'hard');
runVariant('V4: 8pc + Super-Ko + Center Hill (5pt)', { start8: true, superKo: true, hillTarget: 5 }, 30, 'medium', 'medium');
runVariant('V5: 8pc + Super-Ko + Center Hill (7pt)', { start8: true, superKo: true, hillTarget: 7 }, 20, 'hard', 'hard');
runVariant('V5: 8pc + Super-Ko + Center Hill (7pt)', { start8: true, superKo: true, hillTarget: 7 }, 20, 'hard', 'medium');
