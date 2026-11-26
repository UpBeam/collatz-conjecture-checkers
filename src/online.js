/**
 * Online Multiplayer & Verified Leaderboard Client
 * Connects to the Cloudflare Worker (worker/src/index.js) via WebSockets + HTTPS.
 */

const STORAGE_SERVER_KEY = 'collatz_online_server_url_v1';

// After deploying `cd worker && npx wrangler deploy`, set your deployed workers.dev URL here:
export const DEFAULT_PROD_SERVER = '';

export function getOnlineServerUrl() {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_SERVER_KEY) : '';
  if (saved) return saved.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8787';
  }
  return DEFAULT_PROD_SERVER;
}

export function setOnlineServerUrl(url) {
  const cleaned = String(url || '').trim().replace(/\/+$/, '');
  if (typeof localStorage !== 'undefined') {
    if (cleaned) localStorage.setItem(STORAGE_SERVER_KEY, cleaned);
    else localStorage.removeItem(STORAGE_SERVER_KEY);
  }
  return cleaned;
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function toWsUrl(httpUrl, path) {
  const wsBase = httpUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}${path}`;
}

export class OnlineClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.queueWs = null;
    this.roomCode = null;
    this.seat = 0; // 1 = Red, 2 = Blue, 0 = Spectator
    this.ready = false;
  }

  get connected() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  disconnect() {
    if (this.queueWs) {
      try { this.queueWs.close(); } catch {}
      this.queueWs = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.roomCode = null;
    this.seat = 0;
    this.ready = false;
  }

  joinQuickMatch(setupId = 'balanced') {
    const base = getOnlineServerUrl();
    if (!base) {
      this.handlers.onError?.('Online server not configured yet (see Settings / Worker README)');
      return false;
    }
    this.disconnect();

    const ws = new WebSocket(toWsUrl(base, `/ws/queue?setup=${encodeURIComponent(setupId)}`));
    this.queueWs = ws;

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'queued') {
        this.handlers.onQueued?.(msg);
      } else if (msg.type === 'matched') {
        ws.close();
        this.queueWs = null;
        this.connectRoom(msg.roomCode, msg.setupId);
      }
    });

    ws.addEventListener('error', () => {
      this.handlers.onError?.('Could not reach matchmaking server');
    });

    return true;
  }

  connectRoom(roomCode, setupId = 'balanced') {
    const base = getOnlineServerUrl();
    if (!base) {
      this.handlers.onError?.('Online server not configured yet');
      return false;
    }
    this.disconnect();

    const code = String(roomCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.roomCode = code;

    const ws = new WebSocket(toWsUrl(base, `/ws/room/${code}?setup=${encodeURIComponent(setupId)}`));
    this.ws = ws;

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'welcome') {
        this.seat = msg.seat;
        this.ready = msg.ready;
        this.handlers.onWelcome?.({ ...msg, roomCode: code });
      } else if (msg.type === 'room_status') {
        this.ready = msg.ready;
        this.handlers.onRoomStatus?.(msg);
      } else if (msg.type === 'move_applied') {
        this.handlers.onMoveApplied?.(msg);
      } else if (msg.type === 'peer_left') {
        this.ready = msg.ready;
        this.handlers.onPeerLeft?.(msg);
      } else if (msg.type === 'rematch_requested') {
        this.handlers.onRematchRequested?.(msg);
      } else if (msg.type === 'rematch_start') {
        this.seat = msg.seat;
        this.handlers.onRematchStart?.(msg);
      } else if (msg.type === 'error') {
        this.handlers.onError?.(msg.message);
      }
    });

    ws.addEventListener('error', () => {
      this.handlers.onError?.('Could not connect to game server');
    });

    ws.addEventListener('close', () => {
      if (this.ws === ws) {
        this.ws = null;
        this.handlers.onDisconnected?.();
      }
    });

    return true;
  }

  sendMove(x, y, dx, dy) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify({ type: 'move', x, y, dx, dy }));
    return true;
  }

  requestRematch() {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify({ type: 'rematch' }));
    return true;
  }

  async fetchLeaderboard() {
    const base = getOnlineServerUrl();
    if (!base) return null;
    const resp = await fetch(`${base}/api/leaderboard`);
    if (!resp.ok) return null;
    return resp.json();
  }

  async submitVerifiedReplay({ name, setupId, moves }) {
    const base = getOnlineServerUrl();
    if (!base) return null;
    const resp = await fetch(`${base}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, setupId, moves }),
    });
    if (!resp.ok) return null;
    return resp.json();
  }
}
