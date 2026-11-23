/**
 * Theme Pack & Gentle Mobile Monetization Manager
 *
 * - Default theme ("arcade" — Obsidian & Slate) is free.
 * - Lifetime Theme Pack + Ad-Free ($0.99 one-time) unlocks "wood" (Walnut & Ivory)
 *   and "paper" (Drafting Paper & Ink) and removes all gentle mobile ads forever.
 */

const STORAGE_UNLOCK_KEY = 'collatz_checkers_pack_unlocked_v1';
const STORAGE_THEME_KEY = 'collatz_checkers_theme_v1';
const STORAGE_MATCHES_KEY = 'collatz_checkers_matches_v1';

export const THEMES = [
  {
    id: 'arcade',
    name: 'Obsidian & Slate',
    desc: 'Matte slate board, vermilion & glacier tokens',
    free: true,
    swatches: ['#191d27', '#242936', '#e5484d', '#3b9eff'],
  },
  {
    id: 'wood',
    name: 'Walnut & Ivory',
    desc: 'Walnut & birch inlays, crimson & satin ivory',
    free: false,
    swatches: ['#63432c', '#c8b294', '#b8322a', '#e8e0d2'],
  },
  {
    id: 'paper',
    name: 'Drafting Paper & Ink',
    desc: 'Light architectural grid, vermilion & pine',
    free: false,
    swatches: ['#e2e6f0', '#ffffff', '#d63842', '#246a50'],
  },
];

export class MonetizationManager {
  constructor() {
    this.isNativeMobile = Boolean(window.Capacitor?.isNativePlatform?.());
    this.packUnlocked = localStorage.getItem(STORAGE_UNLOCK_KEY) === 'true';
    this.currentTheme = localStorage.getItem(STORAGE_THEME_KEY) || 'arcade';
    this.matchesCompleted = Number(localStorage.getItem(STORAGE_MATCHES_KEY) || 0);

    if (!this.canUseTheme(this.currentTheme)) {
      this.currentTheme = 'arcade';
    }
  }

  canUseTheme(themeId) {
    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return false;
    return theme.free || this.packUnlocked;
  }

  setTheme(themeId) {
    if (!this.canUseTheme(themeId)) return false;
    this.currentTheme = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem(STORAGE_THEME_KEY, themeId);
    return true;
  }

  applySavedTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  shouldShowGentleBanner() {
    const isSmallTouch = window.matchMedia('(max-width: 600px) and (pointer: coarse)').matches;
    return !this.packUnlocked && (this.isNativeMobile || isSmallTouch);
  }

  async purchaseThemePack() {
    if (this.isNativeMobile && window.Capacitor?.Plugins?.Purchases) {
      try {
        await window.Capacitor.Plugins.Purchases.purchasePackage({
          identifier: 'collatz_lifetime_themes_099',
        });
      } catch (err) {
        return { ok: false, message: err?.message || 'Purchase cancelled' };
      }
    }

    this.packUnlocked = true;
    localStorage.setItem(STORAGE_UNLOCK_KEY, 'true');
    this.hideNativeAds();
    return { ok: true, message: 'Theme pack unlocked' };
  }

  async restorePurchases() {
    if (this.isNativeMobile && window.Capacitor?.Plugins?.Purchases) {
      try {
        const res = await window.Capacitor.Plugins.Purchases.restorePurchases();
        if (res?.customerInfo?.entitlements?.active?.lifetime_themes) {
          this.packUnlocked = true;
          localStorage.setItem(STORAGE_UNLOCK_KEY, 'true');
          this.hideNativeAds();
          return { ok: true, message: 'Purchases restored' };
        }
        return { ok: false, message: 'No previous purchase found' };
      } catch {
        return { ok: false, message: 'Could not restore right now' };
      }
    }
    return {
      ok: this.packUnlocked,
      message: this.packUnlocked ? 'Theme pack active' : 'No purchase found',
    };
  }

  onMatchCompleted() {
    this.matchesCompleted += 1;
    localStorage.setItem(STORAGE_MATCHES_KEY, String(this.matchesCompleted));

    if (!this.packUnlocked && this.isNativeMobile && this.matchesCompleted % 3 === 0) {
      window.Capacitor?.Plugins?.AdMob?.showInterstitial?.().catch(() => {});
    }
  }

  hideNativeAds() {
    if (this.isNativeMobile) {
      window.Capacitor?.Plugins?.AdMob?.hideBanner?.().catch(() => {});
    }
  }
}
