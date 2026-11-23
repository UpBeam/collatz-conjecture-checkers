/**
 * Interactive 4-Step Playable Tutorial — Concise, concrete, zero fluff.
 */

import { BOARD_SIZE, createEmptyBoard } from './engine.js';

export const TUTORIAL_STEPS = [
  {
    tag: '1 / 4',
    title: 'Replicate & Hop',
    body: 'Drag either red piece right (→). Every piece on the line clones 1 tile ahead; the back piece hops until it finds an empty square.',
    buildState: () => {
      const board = createEmptyBoard();
      board[1][4] = [1, 0];
      board[2][4] = [1, 0];
      board[7][0] = [0, 1];
      return { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
    },
    hintCell: { x: 1, y: 4 },
  },
  {
    tag: '2 / 4',
    title: 'Capture',
    body: 'Drag the red piece up-right (↗). Hopping eats 1 piece per occupied square—opponent pieces first.',
    buildState: () => {
      const board = createEmptyBoard();
      board[2][5] = [1, 0];
      board[3][4] = [0, 1];
      board[4][3] = [0, 1];
      board[0][0] = [0, 1];
      return { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
    },
    hintCell: { x: 2, y: 5 },
  },
  {
    tag: '3 / 4',
    title: 'Edge Reflection',
    body: 'Drag the edge piece up-right (↗) into the wall. Clones and hops bounce off board edges.',
    buildState: () => {
      const board = createEmptyBoard();
      board[7][3] = [1, 0];
      board[0][0] = [0, 1];
      return { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
    },
    hintCell: { x: 7, y: 3 },
  },
  {
    tag: '4 / 4',
    title: 'Double Carry',
    body: 'Drag the leftmost piece right (→). Any leftover double stack resolves by jumping forward automatically.',
    buildState: () => {
      const board = createEmptyBoard();
      board[0][4] = [1, 0];
      board[3][4] = [1, 0];
      board[4][4] = [1, 0];
      board[7][0] = [0, 1];
      return { size: BOARD_SIZE, board, currentPlayer: 1, turnNumber: 1, winner: 0 };
    },
    hintCell: { x: 0, y: 4 },
  },
];
