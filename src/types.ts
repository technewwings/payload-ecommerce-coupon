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
  /** Access control for partner operations */
  isPartner?: Access
}

export type CouponPluginEndpoints = {
  applyCoupon?: string
  validateCoupon?: string
  partnerStats?: string
}

export type ReferralProgramConfig = {
  /** Allow both coupon and referral systems to run simultaneously */
  allowBothSystems?: boolean
  /** Only one code (coupon or referral) can be applied per cart */
  singleCodePerCart?: boolean
  /** Default commission split for partners */
  defaultPartnerSplit?: number
  /** Default discount split for customers */
  defaultCustomerSplit?: number
}

export type AdminGroupConfig = {
  /** Group name for coupon collections in admin panel */
  couponsGroup?: string
  /** Group name for referral collections in admin panel */
  referralsGroup?: string
}

export type PartnerDashboardConfig = {
  /** Enable partner dashboard widgets */
  enabled?: boolean
  /** Show earnings summary widget */
  showEarningsSummary?: boolean
  /** Show referral performance widget */
  showReferralPerformance?: boolean
  /** Show recent referrals widget */
  showRecentReferrals?: boolean
  /** Show commission breakdown widget */
  showCommissionBreakdown?: boolean
}

export type CouponPluginOptions = {
  enabled?: boolean
  enableReferrals?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  collections?: CouponPluginCollections & {
    /** Override the default coupons collection configuration */
    couponsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    /** Override the default referral programs collection configuration */
    referralProgramsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    /** Override the default referral codes collection configuration */
    referralCodesCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
  }
  endpoints?: CouponPluginEndpoints
  autoIntegrate?: boolean
  access?: CouponPluginAccess
  /** Referral program specific configuration */
  referralConfig?: ReferralProgramConfig
  /** Admin panel group configuration */
  adminGroups?: AdminGroupConfig
  /** Partner dashboard configuration */
  partnerDashboard?: PartnerDashboardConfig
}

export type SanitizedCouponPluginOptions = {
  enabled: boolean
  enableReferrals: boolean
  allowStackWithOtherCoupons: boolean
  defaultCurrency: string
  collections: Required<CouponPluginCollections>
  endpoints: Required<CouponPluginEndpoints>
  autoIntegrate: boolean
  access: Required<CouponPluginAccess>
  referralConfig: Required<ReferralProgramConfig>
  adminGroups: Required<AdminGroupConfig>
  partnerDashboard: Required<PartnerDashboardConfig>
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

export type PartnerStats = {
  totalEarnings: number
  pendingEarnings: number
  paidEarnings: number
  totalReferrals: number
  successfulReferrals: number
  conversionRate: number
  recentReferrals: Array<{
    id: string
    code: string
    orderValue: number
    commission: number
    date: string
    status: 'pending' | 'paid' | 'cancelled'
  }>
  monthlyEarnings: Array<{
    month: string
    earnings: number
    referrals: number
  }>
}

export type PartnerDashboardData = {
  stats: PartnerStats
  referralCodes: Array<{
    id: string
    code: string
    usageCount: number
    totalEarnings: number
    isActive: boolean
  }>
  program: {
    name: string
    description?: string
    commissionRate: number
    customerDiscount: number
  } | null
}
