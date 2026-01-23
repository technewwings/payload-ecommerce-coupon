import { payloadEcommerceCouponPlugin } from './plugin'

export type { CouponPluginOptions, ApplyCouponResponse, ApplyCouponHook } from './types'
export { useCouponCode, validateCouponCode } from './client/hooks'

export const payloadEcommerceCoupon = payloadEcommerceCouponPlugin
