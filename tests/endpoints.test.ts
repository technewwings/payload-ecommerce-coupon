import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test'
import { applyCouponHandler } from '../src/endpoints/applyCoupon'
import { validateCouponHandler } from '../src/endpoints/validateCoupon'
import { sanitizePluginConfig } from '../src/utilities/sanitizePluginConfig'

// Mock Payload
const mockPayload = {
  find: jest.fn(),
  findByID: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}

describe('Apply Coupon Endpoint', () => {
  const pluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: false,
      defaultCurrency: 'USD',
      allowStackWithOtherCoupons: false,
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
    },
  })

  const referralPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      ...pluginConfig,
      enableReferrals: true,
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Input Validation', () => {
    it('should read request body from req.json when req.data is missing', async () => {
      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        json: async () => ({ code: 'TEST10', cartID: 'cart-123' }),
      }

      mockPayload.findByID.mockResolvedValue({
        id: 'cart-123',
        subtotal: 1000,
        appliedCoupons: [],
      })
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const response = await handler(req as any)
      expect(response.status).not.toBe(400)
    })

    it('should return error when code is missing', async () => {
      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Coupon code and cart ID are required')
    })

    it('should return error when cartID is missing', async () => {
      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Coupon code and cart ID are required')
    })

    it('should return error when both code and cartID are missing', async () => {
      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: {},
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
    })

    it('should return error for referral mode when code is missing', async () => {
      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Referral code and cart ID are required')
    })
  })

  describe('Coupon Mode', () => {
    it('should handle valid coupon application', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        isActive: true,
        usageLimit: 100,
        usedCount: 50,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })
      mockPayload.findByID.mockResolvedValue({
        id: 'cart-123',
        subtotal: 1000,
        appliedCoupons: [],
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: 'coupons',
        limit: 1,
        where: { normalizedCode: { equals: 'TEST10' } },
      })
      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    it('should handle coupon not found', async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'INVALID', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid coupon code')
    })

    it('should handle inactive coupon', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        activeFrom: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year in the future
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })
      mockPayload.findByID.mockResolvedValue({
        id: 'cart-123',
        subtotal: 1000,
        appliedCoupons: [],
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon is not yet active')
    })

    it('should handle expired coupon', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        activeUntil: new Date('2020-01-01').toISOString(), // Past date
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon has expired')
    })

    it('should handle usage limit exceeded', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        usageLimit: 100,
        usageCount: 100,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon usage limit exceeded')
    })
  })

  describe('Referral Mode', () => {
    it('should handle valid referral code application', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 15 },
            split: { partnerPercentage: 70, customerPercentage: 30 },
          },
        ],
      }

      const mockCart = {
        id: 'cart-123',
        items: [],
        appliedReferrals: [],
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs' && args.id === 'program-1') {
          return Promise.resolve(mockProgram)
        }
        if (args.collection === 'carts' && args.id === 'cart-123') {
          return Promise.resolve(mockCart)
        }
        return Promise.resolve(null)
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: 'referral-codes',
        limit: 1,
        where: { normalizedCode: { equals: 'REF123' } },
      })
      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    it('should return correct amounts when fixed commissions use direct splits', async () => {
      const mockReferralCode = {
        id: 'ref-2',
        code: 'FIXED1',
        isActive: true,
        program: 'program-2',
      }

      const mockProgram = {
        id: 'program-2',
        isActive: true,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerSplit: 7,
            customerSplit: 3,
          },
        ],
      }

      const mockCart = {
        id: 'cart-456',
        subtotal: 100,
        items: [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }],
        appliedReferrals: [],
      }

      mockPayload.find.mockResolvedValueOnce({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs' && args.id === 'program-2') {
          return Promise.resolve(mockProgram)
        }
        if (args.collection === 'carts' && args.id === 'cart-456') {
          return Promise.resolve(mockCart)
        }
        return Promise.resolve(null)
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'FIXED1', cartID: 'cart-456' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.partnerCommission).toBe(7)
      expect(result.customerDiscount).toBe(3)
    })

    it('should handle referral code not found', async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })
      // cart lookup must succeed otherwise handler returns cart-not-found first
      mockPayload.findByID.mockResolvedValue({
        id: 'cart-123',
        items: [],
        subtotal: 0,
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'INVALID', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid referral code')
    })

    it('should handle inactive referral code', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: false,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockResolvedValue({
        id: 'cart-123',
        items: [],
        subtotal: 0,
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Referral code is not active')
    })

    it('should enforce referral program minimum order amount on apply', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
            customerSplit: 50,
            minOrderAmount: 200,
          },
        ],
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs' && args.id === 'program-1') {
          return Promise.resolve(mockProgram)
        }
        if (args.collection === 'carts' && args.id === 'cart-123') {
          return Promise.resolve({ id: 'cart-123', subtotal: 100, items: [] })
        }
        return Promise.resolve(null)
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('Minimum order value of 200')
    })

    it('should enforce minimum order amount for fixed referral rules on apply', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        minOrderAmount: 200,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerSplit: 15,
            customerSplit: 10,
          },
        ],
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs' && args.id === 'program-1') {
          return Promise.resolve(mockProgram)
        }
        if (args.collection === 'carts' && args.id === 'cart-123') {
          return Promise.resolve({
            id: 'cart-123',
            subtotal: 100,
            items: [{ id: 'i1', price: 100, quantity: 1, product: { id: 'p1' } }],
          })
        }
        return Promise.resolve(null)
      })

      const handler = applyCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('Minimum order value of 200')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPayload.find.mockRejectedValue(new Error('Database connection failed'))

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal server error')
    })

    it('should handle malformed request data', async () => {
      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: null,
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
    })

    it('should handle unexpected errors', async () => {
      mockPayload.find.mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const handler = applyCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal server error')
    })
  })
})

