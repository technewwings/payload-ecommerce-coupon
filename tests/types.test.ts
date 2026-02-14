import { describe, it, expect } from 'bun:test'
import type {
  CouponPluginOptions,
  ApplyCouponResponse,
  SanitizedCouponPluginOptions,
  CouponPluginCollections,
  CouponPluginAccess,
} from '../src/types'

describe('Type Definitions', () => {
  describe('CouponPluginOptions', () => {
    it('should create valid coupon plugin options', () => {
      const options: CouponPluginOptions = {
        enabled: true,
        defaultCurrency: 'USD',
        allowStackWithOtherCoupons: false,
        autoIntegrate: true,
      }
      expect(options.enabled).toBe(true)
      expect(options.defaultCurrency).toBe('USD')
    })

    it('should create valid referral plugin options', () => {
      const options: CouponPluginOptions = {
        enabled: true,
        enableReferrals: true,
        defaultCurrency: 'EUR',
        autoIntegrate: false,
      }
      expect(options.enableReferrals).toBe(true)
      expect(options.defaultCurrency).toBe('EUR')
      expect(options.autoIntegrate).toBe(false)
    })

    it('should handle custom collection slugs', () => {
      const collections: CouponPluginCollections = {
        couponsSlug: 'discount-codes',
        referralProgramsSlug: 'affiliate-programs',
        referralCodesSlug: 'promo-codes',
        referralPartnersSlug: 'partners',
      }
      expect(collections.couponsSlug).toBe('discount-codes')
      expect(collections.referralProgramsSlug).toBe('affiliate-programs')
    })

    it('should handle access control functions', () => {
      const access: CouponPluginAccess = {
        canUseCoupons: ({ req }: any) => Boolean(req?.user),
        canUseReferrals: ({ req }: any) => req?.user?.role === 'premium',
        isAdmin: ({ req }: any) => req?.user?.permissions?.includes('admin'),
      }
      expect(typeof access.canUseCoupons).toBe('function')
      expect(typeof access.canUseReferrals).toBe('function')
      expect(typeof access.isAdmin).toBe('function')
    })

    it('should handle minimal configuration', () => {
      const options: CouponPluginOptions = {}
      expect(options).toBeDefined()
    })
  })

  describe('SanitizedCouponPluginOptions', () => {
    it('should create sanitized options with defaults', () => {
      const sanitized: SanitizedCouponPluginOptions = {
        enabled: true,
        enableReferrals: false,
        allowStackWithOtherCoupons: false,
        defaultCurrency: 'USD',
        collections: {
          couponsSlug: 'coupons',
          referralProgramsSlug: 'referral-programs',
          referralCodesSlug: 'referral-codes',
          referralPartnersSlug: 'referral-partners',
        },
        autoIntegrate: true,
        access: {},
      }
      expect(sanitized.enabled).toBe(true)
      expect(sanitized.enableReferrals).toBe(false)
      expect(sanitized.defaultCurrency).toBe('USD')
      expect(sanitized.collections.couponsSlug).toBe('coupons')
    })

    it('should handle referral mode sanitization', () => {
      const sanitized: SanitizedCouponPluginOptions = {
        enabled: true,
        enableReferrals: true,
        allowStackWithOtherCoupons: false,
        defaultCurrency: 'EUR',
        collections: {
          couponsSlug: 'coupons',
          referralProgramsSlug: 'referral-programs',
          referralCodesSlug: 'referral-codes',
          referralPartnersSlug: 'referral-partners',
        },
        autoIntegrate: true,
        access: {},
      }
      expect(sanitized.enableReferrals).toBe(true)
      expect(sanitized.defaultCurrency).toBe('EUR')
    })
  })

  describe('ApplyCouponResponse', () => {
    it('should create valid apply coupon response', () => {
      const response: ApplyCouponResponse = {
        success: true,
        message: 'Coupon applied',
        discount: 500,
        coupon: {
          code: 'TEST10',
          type: 'percentage',
          value: 10,
        },
      }
      expect(response.success).toBe(true)
      expect(response.discount).toBe(500)
      expect(response.coupon?.type).toBe('percentage')
    })

    it('should create valid apply referral response', () => {
      const response: ApplyCouponResponse = {
        success: true,
        message: 'Referral code applied successfully',
        partnerCommission: 36.75,
        customerDiscount: 15.5,
        referralCode: {
          code: 'REF-ABC123',
        },
      }
      expect(response.success).toBe(true)
      expect(response.partnerCommission).toBe(36.75)
      expect(response.customerDiscount).toBe(15.5)
      expect(response.referralCode?.code).toBe('REF-ABC123')
    })

    it('should handle error response', () => {
      const response: ApplyCouponResponse = {
        success: false,
        message: 'Coupon expired',
        error: 'COUPON_EXPIRED',
      }
      expect(response.success).toBe(false)
      expect(response.error).toBeDefined()
    })

    it('should handle mixed coupon and referral data', () => {
      const response: ApplyCouponResponse = {
        success: true,
        message: 'Applied successfully',
        discount: 100,
        partnerCommission: 50,
        customerDiscount: 100,
        coupon: {
          code: 'MIXED10',
          type: 'fixed',
          value: 10,
        },
        referralCode: {
          code: 'REF-MIXED',
        },
      }
      expect(response.discount).toBe(100)
      expect(response.partnerCommission).toBe(50)
      expect(response.customerDiscount).toBe(100)
      expect(response.coupon?.code).toBe('MIXED10')
      expect(response.referralCode?.code).toBe('REF-MIXED')
    })

    it('should handle minimal success response', () => {
      const response: ApplyCouponResponse = {
        success: true,
        message: 'Success',
      }
      expect(response.success).toBe(true)
      expect(response.message).toBe('Success')
      expect(response.discount).toBeUndefined()
      expect(response.coupon).toBeUndefined()
      expect(response.referralCode).toBeUndefined()
    })

    it('should handle minimal error response', () => {
      const response: ApplyCouponResponse = {
        success: false,
        message: 'Error occurred',
        error: 'GENERIC_ERROR',
      }
      expect(response.success).toBe(false)
      expect(response.error).toBe('GENERIC_ERROR')
    })
  })

  describe('Type Safety', () => {
    it('should enforce coupon type constraints', () => {
      const validTypes: Array<'percentage' | 'fixed'> = ['percentage', 'fixed']

      // This should compile without errors
      const coupon = {
        code: 'TEST',
        type: 'percentage' as const,
        value: 10,
      }

      expect(validTypes).toContain(coupon.type)
    })

    it('should enforce commission rule constraints', () => {
      type CommissionRule = {
        appliesTo: 'all' | 'categories' | 'products'
        totalCommission: {
          type: 'percentage' | 'fixed'
          value: number
        }
        split: {
          partnerPercentage: number
          customerPercentage: number
        }
      }

      const rule: CommissionRule = {
        appliesTo: 'categories',
        totalCommission: {
          type: 'percentage',
          value: 15,
        },
        split: {
          partnerPercentage: 70,
          customerPercentage: 30,
        },
      }

      expect(rule.appliesTo).toBe('categories')
      expect(rule.totalCommission.type).toBe('percentage')
      expect(rule.split.partnerPercentage + rule.split.customerPercentage).toBe(100)
    })

    it('should validate collection slug types', () => {
      const collections: Required<CouponPluginCollections> = {
        couponsSlug: 'coupons',
        referralProgramsSlug: 'referral-programs',
        referralCodesSlug: 'referral-codes',
        referralPartnersSlug: 'referral-partners',
      }

      expect(typeof collections.couponsSlug).toBe('string')
      expect(typeof collections.referralProgramsSlug).toBe('string')
      expect(typeof collections.referralCodesSlug).toBe('string')
      expect(typeof collections.referralPartnersSlug).toBe('string')
    })
  })
})
