/**
 * Collatz Conjecture Checkers — Cloudflare Worker + Durable Objects Backend
 *
 * Provides:
 *   1. GameRoomDO   — Authoritative WebSocket rooms (/ws/room/:code) running
 *                     the exact deterministic engine.js with Super-Ko validation.
 *   2. MatchmakerDO — Quick-match 2-player queue (/ws/queue) + verified global
 *                     leaderboards (GET/POST /api/leaderboard).
 *
 * Deploy:
 *   cd worker && npm install && npx wrangler deploy
 */

import {
  createInitialState,
  executeMove,
  getBoardHash,
  isValidMove,
} from '../../src/engine.js';

const SETUPS = {
  balanced: { size: 8, rows: 2 },
  classic:  { size: 8, rows: 3 },
  grand:    { size: 10, rows: 3 },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ==========================================================================
   Main Worker Router
   ========================================================================== */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health') {
      return jsonResp({ ok: true, service: 'collatz-checkers-online' });
    }

    // Room WebSocket: /ws/room/:code?setup=balanced
    const roomMatch = path.match(/^\/ws\/room\/([A-Z0-9]{4,8})$/i);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      const id = env.GAME_ROOMS.idFromName(code);
      const stub = env.GAME_ROOMS.get(id);
      return stub.fetch(request);
    }

    // Quick-match queue WebSocket: /ws/queue?setup=balanced
    if (path === '/ws/queue') {
      const id = env.MATCHMAKER.idFromName('global');
      const stub = env.MATCHMAKER.get(id);
      return stub.fetch(request);
    }

    // Global leaderboards: GET / POST /api/leaderboard
    if (path === '/api/leaderboard') {
      const id = env.MATCHMAKER.idFromName('global');
      const stub = env.MATCHMAKER.get(id);
      return stub.fetch(request);
    }

    return jsonResp({ error: 'Not found' }, 404);
  },
};

/* ==========================================================================
   Durable Object 1: Authoritative Game Room
   ========================================================================== */
export class GameRoomDO {
  constructor(state) {
    this.durableState = state;
    this.sessions = new Map(); // ws -> { seat: 1 | 2 | 0 }
    this.setupId = 'balanced';
    this.gameState = null;
    this.seenHashes = new Set();
    this.moves = [];
    this.rematchVotes = new Set();
  }

  initGame(setupId = 'balanced') {
    const cfg = SETUPS[setupId] || SETUPS.balanced;
    this.setupId = SETUPS[setupId] ? setupId : 'balanced';
    this.gameState = createInitialState(cfg.size, cfg.rows);
    this.seenHashes = new Set([getBoardHash(this.gameState.board, this.gameState.currentPlayer)]);
    this.moves = [];
    this.rematchVotes.clear();
  }

  broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(msg);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  countPlayers() {
    let p1 = false;
    let p2 = false;
    for (const info of this.sessions.values()) {
      if (info.seat === 1) p1 = true;
      if (info.seat === 2) p2 = true;
    }
    return { p1, p2, ready: p1 && p2 };
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return jsonResp({ error: 'Expected WebSocket' }, 426);
    }

