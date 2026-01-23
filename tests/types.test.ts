import { describe, it, expect } from 'vitest'
import type { CouponPluginOptions, ApplyCouponResponse } from '../src/types'

describe('Type Definitions', () => {
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

  it('should handle error response', () => {
    const response: ApplyCouponResponse = {
      success: false,
      message: 'Coupon expired',
      error: 'COUPON_EXPIRED',
    }
    expect(response.success).toBe(false)
    expect(response.error).toBeDefined()
  })
})
