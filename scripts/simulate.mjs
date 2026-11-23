/**
 * Collatz Conjecture Checkers — Simulation & Game Balance Analyzer
 *
 * Plays AI-vs-AI and Random-vs-Random matches to measure:
 *  - First-player advantage (P1 vs P2 win rate)
 *  - Termination rate & turn length distribution
 *  - Piece count dynamics (bloat vs convergence)
 *  - Skill gradient (Hard > Medium > Easy > Random)
 *  - Bounce, capture, double-carry, and comeback rates
 */

import {
  createInitialState,
  countPieces,
  executeMove,
  getLegalMoves,
} from '../src/engine.js';
import { chooseAIMove } from '../src/ai.js';

function pickMove(state, agent) {
  if (agent === 'random') {
    const moves = getLegalMoves(state);
    return moves[Math.floor(Math.random() * moves.length)] || null;
  }
  return chooseAIMove(state, agent);
}

function playMatch(p1Agent, p2Agent, maxTurns = 160) {
  let state = createInitialState();
  let turns = 0;
  let totalCaptures = 0;
  let totalBounces = 0;
  let totalDoubles = 0;
  let maxTotalPieces = 24;
  let maxBranching = 0;
  let branchingSum = 0;
  let p1MaxDeficit = 0;
  let p2MaxDeficit = 0;

  while (state.winner === 0 && turns < maxTurns) {
    const moves = getLegalMoves(state);
    branchingSum += moves.length;
    if (moves.length > maxBranching) maxBranching = moves.length;

    const agent = state.currentPlayer === 1 ? p1Agent : p2Agent;
    const move = pickMove(state, agent);
    if (!move) break;

    const { nextState, summary } = executeMove(state, move.x, move.y, move.dx, move.dy);
    state = nextState;
    turns++;

    totalCaptures += summary.opponentCaptures;
    totalBounces += summary.bounces;
    totalDoubles += summary.doubleResolutions;

    const counts = countPieces(state.board);
    if (counts.total > maxTotalPieces) maxTotalPieces = counts.total;
    if (counts.p2 - counts.p1 > p1MaxDeficit) p1MaxDeficit = counts.p2 - counts.p1;
    if (counts.p1 - counts.p2 > p2MaxDeficit) p2MaxDeficit = counts.p1 - counts.p2;
  }

  const finalCounts = countPieces(state.board);
  const comeback =
    (state.winner === 1 && p1MaxDeficit >= 4) ||
    (state.winner === 2 && p2MaxDeficit >= 4);

  return {
    winner: state.winner, // 0 = timeout, 1 = P1, 2 = P2, 3 = draw
    turns,
    totalCaptures,
    totalBounces,
    totalDoubles,
    maxTotalPieces,
    finalTotalPieces: finalCounts.total,
    avgBranching: turns > 0 ? branchingSum / turns : 0,
    comeback,
  };
}

function runSuite(label, p1Agent, p2Agent, games, maxTurns = 160) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < games; i++) {
    results.push(playMatch(p1Agent, p2Agent, maxTurns));
  }
  const elapsedMs = Math.round(performance.now() - t0);

  const p1Wins = results.filter((r) => r.winner === 1).length;
  const p2Wins = results.filter((r) => r.winner === 2).length;
  const draws = results.filter((r) => r.winner === 3).length;
  const timeouts = results.filter((r) => r.winner === 0).length;

  const finished = results.filter((r) => r.winner !== 0);
  const turnList = finished.map((r) => r.turns).sort((a, b) => a - b);
  const medianTurns = turnList.length ? turnList[Math.floor(turnList.length / 2)] : null;
  const avgTurns = finished.length
    ? (finished.reduce((s, r) => s + r.turns, 0) / finished.length).toFixed(1)
    : 'N/A';
  const minTurns = turnList.length ? turnList[0] : 'N/A';
  const maxFinTurns = turnList.length ? turnList[turnList.length - 1] : 'N/A';

  const avgMaxPieces = (results.reduce((s, r) => s + r.maxTotalPieces, 0) / games).toFixed(1);
  const avgCaptures = (results.reduce((s, r) => s + r.totalCaptures, 0) / games).toFixed(1);
  const avgBounces = (results.reduce((s, r) => s + r.totalBounces, 0) / games).toFixed(1);
  const avgDoubles = (results.reduce((s, r) => s + r.totalDoubles, 0) / games).toFixed(2);
  const avgBranch = (results.reduce((s, r) => s + r.avgBranching, 0) / games).toFixed(1);
  const comebacks = finished.filter((r) => r.comeback).length;

  console.log(`\n=== ${label} (${games} games, ${elapsedMs}ms) ===`);
  console.log(`  Outcomes : P1=${p1Wins} (${((p1Wins / games) * 100).toFixed(1)}%) | P2=${p2Wins} (${((p2Wins / games) * 100).toFixed(1)}%) | Draw=${draws} | Timeout(>${maxTurns}t)=${timeouts}`);
  console.log(`  Length   : min=${minTurns}, median=${medianTurns}, mean=${avgTurns}, max=${maxFinTurns}`);
  console.log(`  Dynamics : peakPieces=${avgMaxPieces}, captures/game=${avgCaptures}, bounces/game=${avgBounces}, doubleCarries/game=${avgDoubles}`);
  console.log(`  Depth    : avgLegalMoves=${avgBranch}, comebacks(4+ down)=${comebacks}/${finished.length}`);
}

console.log('Running Collatz Conjecture Checkers Simulations...');
runSuite('Random vs Random', 'random', 'random', 80, 160);
runSuite('Easy vs Easy', 'easy', 'easy', 50, 160);
runSuite('Medium vs Medium', 'medium', 'medium', 40, 160);
runSuite('Medium (P1) vs Easy (P2)', 'medium', 'easy', 30, 160);
runSuite('Easy (P1) vs Medium (P2)', 'easy', 'medium', 30, 160);
runSuite('Hard (P1) vs Medium (P2)', 'hard', 'medium', 12, 160);
runSuite('Medium (P1) vs Hard (P2)', 'medium', 'hard', 12, 160);
