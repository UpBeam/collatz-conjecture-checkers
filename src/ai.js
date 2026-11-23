/**
 * Collatz Conjecture Checkers — AI Opponent (Easy / Medium / Hard)
 */

import { countPieces, executeMove, getLegalMoves } from './engine.js';

function evaluateState(state, aiPlayer) {
  if (state.winner === aiPlayer) return 100000;
  if (state.winner !== 0 && state.winner !== 3) return -100000;
  if (state.winner === 3) return 0;

  const { p1, p2 } = countPieces(state.board);
  const myPieces = aiPlayer === 1 ? p1 : p2;
  const oppPieces = aiPlayer === 1 ? p2 : p1;

  // Center control & shared-tile pressure
  const pIdx = aiPlayer - 1;
  const oppIdx = 1 - pIdx;
  let positional = 0;
  let sharedBonus = 0;

  for (let x = 0; x < state.size; x++) {
    for (let y = 0; y < state.size; y++) {
      const cell = state.board[x][y];
      if (cell[pIdx] > 0) {
        const distCenter = Math.abs(x - 3.5) + Math.abs(y - 3.5);
        positional += (7 - distCenter) * 0.6;
        if (cell[oppIdx] > 0) sharedBonus += 1.2;
      }
      if (cell[oppIdx] > 0) {
        const distCenter = Math.abs(x - 3.5) + Math.abs(y - 3.5);
        positional -= (7 - distCenter) * 0.45;
      }
    }
  }

  // Piece advantage is king, with strong incentive to push opponent toward 0
  const eliminationPressure = oppPieces <= 3 ? (4 - oppPieces) * 18 : 0;
  return (myPieces - oppPieces) * 24 + positional + sharedBonus + eliminationPressure;
}

/**
 * Chooses a move for `state.currentPlayer` given difficulty: 'easy' | 'medium' | 'hard'.
 */
export function chooseAIMove(state, difficulty = 'medium') {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  const aiPlayer = state.currentPlayer;

  // Score all immediate 1-ply outcomes
  const scored = moves.map((move) => {
    const { nextState, summary } = executeMove(state, move.x, move.y, move.dx, move.dy);
    const immediateScore =
      evaluateState(nextState, aiPlayer) +
      summary.opponentCaptures * 12 +
      summary.bounces * 1.5;
    return { move, nextState, summary, score: immediateScore };
  });

  scored.sort((a, b) => b.score - a.score);

  // Instant win check
  if (scored[0].nextState.winner === aiPlayer) {
    return scored[0].move;
  }

  if (difficulty === 'easy') {
    // Pick from top 60% of moves with mild preference for fun/active moves
    const poolSize = Math.max(2, Math.ceil(scored.length * 0.6));
    const idx = Math.floor(Math.random() * poolSize);
    return scored[idx].move;
  }

  if (difficulty === 'medium') {
    // Pick among top 3 moves within a small score band for natural variety
    const best = scored[0].score;
    const nearBest = scored.filter((s) => s.score >= best - 8).slice(0, 3);
    return nearBest[Math.floor(Math.random() * nearBest.length)].move;
  }

  // Hard: 2-ply Alpha-Beta over top 14 candidate moves
  const candidates = scored.slice(0, 14);
  let bestMove = candidates[0].move;
  let bestVal = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const cand of candidates) {
    const oppMoves = getLegalMoves(cand.nextState);
    if (oppMoves.length === 0) {
      return cand.move;
    }

    // Opponent minimizes AI score
    let worstForAI = Infinity;
    // Evaluate opponent's best replies (order by opponent captures/piece delta)
    for (const oppMove of oppMoves) {
      const { nextState: afterOpp } = executeMove(
        cand.nextState,
        oppMove.x,
        oppMove.y,
        oppMove.dx,
        oppMove.dy
      );
      const val = evaluateState(afterOpp, aiPlayer);
      if (val < worstForAI) {
        worstForAI = val;
      }
      if (worstForAI <= alpha) {
        break; // Beta cutoff
      }
    }

    // Slight tie-breaker favoring immediate captures & flashy bounces
    const finalScore = worstForAI + cand.summary.opponentCaptures * 0.8 + cand.summary.bounces * 0.2;
    if (finalScore > bestVal) {
      bestVal = finalScore;
      bestMove = cand.move;
    }
    if (bestVal > alpha) {
      alpha = bestVal;
    }
    if (alpha >= beta) break;
  }

  return bestMove;
}
