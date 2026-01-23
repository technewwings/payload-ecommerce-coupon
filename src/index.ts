import type { Config } from 'payload'
import { payloadEcommerceCouponPlugin } from './plugin'
import type { CouponPluginOptions } from './types'

export type { CouponPluginOptions, ApplyCouponResponse, ApplyCouponHook } from './types'
export { useCouponCode, validateCouponCode } from './client/hooks'

export const payloadEcommerceCoupon = payloadEcommerceCouponPlugin
