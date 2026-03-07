import { describe, expect, it } from 'bun:test'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../src/utilities/calculateValues'

describe('calculateCouponDiscount', () => {
  it('should calculate percentage discount correctly', () => {
    const coupon = { type: 'percentage', value: 10 }
    const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
    expect(discount).toBe(10)
  })

  it('should cap percentage discount at maxDiscountAmount', () => {
    const coupon = { type: 'percentage', value: 50, maxDiscountAmount: 20 }
    const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
    expect(discount).toBe(20)
  })

  it('should calculate fixed discount and cap at cart total', () => {
    const coupon = { type: 'fixed', value: 25 }
    const discount = calculateCouponDiscount({ coupon, cartTotal: 20 })
    expect(discount).toBe(20)
  })

  it('should return zero for unsupported coupon type', () => {
    const coupon = { type: 'unknown', value: 50 }
    const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
    expect(discount).toBe(0)
  })
})

describe('calculateCommissionAndDiscount', () => {
  it('should calculate shared commission with partner/customer splits', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 20 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(10)
  })

  it('should support legacy split fields during migration window', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 20 },
          referrerSplit: 50,
          refereeSplit: 50,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(10)
  })

  it('should apply rule-level maxAmount cap per line', () => {
    const cartItems = [{ id: '1', price: 1979, quantity: 4, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 15, maxAmount: 100 },
          partnerSplit: 30,
          customerSplit: 70,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(120)
    expect(result.customerDiscount).toBe(280)
  })

  it('should prioritize product > category > tag > all', () => {
    const cartItems = [
      {
        id: '1',
        price: 100,
        quantity: 1,
        product: { id: 'p1', categories: [{ id: 'c1' }], tags: [{ id: 't1' }] },
      },
    ]

    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 0,
          customerSplit: 100,
        },
        {
          appliesTo: 'segments',
          categories: [{ id: 'c1' }],
          totalCommission: { type: 'percentage', value: 20 },
          partnerSplit: 0,
          customerSplit: 100,
        },
        {
          appliesTo: 'segments',
          tags: [{ id: 't1' }],
          totalCommission: { type: 'percentage', value: 90 },
          partnerSplit: 0,
          customerSplit: 100,
        },
        {
          appliesTo: 'products',
          products: [{ id: 'p1' }],
          totalCommission: { type: 'percentage', value: 15 },
          partnerSplit: 0,
          customerSplit: 100,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    // Product-level should win over category/tag/all.
    expect(result.customerDiscount).toBe(15)
  })

  it('should select highest customer discount within same precedence level', () => {
    const cartItems = [
      {
        id: '1',
        price: 100,
        quantity: 1,
        product: { id: 'p1', categories: [{ id: 'c1' }] },
      },
    ]

    const program = {
      commissionRules: [
        {
          appliesTo: 'segments',
          categories: [{ id: 'c1' }],
          totalCommission: { type: 'percentage', value: 20 },
          partnerSplit: 50,
          customerSplit: 50,
        },
        {
          appliesTo: 'segments',
          categories: [{ id: 'c1' }],
          totalCommission: { type: 'percentage', value: 30 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.customerDiscount).toBe(15)
  })

  it('should tie-break by higher partner commission when customer discount is equal', () => {
    const cartItems = [
      {
        id: '1',
        price: 100,
        quantity: 1,
        product: { id: 'p1', categories: [{ id: 'c1' }] },
      },
    ]

    const program = {
      commissionRules: [
        {
          appliesTo: 'segments',
          categories: [{ id: 'c1' }],
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 50,
          customerSplit: 50,
        },
        {
          appliesTo: 'segments',
          categories: [{ id: 'c1' }],
          totalCommission: { type: 'percentage', value: 20 },
          partnerSplit: 75,
          customerSplit: 25,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    // Both customer=5, second has partner=15 (first partner=5), so second wins.
    expect(result.partnerCommission).toBe(15)
    expect(result.customerDiscount).toBe(5)
  })

  it('should calculate fixed‑amount splits when value is omitted', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 10,
          customerSplit: 5,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(5)
  })

  it('should skip rules when cart total is below rule minOrderAmount', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
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

    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 100 })
    expect(result.partnerCommission).toBe(0)
    expect(result.customerDiscount).toBe(0)
  })

  it('should ignore minOrderAmount restrictions for fixed commission rules', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
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

    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 100 })
    expect(result.partnerCommission).toBe(15)
    expect(result.customerDiscount).toBe(10)
  })

  it('should calculate percentage commissions without totalCommission.value using direct percentages', () => {
    const cartItems = [{ id: '1', price: 200, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage' },
          partnerPercent: 10,
          customerPercent: 15,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 200 })
    expect(result.partnerCommission).toBe(20)
    expect(result.customerDiscount).toBe(30)
  })

  it('should enforce allowedTotalCommissionTypes when calculating rewards', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 20 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({
      cartItems,
      program,
      allowedTotalCommissionTypes: ['fixed'],
    })
    expect(result.partnerCommission).toBe(0)
    expect(result.customerDiscount).toBe(0)
  })

  it('should apply per-order caps independently for partner and customer', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 2, product: { id: 'p1' } }]
    const program = {
      maxPartnerCommissionPerOrder: 10,
      maxCustomerDiscountPerOrder: 8,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 7,
          customerSplit: 5,
        },
      ],
    }

    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(10)
    expect(result.customerDiscount).toBe(8)
  })
})

describe('getProgramMinimumOrderAmount', () => {
  it('should ignore program-level minimum when only fixed commission rules are allowed', () => {
    const min = getProgramMinimumOrderAmount({
      program: {
        minOrderAmount: 500,
        commissionRules: [{ appliesTo: 'all', totalCommission: { type: 'fixed' } }],
      },
      allowedTotalCommissionTypes: ['fixed'],
    })

    expect(min).toBeNull()
  })

  it('should return program-level minimum when percentage rules are available', () => {
    const min = getProgramMinimumOrderAmount({
      program: {
        minOrderAmount: 500,
        commissionRules: [{ appliesTo: 'all', totalCommission: { type: 'percentage' } }],
      },
      allowedTotalCommissionTypes: ['percentage'],
    })

    expect(min).toBe(500)
  })
})
