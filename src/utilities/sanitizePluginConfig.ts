import type { CouponPluginOptions, SanitizedCouponPluginOptions } from '../types'
import { isAdminUser, isPartnerUser } from './userRoles'

export const sanitizePluginConfig = ({
  pluginConfig,
}: {
  pluginConfig: CouponPluginOptions
}): SanitizedCouponPluginOptions => {
  const roleConfig = {
    roleFieldPaths:
      Array.isArray(pluginConfig?.roleConfig?.roleFieldPaths) &&
      pluginConfig.roleConfig.roleFieldPaths.length > 0
        ? pluginConfig.roleConfig.roleFieldPaths
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['role', 'roles'],
    adminRoleValues:
      Array.isArray(pluginConfig?.roleConfig?.adminRoleValues) &&
      pluginConfig.roleConfig.adminRoleValues.length > 0
        ? pluginConfig.roleConfig.adminRoleValues
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['admin'],
    partnerRoleValues:
      Array.isArray(pluginConfig?.roleConfig?.partnerRoleValues) &&
      pluginConfig.roleConfig.partnerRoleValues.length > 0
        ? pluginConfig.roleConfig.partnerRoleValues
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['partner'],
    customRoleResolver:
      typeof pluginConfig?.roleConfig?.customRoleResolver === 'function'
        ? pluginConfig.roleConfig.customRoleResolver
        : undefined,
  }

  const normalizedAllowedTotalCommissionTypes = Array.isArray(
    pluginConfig?.referralConfig?.allowedTotalCommissionTypes,
  )
    ? [
        ...new Set(
          pluginConfig.referralConfig.allowedTotalCommissionTypes.filter(
            (value): value is 'fixed' | 'percentage' => value === 'fixed' || value === 'percentage',
          ),
        ),
      ]
    : []

  // Apply defaults for each property when missing or invalid
  return {
    enabled: !(
      pluginConfig?.enabled === false ||
      (typeof pluginConfig?.enabled === 'string' && pluginConfig.enabled === 'false')
    ),
    enableReferrals:
      !!pluginConfig?.enableReferrals &&
      (typeof pluginConfig?.enableReferrals !== 'string' ||
        pluginConfig.enableReferrals !== 'false'),
    allowStackWithOtherCoupons:
      !!pluginConfig?.allowStackWithOtherCoupons &&
      (typeof pluginConfig?.allowStackWithOtherCoupons !== 'string' ||
        pluginConfig.allowStackWithOtherCoupons !== 'false'),
    defaultCurrency:
      typeof pluginConfig?.defaultCurrency === 'string' &&
      pluginConfig.defaultCurrency.length > 0 &&
      pluginConfig.defaultCurrency.length <= 3
        ? pluginConfig.defaultCurrency
        : 'USD',
    collections: {
      couponsSlug:
        typeof pluginConfig?.collections?.couponsSlug === 'string' &&
        pluginConfig.collections.couponsSlug.trim().length > 0 &&
        pluginConfig.collections.couponsSlug.length <= 100
          ? pluginConfig.collections.couponsSlug
          : 'coupons',
      referralProgramsSlug:
        typeof pluginConfig?.collections?.referralProgramsSlug === 'string' &&
        pluginConfig.collections.referralProgramsSlug.trim().length > 0 &&
        pluginConfig.collections.referralProgramsSlug.length <= 100
          ? pluginConfig.collections.referralProgramsSlug
          : 'referral-programs',
      referralCodesSlug:
        typeof pluginConfig?.collections?.referralCodesSlug === 'string' &&
        pluginConfig.collections.referralCodesSlug.trim().length > 0 &&
        pluginConfig.collections.referralCodesSlug.length <= 100
          ? pluginConfig.collections.referralCodesSlug
          : 'referral-codes',
      referralPartnersSlug:
        typeof pluginConfig?.collections?.referralPartnersSlug === 'string' &&
        pluginConfig.collections.referralPartnersSlug.trim().length > 0 &&
        pluginConfig.collections.referralPartnersSlug.length <= 100
          ? pluginConfig.collections.referralPartnersSlug
          : 'referral-partners',
    },
    endpoints: {
      applyCoupon:
        typeof pluginConfig?.endpoints?.applyCoupon === 'string' &&
        pluginConfig.endpoints.applyCoupon.trim().length > 0
          ? pluginConfig.endpoints.applyCoupon
          : '/coupons/apply',
      validateCoupon:
        typeof pluginConfig?.endpoints?.validateCoupon === 'string' &&
        pluginConfig.endpoints.validateCoupon.trim().length > 0
          ? pluginConfig.endpoints.validateCoupon
          : '/coupons/validate',
      partnerStats:
        typeof pluginConfig?.endpoints?.partnerStats === 'string' &&
        pluginConfig.endpoints.partnerStats.trim().length > 0
          ? pluginConfig.endpoints.partnerStats
          : '/referrals/partner-stats',
      recordOrderUsage:
        typeof pluginConfig?.endpoints?.recordOrderUsage === 'string' &&
        pluginConfig.endpoints.recordOrderUsage.trim().length > 0
          ? pluginConfig.endpoints.recordOrderUsage
          : '/coupons/record-order-usage',
    },
    autoIntegrate: pluginConfig?.autoIntegrate !== false,
    access: {
      canUseCoupons:
        typeof pluginConfig?.access?.canUseCoupons === 'function'
          ? pluginConfig.access.canUseCoupons
          : () => true,
      canUseReferrals:
        typeof pluginConfig?.access?.canUseReferrals === 'function'
          ? pluginConfig.access.canUseReferrals
          : () => false,
      isAdmin:
        typeof pluginConfig?.access?.isAdmin === 'function'
          ? pluginConfig.access.isAdmin
          : ({ req }) => isAdminUser({ user: req?.user, roleConfig }),
      isPartner:
        typeof pluginConfig?.access?.isPartner === 'function'
          ? pluginConfig.access.isPartner
          : ({ req }) => isPartnerUser({ user: req?.user, roleConfig }),
    },
    referralConfig: {
      allowBothSystems: pluginConfig?.referralConfig?.allowBothSystems ?? false,
      singleCodePerCart: pluginConfig?.referralConfig?.singleCodePerCart ?? true,
      defaultPartnerSplit: pluginConfig?.referralConfig?.defaultPartnerSplit ?? 70,
      defaultCustomerSplit: pluginConfig?.referralConfig?.defaultCustomerSplit ?? 30,
      allowedTotalCommissionTypes:
        normalizedAllowedTotalCommissionTypes.length > 0
          ? normalizedAllowedTotalCommissionTypes
          : ['fixed', 'percentage'],
    },
    adminGroups: {
      couponsGroup: pluginConfig?.adminGroups?.couponsGroup ?? 'Coupons',
      referralsGroup: pluginConfig?.adminGroups?.referralsGroup ?? 'Referrals',
    },
    partnerDashboard: {
      enabled: pluginConfig?.partnerDashboard?.enabled ?? true,
      showEarningsSummary: pluginConfig?.partnerDashboard?.showEarningsSummary ?? true,
      showReferralPerformance: pluginConfig?.partnerDashboard?.showReferralPerformance ?? true,
      showRecentReferrals: pluginConfig?.partnerDashboard?.showRecentReferrals ?? true,
      showCommissionBreakdown: pluginConfig?.partnerDashboard?.showCommissionBreakdown ?? true,
    },
    orderIntegration: {
      ordersSlug:
        typeof pluginConfig?.orderIntegration?.ordersSlug === 'string' &&
        pluginConfig.orderIntegration.ordersSlug.trim().length > 0
          ? pluginConfig.orderIntegration.ordersSlug
          : 'orders',
      orderCustomerEmailField:
        typeof pluginConfig?.orderIntegration?.orderCustomerEmailField === 'string' &&
        pluginConfig.orderIntegration.orderCustomerEmailField.trim().length > 0
          ? pluginConfig.orderIntegration.orderCustomerEmailField
          : 'customerEmail',
      orderPaymentStatusField:
        typeof pluginConfig?.orderIntegration?.orderPaymentStatusField === 'string' &&
        pluginConfig.orderIntegration.orderPaymentStatusField.trim().length > 0
          ? pluginConfig.orderIntegration.orderPaymentStatusField
          : 'paymentStatus',
      orderPaidStatusValue:
        typeof pluginConfig?.orderIntegration?.orderPaidStatusValue === 'string'
          ? pluginConfig.orderIntegration.orderPaidStatusValue
          : 'paid',
    },
    roleConfig,
  }
}
