import { createCouponsCollection } from './collections/createCouponsCollection'
import { createReferralCodesCollection } from './collections/createReferralCodesCollection'
import { createReferralProgramsCollection } from './collections/createReferralProgramsCollection'
import { payloadEcommerceCouponPlugin } from './plugin'

export { useCouponCode, usePartnerStats, validateCouponCode } from './client/hooks'
export {
  createCouponsCollection,
  createReferralCodesCollection,
  createReferralProgramsCollection,
  payloadEcommerceCouponPlugin as payloadEcommerceCoupon
}

export type {
  AdminGroupConfig,
  ApplyCouponHook,
  ApplyCouponResponse,
  CouponPluginAccess,
  CouponPluginCollections,
  CouponPluginOptions,
  PartnerDashboardConfig,
  PartnerDashboardData,
  PartnerStats,
  ReferralProgramConfig
} from './types'