describe('Validate Coupon Endpoint', () => {
  const pluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: false,
      defaultCurrency: 'USD',
      allowStackWithOtherCoupons: false,
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
    },
  })

  const referralPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      ...pluginConfig,
      enableReferrals: true,
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Input Validation', () => {
    it('should read request body from req.json when req.data is missing', async () => {
      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        json: async () => ({ code: 'TEST10', cartValue: 1000 }),
      }

      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const response = await handler(req as any)
      expect(response.status).not.toBe(400)
    })

    it('should return error when code is missing', async () => {
      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: {},
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Code is required')
    })

    it('should accept code parameter', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        isActive: true,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })
  })

  describe('Coupon Validation', () => {
    it('should validate active coupon successfully', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        isActive: true,
        description: '10% off',
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.coupon.code).toBe('TEST10')
      expect(result.coupon.type).toBe('percentage')
      expect(result.coupon.value).toBe(10)
    })

    it('should handle coupon not found', async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'INVALID' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid coupon code')
    })

    it('should handle inactive coupon', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should handle expired coupon', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        activeUntil: new Date('2020-01-01').toISOString(), // Past date
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon has expired')
    })

    it('should handle usage limit exceeded', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        usageLimit: 100,
        usageCount: 100,
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockCoupon],
        totalDocs: 1,
      })

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon usage limit exceeded')
    })
  })

  describe('Referral Code Validation', () => {
    it('should validate active referral code successfully', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 15 },
            split: { partnerPercentage: 70, customerPercentage: 30 },
          },
        ],
      }

      mockPayload.find.mockResolvedValue({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockResolvedValue(mockProgram)

      const handler = validateCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.referralCode.code).toBe('REF123')
    })

    it('should handle referral code not found', async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const handler = validateCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'INVALID' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Referral code not found')
    })

    it('should enforce referral program minimum order amount on validate', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
            customerSplit: 50,
            minOrderAmount: 200,
          },
        ],
      }

      mockPayload.find.mockResolvedValueOnce({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
        if (args.collection === 'carts') {
          return Promise.resolve({
            id: 'cart-123',
            subtotal: 100,
            items: [],
          })
        }
        return Promise.resolve(null)
      })

      const handler = validateCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('Minimum order value of 200')
    })

    it('should enforce minimum order amount for fixed referral rules on validate', async () => {
      const mockReferralCode = {
        id: 'ref-1',
        code: 'REF123',
        isActive: true,
        program: 'program-1',
      }

      const mockProgram = {
        id: 'program-1',
        isActive: true,
        minOrderAmount: 200,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerSplit: 15,
            customerSplit: 10,
          },
        ],
      }

      mockPayload.find.mockResolvedValueOnce({
        docs: [mockReferralCode],
        totalDocs: 1,
      })
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
        if (args.collection === 'carts') {
          return Promise.resolve({
            id: 'cart-123',
            subtotal: 100,
            items: [{ id: 'i1', price: 100, quantity: 1, product: { id: 'p1' } }],
          })
        }
        return Promise.resolve(null)
      })

      const handler = validateCouponHandler({
        pluginConfig: referralPluginConfig,
      })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('Minimum order value of 200')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors', async () => {
      mockPayload.find.mockRejectedValue(new Error('Database error'))

      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'TEST10' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal server error')
    })

    it('should handle malformed data', async () => {
      const handler = validateCouponHandler({ pluginConfig })
      const req = {
        payload: mockPayload,
        data: null,
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
    })
  })
})

