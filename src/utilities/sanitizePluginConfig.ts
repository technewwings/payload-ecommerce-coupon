import type { CouponPluginOptions, SanitizedCouponPluginOptions } from '../types'

export const sanitizePluginConfig = ({
  pluginConfig,
}: {
  pluginConfig: CouponPluginOptions
}): SanitizedCouponPluginOptions => {
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
          : () => false,
    },
  }
}
