/**
 * Payload ecommerce stores cart subtotal as the sum of `priceIn{CCY}` fields.
 * Those values follow the plugin-ecommerce client convention: smallest currency units
 * (e.g. fils for AED) so `formatCurrency` can divide by 10^decimals.
 *
 * Coupon math in calculateValues historically uses "major" decimal currency (20 = 20.00 AED).
 * Convert at boundaries when persisting to cart fields that share `subtotal`'s unit.
 */

/** Minor units per 1.00 major for 2-decimal currencies (AED, USD, etc.). */
export const MINOR_PER_MAJOR_2DP = 100

export function minorToMajor2dp(minor: number): number {
  return Math.round(minor) / MINOR_PER_MAJOR_2DP
}

export function majorToMinor2dp(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR_2DP)
}
