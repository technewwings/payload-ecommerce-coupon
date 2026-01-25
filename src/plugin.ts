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

    // Safe autoIntegrate implementation — ensure referral collection exists before injecting relationships
    if (pluginConfig.autoIntegrate) {
      // Ensure collections array exists
      incomingConfig.collections = incomingConfig.collections || []

      // After we already appended the plugin collections above, recompute slug set
      const allSlugs = new Set<string>(incomingConfig.collections.map((c: any) => c.slug))

      // Helper that adds a field group to an existing collection (by slug) if not already present
      const addFieldsToCollection = (targetSlug: string, newFields: any[]) => {
        const idx = incomingConfig.collections!.findIndex((c: any) => c.slug === targetSlug)
        if (idx === -1) return
        const collection = incomingConfig.collections![idx]
        collection.fields = collection.fields || []

        // Avoid adding duplicate fields (by name)
        const existingFieldNames = new Set(collection.fields.map((f: any) => f.name))
        for (const f of newFields) {
          if (!existingFieldNames.has(f.name)) {
            collection.fields.push(f)
          }
        }

        // Replace the collection entry (mutation is OK here)
        incomingConfig.collections![idx] = collection
      }

      // Only inject referral integration if the referral collection slug is actually present
      if (
        pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.referralCodesSlug)
      ) {
        // Fields to append to carts (referral mode)
        const cartReferralFields = [
          {
            name: 'appliedReferralCode',
            type: 'relationship',
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: { description: 'Referral code applied to this cart' },
          },
          {
            name: 'partnerCommission',
            type: 'number',
            admin: { description: 'Partner commission amount for this cart' },
          },
          {
            name: 'customerDiscount',
            type: 'number',
            admin: { description: 'Customer discount amount for this cart' },
          },
        ]

        addFieldsToCollection('carts', cartReferralFields)

        // Fields to append to orders (referral mode)
        const orderReferralFields = [
          {
            name: 'appliedReferralCode',
            type: 'relationship',
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: { description: 'Referral code applied to this order', readOnly: true },
          },
          {
            name: 'partnerCommission',
            type: 'number',
            admin: { description: 'Partner commission amount for this order', readOnly: true },
          },
          {
            name: 'customerDiscount',
            type: 'number',
            admin: { description: 'Customer discount amount for this order', readOnly: true },
          },
        ]

        addFieldsToCollection('orders', orderReferralFields)
      } else if (
        !pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.couponsSlug)
      ) {
        // coupon mode — similar safe injection for appliedCoupons
        const cartCouponFields = [
          {
            name: 'appliedCoupon',
            type: 'relationship',
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: 'Coupon applied to this cart' },
          },
          {
            name: 'discountAmount',
            type: 'number',
            admin: { description: 'Discount amount from coupon' },
          },
        ]
        addFieldsToCollection('carts', cartCouponFields)

        const orderCouponFields = [
          {
            name: 'appliedCoupon',
            type: 'relationship',
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: 'Coupon applied to this order', readOnly: true },
          },
          {
            name: 'discountAmount',
            type: 'number',
            admin: { description: 'Discount amount from coupon', readOnly: true },
          },
        ]
        addFieldsToCollection('orders', orderCouponFields)
      }
    }

    return incomingConfig
  }
