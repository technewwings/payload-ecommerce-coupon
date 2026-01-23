import type { Config } from 'payload'

export type ApplyCouponHooksArgs = {
  config: Config
  _allowStackWithOtherCoupons: boolean
  couponsSlug: string
  _referralProgramsSlug: string
  referralCodesSlug: string
}

export const applyCouponHooks = ({
  config,
  _allowStackWithOtherCoupons,
  couponsSlug,
  _referralProgramsSlug,
  referralCodesSlug,
}: ApplyCouponHooksArgs): Config => {
  // NOTE: This is a simplified example; in a real implementation you would
  // integrate deeply with the ecommerce plugin transactions and orders collections.

  const cartsSlug = 'carts'

  config.collections = (config.collections || []).map((collection) => {
    if (collection.slug === cartsSlug) {
      return {
        ...collection,
        fields: [
          ...(collection.fields || []),
          {
            name: 'appliedCoupons',
            type: 'array',
            fields: [
              {
                name: 'coupon',
                type: 'relationship',
                relationTo: couponsSlug,
              },
              {
                name: 'referralCode',
                type: 'relationship',
                relationTo: referralCodesSlug,
              },
              {
                name: 'discountAmount',
                type: 'number',
              },
            ],
          },
        ],
      }
    }

    return collection
  })

  return config
}
