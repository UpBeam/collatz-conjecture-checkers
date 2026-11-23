import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, createEmptyBoard, BOARD_SIZE, executeMove } from '../src/engine.js';
import { chooseAIMove } from '../src/ai.js';

test('AI chooses valid moves across easy, medium, and hard difficulties', () => {
  const state = createInitialState();
  for (const diff of ['easy', 'medium', 'hard']) {
    const move = chooseAIMove(state, diff);
    assert.ok(move, `AI (${diff}) should return a move`);
    const { nextState } = executeMove(state, move.x, move.y, move.dx, move.dy);
    assert.equal(nextState.turnNumber, 2);
  }
});

test('AI spots an immediate winning capture', () => {
  const board = createEmptyBoard();
  board[2][4] = [0, 1]; // AI (Player 2)
  board[3][4] = [1, 0]; // Last Red piece
  const state = { size: BOARD_SIZE, board, currentPlayer: 2, turnNumber: 10, winner: 0 };

  const move = chooseAIMove(state, 'hard');
  assert.ok(move);
  const { nextState } = executeMove(state, move.x, move.y, move.dx, move.dy);
  assert.equal(nextState.winner, 2, 'AI should take the immediate winning move');
});
