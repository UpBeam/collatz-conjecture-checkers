/**
 * Crisp, uniform 1.75px-stroke geometric SVG icons (20x20 viewBox).
 * Zero emojis in UI chrome.
 */

const svg = (paths, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  help: svg(`<circle cx="10" cy="10" r="7.5"/><path d="M7.8 7.8a2.3 2.3 0 0 1 4.4.8c0 1.4-2.2 1.8-2.2 3.1"/><circle cx="10" cy="14.4" r="0.6" fill="currentColor" stroke="none"/>`),
  themes: svg(`<circle cx="10" cy="10" r="7.5"/><path d="M10 2.5v15"/><path d="M10 10l6.5-3.7"/><path d="M10 10l6.5 3.7"/>`),
  history: svg(`<circle cx="10" cy="10" r="7.5"/><path d="M10 5.8V10l2.8 1.8"/>`),
  settings: svg(`<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>`),
  soundOn: svg(`<path d="M3.5 7.8h2.8l4-3.3v11l-4-3.3H3.5z"/><path d="M13.3 7.2a4 4 0 0 1 0 5.6"/><path d="M15.6 5a7 7 0 0 1 0 10"/>`),
  soundOff: svg(`<path d="M3.5 7.8h2.8l4-3.3v11l-4-3.3H3.5z"/><path d="M13.5 7.5l4 5M17.5 7.5l-4 5"/>`),
  undo: svg(`<path d="M6.5 7H3v3.5"/><path d="M3.4 7.4A6.5 6.5 0 1 1 5.2 15"/>`),
  redo: svg(`<path d="M13.5 7H17v3.5"/><path d="M16.6 7.4A6.5 6.5 0 1 0 14.8 15"/>`),
  restart: svg(`<path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6"/><path d="M16.5 3.8v3.4h-3.4"/>`),
  ai: svg(`<rect x="4" y="5.5" width="12" height="9" rx="2"/><path d="M10 3v2.5"/><circle cx="7.6" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="12.4" cy="10" r="0.9" fill="currentColor" stroke="none"/><path d="M7.5 17h5"/>`),
  pvp: svg(`<circle cx="7.2" cy="7.2" r="2.3"/><path d="M3.2 15.2c.5-2.2 2-3.2 4-3.2s3.5 1 4 3.2"/><circle cx="13.5" cy="7.8" r="1.9"/><path d="M13 12.2c1.6.2 2.9 1.1 3.4 3"/>`),
  close: svg(`<path d="M5 5l10 10M15 5L5 15"/>`, 16),
  play: svg(`<path d="M6 4.5l9.5 5.5L6 15.5z" fill="currentColor" stroke="none"/>`, 16),
  check: svg(`<path d="M4.5 10.5l3.5 3.5 7.5-8"/>`, 16),
  lock: svg(`<rect x="4.5" y="9" width="11" height="7.5" rx="1.8"/><path d="M7 9V6.8a3 3 0 0 1 6 0V9"/>`, 15),
  bounce: svg(`<path d="M4 14l5-6 4 4 3-6"/><path d="M13.2 6H16v2.8"/>`, 14),
  capture: svg(`<circle cx="10" cy="10" r="5.5"/><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3"/>`, 14),
  hop: svg(`<path d="M3.5 13.5c2.2-5 6.8-5 9 0"/><path d="M10.5 12.5l2 1.2.8-2.2"/>`, 14),
  arrowRight: svg(`<path d="M4.5 10h11M11.5 6l4 4-4 4"/>`, 16),
  collatz: svg(`<path d="M3 13.5l3.2-6 3.3 3.5L13 5l4 10"/><circle cx="17" cy="15" r="1.2" fill="currentColor" stroke="none"/>`),
  daily: svg(`<rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M7 2.8v3M13 2.8v3M3.5 8.5h13"/><circle cx="10" cy="12.5" r="1.3" fill="currentColor" stroke="none"/>`),
  share: svg(`<path d="M10 12.5V4M6.8 7.2L10 4l3.2 3.2"/><path d="M4.5 11.5v3a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-3"/>`, 16),
  trophy: svg(`<path d="M6.5 4h7v4.2a3.5 3.5 0 0 1-7 0V4z"/><path d="M6.5 5.5H4.2a1.8 1.8 0 0 0 1.8 3.2"/><path d="M13.5 5.5h2.3a1.8 1.8 0 0 1-1.8 3.2"/><path d="M10 11.7V15.5M7 16h6"/>`, 28),
};
