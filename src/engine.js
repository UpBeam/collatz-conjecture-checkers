/**
 * Sam Palmer's Collatz Conjecture Checkers — Pure Game Engine
 *
 * Board coordinates:
 *   x ∈ [0..7] (left to right, columns)
 *   y ∈ [0..7] (top to bottom, rows)
 * Each cell is [p1Count, p2Count]:
 *   Player 1 (Red / index 0) starts on bottom 3 rows (y = 5, 6, 7)
 *   Player 2 (Black/Cyan / index 1) starts on top 3 rows (y = 0, 1, 2)
 */

export const BOARD_SIZE = 8;

export const DIRECTIONS = [
  { id: 'n',  dx:  0, dy: -1, label: 'N',  angle: -90 },
  { id: 'ne', dx:  1, dy: -1, label: 'NE', angle: -45 },
  { id: 'e',  dx:  1, dy:  0, label: 'E',  angle:   0 },
  { id: 'se', dx:  1, dy:  1, label: 'SE', angle:  45 },
  { id: 's',  dx:  0, dy:  1, label: 'S',  angle:  90 },
  { id: 'sw', dx: -1, dy:  1, label: 'SW', angle: 135 },
  { id: 'w',  dx: -1, dy:  0, label: 'W',  angle: 180 },
  { id: 'nw', dx: -1, dy: -1, label: 'NW', angle: -135 },
];

export const DIR_BY_ID = Object.fromEntries(DIRECTIONS.map((d) => [d.id, d]));

export function createEmptyBoard(size = BOARD_SIZE) {
  const board = [];
  for (let x = 0; x < size; x++) {
    board[x] = [];
    for (let y = 0; y < size; y++) {
      board[x][y] = [0, 0];
    }
  }
  return board;
}

export function createInitialBoard(size = BOARD_SIZE, startingRows = 2) {
  const board = createEmptyBoard(size);
  for (let rowOffset = 0; rowOffset < startingRows; rowOffset++) {
    for (let x = 0; x < size; x++) {
      // Player 2 (top rows)
      if ((rowOffset + x) % 2 === 0) {
        board[x][rowOffset] = [0, 1];
      }
      // Player 1 (bottom rows)
      if ((rowOffset + x + 1) % 2 === 0) {
        board[x][size - rowOffset - 1] = [1, 0];
      }
    }
  }
  return board;
}

export function cloneBoard(board) {
  return board.map((col) => col.map((cell) => [cell[0], cell[1]]));
}

export function createInitialState(size = BOARD_SIZE, startingRows = 2) {
  return {
    size,
    startingRows,
    board: createInitialBoard(size, startingRows),
    currentPlayer: 1,
    turnNumber: 1,
    winner: 0,
  };
}

export function getBoardHash(board, currentPlayer) {
  let out = `${currentPlayer}:`;
  for (let x = 0; x < board.length; x++) {
    for (let y = 0; y < board[x].length; y++) {
      out += `${board[x][y][0]}${board[x][y][1]}`;
    }
  }
  return out;
}

export function countPieces(board) {
  let p1 = 0;
  let p2 = 0;
  for (let x = 0; x < board.length; x++) {
    for (let y = 0; y < board[x].length; y++) {
      p1 += board[x][y][0];
      p2 += board[x][y][1];
    }
  }
  return { p1, p2, total: p1 + p2 };
}

export function checkWinner(board) {
  const { p1, p2 } = countPieces(board);
  if (p1 > 0 && p2 > 0) return 0;
  if (p1 > 0 && p2 === 0) return 1;
  if (p2 > 0 && p1 === 0) return 2;
  return 3; // Mutual elimination (edge case)
}

/**
 * Steps 1 tile from (x, y) in direction (dx, dy), reflecting off board edges.
 */
