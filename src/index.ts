import { payloadEcommerceCouponPlugin } from './plugin'

export { payloadEcommerceCouponPlugin as payloadEcommerceCoupon }
export { useCouponCode, validateCouponCode } from './client/hooks'

export type {
  CouponPluginOptions,
  CouponPluginCollections,
  CouponPluginAccess,
  ApplyCouponResponse,
  ApplyCouponHook,
} from './types'
