import { createCouponsCollection } from './collections/createCouponsCollection'
import { createReferralCodesCollection } from './collections/createReferralCodesCollection'
import { createReferralProgramsCollection } from './collections/createReferralProgramsCollection'
import { payloadEcommerceCouponPlugin } from './plugin'

export { useCouponCode, usePartnerStats, validateCouponCode } from './client/hooks'
export {
  calculateCommissionAndDiscount,
  getProgramMinimumOrderAmount,
} from './utilities/calculateValues'
export { getCartTotalWithDiscounts } from './utilities/getCartTotalWithDiscounts'
export { recordCouponUsageForOrder } from './utilities/recordCouponUsageForOrder'
export {
  createCouponsCollection,
  createReferralCodesCollection,
  createReferralProgramsCollection,
  payloadEcommerceCouponPlugin as payloadEcommerceCoupon,
}

export type {
  AdminGroupConfig,
  ApplyCouponHook,
  ApplyCouponResponse,
  CouponPluginAccess,
  CouponPluginCollections,
  CouponPluginOptions,
  CouponPluginPolicies,
  OrderIntegrationConfig,
  PartnerDashboardConfig,
  PartnerDashboardData,
  PartnerStats,
  PartnerStatsPolicyContext,
  PluginIntegrationCollections,
  PluginIntegrationConfig,
  PluginIntegrationFields,
  PluginIntegrationResolvers,
  PolicyContext,
  RecordOrderUsagePolicyContext,
  ReferralProgramConfig,
  RoleConfig,
} from './types'
export type { CartLike } from './utilities/getCartTotalWithDiscounts'