export function stepWithBounce(x, y, dx, dy, size = BOARD_SIZE) {
  let ndx = dx;
  let ndy = dy;
  let bouncedX = false;
  let bouncedY = false;

  if (x + ndx < 0 || x + ndx >= size) {
    ndx = -ndx;
    bouncedX = true;
  }
  if (y + ndy < 0 || y + ndy >= size) {
    ndy = -ndy;
    bouncedY = true;
  }

  return {
    x: x + ndx,
    y: y + ndy,
    dx: ndx,
    dy: ndy,
    bounced: bouncedX || bouncedY,
    bouncedX,
    bouncedY,
  };
}

/**
 * Returns all cells on the straight line through (x, y) along (dx, dy),
 * ordered from the backmost edge to the frontmost edge.
 */
export function getLineCells(x, y, dx, dy, size = BOARD_SIZE) {
  if (dx === 0 && dy === 0) return [{ x, y }];

  let bx = x;
  let by = y;
  while (bx - dx >= 0 && bx - dx < size && by - dy >= 0 && by - dy < size) {
    bx -= dx;
    by -= dy;
  }

  const cells = [];
  let cx = bx;
  let cy = by;
  while (cx >= 0 && cx < size && cy >= 0 && cy < size) {
    cells.push({ x: cx, y: cy });
    cx += dx;
    cy += dy;
  }
  return cells;
}

/**
 * Canonical key for a (line, direction) pair so duplicate moves on the same
 * line in the same direction can be deduplicated.
 */
export function getLineMoveKey(x, y, dx, dy, size = BOARD_SIZE) {
  const line = getLineCells(x, y, dx, dy, size);
  const start = line[0];
  return `${start.x},${start.y}:${dx},${dy}`;
}

export function isValidMove(state, x, y, dx, dy) {
  if (state.winner !== 0) return false;
  if (dx === 0 && dy === 0) return false;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
  if (x < 0 || x >= state.size || y < 0 || y >= state.size) return false;
  const pIdx = state.currentPlayer - 1;
  return state.board[x][y][pIdx] > 0;
}

/**
 * Runs a single hopping piece starting at (startX, startY) moving in (dx, dy).
 * Mutates `board` in-place and appends structured events to `events`.
 */
function runHop(board, size, player, startX, startY, startDx, startDy, isDoubleCarry, events) {
  const pIdx = player - 1;
  const oppIdx = 1 - pIdx;

  let cx = startX;
  let cy = startY;
  let dx = startDx;
  let dy = startDy;

  let hops = 0;
  let bounces = 0;
  let opponentCaptures = 0;
  let selfCaptures = 0;
  const maxSteps = size * size * 4;

  events.push({
    type: 'hop_start',
    x: cx,
    y: cy,
    player,
    isDoubleCarry,
    boardAfter: cloneBoard(board),
  });

  for (let step = 0; step < maxSteps; step++) {
    const next = stepWithBounce(cx, cy, dx, dy, size);
    const nx = next.x;
    const ny = next.y;
    dx = next.dx;
    dy = next.dy;
    if (next.bounced) bounces++;
    hops++;

    const cell = board[nx][ny];
    const isEmpty = cell[0] === 0 && cell[1] === 0;

    if (isEmpty) {
      cell[pIdx] += 1;
      events.push({
        type: 'hop_step',
        fromX: cx,
        fromY: cy,
        toX: nx,
        toY: ny,
        dx,
        dy,
        bounced: next.bounced,
        bouncedX: next.bouncedX,
        bouncedY: next.bouncedY,
        eaten: null,
        landed: true,
        stepIndex: step,
        player,
        isDoubleCarry,
        boardAfter: cloneBoard(board),
      });
      return { landedX: nx, landedY: ny, hops, bounces, opponentCaptures, selfCaptures };
    }

    // Occupied: eat 1 piece (prioritize opponent's piece first per agreed rules)
    let eaten = null;
    if (cell[oppIdx] > 0) {
      cell[oppIdx] -= 1;
      eaten = oppIdx + 1;
      opponentCaptures++;
    } else if (cell[pIdx] > 0) {
      cell[pIdx] -= 1;
      eaten = pIdx + 1;
      selfCaptures++;
    }

    events.push({
      type: 'hop_step',
      fromX: cx,
      fromY: cy,
      toX: nx,
      toY: ny,
      dx,
      dy,
      bounced: next.bounced,
      bouncedX: next.bouncedX,
      bouncedY: next.bouncedY,
      eaten,
      landed: false,
      stepIndex: step,
      player,
      isDoubleCarry,
      boardAfter: cloneBoard(board),
    });

    cx = nx;
    cy = ny;
  }

  // Fallback safety (should never occur because every hop removes a piece)
  board[cx][cy][pIdx] += 1;
  return { landedX: cx, landedY: cy, hops, bounces, opponentCaptures, selfCaptures };
}

