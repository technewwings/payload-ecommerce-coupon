/**
 * Set DEBUG_COUPON_CART=1 in the environment to log coupon/cart recalculation details
 * (server console + Payload logger when available).
 */
export function isCouponCartDebugEnabled(): boolean {
  try {
    return process.env.DEBUG_COUPON_CART === '1' || process.env.DEBUG_COUPON_CART === 'true'
  } catch {
    return false
  }
}

export function logCouponCartDebug(
  label: string,
  data: Record<string, unknown>,
  req?: { payload?: { logger?: { info: (o: unknown) => void } } },
): void {
  if (!isCouponCartDebugEnabled()) return
  const payload = { msg: `[payload-ecommerce-coupon] ${label}`, ...data }
  try {
    req?.payload?.logger?.info(payload as any)
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console -- intentional debug when DEBUG_COUPON_CART is set
  console.log('[payload-ecommerce-coupon]', label, data)
}

/** Detailed server console snapshot for coupon relation resolution (DEBUG_COUPON_CART only). */
export function logRecalculateCartCouponSnapshot(
  ctx: {
    cartAppliedCouponField: string
    mutableData: Record<string, unknown>
    original: Record<string, unknown>
    effectiveAppliedCoupon: unknown
    appliedCouponID: string | number | null
  },
  req?: { payload?: { logger?: { info: (o: unknown) => void } } },
): void {
  if (!isCouponCartDebugEnabled()) return
  const f = ctx.cartAppliedCouponField
  const fromData = ctx.mutableData[f]
  const fromOrig = ctx.original[f]
  const dataHasOwn = Object.prototype.hasOwnProperty.call(ctx.mutableData, f)
  const origHasOwn = Object.prototype.hasOwnProperty.call(ctx.original, f)
  const keys = Object.keys(ctx.mutableData)
  const snapshot: Record<string, unknown> = {
    couponField: f,
    dataHasOwnAppliedCoupon: dataHasOwn,
    origHasOwnAppliedCoupon: origHasOwn,
    mutableDataAppliedCoupon: fromData,
    originalAppliedCoupon: fromOrig,
    effectiveAppliedCoupon: ctx.effectiveAppliedCoupon,
    appliedCouponID: ctx.appliedCouponID,
    mutableDataKeysCount: keys.length,
    mutableDataKeysSample: keys.slice(0, 45),
  }
  logCouponCartDebug('recalculateCart: coupon snapshot', snapshot, req)
}
