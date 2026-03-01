import { describe, it, expect } from 'bun:test'
import { sanitizePluginConfig } from '../src/utilities/sanitizePluginConfig'

describe('sanitizePluginConfig', () => {
  describe('Default Values', () => {
    it('should apply all default values when config is empty', () => {
      const result = sanitizePluginConfig({ pluginConfig: {} })
      expect(result.enabled).toBe(true)
      expect(result.enableReferrals).toBe(false)
      expect(result.allowStackWithOtherCoupons).toBe(false)
      expect(result.defaultCurrency).toBe('USD')
      expect(result.autoIntegrate).toBe(true)
    })

    it('should apply defaults for collections', () => {
      const result = sanitizePluginConfig({ pluginConfig: {} })
      expect(result.collections.couponsSlug).toBe('coupons')
      expect(result.collections.referralProgramsSlug).toBe('referral-programs')
      expect(result.collections.referralCodesSlug).toBe('referral-codes')
      expect(result.collections.referralPartnersSlug).toBe('referral-partners')
    })

    it('should apply defaults for endpoints', () => {
      const result = sanitizePluginConfig({ pluginConfig: {} })
      expect(result.endpoints.applyCoupon).toBe('/coupons/apply')
      expect(result.endpoints.validateCoupon).toBe('/coupons/validate')
    })

    it('should apply defaults for access control', () => {
      const result = sanitizePluginConfig({ pluginConfig: {} })
      expect(result.access.canUseCoupons).toBeDefined()
      expect(result.access.canUseReferrals).toBeDefined()
      expect(result.access.isAdmin).toBeDefined()
      expect(typeof result.access.canUseCoupons).toBe('function')
      expect(typeof result.access.canUseReferrals).toBe('function')
      expect(typeof result.access.isAdmin).toBe('function')
    })
  })

  describe('Custom Configuration', () => {
    it('should preserve custom boolean options', () => {
      const config = {
        enabled: false,
        enableReferrals: true,
        allowStackWithOtherCoupons: true,
        autoIntegrate: false,
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.enabled).toBe(false)
      expect(result.enableReferrals).toBe(true)
      expect(result.allowStackWithOtherCoupons).toBe(true)
      expect(result.autoIntegrate).toBe(false)
    })

    it('should preserve custom currency', () => {
      const config = { defaultCurrency: 'EUR' }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.defaultCurrency).toBe('EUR')
    })

    it('should preserve custom collection slugs', () => {
      const config = {
        collections: {
          couponsSlug: 'discount-codes',
          referralProgramsSlug: 'affiliate-programs',
          referralCodesSlug: 'promo-codes',
          referralPartnersSlug: 'partners',
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('discount-codes')
      expect(result.collections.referralProgramsSlug).toBe('affiliate-programs')
      expect(result.collections.referralCodesSlug).toBe('promo-codes')
      expect(result.collections.referralPartnersSlug).toBe('partners')
    })

    it('should preserve partial collection slugs', () => {
      const config = {
        collections: {
          couponsSlug: 'custom-coupons',
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('custom-coupons')
      expect(result.collections.referralProgramsSlug).toBe('referral-programs') // default
    })

    it('should preserve custom endpoint paths', () => {
      const config = {
        endpoints: {
          applyCoupon: '/api/custom/apply',
          validateCoupon: '/api/custom/validate',
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.endpoints.applyCoupon).toBe('/api/custom/apply')
      expect(result.endpoints.validateCoupon).toBe('/api/custom/validate')
    })

    it('should preserve custom access functions', () => {
      const customCanUseCoupons = () => false
      const customCanUseReferrals = () => true
      const customIsAdmin = () => false

      const config = {
        access: {
          canUseCoupons: customCanUseCoupons,
          canUseReferrals: customCanUseReferrals,
          isAdmin: customIsAdmin,
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.access.canUseCoupons).toBe(customCanUseCoupons)
      expect(result.access.canUseReferrals).toBe(customCanUseReferrals)
      expect(result.access.isAdmin).toBe(customIsAdmin)
    })

    it('should preserve partial access functions', () => {
      const customCanUseCoupons = () => false
      const config = {
        access: {
          canUseCoupons: customCanUseCoupons,
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.access.canUseCoupons).toBe(customCanUseCoupons)
      expect(result.access.canUseReferrals).toBeDefined() // default
      expect(result.access.isAdmin).toBeDefined() // default
    })

    it('should honor custom roleConfig field paths and values', () => {
      const result = sanitizePluginConfig({
        pluginConfig: {
          roleConfig: {
            roleFieldPaths: ['account.roles', 'permissions.roles'],
            partnerRoleValues: ['affiliate'],
            adminRoleValues: ['superadmin'],
          },
        },
      })

      const partnerReq = {
        user: {
          account: {
            roles: ['affiliate'],
          },
        },
      }
      const adminReq = {
        user: {
          permissions: {
            roles: ['superadmin'],
          },
        },
      }

      expect(result.access.isPartner({ req: partnerReq } as any)).toBe(true)
      expect(result.access.isAdmin({ req: adminReq } as any)).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('should handle null input', () => {
      const result = sanitizePluginConfig({ pluginConfig: null as any })
      expect(result.enabled).toBe(true)
      expect(result.enableReferrals).toBe(false)
    })

    it('should handle undefined input', () => {
      const result = sanitizePluginConfig({ pluginConfig: undefined as any })
      expect(result.enabled).toBe(true)
      expect(result.enableReferrals).toBe(false)
    })

    it('should handle invalid boolean values', () => {
      const config = {
        enabled: 'true' as any,
        enableReferrals: 1 as any,
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.enabled).toBe(true) // coerced to boolean
      expect(result.enableReferrals).toBe(true) // coerced to boolean
    })

    it('should handle invalid string values', () => {
      const config = {
        defaultCurrency: 123 as any,
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.defaultCurrency).toBe('USD') // fallback to default
    })

    it('should handle empty string slugs', () => {
      const config = {
        collections: {
          couponsSlug: '',
          referralProgramsSlug: '   ',
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('coupons') // fallback to default
      expect(result.collections.referralProgramsSlug).toBe('referral-programs') // fallback to default
    })

    it('should handle invalid endpoint paths', () => {
      const config = {
        endpoints: {
          applyCoupon: 123 as any,
          validateCoupon: null as any,
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.endpoints.applyCoupon).toBe('/coupons/apply') // fallback to default
      expect(result.endpoints.validateCoupon).toBe('/coupons/validate') // fallback to default
    })

    it('should handle invalid access functions', () => {
      const config = {
        access: {
          canUseCoupons: 'not-a-function' as any,
          canUseReferrals: 123 as any,
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(typeof result.access.canUseCoupons).toBe('function') // fallback to default
      expect(typeof result.access.canUseReferrals).toBe('function') // fallback to default
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000)
      const config = {
        defaultCurrency: longString,
        collections: {
          couponsSlug: longString,
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.defaultCurrency).toBe('USD') // should validate and fallback
      expect(result.collections.couponsSlug).toBe('coupons') // should validate and fallback
    })

    it('should handle special characters in slugs', () => {
      const config = {
        collections: {
          couponsSlug: 'test_slug-123!@#',
        },
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('test_slug-123!@#')
    })

    it('should handle nested objects', () => {
      const config = {
        collections: {
          nested: {
            invalid: 'structure',
          },
        } as any,
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('coupons') // should ignore invalid structure
    })

    it('should handle arrays where objects expected', () => {
      const config = {
        collections: [] as any,
        endpoints: [] as any,
        access: [] as any,
      }
      const result = sanitizePluginConfig({ pluginConfig: config })
      expect(result.collections.couponsSlug).toBe('coupons')
      expect(result.endpoints.applyCoupon).toBe('/coupons/apply')
      expect(typeof result.access.canUseCoupons).toBe('function')
    })
  })

  describe('Type Safety', () => {
    it('should return properly typed configuration', () => {
      const result = sanitizePluginConfig({ pluginConfig: {} })
      // These should compile without type errors
      const enabled: boolean = result.enabled
      const enableReferrals: boolean = result.enableReferrals
      const currency: string = result.defaultCurrency
      const collections = result.collections
      const endpoints = result.endpoints
      const access = result.access

      expect(enabled).toBe(true)
      expect(enableReferrals).toBe(false)
      expect(currency).toBe('USD')
      expect(collections.couponsSlug).toBe('coupons')
      expect(endpoints.applyCoupon).toBe('/coupons/apply')
      expect(typeof access.canUseCoupons).toBe('function')
    })

    it('should handle all optional properties', () => {
      const minimal: any = {}
      const result = sanitizePluginConfig({ pluginConfig: minimal })
      expect(result).toBeDefined()

      const full: any = {
        enabled: true,
        enableReferrals: false,
        defaultCurrency: 'USD',
        allowStackWithOtherCoupons: false,
        autoIntegrate: true,
        collections: {
          couponsSlug: 'coupons',
          referralProgramsSlug: 'referral-programs',
          referralCodesSlug: 'referral-codes',
          referralPartnersSlug: 'referral-partners',
        },
        endpoints: {
          applyCoupon: '/coupons/apply',
          validateCoupon: '/coupons/validate',
        },
        access: {
          canUseCoupons: () => true,
          canUseReferrals: () => false,
          isAdmin: () => false,
        },
      }
      const fullResult = sanitizePluginConfig({ pluginConfig: full })
      expect(fullResult).toBeDefined()
    })
  })
})
