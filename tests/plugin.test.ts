import { describe, it, expect } from 'vitest'
import { payloadEcommerceCoupon } from '../src/index'

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

  it('should add coupon collections when enabled', async () => {
    const plugin = payloadEcommerceCoupon({ enabled: true })
    const testConfig = { collections: [] } as any
    const result = await plugin(testConfig)
    expect(result.collections).toHaveLength(3)
    expect(result.collections?.map((c: any) => c.slug)).toEqual([
      'coupons',
      'referral-programs',
      'referral-codes',
    ])
  })

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
})
