import type { Config } from 'payload'

import { createCouponsCollection } from './collections/createCouponsCollection'
import { createReferralCodesCollection } from './collections/createReferralCodesCollection'
import { createReferralProgramsCollection } from './collections/createReferralProgramsCollection'
import { applyCouponEndpoint } from './endpoints/applyCoupon'
import { validateCouponEndpoint } from './endpoints/validateCoupon'
import type { CouponPluginOptions } from './types'
import { sanitizePluginConfig } from './utilities/sanitizePluginConfig'

export const payloadEcommerceCouponPlugin =
  (pluginOptions: CouponPluginOptions = {}) =>
  async (incomingConfig: Config): Promise<Config> => {
    if (!pluginOptions.enabled) return incomingConfig

    const pluginConfig = sanitizePluginConfig({ pluginConfig: pluginOptions })

    // Ensure collections exists
    if (!incomingConfig.collections) {
      incomingConfig.collections = []
    }

    // Create collections
    const couponsCollection = createCouponsCollection(pluginConfig)
    const referralProgramsCollection = createReferralProgramsCollection(pluginConfig)
    const referralCodesCollection = createReferralCodesCollection(pluginConfig)

    // Add collections to config
    incomingConfig.collections = [
      ...incomingConfig.collections,
      couponsCollection,
      referralProgramsCollection,
      referralCodesCollection,
    ]

    // Add endpoints
    if (!incomingConfig.endpoints) {
      incomingConfig.endpoints = []
    }

    incomingConfig.endpoints = [
      ...incomingConfig.endpoints,
      validateCouponEndpoint({ pluginConfig }),
      applyCouponEndpoint({ pluginConfig }),
    ]

    // Extend existing collections if autoIntegrate is enabled
    if (pluginConfig.autoIntegrate) {
      incomingConfig.collections = incomingConfig.collections.map((collection) => {
        // Extend carts collection
        if (collection.slug === 'carts') {
          return {
            ...collection,
            fields: [
              ...(collection.fields || []),
              {
                name: 'appliedCoupons',
                type: 'array',
                admin: {
                  description: 'Coupons applied to this cart',
                },
                fields: [
                  {
                    name: 'coupon',
                    type: 'relationship',
                    relationTo: pluginConfig.collections.couponsSlug,
                    required: true,
                  },
                  {
                    name: 'referralCode',
                    type: 'relationship',
                    relationTo: pluginConfig.collections.referralCodesSlug,
                  },
                  {
                    name: 'discountAmount',
                    type: 'number',
                    required: true,
                    admin: {
                      description: `Discount amount in ${pluginConfig.defaultCurrency}`,
                    },
                  },
                  {
                    name: 'appliedAt',
                    type: 'date',
                    defaultValue: () => new Date(),
                  },
                ],
              },
            ],
          }
        }

        // Extend orders collection
        if (collection.slug === 'orders') {
          return {
            ...collection,
            fields: [
              ...(collection.fields || []),
              {
                name: 'appliedCoupons',
                type: 'array',
                admin: {
                  description: 'Coupons applied to this order',
                  readOnly: true,
                },
                fields: [
                  {
                    name: 'coupon',
                    type: 'relationship',
                    relationTo: pluginConfig.collections.couponsSlug,
                    required: true,
                  },
                  {
                    name: 'referralCode',
                    type: 'relationship',
                    relationTo: pluginConfig.collections.referralCodesSlug,
                  },
                  {
                    name: 'discountAmount',
                    type: 'number',
                    required: true,
                  },
                ],
              },
            ],
          }
        }

        return collection
      })
    }

    return incomingConfig
  }
