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
    const pluginConfig = sanitizePluginConfig({ pluginConfig: pluginOptions })

    if (!pluginConfig.enabled) return incomingConfig || {}

    // Handle null or undefined incoming config
    if (!incomingConfig) {
      incomingConfig = { collections: [], endpoints: [] } as any
    }
    if (!incomingConfig.collections) {
      incomingConfig.collections = []
    }

    const collectionsToAdd = []

    if (pluginConfig.enableReferrals) {
      // Referral mode: create referral collections only
      const referralProgramsCollection = createReferralProgramsCollection(pluginConfig)
      const referralCodesCollection = createReferralCodesCollection(pluginConfig)

      collectionsToAdd.push(referralProgramsCollection, referralCodesCollection)
    } else {
      // Coupon mode: create coupon collections only
      const couponsCollection = createCouponsCollection(pluginConfig)
      collectionsToAdd.push(couponsCollection)
    }

    // Add collections to config (avoid duplicates)
    const existingSlugs = new Set(incomingConfig.collections.map((c: any) => c.slug))
    const collectionsToAddFiltered = collectionsToAdd.filter((c: any) => !existingSlugs.has(c.slug))
    incomingConfig.collections = [...incomingConfig.collections, ...collectionsToAddFiltered]

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
      // Recompute the set of collection slugs after adding plugin collections
      const collectionSlugs = new Set(incomingConfig.collections.map((c) => c.slug))

      // Extend carts collection
      if (
        pluginConfig.enableReferrals &&
        collectionSlugs.has(pluginConfig.collections.referralCodesSlug)
      ) {
        const cartCollection = incomingConfig.collections.find((c) => c.slug === 'carts')
        if (cartCollection) {
          if (!cartCollection.fields) cartCollection.fields = []
          cartCollection.fields.push({
            name: 'appliedReferrals',
            type: 'array',
            admin: {
              description: 'Referral codes applied to this cart',
            },
            fields: [
              {
                name: 'referralCode',
                type: 'relationship',
                relationTo: pluginConfig.collections.referralCodesSlug,
                required: true,
              },
              {
                name: 'partnerCommission',
                type: 'number',
                required: true,
                admin: {
                  description: `Commission amount for the partner in ${pluginConfig.defaultCurrency}`,
                },
              },
              {
                name: 'customerDiscount',
                type: 'number',
                required: true,
                admin: {
                  description: `Discount amount for the customer in ${pluginConfig.defaultCurrency}`,
                },
              },
              {
                name: 'appliedAt',
                type: 'date',
                defaultValue: () => new Date(),
              },
            ],
          })
        }
      } else if (
        !pluginConfig.enableReferrals &&
        collectionSlugs.has(pluginConfig.collections.couponsSlug)
      ) {
        const cartCollection = incomingConfig.collections.find((c) => c.slug === 'carts')
        if (cartCollection) {
          if (!cartCollection.fields) cartCollection.fields = []
          cartCollection.fields.push({
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
          })
        }
      }

      // Extend orders collection
      if (
        pluginConfig.enableReferrals &&
        collectionSlugs.has(pluginConfig.collections.referralCodesSlug)
      ) {
        const orderCollection = incomingConfig.collections.find((c) => c.slug === 'orders')
        if (orderCollection) {
          if (!orderCollection.fields) orderCollection.fields = []
          orderCollection.fields.push({
            name: 'appliedReferrals',
            type: 'array',
            admin: {
              description: 'Referral codes applied to this order',
              readOnly: true,
            },
            fields: [
              {
                name: 'referralCode',
                type: 'relationship',
                relationTo: pluginConfig.collections.referralCodesSlug,
                required: true,
              },
              {
                name: 'partnerCommission',
                type: 'number',
                required: true,
              },
              {
                name: 'customerDiscount',
                type: 'number',
                required: true,
              },
            ],
          })
        }
      } else if (
        !pluginConfig.enableReferrals &&
        collectionSlugs.has(pluginConfig.collections.couponsSlug)
      ) {
        const orderCollection = incomingConfig.collections.find((c) => c.slug === 'orders')
        if (orderCollection) {
          if (!orderCollection.fields) orderCollection.fields = []
          orderCollection.fields.push({
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
                name: 'discountAmount',
                type: 'number',
                required: true,
              },
            ],
          })
        }
      }
    }

    return incomingConfig
  }
