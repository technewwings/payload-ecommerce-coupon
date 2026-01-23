import type { Config } from 'payload'

export type CouponPluginCollections = {
  couponsSlug?: string
  referralProgramsSlug?: string
  referralCodesSlug?: string
}

export type CouponPluginOptions = {
  enabled?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  slugMap?: {
    orders?: string
    carts?: string
    transactions?: string
  }
  collections?: CouponPluginCollections
}