/**
 * Executes a full Collatz Conjecture Checkers move:
 *  1. Replication along the chosen line in (dx, dy), reflecting off edges (Sam's Option B).
 *  2. Backmost piece of currentPlayer hops forward, eating 1 piece per occupied tile
 *     (opponent first) and reflecting off walls until landing in an empty tile.
 *  3. Any remaining double pieces (count >= 2 of currentPlayer) resolve themselves by
 *     jumping in their direction, consuming 1 from their starting tile + 1 per tile
 *     passed until landing in an empty tile.
 */
export function executeMove(state, x, y, dx, dy) {
  if (!isValidMove(state, x, y, dx, dy)) {
    throw new Error(`Invalid move at (${x},${y}) dir (${dx},${dy}) for player ${state.currentPlayer}`);
  }

  const size = state.size;
  const player = state.currentPlayer;
  const pIdx = player - 1;
  const board = cloneBoard(state.board);
  const line = getLineCells(x, y, dx, dy, size);
  const events = [];

  // Record binary representation of current player's pieces along the line (for Math-Chic UI!)
  const binaryBefore = line.map((c) => (board[c.x][c.y][pIdx] > 0 ? '1' : '0')).join('');

  events.push({
    type: 'select_line',
    line,
    player,
    dx,
    dy,
    originX: x,
    originY: y,
  });

  // Identify all current player's pieces currently on this line (ordered back -> front)
  const activeCells = line.filter((c) => board[c.x][c.y][pIdx] > 0);
  const backmost = activeCells[0];

  // Track direction associated with any tile that receives a replicated piece
  // (in case a reflected replication causes a leftover double piece)
  const doubleDirMap = new Map();

  // Phase 1: Replication (iterate front -> back on snapshot so each piece replicates once)
  const spawns = [];
  for (let i = activeCells.length - 1; i >= 0; i--) {
    const src = activeCells[i];
    const dest = stepWithBounce(src.x, src.y, dx, dy, size);
    board[dest.x][dest.y][pIdx] += 1;
    doubleDirMap.set(`${dest.x},${dest.y}`, { dx: dest.dx, dy: dest.dy });
    spawns.push({
      fromX: src.x,
      fromY: src.y,
      toX: dest.x,
      toY: dest.y,
      bounced: dest.bounced,
      bouncedX: dest.bouncedX,
      bouncedY: dest.bouncedY,
      player,
      newCount: board[dest.x][dest.y][pIdx],
    });
  }

  events.push({
    type: 'replicate',
    spawns,
    player,
    boardAfter: cloneBoard(board),
  });

  // Phase 2: Backmost piece lifts and hops
  board[backmost.x][backmost.y][pIdx] -= 1;
  const mainHop = runHop(board, size, player, backmost.x, backmost.y, dx, dy, false, events);

  let totalHops = mainHop.hops;
  let totalBounces = mainHop.bounces + spawns.filter((s) => s.bounced).length;
  let totalOpponentCaptures = mainHop.opponentCaptures;
  let totalSelfCaptures = mainHop.selfCaptures;
  let doubleResolutions = 0;

  // Phase 3: Resolve any remaining double pieces (Sam's carry rule)
  // Scan line back-to-front first, then full board for any reflected doubles
  const maxDoublePasses = 32;
  for (let pass = 0; pass < maxDoublePasses; pass++) {
    let doubleCell = null;

    for (const c of line) {
      if (board[c.x][c.y][pIdx] >= 2) {
        doubleCell = c;
        break;
      }
    }
    if (!doubleCell) {
      outer: for (let cx = 0; cx < size; cx++) {
        for (let cy = 0; cy < size; cy++) {
          if (board[cx][cy][pIdx] >= 2) {
            doubleCell = { x: cx, y: cy };
            break outer;
          }
        }
      }
    }

    if (!doubleCell) break;

    doubleResolutions++;
    // One piece jumps AND takes one from the starting tile (consuming 2 of currentPlayer's pieces)
    board[doubleCell.x][doubleCell.y][pIdx] -= 2;
    totalSelfCaptures += 1;

    const dirInfo = doubleDirMap.get(`${doubleCell.x},${doubleCell.y}`) || { dx, dy };
    const carryHop = runHop(
      board,
      size,
      player,
      doubleCell.x,
      doubleCell.y,
      dirInfo.dx,
      dirInfo.dy,
      true,
      events
    );
    totalHops += carryHop.hops;
    totalBounces += carryHop.bounces;
    totalOpponentCaptures += carryHop.opponentCaptures;
    totalSelfCaptures += carryHop.selfCaptures;
  }

  const winner = checkWinner(board);
  const nextPlayer = winner === 0 ? (player === 1 ? 2 : 1) : player;
  const counts = countPieces(board);
  const binaryAfter = line.map((c) => (board[c.x][c.y][pIdx] > 0 ? '1' : '0')).join('');

  events.push({
    type: 'turn_end',
    nextPlayer,
    winner,
    counts,
  });

  const nextState = {
    size,
    board,
    currentPlayer: nextPlayer,
    turnNumber: state.turnNumber + 1,
    winner,
  };

  const summary = {
    player,
    originX: x,
    originY: y,
    backmostX: backmost.x,
    backmostY: backmost.y,
    dx,
    dy,
    dirId: DIRECTIONS.find((d) => d.dx === dx && d.dy === dy)?.id || '?',
    replicatedCount: spawns.length,
    hops: totalHops,
    bounces: totalBounces,
    opponentCaptures: totalOpponentCaptures,
    selfCaptures: totalSelfCaptures,
    doubleResolutions,
    binaryBefore,
    binaryAfter,
    countsAfter: counts,
    winner,
  };

  return { nextState, events, summary };
}

