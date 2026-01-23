import type { CouponPluginOptions, SanitizedCouponPluginOptions } from '../types'

export const sanitizePluginConfig = ({
  pluginConfig,
}: {
  pluginConfig: CouponPluginOptions
}): SanitizedCouponPluginOptions => {
  return {
    enabled: pluginConfig.enabled ?? true,
    allowStackWithOtherCoupons: pluginConfig.allowStackWithOtherCoupons ?? false,
    defaultCurrency: pluginConfig.defaultCurrency ?? 'USD',
    collections: {
      couponsSlug: pluginConfig.collections?.couponsSlug ?? 'coupons',
      referralProgramsSlug: pluginConfig.collections?.referralProgramsSlug ?? 'referral-programs',
      referralCodesSlug: pluginConfig.collections?.referralCodesSlug ?? 'referral-codes',
      referralPartnersSlug: pluginConfig.collections?.referralPartnersSlug ?? 'referral-partners',
    },
    autoIntegrate: pluginConfig.autoIntegrate ?? true,
    access: pluginConfig.access ?? {},
  }
}
