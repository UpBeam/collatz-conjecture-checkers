/**
 * Collatz Conjecture Checkers — AI Opponent (Easy / Medium / Hard)
 * Super-Ko aware: avoids repeating previously seen board states.
 */

import { countPieces, executeMove, getBoardHash, getLegalMoves } from './engine.js';

function evaluateState(state, aiPlayer) {
  if (state.winner === aiPlayer) return 100000;
  if (state.winner !== 0 && state.winner !== 3) return -100000;
  if (state.winner === 3) return 0;

  const { p1, p2 } = countPieces(state.board);
  const myPieces = aiPlayer === 1 ? p1 : p2;
  const oppPieces = aiPlayer === 1 ? p2 : p1;

  const pIdx = aiPlayer - 1;
  const oppIdx = 1 - pIdx;
  const mid = (state.size - 1) / 2;
  const maxDist = state.size - 1;
  let positional = 0;
  let sharedBonus = 0;

  for (let x = 0; x < state.size; x++) {
    for (let y = 0; y < state.size; y++) {
      const cell = state.board[x][y];
      if (cell[pIdx] > 0) {
        const distCenter = Math.abs(x - mid) + Math.abs(y - mid);
        positional += (maxDist - distCenter) * 0.6;
        if (cell[oppIdx] > 0) sharedBonus += 1.2;
      }
      if (cell[oppIdx] > 0) {
        const distCenter = Math.abs(x - mid) + Math.abs(y - mid);
        positional -= (maxDist - distCenter) * 0.45;
      }
    }
  }

  const eliminationPressure = oppPieces <= 3 ? (4 - oppPieces) * 18 : 0;
  return (myPieces - oppPieces) * 24 + positional + sharedBonus + eliminationPressure;
}

/**
 * Chooses a move for `state.currentPlayer` given difficulty: 'easy' | 'medium' | 'hard'.
 */
export function chooseAIMove(state, difficulty = 'medium', seenHashes = null) {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  const aiPlayer = state.currentPlayer;
  const scored = [];

  for (const move of moves) {
    const { nextState, summary } = executeMove(state, move.x, move.y, move.dx, move.dy);
    const hash = getBoardHash(nextState.board, nextState.currentPlayer);
    if (seenHashes && seenHashes.has(hash)) continue;

    const immediateScore =
      evaluateState(nextState, aiPlayer) +
      summary.opponentCaptures * 12 +
      summary.bounces * 1.5;
    scored.push({ move, nextState, summary, hash, score: immediateScore });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);

  if (scored[0].nextState.winner === aiPlayer) {
    return scored[0].move;
  }

  if (difficulty === 'easy') {
    const poolSize = Math.max(2, Math.ceil(scored.length * 0.6));
    const idx = Math.floor(Math.random() * Math.min(poolSize, scored.length));
    return scored[idx].move;
  }

  if (difficulty === 'medium') {
    const best = scored[0].score;
    const nearBest = scored.filter((s) => s.score >= best - 8).slice(0, 3);
    return nearBest[Math.floor(Math.random() * nearBest.length)].move;
  }

  // Hard: 2-ply Alpha-Beta over top 14 candidate moves
  const candidates = scored.slice(0, 14);
  let bestMove = candidates[0].move;
  let bestVal = -Infinity;
  let alpha = -Infinity;

  for (const cand of candidates) {
    const oppMoves = getLegalMoves(cand.nextState);
    if (oppMoves.length === 0) return cand.move;

    let worstForAI = Infinity;
    let legalReplies = 0;

    for (const oppMove of oppMoves) {
      const { nextState: afterOpp } = executeMove(
        cand.nextState,
        oppMove.x,
        oppMove.y,
        oppMove.dx,
        oppMove.dy
      );
      if (seenHashes) {
        const oppHash = getBoardHash(afterOpp.board, afterOpp.currentPlayer);
        if (seenHashes.has(oppHash) || oppHash === cand.hash) continue;
      }
      legalReplies++;

      const val = evaluateState(afterOpp, aiPlayer);
      if (val < worstForAI) worstForAI = val;
      if (worstForAI <= alpha) break;
    }

    if (legalReplies === 0) return cand.move; // Opponent trapped by Super-Ko

    const finalScore =
      worstForAI +
      cand.summary.opponentCaptures * 0.8 +
      cand.summary.bounces * 0.2 +
      Math.random() * 0.4;
    if (finalScore > bestVal) {
      bestVal = finalScore;
      bestMove = cand.move;
    }
    if (bestVal > alpha) alpha = bestVal;
  }

  return bestMove;
}
