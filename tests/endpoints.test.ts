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
      const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
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
        where: { code: { equals: 'TEST10' } },
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

      const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
      const req = {
        payload: mockPayload,
        data: { code: 'REF123', cartID: 'cart-123' },
      }

      const response = await handler(req as any)
      const result = await response.json()

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: 'referral-codes',
        limit: 1,
        depth: 1,
        where: { code: { equals: 'REF123' } },
      })
      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    it('should handle referral code not found', async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      })

      const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
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

      const handler = applyCouponHandler({ pluginConfig: referralPluginConfig })
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

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig })
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

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig })
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
