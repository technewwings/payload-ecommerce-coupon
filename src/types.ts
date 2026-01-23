export type CouponPluginCollections = {
  couponsSlug?: string
  referralProgramsSlug?: string
  referralCodesSlug?: string
  referralPartnersSlug?: string
}

export type CouponPluginOptions = {
  enabled?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  collections?: CouponPluginCollections
  autoIntegrate?: boolean
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