describe('Referral v2 Consistency', () => {
  const referralPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: true,
      defaultCurrency: 'USD',
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
        canUseReferrals: () => true,
        isAdmin: () => true,
      },
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return identical referral values in apply and validate for same cart', async () => {
    const referralCode = {
      id: 'ref-1',
      code: 'REF123',
      isActive: true,
      program: 'prog-1',
    }
    const program = {
      id: 'prog-1',
      isActive: true,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }
    const cart = {
      id: 'cart-1',
      subtotal: 100,
      items: [{ product: { id: 'p1' }, quantity: 1, price: 100 }],
    }

    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === 'referral-codes') return Promise.resolve({ docs: [referralCode] })
      return Promise.resolve({ docs: [] })
    })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'carts') return Promise.resolve(cart)
      if (args.collection === 'referral-programs') return Promise.resolve(program)
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({})

    const apply = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const validate = validateCouponHandler({
      pluginConfig: referralPluginConfig,
    })

    const applyResp = await apply({
      payload: mockPayload,
      data: { code: 'REF123', cartID: 'cart-1' },
    } as any)
    const validateResp = await validate({
      payload: mockPayload,
      data: { code: 'REF123', cartID: 'cart-1' },
    } as any)

    const applyJson = await applyResp.json()
    const validateJson = await validateResp.json()

    expect(applyJson.partnerCommission).toBe(validateJson.partnerCommission)
    expect(applyJson.customerDiscount).toBe(validateJson.customerDiscount)
  })

  it('should trim referral code before lookup', async () => {
    const referralCode = {
      id: 'ref-1',
      code: 'REF123',
      isActive: true,
      program: 'prog-1',
    }
    const program = { id: 'prog-1', isActive: true, commissionRules: [] }
    const cart = { id: 'cart-1', subtotal: 100, items: [] }

    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === 'referral-codes' && args.where?.code?.equals === 'REF123') {
        return Promise.resolve({ docs: [referralCode] })
      }
      return Promise.resolve({ docs: [] })
    })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'carts') return Promise.resolve(cart)
      if (args.collection === 'referral-programs') return Promise.resolve(program)
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({})

    const apply = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const resp = await apply({
      payload: mockPayload,
      data: { code: ' REF123 ', cartID: 'cart-1' },
    } as any)
    const result = await resp.json()

    expect(resp.status).toBe(200)
    expect(result.success).toBe(true)
  })

  it('should detect already applied referral when relation is populated object', async () => {
    const referralCode = {
      id: 'ref-1',
      code: 'REF123',
      isActive: true,
      program: 'prog-1',
    }
    const program = { id: 'prog-1', isActive: true, commissionRules: [] }
    const cart = {
      id: 'cart-1',
      subtotal: 100,
      items: [],
      appliedReferralCode: { id: 'ref-1' },
    }

    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === 'referral-codes') return Promise.resolve({ docs: [referralCode] })
      return Promise.resolve({ docs: [] })
    })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'carts') return Promise.resolve(cart)
      if (args.collection === 'referral-programs') return Promise.resolve(program)
      return Promise.resolve(null)
    })

    const apply = applyCouponHandler({
      pluginConfig: {
        ...referralPluginConfig,
        referralConfig: {
          ...referralPluginConfig.referralConfig,
          singleCodePerCart: false,
        },
      },
    })
    const resp = await apply({
      payload: mockPayload,
      data: { code: 'REF123', cartID: 'cart-1' },
    } as any)
    const result = await resp.json()

    expect(resp.status).toBe(400)
    expect(result.error).toBe('Referral code already applied to this cart')
  })
})

