import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCouponCode, validateCouponCode } from '../src/client/hooks'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Frontend Hooks', () => {
  it('should handle missing coupon code', async () => {
    const result = await useCouponCode({ code: '' })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should validate coupon code', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            message: 'Valid',
            coupon: { code: 'TEST10', type: 'percentage', value: 10 },
          }),
      } as any),
    )

    const result = await validateCouponCode('TEST10')
    expect(result.success).toBe(true)
    expect(result.coupon?.code).toBe('TEST10')
  })

  it('should handle network errors', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network failed')),
    )

    const result = await useCouponCode({ code: 'TEST10' })
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

    const result = await useCouponCode({ code: 'INVALID' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Coupon not found')
  })
})
