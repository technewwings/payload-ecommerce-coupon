import type { Config } from 'payload'
import type { CouponPluginOptions } from './types'

export const payloadEcommerceCouponPlugin =
  (pluginOptions: CouponPluginOptions = {}) =>
  (incomingConfig: Config): Config => {
    const {
      enabled = true,
      _defaultCurrency = 'USD',
      _allowStackWithOtherCoupons = false,
      collections: _collectionConfig = {},
      _autoIntegrate = true,
    } = pluginOptions

    if (!enabled) return incomingConfig

    const config = { ...incomingConfig }

    // TODO: Add collections
    // TODO: Add endpoints
    // TODO: Add hooks
    // TODO: Auto-integrate with ecommerce collections

    return config
  }
