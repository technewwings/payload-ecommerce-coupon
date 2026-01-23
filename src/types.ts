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

export type CouponPluginEndpoints = {
  applyCoupon?: string
  validateCoupon?: string
}

export type CouponPluginOptions = {
  enabled?: boolean
  enableReferrals?: boolean // New: toggle between coupons and referrals
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  collections?: CouponPluginCollections
  endpoints?: CouponPluginEndpoints
  autoIntegrate?: boolean
  access?: CouponPluginAccess
}

export type SanitizedCouponPluginOptions = {
  enabled: boolean
  enableReferrals: boolean // New: determines if using referral or coupon system
  allowStackWithOtherCoupons: boolean
  defaultCurrency: string
  collections: Required<CouponPluginCollections>
  endpoints: Required<CouponPluginEndpoints>
  autoIntegrate: boolean
  access: Required<CouponPluginAccess>
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
  partnerCommission?: number
  customerDiscount?: number
  currency?: string
  coupon?: {
    code: string
    type: 'percentage' | 'fixed'
    value: number
  }
  referralCode?: {
    code: string
  }
  error?: string
}
