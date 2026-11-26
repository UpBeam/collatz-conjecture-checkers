import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoomDO, MatchmakerDO } from '../worker/src/index.js';
import { generateRoomCode } from '../src/online.js';

// Lightweight mock WebSocket for testing Cloudflare Durable Object room logic offline
class MockWS {
  constructor() {
    this.readyState = 1;
    this.sent = [];
    this.listeners = new Map();
  }
  accept() {}
  send(msg) { this.sent.push(JSON.parse(msg)); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  emit(type, payload) {
    for (const fn of this.listeners.get(type) || []) fn(payload);
  }
}

test('generateRoomCode returns 5-char unambiguous uppercase codes', () => {
  const code = generateRoomCode();
  assert.equal(code.length, 5);
  assert.match(code, /^[A-Z2-9]{5}$/);
});

test('GameRoomDO validates turns, runs authoritative Collatz engine, and rejects out-of-turn moves', () => {
  const room = new GameRoomDO({});
  room.initGame('balanced');

  const p1 = new MockWS();
  const p2 = new MockWS();
  room.sessions.set(p1, { seat: 1 });
  room.sessions.set(p2, { seat: 2 });

  // Seat 2 tries to move on Seat 1's turn -> rejected
  room.handleMessage(p2, { type: 'move', x: 0, y: 0, dx: 1, dy: 1 });
  assert.equal(p2.sent.at(-1).type, 'error');
  assert.equal(room.moves.length, 0);

  // Seat 1 plays valid move from (0, 6) NE (+1, -1) -> accepted & broadcast to both!
  room.handleMessage(p1, { type: 'move', x: 0, y: 6, dx: 1, dy: -1 });
  assert.equal(room.moves.length, 1);
  assert.equal(p1.sent.at(-1).type, 'move_applied');
  assert.equal(p2.sent.at(-1).type, 'move_applied');
  assert.equal(p2.sent.at(-1).bySeat, 1);
});

test('MatchmakerDO anti-cheat verifies submitted replays and rejects illegal moves', async () => {
  const store = new Map();
  const mm = new MatchmakerDO({
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { store.set(k, v); },
    },
  });

  // Valid replay submission
  const reqOk = new Request('https://example.com/api/leaderboard', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Sam',
      setupId: 'balanced',
      moves: [{ x: 0, y: 6, dx: 1, dy: -1 }],
    }),
  });
  const resOk = await mm.fetch(reqOk);
  const bodyOk = await resOk.json();
  assert.equal(resOk.status, 200);
  assert.equal(bodyOk.verified, true);
  assert.ok(bodyOk.maxHop >= 1);

  // Illegal move submission -> rejected with 400
  const reqBad = new Request('https://example.com/api/leaderboard', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Cheater',
      setupId: 'balanced',
      moves: [{ x: 0, y: 0, dx: 1, dy: 1 }], // P1 has no piece at (0,0)!
    }),
  });
  const resBad = await mm.fetch(reqBad);
  assert.equal(resBad.status, 400);
});
