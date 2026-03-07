import { describe, expect, it } from 'bun:test'
import { getCartItemUnitPrice, readMoneyField } from '../src/utilities/pricing'

describe('pricing utility', () => {
  it('reads requested currency first', () => {
    const value = readMoneyField({ priceInUSD: 120, priceInAED: 440, price: 999 }, 'USD', 'AED')
    expect(value).toBe(120)
  })

  it('falls back to default currency when requested missing', () => {
    const value = readMoneyField({ priceInAED: 440, price: 999 }, 'USD', 'AED')
    expect(value).toBe(440)
  })

  it('falls back to base price when currency fields are missing', () => {
    const value = readMoneyField({ price: 75 }, 'USD', 'AED')
    expect(value).toBe(75)
  })

  it('returns undefined when no numeric price exists', () => {
    const value = readMoneyField({}, 'USD', 'AED')
    expect(value).toBeUndefined()
  })

  it('returns 0 when everything is missing in cart unit price helper', () => {
    const value = getCartItemUnitPrice({
      item: {},
      product: {},
      currencyCode: 'USD',
      defaultCurrencyCode: 'AED',
    })
    expect(value).toBe(0)
  })

  it('keeps zero item price and does not treat it as missing', () => {
    const value = getCartItemUnitPrice({
      item: { price: 0 },
      product: { priceInUSD: 20 },
      currencyCode: 'USD',
      defaultCurrencyCode: 'AED',
    })
    expect(value).toBe(0)
  })

  it('uses variant price before product price after item fallback', () => {
    const value = getCartItemUnitPrice({
      item: {},
      variant: { priceInUSD: 35 },
      product: { priceInUSD: 20 },
      currencyCode: 'USD',
      defaultCurrencyCode: 'AED',
    })
    expect(value).toBe(35)
  })
})
