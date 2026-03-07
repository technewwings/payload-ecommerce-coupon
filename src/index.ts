import { createCouponsCollection } from "./collections/createCouponsCollection";
import { createReferralCodesCollection } from "./collections/createReferralCodesCollection";
import { createReferralProgramsCollection } from "./collections/createReferralProgramsCollection";
import { payloadEcommerceCouponPlugin } from "./plugin";

export { useCouponCode, usePartnerStats, validateCouponCode } from "./client/hooks";
export { PartnerDashboard } from "./components/PartnerDashboard";
export { EarningsSummary } from "./components/PartnerDashboard/EarningsSummary";
export { RecentReferrals } from "./components/PartnerDashboard/RecentReferrals";
export { ReferralCodes } from "./components/PartnerDashboard/ReferralCodes";
export { ReferralPerformance } from "./components/PartnerDashboard/ReferralPerformance";
export { ProgramOverview } from "./components/PartnerDashboard/ProgramOverview";
export { CommissionBreakdown } from "./components/PartnerDashboard/CommissionBreakdown";

export {
  calculateCommissionAndDiscount,
  getProgramMinimumOrderAmount,
} from "./utilities/calculateValues";
export { getCartTotalWithDiscounts } from "./utilities/getCartTotalWithDiscounts";
export { recordCouponUsageForOrder } from "./utilities/recordCouponUsageForOrder";
export {
  createCouponsCollection,
  createReferralCodesCollection,
  createReferralProgramsCollection,
  payloadEcommerceCouponPlugin as payloadEcommerceCoupon,
};

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
} from "./types";
export type { CartLike } from "./utilities/getCartTotalWithDiscounts";