    const url = new URL(request.url);
    const reqSetup = url.searchParams.get('setup') || 'balanced';
    if (!this.gameState) {
      this.initGame(reqSetup);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const { p1, p2 } = this.countPlayers();
    const seat = !p1 ? 1 : !p2 ? 2 : 0; // 0 = spectator
    this.sessions.set(server, { seat });

    const status = this.countPlayers();
    server.send(JSON.stringify({
      type: 'welcome',
      seat,
      setupId: this.setupId,
      moves: this.moves,
      ready: status.ready,
    }));

    if (seat > 0) {
      this.broadcast({ type: 'room_status', ready: status.ready, players: (status.p1 ? 1 : 0) + (status.p2 ? 1 : 0) });
    }

    server.addEventListener('message', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        this.handleMessage(server, data);
      } catch {
        // Ignore malformed packets
      }
    });

    server.addEventListener('close', () => {
      const info = this.sessions.get(server);
      this.sessions.delete(server);
      if (info && info.seat > 0) {
        this.rematchVotes.delete(info.seat);
        const st = this.countPlayers();
        this.broadcast({ type: 'peer_left', seat: info.seat, ready: st.ready });
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  handleMessage(ws, data) {
    const info = this.sessions.get(ws);
    if (!info) return;

    if (data.type === 'move') {
      if (info.seat === 0 || this.gameState.winner !== 0) return;
      if (info.seat !== this.gameState.currentPlayer) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
      }
      const { x, y, dx, dy } = data;
      if (!isValidMove(this.gameState, x, y, dx, dy)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid move' }));
        return;
      }
      const { nextState } = executeMove(this.gameState, x, y, dx, dy);
      const nextHash = getBoardHash(nextState.board, nextState.currentPlayer);
      if (this.seenHashes.has(nextHash)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Repeat blocked (Ko)' }));
        return;
      }

      this.gameState = nextState;
      this.seenHashes.add(nextHash);
      this.moves.push({ x, y, dx, dy });

      this.broadcast({
        type: 'move_applied',
        x,
        y,
        dx,
        dy,
        bySeat: info.seat,
        turnNumber: nextState.turnNumber,
        winner: nextState.winner,
      });
    } else if (data.type === 'rematch' && info.seat > 0) {
      this.rematchVotes.add(info.seat);
      if (this.rematchVotes.has(1) && this.rematchVotes.has(2)) {
        // Swap seats for fairness on rematch!
        for (const [sock, meta] of this.sessions.entries()) {
          if (meta.seat === 1) meta.seat = 2;
          else if (meta.seat === 2) meta.seat = 1;
          sock.send(JSON.stringify({ type: 'rematch_start', seat: meta.seat, setupId: this.setupId }));
        }
        this.initGame(this.setupId);
      } else {
        this.broadcast({ type: 'rematch_requested', bySeat: info.seat });
      }
    }
  }
}

/* ==========================================================================
   Durable Object 2: Quick-Match Queue + Verified Global Leaderboards
   ========================================================================== */
export class MatchmakerDO {
  constructor(state) {
    this.durableState = state;
    this.queues = { balanced: [], classic: [], grand: [] };
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket Quick-Match Queue
    if (url.pathname === '/ws/queue') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return jsonResp({ error: 'Expected WebSocket' }, 426);
      }
      const setupId = SETUPS[url.searchParams.get('setup')] ? url.searchParams.get('setup') : 'balanced';
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      const q = this.queues[setupId];
      // Prune closed sockets
      while (q.length > 0 && q[0].readyState !== 1) q.shift();

      if (q.length > 0) {
        const opponent = q.shift();
        const roomCode = randomRoomCode();
        try {
          opponent.send(JSON.stringify({ type: 'matched', roomCode, setupId }));
          server.send(JSON.stringify({ type: 'matched', roomCode, setupId }));
        } catch {
          q.push(server);
        }
      } else {
        q.push(server);
        server.send(JSON.stringify({ type: 'queued', setupId }));
      }

      server.addEventListener('close', () => {
        const idx = q.indexOf(server);
        if (idx !== -1) q.splice(idx, 1);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // Verified Global Leaderboards
    if (url.pathname === '/api/leaderboard') {
      if (request.method === 'GET') {
        const longestHops = (await this.durableState.storage.get('lb_hops')) || [];
        const fastestWins = (await this.durableState.storage.get('lb_wins')) || [];
        return jsonResp({ longestHops, fastestWins });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.moves) || body.moves.length === 0 || body.moves.length > 200) {
          return jsonResp({ error: 'Invalid submission' }, 400);
        }
        const name = String(body.name || 'Anon').replace(/[^\w\s-]/g, '').trim().slice(0, 16) || 'Anon';
        const setupId = SETUPS[body.setupId] ? body.setupId : 'balanced';
        const cfg = SETUPS[setupId];

        // Server-side anti-cheat verification: replay every move through engine.js!
        let st = createInitialState(cfg.size, cfg.rows);
        let maxHop = 0;
        let totalBounces = 0;
        for (const m of body.moves) {
          if (!isValidMove(st, m.x, m.y, m.dx, m.dy)) {
            return jsonResp({ error: 'Illegal move in replay' }, 400);
          }
          const { nextState, summary } = executeMove(st, m.x, m.y, m.dx, m.dy);
          if (summary.hops > maxHop) maxHop = summary.hops;
          totalBounces += summary.bounces;
          st = nextState;
        }

        const now = new Date().toISOString().slice(0, 10);
        const longestHops = (await this.durableState.storage.get('lb_hops')) || [];
        longestHops.push({ name, setupId, maxHop, totalBounces, date: now });
        longestHops.sort((a, b) => b.maxHop - a.maxHop || b.totalBounces - a.totalBounces);
        await this.durableState.storage.put('lb_hops', longestHops.slice(0, 15));

        if (st.winner === 1) {
          const fastestWins = (await this.durableState.storage.get('lb_wins')) || [];
          fastestWins.push({ name, setupId, turns: body.moves.length, maxHop, date: now });
          fastestWins.sort((a, b) => a.turns - b.turns);
          await this.durableState.storage.put('lb_wins', fastestWins.slice(0, 15));
        }

        return jsonResp({ ok: true, verified: true, maxHop, winner: st.winner });
      }
    }

    return jsonResp({ error: 'Not found' }, 404);
  }
}
