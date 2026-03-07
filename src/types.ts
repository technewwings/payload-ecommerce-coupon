import type { Access, CollectionSlug } from 'payload'

export type CouponPluginCollections = {
  couponsSlug?: string
  referralProgramsSlug?: string
  referralCodesSlug?: string
  referralPartnersSlug?: string
}

export type CouponPluginAccess = {
  /** Legacy: Access control for coupon operations */
  canUseCoupons?: Access
  /** Legacy: Access control for referral operations */
  canUseReferrals?: Access
  /** Legacy: Access control for admin operations */
  isAdmin?: Access
  /** Legacy: Access control for partner operations */
  isPartner?: Access
}

export type CouponPluginEndpoints = {
  applyCoupon?: string
  validateCoupon?: string
  partnerStats?: string
  recordOrderUsage?: string
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
  /** Allowed Total Commission types in referral programs */
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}

export type RoleConfig = {
  /** User field paths that can hold roles (supports string or string[]) */
  roleFieldPaths?: string[]
  /** Values considered admin role */
  adminRoleValues?: string[]
  /** Values considered partner role */
  partnerRoleValues?: string[]
  /** Optional override to extract roles from req.user */
  customRoleResolver?: (user: unknown) => string[]
}

export type AdminGroupConfig = {
  /** Group name for coupon collections in admin panel */
  couponsGroup?: string
  /** Group name for referral collections in admin panel */
  referralsGroup?: string
}

/** Config for per-customer coupon limit (query paid orders by customer) */
export type OrderIntegrationConfig = {
  /** Orders collection slug */
  ordersSlug?: string
  /** Order field that stores customer email */
  orderCustomerEmailField?: string
  /** Order field that indicates payment status */
  orderPaymentStatusField?: string
  /** Value that means order is paid (counted for per-customer limit) */
  orderPaidStatusValue?: string
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

export type PolicyContext = {
  req: unknown
  user?: unknown
  payload?: unknown
}

export type PartnerStatsPolicyContext = PolicyContext & {
  requestedPartnerID?: string | number
}

export type RecordOrderUsagePolicyContext = PolicyContext & {
  order: unknown
}

export type CouponPluginPolicies = {
  /** Assumption-free policy gate for applying/using coupon codes */
  canApplyCoupon?: (context: PolicyContext) => boolean | Promise<boolean>
  /** Assumption-free policy gate for applying/using referral codes */
  canApplyReferral?: (context: PolicyContext) => boolean | Promise<boolean>
  /** Assumption-free policy gate for viewing partner stats */
  canViewPartnerStats?: (context: PartnerStatsPolicyContext) => boolean | Promise<boolean>
  /** Assumption-free policy gate for recording order usage */
  canRecordOrderUsage?: (context: RecordOrderUsagePolicyContext) => boolean | Promise<boolean>
}

export type PluginIntegrationCollections = {
  cartsSlug?: string
  ordersSlug?: string
  productsSlug?: string
  usersSlug?: string
  categoriesSlug?: string
  tagsSlug?: string
}

export type PluginIntegrationFields = {
  /** Cart/order field names */
  cartItemsField?: string
  cartSubtotalField?: string
  cartTotalField?: string
  cartAppliedCouponField?: string
  cartAppliedReferralCodeField?: string
  cartDiscountAmountField?: string
  cartCustomerDiscountField?: string
  cartPartnerCommissionField?: string
  orderAppliedCouponField?: string
  orderAppliedReferralCodeField?: string
  orderDiscountAmountField?: string
  orderCustomerDiscountField?: string
  orderPartnerCommissionField?: string
  /** Order lifecycle and ownership */
  orderCustomerEmailField?: string
  orderPaymentStatusField?: string
  orderCreatedAtField?: string
  /** Product-related mapping */
  productPriceField?: string
  productCurrencyCodeField?: string
}

export type PluginIntegrationResolvers = {
  /** Resolve user identity without role assumptions */
  getUserID?: (args: { req: unknown; user?: unknown }) => string | number | null | undefined
  /** Resolve cart items from a cart document */
  getCartItems?: (cart: unknown) => any[]
  /** Resolve cart subtotal from a cart document */
  getCartSubtotal?: (cart: unknown) => number
  /** Resolve cart total from a cart document */
  getCartTotal?: (cart: unknown) => number
  /** Resolve if an order is paid/completed */
  isOrderPaid?: (order: unknown) => boolean
  /** Resolve product unit price */
  getProductUnitPrice?: (args: {
    item: unknown
    product: unknown
    variant?: unknown
    currencyCode?: string
  }) => number
}

export type PluginIntegrationConfig = {
  collections?: PluginIntegrationCollections
  fields?: PluginIntegrationFields
  resolvers?: PluginIntegrationResolvers
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
  /** Assumption-free policy callbacks */
  policies?: CouponPluginPolicies
  /** Assumption-free integration mapping and resolvers */
  integration?: PluginIntegrationConfig
  /** Referral program specific configuration */
  referralConfig?: ReferralProgramConfig
  /** Admin panel group configuration */
  adminGroups?: AdminGroupConfig
  /** Partner dashboard configuration */
  partnerDashboard?: PartnerDashboardConfig
  /** Order integration for per-customer coupon limit */
  orderIntegration?: OrderIntegrationConfig
  /** Role resolution configuration for access checks and user filtering (legacy-compatible) */
  roleConfig?: RoleConfig
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
  policies: {
    canApplyCoupon: (context: PolicyContext) => boolean | Promise<boolean>
    canApplyReferral: (context: PolicyContext) => boolean | Promise<boolean>
    canViewPartnerStats: (context: PartnerStatsPolicyContext) => boolean | Promise<boolean>
    canRecordOrderUsage: (context: RecordOrderUsagePolicyContext) => boolean | Promise<boolean>
  }
  integration: {
    collections: Required<PluginIntegrationCollections>
    fields: Required<PluginIntegrationFields>
    resolvers: Required<PluginIntegrationResolvers>
  }
  referralConfig: Required<ReferralProgramConfig>
  adminGroups: Required<AdminGroupConfig>
  partnerDashboard: Required<PartnerDashboardConfig>
  orderIntegration: Required<OrderIntegrationConfig>
  roleConfig: {
    roleFieldPaths: string[]
    adminRoleValues: string[]
    partnerRoleValues: string[]
    customRoleResolver?: (user: unknown) => string[]
  }
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
    commissionRate: number
    customerDiscount: number
  } | null
}
