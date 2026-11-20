/**
 * Authoritative 9:16 (720x1280) layout zones and platform safe margins
 * for Shorts / Reels / TikTok (avoiding bottom 20% and right 15% UI overlays).
 */
export const LAYOUT_9X16 = {
  width: 720,
  height: 1280,
  safeLeft: 48,
  /** Reserves right 15% (108px) + 4px margin = 112px on the right. */
  safeRightMargin: 112,
  /** Platform UI right boundary (85% of 720 = 612px). */
  platformRightUnsafeX: 612,
  /** Platform UI bottom boundary (80% of 1280 = 1024px). */
  platformBottomUnsafeY: 1024,
  zones: {
    title: { top: 72, maxHeight: 160 },
    free: { top: 240, maxHeight: 540 },
    callout: { top: 790, maxHeight: 140 },
    caption: { top: 942, maxHeight: 78 },
  },
} as const;
