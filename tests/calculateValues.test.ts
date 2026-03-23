import { describe, expect, it } from 'bun:test'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../src/utilities/calculateValues'
// ---------------------------------------------------------------------------
// calculateCouponDiscount
// ---------------------------------------------------------------------------

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

  // ── Floating-point precision ───────────────────────────────────────────────
  // These tests use values where naive float arithmetic would give wrong results
  // but integer-cent arithmetic gives the exact answer.

  it('[precision] 10% of $19.99 floors to $1.99 (not $2.00)', () => {
    // naive: roundTo2((19.99 * 10) / 100) = roundTo2(1.999) = 2.00  ← wrong
    // cents: floor(1999 * 10 / 100) = 199 cents = $1.99  ← correct
    const coupon = { type: 'percentage', value: 10 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 19.99 })).toBe(1.99)
  })

  it('[precision] 3% of $33.33 floors to $0.99 (not $1.00)', () => {
    // naive: roundTo2((33.33 * 3) / 100) = roundTo2(0.9999) = 1.00  ← wrong
    // cents: floor(3333 * 3 / 100) = floor(99.99) = 99 cents = $0.99  ← correct
    const coupon = { type: 'percentage', value: 3 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 33.33 })).toBe(0.99)
  })

  it('[precision] 7.5% of $200.00 is exactly $15.00', () => {
    const coupon = { type: 'percentage', value: 7.5 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 200 })).toBe(15)
  })

  it('[precision] fixed coupon of $4.99 on $50.00 cart returns exactly $4.99', () => {
    const coupon = { type: 'fixed', value: 4.99 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 50 })).toBe(4.99)
  })

  it('[precision] fixed coupon capped to fractional cart total $3.50 exactly', () => {
    const coupon = { type: 'fixed', value: 5 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 3.5 })).toBe(3.5)
  })

  it('[precision] maxDiscountAmount cap with fractional cap value applies exactly', () => {
    // 50% of $49.99 = $24.995 → cents: floor(4999 * 50 / 100) = 2499 cents = $24.99
    // cap is $20.00 → capped to $20.00
    const coupon = { type: 'percentage', value: 50, maxDiscountAmount: 20 }
    expect(calculateCouponDiscount({ coupon, cartTotal: 49.99 })).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// calculateCommissionAndDiscount
// ---------------------------------------------------------------------------

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

  it('should return zero commission when cart total is below program minOrderAmount (cart-wide)', () => {
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
    expect(result.partnerCommission).toBe(0)
    expect(result.customerDiscount).toBe(0)
  })

  it('should apply fixed commission when program minOrderAmount is met by cart total across lines', () => {
    const cartItems = [
      { id: '1', price: 100, quantity: 1, product: { id: 'p1' } },
      { id: '2', price: 110, quantity: 1, product: { id: 'p2' } },
    ]
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
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 210 })
    expect(result.partnerCommission).toBe(30)
    expect(result.customerDiscount).toBe(20)
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

  // ── Floating-point precision ───────────────────────────────────────────────
  // These tests prove that all arithmetic is done in integer cents (×100 then ÷100).
  // Each case is annotated with what naive float arithmetic would produce incorrectly.

  it('[precision] 10% of $19.99 per item yields $0.99 each (not $1.00)', () => {
    // itemTotalCents = 1999
    // potCents = floor(1999 * 10 / 100) = 199
    // split 50/50: partner = floor(199 * 50 / 100) = 99 cents = $0.99
    //              customer = floor(199 * 50 / 100) = 99 cents = $0.99
    // naive float: (19.99 * 10 / 100) * 0.5 = 0.9995 → roundTo2 = 1.00  ← wrong
    const cartItems = [{ id: '1', price: 19.99, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 19.99 })
    expect(result.partnerCommission).toBe(0.99)
    expect(result.customerDiscount).toBe(0.99)
  })

  it('[precision] 15% of $33.33 split 60/40 gives $2.99 partner / $1.99 customer', () => {
    // itemTotalCents = 3333
    // potCents = floor(3333 * 15 / 100) = floor(499.95) = 499
    // partner = floor(499 * 60 / 100) = floor(299.4) = 299 cents = $2.99
    // customer = floor(499 * 40 / 100) = floor(199.6) = 199 cents = $1.99
    // naive float: (33.33*15/100) = 4.9995 → partner=4.9995*0.6=2.9997→3.00, customer=1.9998→2.00 ← wrong
    const cartItems = [{ id: '1', price: 33.33, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 15 },
          partnerSplit: 60,
          customerSplit: 40,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 33.33 })
    expect(result.partnerCommission).toBe(2.99)
    expect(result.customerDiscount).toBe(1.99)
  })

  it('[precision] direct partnerPercent/customerPercent on $9.99 item is exact', () => {
    // itemTotalCents = 999
    // partner = floor(999 * 10 / 100) = floor(99.9) = 99 cents = $0.99
    // customer = floor(999 * 15 / 100) = floor(149.85) = 149 cents = $1.49
    const cartItems = [{ id: '1', price: 9.99, quantity: 1, product: { id: 'p1' } }]
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
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 9.99 })
    expect(result.partnerCommission).toBe(0.99)
    expect(result.customerDiscount).toBe(1.49)
  })

  it('[precision] fixed per-item amounts of $1.50/$0.75 at qty=3 are exact', () => {
    // partner: toCents(1.50) * 3 = 150 * 3 = 450 cents = $4.50
    // customer: toCents(0.75) * 3 = 75 * 3 = 225 cents = $2.25
    // naive float: 1.5 * 3 = 4.5 (ok here), but 0.75 * 3 = 2.25 (also ok here)
    // The cents path guarantees correctness for values like $0.33 * 3 = $0.99 (not $1.00)
    const cartItems = [{ id: '1', price: 10, quantity: 3, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 1.5,
          customerSplit: 0.75,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(4.5)
    expect(result.customerDiscount).toBe(2.25)
  })

  it('[precision] fixed per-item $0.33 at qty=3 gives $0.99 (not $1.00 via float drift)', () => {
    // toCents(0.33) * 3 = 33 * 3 = 99 cents = $0.99
    // naive float: 0.33 * 3 = 0.9900000000000001 → roundTo2 = 0.99 (borderline, but unreliable)
    const cartItems = [{ id: '1', price: 10, quantity: 3, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 0.33,
          customerSplit: 0.33,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(0.99)
    expect(result.customerDiscount).toBe(0.99)
  })

  it('[precision] per-order caps of $9.99/$4.99 are applied exactly in cents', () => {
    // maxPartnerCommissionPerOrder=$9.99 → 999 cents
    // maxCustomerDiscountPerOrder=$4.99 → 499 cents
    // rule produces partner=14*100=1400 cents, customer=10*100=1000 cents (2 items at $7/$5)
    // both capped: 999 cents = $9.99 and 499 cents = $4.99
    const cartItems = [{ id: '1', price: 100, quantity: 2, product: { id: 'p1' } }]
    const program = {
      maxPartnerCommissionPerOrder: 9.99,
      maxCustomerDiscountPerOrder: 4.99,
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
    expect(result.partnerCommission).toBe(9.99)
    expect(result.customerDiscount).toBe(4.99)
  })

  it('[precision] maxAmount cap of $2.99 on 10% rule caps correctly without overshoot', () => {
    // 10% of $100 = $10.00 → potCents=1000, maxAmountCents=toCents(2.99)=299
    // capped to 299 cents, split 50/50:
    //   partner = floor(299 * 50 / 100) = floor(149.5) = 149 cents = $1.49
    //   customer = floor(299 * 50 / 100) = floor(149.5) = 149 cents = $1.49
    //   total paid out = $2.98 ≤ $2.99 cap ✓
    // naive float: 2.99 * 0.5 = 1.495 → roundTo2 = 1.50 each → sum $3.00 > $2.99 ← wrong
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'percentage', value: 10, maxAmount: 2.99 },
          partnerSplit: 50,
          customerSplit: 50,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 100 })
    expect(result.partnerCommission).toBe(1.49)
    expect(result.customerDiscount).toBe(1.49)
  })

  it('[precision] rule minOrderAmount=$9.99, cartTotal=$9.99 boundary passes (9999 >= 9999)', () => {
    // If comparison were done in floats, 9.99 vs 9.99 is fine, but
    // intermediate float arithmetic could push either side by an epsilon.
    // In cents: 9999 >= 9999 is always exactly true.
    const cartItems = [{ id: '1', price: 9.99, quantity: 1, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 1,
          customerSplit: 1,
          minOrderAmount: 9.99,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 9.99 })
    expect(result.partnerCommission).toBe(1)
    expect(result.customerDiscount).toBe(1)
  })

  it('[precision] program minOrderAmount=$100.00, cartTotal=$100.00 boundary passes exactly', () => {
    const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
    const program = {
      minOrderAmount: 100,
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed' },
          partnerSplit: 5,
          customerSplit: 3,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program, cartTotal: 100 })
    expect(result.partnerCommission).toBe(5)
    expect(result.customerDiscount).toBe(3)
  })

  it('[precision] fixed direct mode maxAmount cap with fractional cap applied in cents', () => {
    // partnerSplit=$3, customerSplit=$3, qty=2
    // uncapped: partner=300*2=600 cents=$6.00, customer=600 cents=$6.00
    // maxAmount=$4.99 → maxAmountCents=499 per unit, maxPotForLine=998 cents
    // totalPot = 600+600=1200 cents > 998 → ratio=998/1200=0.8317
    // partner = floor(600 * 0.8317) = floor(499.0) = 499 cents = $4.99
    // customer = floor(600 * 0.8317) = floor(499.0) = 499 cents = $4.99
    const cartItems = [{ id: '1', price: 50, quantity: 2, product: { id: 'p1' } }]
    const program = {
      commissionRules: [
        {
          appliesTo: 'all',
          totalCommission: { type: 'fixed', maxAmount: 4.99 },
          partnerSplit: 3,
          customerSplit: 3,
        },
      ],
    }
    const result = calculateCommissionAndDiscount({ cartItems, program })
    expect(result.partnerCommission).toBe(4.99)
    expect(result.customerDiscount).toBe(4.99)
  })

  it('stores partner/customer rewards in minor units when cartAmountsInMinorUnits is true', () => {
    const cartItems = [
      { id: '1', price: 10000, quantity: 1, product: { id: 'p1', price: 10000 } },
    ]
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
      currencyCode: 'USD',
      cartTotal: 10000,
      cartAmountsInMinorUnits: true,
    })

    expect(result.partnerCommission).toBe(1000)
    expect(result.customerDiscount).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// getProgramMinimumOrderAmount
// ---------------------------------------------------------------------------

describe('getProgramMinimumOrderAmount', () => {
  it('should return program-level minimum when only fixed commission rules are allowed', () => {
    const min = getProgramMinimumOrderAmount({
      program: {
        minOrderAmount: 500,
        commissionRules: [{ appliesTo: 'all', totalCommission: { type: 'fixed' } }],
      },
      allowedTotalCommissionTypes: ['fixed'],
    })

    expect(min).toBe(500)
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
