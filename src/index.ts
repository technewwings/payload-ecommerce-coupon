import type { Config, Endpoint } from 'payload'
import type { EcommercePluginConfig, PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

import type { CouponPluginOptions } from './types.js'
import { buildCouponCollections } from './couponCollections.js'
import { applyCouponHooks } from './hooks/applyCoupon.js'

export type { CouponPluginOptions } from './types.js'

export const payloadEcommerceCoupon =
  (pluginOptions: CouponPluginOptions = {}): ((incomingConfig: Config) => Config) =>
  (incomingConfig) => {
    let config = { ...incomingConfig }

    const {
      enabled = true,
      slugMap = {},
      collections = {},
      allowStackWithOtherCoupons = false,
      defaultCurrency,
    } = pluginOptions

    if (!enabled) return config

    // Locate ecommerce plugin config (if present)
    const ecommercePlugin = (config.plugins || []).find((plugin: any) => {
      return typeof plugin === 'function' && plugin.name === 'ecommercePlugin'
    }) as ((config: Config) => Config) | undefined

    if (!ecommercePlugin) {
      // Plugin can still work in a degraded mode, but we recommend ecommerce plugin
      // Consumers should ensure @payloadcms/plugin-ecommerce is installed
    }

    const couponsSlug = collections.couponsSlug || 'coupons'
    const referralProgramsSlug = collections.referralProgramsSlug || 'referral-programs'
    const referralCodesSlug = collections.referralCodesSlug || 'referral-codes'

    // Extend collections
    const { couponsCollection, referralProgramsCollection, referralCodesCollection } =
      buildCouponCollections({
        couponsSlug,
        referralCodesSlug,
        referralProgramsSlug,
        defaultCurrency,
      })

    config.collections = [
      ...(config.collections || []),
      couponsCollection,
      referralProgramsCollection,
      referralCodesCollection,
    ]

    // Add endpoints under /api/ecommerce/coupons
    const couponEndpoints: Endpoint[] = [
      {
        path: '/ecommerce/coupons/validate',
        method: 'post',
        handler: async (req) => {
          const { code, cartID } = req.body as { code?: string; cartID?: string }
          if (!code) {
            return Response.json({ error: 'Coupon code is required' }, { status: 400 })
          }

          const result = await req.payload.local.APIRequest<{ valid: boolean; message?: string }>(
            {
              method: 'post',
              path: '/ecommerce/coupons/apply',
              body: { code, cartID },
              req,
            },
          )

          return Response.json(result)
        },
      },
    ]

    config.endpoints = [...(config.endpoints || []), ...couponEndpoints]

    // Attach hooks to ecommerce collections (orders, transactions, carts)
    config = applyCouponHooks({
      config,
      allowStackWithOtherCoupons,
      couponsSlug,
      referralCodesSlug,
      referralProgramsSlug,
    })

    return config
  }
