# Collatz Conjecture Checkers

**Sam Palmer's Collatz Conjecture Checkers** — a tactile arcade strategy game built for **itch.io (HTML5)** and **iOS / Android mobile**.

## Quick Start

```bash
# Run unit tests (engine + AI)
npm test

# Serve locally on http://localhost:4173
python3 -m http.server 4173

# Build an itch.io-ready HTML5 zip bundle (dist/collatz-checkers-itch.zip)
npm run pack:itch
```

## Publishing to itch.io
1. Run `npm run pack:itch`.
2. Upload `dist/collatz-checkers-itch.zip` to itch.io as an **HTML** project.
3. Check **"This file will be played in the browser"**, enable **Mobile friendly**, and set viewport to e.g. `960 × 760` (responsive layout adapts automatically).

## Wrapping for iOS / Android (Capacitor)
The project has zero build-step dependencies and is pre-wired in `src/monetization.js` for:
- **Lifetime Theme Pack + Ad-Free ($0.99)** via RevenueCat / Capacitor Purchases (`collatz_lifetime_themes_099`) unlocking *Warm Modern Wood & Brass* and *Math-Chic Neon Minimalist*.
- **Gentle Mobile Ads** via Capacitor AdMob (subtle bottom banner on mobile + optional interstitial at most once every 3 completed matches, never mid-game, permanently disabled once unlocked).