describe('cartSubtotal Baseline Enforcement', () => {
  const couponPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: false,
      defaultCurrency: 'USD',
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
        canUseReferrals: () => true,
        isAdmin: () => true,
      },
    },
  })

  const referralPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: true,
      defaultCurrency: 'USD',
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
        canUseReferrals: () => true,
        isAdmin: () => true,
      },
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // applyCoupon — coupon path: min/max order uses cartSubtotal
  // ---------------------------------------------------------------------------

  it('apply coupon: enforces minOrderValue against cartSubtotal, not cartTotal', async () => {
    // Cart has subtotal=80, but total=60 (discount already applied from elsewhere).
    // coupon.minOrderValue=100 should reject because subtotal(80) < 100,
    // even though if we checked total(60) it would also reject — the key is we
    // compare against the PRE-discount subtotal, not the post-discount total.
    const mockCoupon = {
      id: 'c1',
      code: 'MIN100',
      type: 'fixed',
      value: 10,
      minOrderValue: 100,
    }

    mockPayload.find.mockResolvedValue({ docs: [mockCoupon], totalDocs: 1 })
    mockPayload.findByID.mockResolvedValue({
      id: 'cart-1',
      subtotal: 80,
      total: 60,
      items: [],
    })

    const handler = applyCouponHandler({ pluginConfig: couponPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'MIN100', cartID: 'cart-1' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toContain('Minimum order value of 100 USD required')
  })

  it('apply coupon: passes minOrderValue check when cartSubtotal meets threshold even if cartTotal does not', async () => {
    // Cart subtotal=150 (meets minOrderValue=100), total=90 (post-discount, below threshold).
    // We should pass because we check cartSubtotal, not cartTotal.
    const mockCoupon = {
      id: 'c2',
      code: 'MIN100B',
      type: 'fixed',
      value: 5,
      minOrderValue: 100,
    }

    mockPayload.find.mockResolvedValue({ docs: [mockCoupon], totalDocs: 1 })
    mockPayload.findByID.mockResolvedValue({
      id: 'cart-2',
      subtotal: 150,
      total: 90,
      items: [],
    })
    mockPayload.update.mockResolvedValue({})

    const handler = applyCouponHandler({ pluginConfig: couponPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'MIN100B', cartID: 'cart-2' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
  })

  it('apply coupon: enforces maxOrderValue against cartSubtotal', async () => {
    // cartSubtotal=200 exceeds maxOrderValue=150 → rejected.
    const mockCoupon = {
      id: 'c3',
      code: 'MAX150',
      type: 'fixed',
      value: 10,
      maxOrderValue: 150,
    }

    mockPayload.find.mockResolvedValue({ docs: [mockCoupon], totalDocs: 1 })
    mockPayload.findByID.mockResolvedValue({
      id: 'cart-3',
      subtotal: 200,
      total: 200,
      items: [],
    })

    const handler = applyCouponHandler({ pluginConfig: couponPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'MAX150', cartID: 'cart-3' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toContain('Maximum order value of 150 USD exceeded')
  })

  it('apply coupon: calculates percentage discount against cartSubtotal', async () => {
    // cartSubtotal=200, total=180. 10% of subtotal(200)=20, not 10% of total(180)=18.
    const mockCoupon = {
      id: 'c4',
      code: 'PCT10',
      type: 'percentage',
      value: 10,
    }

    mockPayload.find.mockResolvedValue({ docs: [mockCoupon], totalDocs: 1 })
    mockPayload.findByID.mockResolvedValue({
      id: 'cart-4',
      subtotal: 200,
      total: 180,
      items: [],
    })
    mockPayload.update.mockResolvedValue({})

    const handler = applyCouponHandler({ pluginConfig: couponPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'PCT10', cartID: 'cart-4' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    // Discount must be 10% of subtotal(200) = 20, not 10% of total(180) = 18
    expect(result.discount).toBe(20)
  })

  it('apply coupon: fixed discount uses cartSubtotal as ceiling when subtotal < coupon value', async () => {
    // cartSubtotal=30, coupon fixed value=50 → discount capped at subtotal(30).
    const mockCoupon = {
      id: 'c5',
      code: 'FIX50',
      type: 'fixed',
      value: 50,
    }

    mockPayload.find.mockResolvedValue({ docs: [mockCoupon], totalDocs: 1 })
    mockPayload.findByID.mockResolvedValue({
      id: 'cart-5',
      subtotal: 30,
      total: 30,
      items: [],
    })
    mockPayload.update.mockResolvedValue({})

    const handler = applyCouponHandler({ pluginConfig: couponPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'FIX50', cartID: 'cart-5' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    // Discount capped at subtotal(30)
    expect(result.discount).toBe(30)
  })

  // ---------------------------------------------------------------------------
  // applyCoupon — referral path: min order uses cartSubtotal
  // ---------------------------------------------------------------------------

  it('apply referral: enforces minOrderAmount against cartSubtotal, not cartTotal', async () => {
    // cartSubtotal=80, cartTotal=60. minOrderAmount=100.
    // Should reject because subtotal(80) < 100.
    const mockReferralCode = {
      id: 'ref-sub-1',
      code: 'REFSUB1',
      isActive: true,
      program: 'prog-sub-1',
    }
    const mockProgram = {
      id: 'prog-sub-1',
      isActive: true,
      minOrderAmount: 100,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 10,
          customerSplit: 5,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({ id: 'cart-sub-1', subtotal: 80, total: 60, items: [] })
      }
      return Promise.resolve(null)
    })

    const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFSUB1', cartID: 'cart-sub-1' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toContain('Minimum order value of 100 USD required')
  })

  it('apply referral: passes minOrderAmount when cartSubtotal meets threshold even if cartTotal does not', async () => {
    // cartSubtotal=150, cartTotal=80. minOrderAmount=100.
    // Should pass because subtotal(150) >= 100.
    const mockReferralCode = {
      id: 'ref-sub-2',
      code: 'REFSUB2',
      isActive: true,
      program: 'prog-sub-2',
    }
    const mockProgram = {
      id: 'prog-sub-2',
      isActive: true,
      minOrderAmount: 100,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 10,
          customerSplit: 5,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({
          id: 'cart-sub-2',
          subtotal: 150,
          total: 80,
          items: [{ id: 'i1', price: 150, quantity: 1, product: { id: 'p1' } }],
        })
      }
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({})

    const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFSUB2', cartID: 'cart-sub-2' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
  })

  it('apply referral: commission calculation uses cartSubtotal as the base', async () => {
    // cartSubtotal=200, cartTotal=150 (post-discount).
    // 10% percentage rule on subtotal(200) → totalPot=20, split 50/50 → each 10.
    // If it mistakenly used cartTotal(150) → totalPot=15, split → each 7.5.
    const mockReferralCode = {
      id: 'ref-sub-3',
      code: 'REFSUB3',
      isActive: true,
      program: 'prog-sub-3',
    }
    const mockProgram = {
      id: 'prog-sub-3',
      isActive: true,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({
          id: 'cart-sub-3',
          subtotal: 200,
          total: 150,
          items: [{ id: 'i1', price: 200, quantity: 1, product: { id: 'p1' } }],
        })
      }
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({})

    const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFSUB3', cartID: 'cart-sub-3' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    // 10% of subtotal(200) = 20, split 50/50 → each 10
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(10)
  })

  // ---------------------------------------------------------------------------
  // validateCoupon — referral path: min order uses cartSubtotal
  // ---------------------------------------------------------------------------

  it('validate referral: enforces minOrderAmount against cartSubtotal, not cartTotal', async () => {
    // cartSubtotal=80 (via subtotal field), minOrderAmount=100.
    const mockReferralCode = {
      id: 'ref-val-1',
      code: 'REFVAL1',
      isActive: true,
      program: 'prog-val-1',
    }
    const mockProgram = {
      id: 'prog-val-1',
      isActive: true,
      minOrderAmount: 100,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 10,
          customerSplit: 5,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({ id: 'cart-val-1', subtotal: 80, total: 60, items: [] })
      }
      return Promise.resolve(null)
    })

    const handler = validateCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFVAL1', cartID: 'cart-val-1' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toContain('Minimum order value of 100 USD required')
  })

  it('validate referral: passes minOrderAmount when cartSubtotal meets threshold even if cartTotal does not', async () => {
    // cartSubtotal=120, cartTotal=70. minOrderAmount=100.
    const mockReferralCode = {
      id: 'ref-val-2',
      code: 'REFVAL2',
      isActive: true,
      program: 'prog-val-2',
    }
    const mockProgram = {
      id: 'prog-val-2',
      isActive: true,
      minOrderAmount: 100,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 10,
          customerSplit: 5,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({
          id: 'cart-val-2',
          subtotal: 120,
          total: 70,
          items: [{ id: 'i1', price: 120, quantity: 1, product: { id: 'p1' } }],
        })
      }
      return Promise.resolve(null)
    })

    const handler = validateCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFVAL2', cartID: 'cart-val-2' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
  })

  it('validate referral: commission calculation uses cartSubtotal as the base', async () => {
    // cartSubtotal=200, cartTotal=100. 10% on subtotal → 20 total, 50/50 → 10 each.
    const mockReferralCode = {
      id: 'ref-val-3',
      code: 'REFVAL3',
      isActive: true,
      program: 'prog-val-3',
    }
    const mockProgram = {
      id: 'prog-val-3',
      isActive: true,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }

    mockPayload.find.mockResolvedValue({ docs: [mockReferralCode], totalDocs: 1 })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(mockProgram)
      if (args.collection === 'carts') {
        return Promise.resolve({
          id: 'cart-val-3',
          subtotal: 200,
          total: 100,
          items: [{ id: 'i1', price: 200, quantity: 1, product: { id: 'p1' } }],
        })
      }
      return Promise.resolve(null)
    })

    const handler = validateCouponHandler({ pluginConfig: referralPluginConfig })
    const response = await handler({
      payload: mockPayload,
      data: { code: 'REFVAL3', cartID: 'cart-val-3' },
    } as any)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    // 10% of subtotal(200)=20, 50/50 split → each 10
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(10)
  })

  // ---------------------------------------------------------------------------
  // apply+validate consistency: both use cartSubtotal as baseline
  // ---------------------------------------------------------------------------

  it('apply and validate produce identical values when cart has divergent subtotal and total', async () => {
    // This test verifies the critical invariant: apply and validate must agree
    // when both are called with the same cart that has subtotal != total.
    const referralCode = {
      id: 'ref-cons-1',
      code: 'REFCONS1',
      isActive: true,
      program: 'prog-cons-1',
    }
    const program = {
      id: 'prog-cons-1',
      isActive: true,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 60,
          customerSplit: 40,
        },
      ],
    }
    // Simulate a cart where a previous operation reduced total but subtotal remains original
    const cart = {
      id: 'cart-cons-1',
      subtotal: 300,
      total: 240,
      items: [{ id: 'i1', price: 300, quantity: 1, product: { id: 'p1' } }],
    }

    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === 'referral-codes') return Promise.resolve({ docs: [referralCode] })
      return Promise.resolve({ docs: [] })
    })
    mockPayload.findByID.mockImplementation((args: any) => {
      if (args.collection === 'referral-programs') return Promise.resolve(program)
      if (args.collection === 'carts') return Promise.resolve(cart)
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({})

    const applyHandler = applyCouponHandler({ pluginConfig: referralPluginConfig })
    const validateHandler = validateCouponHandler({ pluginConfig: referralPluginConfig })

    const applyResp = await applyHandler({
      payload: mockPayload,
      data: { code: 'REFCONS1', cartID: 'cart-cons-1' },
    } as any)
    const validateResp = await validateHandler({
      payload: mockPayload,
      data: { code: 'REFCONS1', cartID: 'cart-cons-1' },
    } as any)

    const applyJson = await applyResp.json()
    const validateJson = await validateResp.json()

    expect(applyResp.status).toBe(200)
    expect(validateResp.status).toBe(200)

    // Both endpoints must agree on commission values
    expect(applyJson.partnerCommission).toBe(validateJson.partnerCommission)
    expect(applyJson.customerDiscount).toBe(validateJson.customerDiscount)

    // Values should be based on subtotal(300), not total(240)
    // 10% of 300 = 30, split 60/40 → partner=18, customer=12
    expect(applyJson.partnerCommission).toBe(18)
    expect(applyJson.customerDiscount).toBe(12)
  })
})
