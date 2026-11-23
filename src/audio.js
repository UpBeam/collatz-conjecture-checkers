/**
 * Procedural Web Audio API Synthesizer — Zero external assets.
 * Restrained, tactile foley adapted per theme (arcade / wood / paper).
 */

const PENTATONIC_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.hapticsEnabled = true;
    this.theme = 'arcade';
  }

  ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  haptic(pattern) {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore unsupported browsers
      }
    }
  }

  setTheme(theme) {
    this.theme = theme;
  }

  setEnabled(flag) {
    this.enabled = flag;
  }

  setHapticsEnabled(flag) {
    this.hapticsEnabled = flag;
  }

  getWaveType() {
    if (this.theme === 'wood') return 'sine';
    if (this.theme === 'paper') return 'sine';
    return 'triangle';
  }

  playTone(freq, duration = 0.1, volume = 0.12, type = null, slideTo = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type || this.getWaveType();
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.theme === 'wood' ? 1200 : 2400, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playSelect() {
    this.playTone(this.theme === 'wood' ? 300 : 440, 0.055, 0.08, 'sine', 560);
    this.haptic(8);
  }

  playAimTick() {
    this.playTone(this.theme === 'wood' ? 240 : 600, 0.028, 0.035, 'sine');
  }

  playReplicate(count = 1) {
    const base = this.theme === 'wood' ? 280 : 340;
    for (let i = 0; i < Math.min(count, 5); i++) {
      setTimeout(() => {
        this.playTone(base + i * 50, 0.08, 0.08);
      }, i * 28);
    }
    this.haptic(10);
  }

  playHop(stepIndex = 0, isOpponentCapture = false) {
    const note = PENTATONIC_HZ[stepIndex % PENTATONIC_HZ.length];
    this.playTone(note, 0.11, isOpponentCapture ? 0.15 : 0.11);
    if (isOpponentCapture) {
      setTimeout(() => this.playTone(note * 1.5, 0.08, 0.09, 'sine'), 18);
      this.haptic([10, 16, 12]);
    } else {
      this.haptic(7);
    }
  }

  playBounce() {
    this.playTone(165, 0.12, 0.15, 'triangle', 95);
    this.haptic(15);
  }

  playLand() {
    this.playTone(this.theme === 'wood' ? 200 : 260, 0.095, 0.12, 'sine', 180);
    this.haptic(12);
  }

  playDoubleCarry() {
    this.playTone(440, 0.09, 0.11, 'triangle', 660);
    setTimeout(() => this.playTone(660, 0.11, 0.11, 'triangle', 880), 60);
    this.haptic([12, 22, 16]);
  }

  playVictory() {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((hz, idx) => {
      setTimeout(() => this.playTone(hz, 0.34, 0.12, 'triangle'), idx * 80);
    });
    this.haptic([20, 35, 20, 35, 50]);
  }
}
