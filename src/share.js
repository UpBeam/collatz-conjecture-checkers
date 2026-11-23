/**
 * Shareable URL Replay Codec (#r=...) & Dry Victory Share Cards
 *
 * Binary layout (base64url encoded):
 *   byte 0: setupCode (0 = balanced 8x8/8, 1 = classic 8x8/12, 2 = grand 10x10/15)
 *   bytes 1..2n: per move: [ (x << 4) | y, dirIdx ]
 */

import { DIRECTIONS } from './engine.js';

const SETUP_TO_CODE = { balanced: 0, classic: 1, grand: 2 };
const CODE_TO_SETUP = ['balanced', 'classic', 'grand'];

const QUIPS = [
  "AI cooked formal proofs, so we're bouncing 3n+1 checkers off walls.",
  "Erdős said math isn't ready for Collatz. Checkers is.",
  "Still unsolved. Still playable.",
  "Every move is (3n+1)/2^k in binary. Don't prove it, just capture.",
  "Mathematics has been relegated to billiard-shot checkers.",
];

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function encodeReplay(setupId, moves) {
  const setupCode = SETUP_TO_CODE[setupId] ?? 0;
  const bytes = new Uint8Array(1 + moves.length * 2);
  bytes[0] = setupCode;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const dirIdx = DIRECTIONS.findIndex((d) => d.dx === m.dx && d.dy === m.dy);
    bytes[1 + i * 2] = ((m.x & 0x0f) << 4) | (m.y & 0x0f);
    bytes[2 + i * 2] = dirIdx >= 0 ? dirIdx : 0;
  }
  return bytesToBase64Url(bytes);
}

export function decodeReplay(hashPayload) {
  try {
    const bytes = base64UrlToBytes(hashPayload);
    if (bytes.length < 1 || (bytes.length - 1) % 2 !== 0) return null;
    const setupId = CODE_TO_SETUP[bytes[0]];
    if (!setupId) return null;

    const moves = [];
    for (let i = 1; i < bytes.length; i += 2) {
      const x = (bytes[i] >> 4) & 0x0f;
      const y = bytes[i] & 0x0f;
      const dir = DIRECTIONS[bytes[i + 1]];
      if (!dir) return null;
      moves.push({ x, y, dx: dir.dx, dy: dir.dy, dirId: dir.id });
    }
    return { setupId, moves };
  } catch {
    return null;
  }
}

export function buildReplayUrl(setupId, moves, baseUrl = null) {
  const base = baseUrl || `${window.location.origin}${window.location.pathname}`;
  const encoded = encodeReplay(setupId, moves);
  return `${base}#r=${encoded}`;
}

export function buildVictoryShareText({ winner, modeLabel, setupLabel, turns, captures, bounces, maxHop, replayUrl }) {
  const quip = QUIPS[(turns + captures + bounces) % QUIPS.length];
  const outcome = winner === 1 ? 'Won' : winner === 2 ? 'Lost' : 'Draw';
  const lines = [
    `Collatz Checkers (${setupLabel} · ${modeLabel})`,
    `${outcome} in ${turns} moves · ${captures} captures · ${bounces} bounces · ${maxHop}-hop peak`,
    `"${quip}"`,
    replayUrl,
  ];
  return lines.join('\n');
}

export function buildDailyShareText({ dayNumber, attempts, hops, bounces, captures, dailyUrl }) {
  const tryWord = attempts === 1 ? '1 try' : `${attempts} tries`;
  const dots = '●'.repeat(Math.min(attempts, 6));
  const lines = [
    `Collatz Checkers · Daily #${dayNumber}`,
    `Solved in ${tryWord} ${dots} · ${hops}-hop · ${bounces} bounce${bounces === 1 ? '' : 's'} · ${captures} wiped`,
    dailyUrl,
  ];
  return lines.join('\n');
}
