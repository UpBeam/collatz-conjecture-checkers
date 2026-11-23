/**
 * Move History, Undo/Redo, and Replay Manager
 */

import { cloneBoard, getBoardHash } from './engine.js';

function cloneState(state) {
  return {
    size: state.size,
    startingRows: state.startingRows,
    board: cloneBoard(state.board),
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    winner: state.winner,
  };
}

export class GameHistory {
  constructor(initialState) {
    this.reset(initialState);
  }

  reset(initialState) {
    this.entries = [
      {
        state: cloneState(initialState),
        summary: null,
        events: null,
        move: null,
      },
    ];
    this.cursor = 0;
  }

  get current() {
    return this.entries[this.cursor];
  }

  get state() {
    return cloneState(this.entries[this.cursor].state);
  }

  get length() {
    return this.entries.length;
  }

  get moveCount() {
    return this.entries.length - 1;
  }

  canUndo() {
    return this.cursor > 0;
  }

  canRedo() {
    return this.cursor < this.entries.length - 1;
  }

  push(nextState, move, summary, events) {
    // Discard redo branch if we branched from an earlier point
    if (this.cursor < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.cursor + 1);
    }
    this.entries.push({
      state: cloneState(nextState),
      move,
      summary,
      events,
    });
    this.cursor = this.entries.length - 1;
  }

  undo(steps = 1) {
    const target = Math.max(0, this.cursor - steps);
    if (target === this.cursor) return null;
    this.cursor = target;
    return this.state;
  }

  redo(steps = 1) {
    const target = Math.min(this.entries.length - 1, this.cursor + steps);
    if (target === this.cursor) return null;
    this.cursor = target;
    return this.state;
  }

  jumpTo(index) {
    const clamped = Math.max(0, Math.min(this.entries.length - 1, index));
    this.cursor = clamped;
    return this.entries[this.cursor];
  }

  getSeenHashes() {
    const set = new Set();
    for (let i = 0; i <= this.cursor; i++) {
      const st = this.entries[i].state;
      set.add(getBoardHash(st.board, st.currentPlayer));
    }
    return set;
  }
}
