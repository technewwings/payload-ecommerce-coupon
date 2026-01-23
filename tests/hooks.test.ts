import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCouponCode, validateCouponCode } from '../src/client/hooks'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Frontend Hooks', () => {
  describe('useCouponCode', () => {
    it('should handle missing coupon code', async () => {
      const result = await useCouponCode({ code: '' })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle missing cart ID', async () => {
      const result = await useCouponCode({ code: 'TEST10' })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should successfully apply coupon', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Coupon applied successfully',
              discount: 500,
              coupon: { code: 'TEST10', type: 'percentage', value: 10 },
              currency: 'USD',
            }),
        } as any),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(true)
      expect(result.discount).toBe(500)
      expect(result.coupon?.code).toBe('TEST10')
      expect(result.currency).toBeUndefined() // Not returned by hook
    })

    it('should successfully apply referral code', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Referral code applied successfully',
              partnerCommission: 36.75,
              customerDiscount: 15.50,
              referralCode: { code: 'REF-ABC123' },
              currency: 'USD',
            }),
        } as any),
      )

      const result = await useCouponCode({ code: 'REF-ABC123', cartID: 'cart-123' })
      expect(result.success).toBe(true)
      expect(result.discount).toBe(15.50) // customerDiscount becomes discount
      expect(result.partnerCommission).toBe(36.75)
      expect(result.customerDiscount).toBe(15.50)
      expect(result.referralCode?.code).toBe('REF-ABC123')
    })

    it('should handle network errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Network failed')),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network')
    })

    it('should handle API errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: 'Coupon not found',
            }),
        } as any),
      )

      const result = await useCouponCode({ code: 'INVALID', cartID: 'cart-123' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Coupon not found')
    })

    it('should handle malformed API response', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              // Missing required fields
            }),
        } as any),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(true)
      expect(result.discount).toBeUndefined()
    })

    it('should include customer email when provided', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              message: 'Applied',
            }),
        } as any),
      )

      await useCouponCode({
        code: 'TEST10',
        cartID: 'cart-123',
        customerEmail: 'user@example.com'
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/coupons/apply',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'TEST10',
            cartID: 'cart-123',
            customerEmail: 'user@example.com'
          })
        })
      )
    })
  })

  describe('validateCouponCode', () => {
    it('should validate coupon code successfully', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              coupon: { code: 'TEST10', type: 'percentage', value: 10 },
              discount: 500,
              currency: 'USD',
            }),
        } as any),
      )

      const result = await validateCouponCode('TEST10')
      expect(result.success).toBe(true)
      expect(result.coupon?.code).toBe('TEST10')
      expect(result.discount).toBe(500)
    })

    it('should validate referral code successfully', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              referralCode: { code: 'REF-ABC123', description: 'Get discount' },
              partnerCommission: 36.75,
              customerDiscount: 15.50,
              currency: 'USD',
            }),
        } as any),
      )

      const result = await validateCouponCode('REF-ABC123')
      expect(result.success).toBe(true)
      expect(result.referralCode?.code).toBe('REF-ABC123')
      expect(result.discount).toBeUndefined() // Not set for referrals in validate
      expect(result.partnerCommission).toBe(36.75)
      expect(result.customerDiscount).toBe(15.50)
    })

    it('should handle validation errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: 'Invalid code',
            }),
        } as any),
      )

      const result = await validateCouponCode('INVALID')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid code')
    })

    it('should handle network errors during validation', async () => {
      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Network error')),
      )

      const result = await validateCouponCode('TEST10')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network')
    })

    it('should include cart value for validation', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
            }),
        } as any),
      )

      await validateCouponCode('TEST10', 1000)

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/coupons/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'TEST10',
            cartValue: 1000
          })
        })
      )
    })

    it('should include cart ID for referral validation', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
            }),
        } as any),
      )

      await validateCouponCode('REF-ABC123', undefined, 'cart-123')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/coupons/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'REF-ABC123',
            cartID: 'cart-123'
          })
        })
      )
    })
  })

  describe('Error Scenarios', () => {
    it('should handle fetch throwing non-Error objects', async () => {
      global.fetch = vi.fn(() =>
        Promise.reject('String error'),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle invalid JSON response', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        } as any),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle empty response body', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(null),
        } as any),
      )

      const result = await useCouponCode({ code: 'TEST10', cartID: 'cart-123' })
      expect(result.success).toBe(false)
    })
  })
})