/**
 * Computes a preview of a move without mutating state.
 */
export function previewMove(state, x, y, dx, dy) {
  if (!isValidMove(state, x, y, dx, dy)) return null;
  const { nextState, events, summary } = executeMove(state, x, y, dx, dy);
  const lineEvent = events.find((e) => e.type === 'select_line');
  const repEvent = events.find((e) => e.type === 'replicate');
  const hopSteps = events.filter((e) => e.type === 'hop_step');
  return {
    line: lineEvent.line,
    spawns: repEvent.spawns,
    hopSteps,
    summary,
    nextState,
  };
}

/**
 * Returns all unique legal moves for the current player (deduplicated by line + direction).
 */
export function getLegalMoves(state, seenHashes = null) {
  if (state.winner !== 0) return [];
  const pIdx = state.currentPlayer - 1;
  const seen = new Set();
  const moves = [];

  for (let x = 0; x < state.size; x++) {
    for (let y = 0; y < state.size; y++) {
      if (state.board[x][y][pIdx] > 0) {
        for (const dir of DIRECTIONS) {
          const key = getLineMoveKey(x, y, dir.dx, dir.dy, state.size);
          if (!seen.has(key)) {
            seen.add(key);
            if (seenHashes) {
              const { nextState } = executeMove(state, x, y, dir.dx, dir.dy);
              if (seenHashes.has(getBoardHash(nextState.board, nextState.currentPlayer))) {
                continue;
              }
            }
            moves.push({ x, y, dx: dir.dx, dy: dir.dy, dirId: dir.id });
          }
        }
      }
    }
  }
  return moves;
}
