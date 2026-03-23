import { payloadEcommerceCoupon } from '../src'

describe('Coupon Plugin', () => {
  it('should export plugin function', () => {
    expect(typeof payloadEcommerceCoupon).toBe('function')
  })

  it('should return config modifier function', async () => {
    const plugin = payloadEcommerceCoupon()
    expect(typeof plugin).toBe('function')
    const result = await plugin({} as any)
    expect(result).toBeDefined()
  })

  it('should disable when enabled is false', async () => {
    const plugin = payloadEcommerceCoupon({ enabled: false })
    const testConfig = { version: 1 } as any
    const result = await plugin(testConfig)
    expect(result).toEqual(testConfig)
  })

  describe('Configuration Options', () => {
    it('should accept valid plugin options', async () => {
      const plugin = payloadEcommerceCoupon({
        enabled: true,
        defaultCurrency: 'USD',
        allowStackWithOtherCoupons: false,
        autoIntegrate: true,
      })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle enableReferrals option', async () => {
      const plugin = payloadEcommerceCoupon({ enableReferrals: true })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle custom collection slugs', async () => {
      const plugin = payloadEcommerceCoupon({
        collections: {
          couponsSlug: 'discount-codes',
          referralProgramsSlug: 'affiliate-programs',
          referralCodesSlug: 'promo-codes',
        },
      })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle access control configuration', async () => {
      const plugin = payloadEcommerceCoupon({
        access: {
          canUseCoupons: () => true,
          canUseReferrals: () => false,
          isAdmin: () => false,
        },
      })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle complex access control', async () => {
      const plugin = payloadEcommerceCoupon({
        access: {
          canUseCoupons: ({ req }: any) => Boolean(req?.user),
          canUseReferrals: ({ req }: any) => req?.user?.role === 'premium',
          isAdmin: ({ req }: any) => req?.user?.permissions?.includes('admin'),
        },
      })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })
  })

  describe('Collection Creation', () => {
    it('should add coupon collections when referrals disabled (default)', async () => {
      const plugin = payloadEcommerceCoupon({ enabled: true })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(1)
      expect(result.collections?.map((c: any) => c.slug)).toEqual(['coupons'])
    })

    it('should add referral collections when referrals enabled', async () => {
      const plugin = payloadEcommerceCoupon({
        enabled: true,
        enableReferrals: true,
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(3)
      expect(result.collections?.map((c: any) => c.slug)).toEqual([
        'referral-programs',
        'referral-codes',
        'coupons',
      ])
    })

    it('should not create collections when disabled', async () => {
      const plugin = payloadEcommerceCoupon({ enabled: false })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(0)
    })

    it('should create collections with custom slugs', async () => {
      const plugin = payloadEcommerceCoupon({
        enableReferrals: true,
        collections: {
          referralProgramsSlug: 'custom-programs',
          referralCodesSlug: 'custom-codes',
        },
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections?.map((c: any) => c.slug)).toEqual([
        'custom-programs',
        'custom-codes',
        'coupons',
      ])
    })
  })

  describe('Endpoint Creation', () => {
    it('should add endpoints', async () => {
      const plugin = payloadEcommerceCoupon({ enabled: true })
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result.endpoints).toHaveLength(2)
      expect(result.endpoints?.map((e: any) => e.path)).toEqual([
        '/coupons/validate',
        '/coupons/apply',
      ])
    })

    it('should add endpoints for referral mode', async () => {
      const plugin = payloadEcommerceCoupon({
        enabled: true,
        enableReferrals: true,
      })
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result.endpoints).toHaveLength(3)
      expect(result.endpoints?.map((e: any) => e.path)).toEqual([
        '/coupons/validate',
        '/coupons/apply',
        '/referrals/partner-stats',
      ])
    })

    it('should not add endpoints when disabled', async () => {
      const plugin = payloadEcommerceCoupon({ enabled: false })
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result.endpoints).toBeUndefined()
    })

    it('should register collection-level coupon endpoints to avoid route conflicts', async () => {
      const plugin = payloadEcommerceCoupon({ enabled: true })
      const result = await plugin({ collections: [] } as any)
      const couponsCollection = result.collections?.find((c: any) => c.slug === 'coupons')

      expect(couponsCollection).toBeDefined()
      expect(couponsCollection?.endpoints?.map((e: any) => e.path)).toEqual(
        expect.arrayContaining(['/apply', '/validate']),
      )
    })
  })

  describe('Auto-Integration', () => {
    it('should extend carts collection when autoIntegrate enabled', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const testConfig = {
        collections: [{ slug: 'carts', fields: [] }],
      } as any
      const result = await plugin(testConfig)
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      expect(cartsCollection).toBeDefined()
      expect(cartsCollection?.fields).toBeDefined()
    })

    it('should extend orders collection when autoIntegrate enabled', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const testConfig = {
        collections: [{ slug: 'orders', fields: [] }],
      } as any
      const result = await plugin(testConfig)
      const ordersCollection = result.collections?.find((c: any) => c.slug === 'orders')
      expect(ordersCollection).toBeDefined()
      expect(ordersCollection?.fields).toBeDefined()
    })

    it('should not extend collections when autoIntegrate disabled', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: false })
      const testConfig = {
        collections: [{ slug: 'carts', fields: [] }],
      } as any
      const result = await plugin(testConfig)
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      expect(cartsCollection?.fields).toHaveLength(0)
    })

    it('should create appliedCoupon field for coupon mode', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const testConfig = {
        collections: [{ slug: 'carts', fields: [] }],
      } as any
      const result = await plugin(testConfig)
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      const appliedCouponField = cartsCollection?.fields?.find(
        (f: any) => f.name === 'appliedCoupon',
      )
      const discountAmountField = cartsCollection?.fields?.find(
        (f: any) => f.name === 'discountAmount',
      )
      expect(appliedCouponField).toBeDefined()
      expect(discountAmountField).toBeDefined()
      expect(appliedCouponField?.type).toBe('relationship')
      expect(discountAmountField?.type).toBe('number')
    })

    it('should create appliedReferralCode field for referral mode', async () => {
      const plugin = payloadEcommerceCoupon({
        enableReferrals: true,
        autoIntegrate: true,
      })
      const testConfig = {
        collections: [{ slug: 'carts', fields: [] }],
      } as any
      const result = await plugin(testConfig)
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      const appliedReferralCodeField = cartsCollection?.fields?.find(
        (f: any) => f.name === 'appliedReferralCode',
      )
      const partnerCommissionField = cartsCollection?.fields?.find(
        (f: any) => f.name === 'partnerCommission',
      )
      const customerDiscountField = cartsCollection?.fields?.find(
        (f: any) => f.name === 'customerDiscount',
      )
      expect(appliedReferralCodeField).toBeDefined()
      expect(partnerCommissionField).toBeDefined()
      expect(customerDiscountField).toBeDefined()
      expect(appliedReferralCodeField?.type).toBe('relationship')
      expect(partnerCommissionField?.type).toBe('number')
      expect(customerDiscountField?.type).toBe('number')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid configuration gracefully', async () => {
      const plugin = payloadEcommerceCoupon({} as any)
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle missing collections array', async () => {
      const plugin = payloadEcommerceCoupon()
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result.collections).toBeDefined()
    })

    it('should handle missing endpoints array', async () => {
      const plugin = payloadEcommerceCoupon()
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result.endpoints).toBeDefined()
    })

    it('should handle null or undefined config', async () => {
      const plugin = payloadEcommerceCoupon()
      const result = await plugin(null as any)
      expect(result).toBeDefined()
    })

    it('should handle malformed collection slugs', async () => {
      const plugin = payloadEcommerceCoupon({
        collections: {
          couponsSlug: '',
          referralProgramsSlug: 'valid-slug',
        } as any,
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result).toBeDefined()
    })

    it('should handle invalid access functions', async () => {
      const plugin = payloadEcommerceCoupon({
        access: {
          canUseCoupons: 'not-a-function' as any,
          canUseReferrals: () => true,
        },
      })
      const testConfig = {} as any
      const result = await plugin(testConfig)
      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty collections object', async () => {
      const plugin = payloadEcommerceCoupon({
        collections: {},
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(1) // coupons collection
    })

    it('should handle undefined collections in config', async () => {
      const plugin = payloadEcommerceCoupon()
      const testConfig = { collections: undefined } as any
      const result = await plugin(testConfig)
      expect(result.collections).toBeDefined()
      expect(Array.isArray(result.collections)).toBe(true)
    })

    it('should handle undefined endpoints in config', async () => {
      const plugin = payloadEcommerceCoupon()
      const testConfig = { endpoints: undefined } as any
      const result = await plugin(testConfig)
      expect(result.endpoints).toBeDefined()
      expect(Array.isArray(result.endpoints)).toBe(true)
    })

    it('should handle conflicting collection slugs', async () => {
      const plugin = payloadEcommerceCoupon({
        enableReferrals: true,
        collections: {
          couponsSlug: 'shared-slug',
          referralProgramsSlug: 'shared-slug',
        },
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(3)
      const slugs = result.collections?.map((c: any) => c.slug)
      expect(slugs).toContain('shared-slug')
    })

    it('should handle very long collection slugs', async () => {
      const longSlug = 'a'.repeat(100)
      const plugin = payloadEcommerceCoupon({
        collections: {
          couponsSlug: longSlug,
        },
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections?.[0]?.slug).toBe(longSlug)
    })

    it('should handle special characters in slugs', async () => {
      const plugin = payloadEcommerceCoupon({
        collections: {
          couponsSlug: 'test_slug-123',
        },
      })
      const testConfig = { collections: [] } as any
      const result = await plugin(testConfig)
      expect(result.collections?.[0]?.slug).toBe('test_slug-123')
    })
  })

  describe('Integration Scenarios', () => {
    it('should integrate with existing collections without conflicts', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const testConfig = {
        collections: [
          {
            slug: 'users',
            fields: [{ name: 'name', type: 'text' }],
          },
          {
            slug: 'carts',
            fields: [{ name: 'items', type: 'array' }],
          },
        ],
      } as any
      const result = await plugin(testConfig)
      expect(result.collections).toHaveLength(3) // users, carts (extended), coupons
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      expect(cartsCollection?.fields).toHaveLength(3) // original items + appliedCoupon + discountAmount
    })

    it('should handle multiple plugins integration', async () => {
      const plugin1 = payloadEcommerceCoupon({ autoIntegrate: true })
      const plugin2 = payloadEcommerceCoupon({
        enableReferrals: true,
        collections: {
          referralProgramsSlug: 'affiliate-programs',
        },
      })

      let config = { collections: [{ slug: 'carts', fields: [] }] } as any
      config = await plugin1(config)
      config = await plugin2(config)

      expect(config.collections).toHaveLength(4) // carts (extended), coupons, affiliate-programs, referral-codes
    })

    it('should preserve existing collection configuration', async () => {
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const testConfig = {
        collections: [
          {
            slug: 'carts',
            fields: [{ name: 'existingField', type: 'text' }],
            hooks: {
              beforeChange: [() => {}],
            },
            access: {
              read: () => true,
            },
          },
        ],
      } as any
      const result = await plugin(testConfig)
      const cartsCollection = result.collections?.find((c: any) => c.slug === 'carts')
      expect(cartsCollection?.fields).toHaveLength(3) // existing + appliedCoupon + discountAmount
      expect(cartsCollection?.hooks?.beforeChange).toHaveLength(2)
      expect(cartsCollection?.access?.read).toBeDefined()
    })
  })

  describe('Performance and Memory', () => {
    it('should not create duplicate collections', async () => {
      const plugin = payloadEcommerceCoupon()
      const testConfig = {
        collections: [
          { slug: 'coupons', fields: [] }, // Pre-existing coupons collection
        ],
      } as any
      const result = await plugin(testConfig)
      const couponCollections = result.collections?.filter((c: any) => c.slug === 'coupons')
      expect(couponCollections).toHaveLength(1)
    })

    it('should handle large configuration objects', async () => {
      const largeConfig = {
        collections: Array.from({ length: 100 }, (_, i) => ({
          slug: `collection-${i}`,
          fields: [{ name: 'field', type: 'text' }],
        })),
      }
      const plugin = payloadEcommerceCoupon({ autoIntegrate: true })
      const result = await plugin(largeConfig as any)
      expect(result.collections).toHaveLength(101) // 100 original + 1 coupons
    })
  })

  describe('Type Safety', () => {
    it('should accept all valid option types', async () => {
      const plugin = payloadEcommerceCoupon({
        enabled: true,
        enableReferrals: false,
        defaultCurrency: 'USD',
        allowStackWithOtherCoupons: true,
        autoIntegrate: true,
        collections: {
          couponsSlug: 'coupons',
          referralProgramsSlug: 'referral-programs',
          referralCodesSlug: 'referral-codes',
          referralPartnersSlug: 'referral-partners',
        },
        endpoints: {
          applyCoupon: '/api/coupons/apply',
          validateCoupon: '/api/coupons/validate',
        },
        access: {
          canUseCoupons: () => true,
          canUseReferrals: () => false,
          isAdmin: () => true,
        },
      })
      const result = await plugin({} as any)
      expect(result).toBeDefined()
    })

    it('should handle optional properties correctly', async () => {
      const minimalPlugin = payloadEcommerceCoupon()
      const fullPlugin = payloadEcommerceCoupon({
        enabled: true,
        enableReferrals: true,
        defaultCurrency: 'EUR',
        allowStackWithOtherCoupons: false,
        autoIntegrate: false,
      })

      const minimalResult = await minimalPlugin({} as any)
      const fullResult = await fullPlugin({} as any)

      expect(minimalResult).toBeDefined()
      expect(fullResult).toBeDefined()
    })
  })
})
