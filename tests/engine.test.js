import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE,
  createEmptyBoard,
  createInitialState,
  countPieces,
  stepWithBounce,
  executeMove,
  getLegalMoves,
} from '../src/engine.js';

test('initial board has 12 Red and 12 Black pieces on matching parity squares', () => {
  const state = createInitialState();
  const counts = countPieces(state.board);
  assert.equal(counts.p1, 12);
  assert.equal(counts.p2, 12);
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.winner, 0);
});

test('Sam Option B: solo piece at right edge moving diagonally off-board reflects and lands 2 tiles from edge', () => {
  const board = createEmptyBoard();
  board[7][3] = [1, 0]; // Red solo at right edge
  board[0][0] = [0, 1]; // Black piece elsewhere so game continues

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  const { nextState, summary } = executeMove(state, 7, 3, 1, -1); // NE off right edge

  assert.equal(nextState.board[7][3][0], 0, 'origin edge cell should be empty');
  assert.equal(nextState.board[6][2][0], 0, 'replicated piece at (6,2) should be eaten');
  assert.equal(nextState.board[5][1][0], 1, 'piece should land 2 tiles from the edge at (5,1)');
  assert.equal(summary.bounces >= 1, true);
  assert.equal(countPieces(nextState.board).p1, 1);
});

test('corner piece moving diagonally into corner reflects straight back 180 degrees', () => {
  const board = createEmptyBoard();
  board[7][0] = [1, 0];
  board[0][7] = [0, 1];

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  const { nextState } = executeMove(state, 7, 0, 1, -1); // NE into top-right corner

  assert.equal(nextState.board[7][0][0], 0);
  assert.equal(nextState.board[6][1][0], 0);
  assert.equal(nextState.board[5][2][0], 1);
});

test('hopping over a shared tile eats opponent piece first and preserves own piece', () => {
  const board = createEmptyBoard();
  board[2][5] = [1, 0]; // Red backmost
  board[3][4] = [0, 1]; // Black ahead
  board[0][0] = [0, 1]; // Extra black so game doesn't end

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  // Move NE (+1, -1):
  // Phase 1: (2,5) replicates onto (3,4) -> (3,4) becomes shared [1,1]
  // Phase 2: (2,5) lifts, hops over (3,4) -> eats Black (opponent first!), leaving Red [1,0] at (3,4), lands at (4,3)
  const { nextState, summary } = executeMove(state, 2, 5, 1, -1);

  assert.deepEqual(nextState.board[2][5], [0, 0]);
  assert.deepEqual(nextState.board[3][4], [1, 0], 'opponent piece eaten, own piece remains');
  assert.deepEqual(nextState.board[4][3], [1, 0], 'jumper lands on empty tile');
  assert.equal(summary.opponentCaptures, 1);
});

test('lifting backmost piece from a shared tile preserves the opponent piece on that tile', () => {
  const board = createEmptyBoard();
  board[2][5] = [1, 1]; // Shared tile!
  board[0][0] = [0, 1];

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  const { nextState } = executeMove(state, 2, 5, 1, -1);

  assert.deepEqual(nextState.board[2][5], [0, 1], 'opponent piece on starting shared tile must survive');
  assert.deepEqual(nextState.board[3][4], [0, 0]);
  assert.deepEqual(nextState.board[4][3], [1, 0]);
});

test('Sam double-piece carry resolution: leftover double piece resolves by jumping and eating along the way', () => {
  const board = createEmptyBoard();
  // Line along East (dx=1, dy=0) at y=4:
  // Pieces at x=0, gap at x=2, pieces at x=3 and x=4
  board[0][4] = [1, 0];
  board[3][4] = [1, 0];
  board[4][4] = [1, 0];
  board[0][0] = [0, 1]; // Opponent elsewhere

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  // Phase 1 (East):
  //   (0,4) -> spawns at (1,4) => (1,4)=1
  //   (3,4) -> spawns at (4,4) => (4,4)=2 (DOUBLE!)
  //   (4,4) -> spawns at (5,4) => (5,4)=1
  // Phase 2 (Backmost (0,4) hops East):
  //   eats (1,4), lands at empty (2,4)!
  // Phase 3 (Leftover double at (4,4) resolves East):
  //   takes 1 from (4,4) and jumps East -> (4,4)=0, eats (5,4) -> (5,4)=0, lands at (6,4)=1!
  const { nextState, summary } = executeMove(state, 0, 4, 1, 0);

  assert.equal(summary.doubleResolutions, 1);
  assert.equal(nextState.board[4][4][0], 0, 'double piece should be resolved');
  assert.equal(nextState.board[2][4][0], 1, 'backmost landed at (2,4)');
  assert.equal(nextState.board[3][4][0], 1, 'x=3 remains untouched');
  assert.equal(nextState.board[5][4][0], 0, 'x=5 eaten by double carry');
  assert.equal(nextState.board[6][4][0], 1, 'double carry landed at x=6');
});

test('eliminating last opponent piece triggers win', () => {
  const board = createEmptyBoard();
  board[2][4] = [1, 0];
  board[3][4] = [0, 1]; // Last black piece

  const state = { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
  const { nextState, summary } = executeMove(state, 2, 4, 1, 0);

  assert.equal(nextState.winner, 1);
  assert.equal(summary.winner, 1);
  assert.equal(countPieces(nextState.board).p2, 0);
});

test('getLegalMoves deduplicates moves on the same line and direction', () => {
  const state = createInitialState();
  const moves = getLegalMoves(state);
  assert.ok(moves.length > 0 && moves.length < 12 * 8, 'should deduplicate collinear moves');
});

test('stepWithBounce handles orthogonal and diagonal wall bounces', () => {
  assert.deepEqual(stepWithBounce(7, 4, 1, 0), {
    x: 6, y: 4, dx: -1, dy: 0, bounced: true, bouncedX: true, bouncedY: false,
  });
  assert.deepEqual(stepWithBounce(0, 0, -1, -1), {
    x: 1, y: 1, dx: 1, dy: 1, bounced: true, bouncedX: true, bouncedY: true,
  });
});
