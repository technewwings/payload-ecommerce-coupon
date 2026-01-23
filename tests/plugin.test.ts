import { describe, it, expect } from 'vitest'
import { payloadEcommerceCoupon } from '../src/index'

describe('Coupon Plugin', () => {
  it('should export plugin function', () => {
    expect(typeof payloadEcommerceCoupon).toBe('function')
  })

  it('should return config modifier function', () => {
    const plugin = payloadEcommerceCoupon()
    expect(typeof plugin).toBe('function')
  })

  it('should disable when enabled is false', () => {
    const plugin = payloadEcommerceCoupon({ enabled: false })
    const testConfig = { version: 1 } as any
    const result = plugin(testConfig)
    expect(result).toEqual(testConfig)
  })

  it('should accept valid plugin options', () => {
    const plugin = payloadEcommerceCoupon({
      enabled: true,
      defaultCurrency: 'USD',
      allowStackWithOtherCoupons: false,
      autoIntegrate: true,
    })
    expect(typeof plugin).toBe('function')
  })

  it('should use default options when not provided', () => {
    const plugin = payloadEcommerceCoupon()
    expect(typeof plugin).toBe('function')
  })
})
