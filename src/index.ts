import { payloadEcommerceCouponPlugin } from './plugin'
import { createCouponsCollection } from './collections/createCouponsCollection'
import { createReferralCodesCollection } from './collections/createReferralCodesCollection'
import { createReferralProgramsCollection } from './collections/createReferralProgramsCollection'

export { payloadEcommerceCouponPlugin as payloadEcommerceCoupon }
export { useCouponCode, validateCouponCode, usePartnerStats } from './client/hooks'
export { createCouponsCollection }
export { createReferralCodesCollection }
export { createReferralProgramsCollection }

export type {
  CouponPluginOptions,
  CouponPluginCollections,
  CouponPluginAccess,
  ApplyCouponResponse,
  ApplyCouponHook,
  PartnerStats,
  PartnerDashboardData,
  ReferralProgramConfig,
  AdminGroupConfig,
  PartnerDashboardConfig,
} from './types'
