import type { Config } from 'payload'
import type { CouponPluginOptions } from './types'

export const payloadEcommerceCouponPlugin =
  (pluginOptions: CouponPluginOptions = {}) =>
  (incomingConfig: Config): Config => {
    const {
      enabled = true,
      defaultCurrency = 'USD',
      allowStackWithOtherCoupons = false,
      collections: collectionConfig = {},
      autoIntegrate = true,
    } = pluginOptions

    if (!enabled) return incomingConfig

    const config = { ...incomingConfig }

    // TODO: Add collections
    // TODO: Add endpoints
    // TODO: Add hooks
    // TODO: Auto-integrate with ecommerce collections

    return config
  }
