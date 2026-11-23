import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeReplay, decodeReplay, buildVictoryShareText, buildDailyShareText } from '../src/share.js';
import { generateDailyPuzzle } from '../src/daily.js';
import { executeMove } from '../src/engine.js';

test('encodeReplay / decodeReplay round-trips moves across 8x8 and 10x10 setups', () => {
  const moves = [
    { x: 1, y: 6, dx: 1, dy: -1 },
    { x: 9, y: 0, dx: -1, dy: 1 },
    { x: 4, y: 4, dx: 0, dy: -1 },
  ];
  const encoded = encodeReplay('grand', moves);
  assert.ok(encoded.length < 20, 'encoded replay should be compact');

  const decoded = decodeReplay(encoded);
  assert.equal(decoded.setupId, 'grand');
  assert.equal(decoded.moves.length, 3);
  assert.equal(decoded.moves[1].x, 9);
  assert.equal(decoded.moves[1].y, 0);
  assert.equal(decoded.moves[1].dx, -1);
  assert.equal(decoded.moves[1].dy, 1);
});

test('generateDailyPuzzle is deterministic and guaranteed 1-move solvable across multiple dates', () => {
  const dates = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-12-01', '2027-01-01'];
  for (const dateKey of dates) {
    const p1 = generateDailyPuzzle(dateKey);
    const p2 = generateDailyPuzzle(dateKey);
    assert.deepEqual(p1.solution, p2.solution, 'daily puzzle must be deterministic');
    assert.deepEqual(p1.state.board, p2.state.board);

    const { nextState } = executeMove(
      p1.state,
      p1.solution.x,
      p1.solution.y,
      p1.solution.dx,
      p1.solution.dy
    );
    assert.equal(nextState.winner, 1, `Daily puzzle for ${dateKey} must be solvable in 1 move`);
  }
});

test('share text formatters include key stats and URLs', () => {
  const vText = buildVictoryShareText({
    winner: 1,
    modeLabel: 'AI · Hard',
    setupLabel: '8×8 · Balanced',
    turns: 22,
    captures: 11,
    bounces: 7,
    maxHop: 6,
    replayUrl: 'https://upbeam.github.io/collatz-conjecture-checkers/#r=AAA',
  });
  assert.ok(vText.includes('Won in 22 moves'));
  assert.ok(vText.includes('#r=AAA'));

  const dText = buildDailyShareText({
    dayNumber: 1,
    attempts: 2,
    hops: 5,
    bounces: 2,
    captures: 3,
    dailyUrl: 'https://upbeam.github.io/collatz-conjecture-checkers/#daily',
  });
  assert.ok(dText.includes('Daily #1'));
  assert.ok(dText.includes('2 tries'));
});
