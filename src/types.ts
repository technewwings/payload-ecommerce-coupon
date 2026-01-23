import type { Access, CollectionSlug } from 'payload'

export type CouponPluginCollections = {
  couponsSlug?: string
  referralProgramsSlug?: string
  referralCodesSlug?: string
  referralPartnersSlug?: string
}

export type CouponPluginAccess = {
  /** Access control for coupon operations */
  canUseCoupons?: Access
  /** Access control for referral operations */
  canUseReferrals?: Access
  /** Access control for admin operations */
  isAdmin?: Access
}

export type CouponPluginOptions = {
  enabled?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  collections?: CouponPluginCollections
  autoIntegrate?: boolean
  access?: CouponPluginAccess
}

export type SanitizedCouponPluginOptions = {
  enabled: boolean
  allowStackWithOtherCoupons: boolean
  defaultCurrency: string
  collections: Required<CouponPluginCollections>
  autoIntegrate: boolean
  access: CouponPluginAccess
}

export type CouponPluginConfig = {
  collections: {
    coupons: CollectionSlug
    referralPrograms: CollectionSlug
    referralCodes: CollectionSlug
    referralPartners?: CollectionSlug
  }
}

export type ApplyCouponHook = {
  code: string
  cartID?: string
  customerEmail?: string
}

export type ApplyCouponResponse = {
  success: boolean
  message: string
  discount?: number
  coupon?: {
    code: string
    type: 'percentage' | 'fixed'
    value: number
  }
  error?: string
}
