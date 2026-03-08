import { beforeEach, describe, expect, it } from 'bun:test'
import { createReferralProgramsCollection } from '../src/collections/createReferralProgramsCollection'
import { sanitizePluginConfig } from '../src/utilities/sanitizePluginConfig'

describe('Referral Programs Collection v2', () => {
  const pluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enableReferrals: true,
      defaultCurrency: 'USD',
      access: {
        canUseReferrals: () => true,
        isAdmin: () => true,
      },
    },
  })

  const collection = createReferralProgramsCollection(pluginConfig)
  const beforeChangeHook = collection.hooks?.beforeChange?.[0] as any
  const afterReadHook = collection.hooks?.afterRead?.[0] as any

  beforeEach(() => {
    expect(beforeChangeHook).toBeDefined()
    expect(afterReadHook).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // Schema shape
  // ---------------------------------------------------------------------------

  it('should expose expected top-level fields in the schema', () => {
    const names = (collection.fields || []).map((f: any) => f.name)
    expect(names).toContain('name')
    expect(names).toContain('isActive')
    expect(names).toContain('maxPartnerCommissionPerOrder')
    expect(names).toContain('maxCustomerDiscountPerOrder')
    expect(names).toContain('minOrderAmount')
    expect(names).toContain('commissionRules')
    expect(names).not.toContain('description')
    expect(names).not.toContain('activeFrom')
    expect(names).not.toContain('activeUntil')
    expect(names).not.toContain('minOrderValue')
  })

  // ---------------------------------------------------------------------------
  // beforeChange — validation errors
  // ---------------------------------------------------------------------------

  it('should throw when commissionRules array is empty', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          commissionRules: [],
        },
      }),
    ).toThrow('At least one commission rule is required')
  })

  it('should throw when commissionRules is missing', () => {
    expect(() =>
      beforeChangeHook({
        data: {},
      }),
    ).toThrow('At least one commission rule is required')
  })

  it('should reject negative top-level minOrderAmount', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          minOrderAmount: -1,
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'fixed', value: 10 },
              partnerSplit: 50,
              customerSplit: 50,
            },
          ],
        },
      }),
    ).toThrow('Minimum Order Amount must be a non-negative number')
  })

  it('should reject negative top-level maxPartnerCommissionPerOrder', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          maxPartnerCommissionPerOrder: -1,
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'fixed', value: 10 },
              partnerSplit: 50,
              customerSplit: 50,
            },
          ],
        },
      }),
    ).toThrow('Maximum commission per order for partner must be a non-negative number')
  })

  it('should reject negative top-level maxCustomerDiscountPerOrder', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          maxCustomerDiscountPerOrder: -1,
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'fixed', value: 10 },
              partnerSplit: 50,
              customerSplit: 50,
            },
          ],
        },
      }),
    ).toThrow('Maximum discount for customer per order must be a non-negative number')
  })

  it('should require at least one category or tag for segments rules', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          commissionRules: [
            {
              appliesTo: 'segments',
              totalCommission: { type: 'percentage', value: 10 },
              partnerSplit: 30,
            },
          ],
        },
      }),
    ).toThrow('At least one category or tag is required')
  })

  it('should reject invalid partner split bounds', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'percentage', value: 10 },
              partnerSplit: 120,
            },
          ],
        },
      }),
    ).toThrow('Partner Split must be between 0 and 100')
  })

  it('should reject commission types not allowed by config', () => {
    const fixedOnlyPluginConfig = sanitizePluginConfig({
      pluginConfig: {
        enableReferrals: true,
        referralConfig: {
          allowedTotalCommissionTypes: ['fixed'],
        },
      },
    })
    const fixedOnlyCollection = createReferralProgramsCollection(fixedOnlyPluginConfig)
    const fixedOnlyBeforeChangeHook = fixedOnlyCollection.hooks?.beforeChange?.[0] as any

    expect(() =>
      fixedOnlyBeforeChangeHook({
        data: {
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'percentage', value: 10 },
              partnerSplit: 30,
            },
          ],
        },
      }),
    ).toThrow('Total Commission type must be one of fixed')
  })

  it('should reject percentage rules when partnerPercent + customerPercent exceeds 100', () => {
    expect(() =>
      beforeChangeHook({
        data: {
          commissionRules: [
            {
              appliesTo: 'all',
              totalCommission: { type: 'percentage', value: 20 },
              partnerPercent: 60,
              customerPercent: 50,
            },
          ],
        },
      }),
    ).toThrow('Partner percentage + Customer percentage cannot exceed 100')
  })

  // ---------------------------------------------------------------------------
  // beforeChange — x100 scaling of monetary cap fields
  // ---------------------------------------------------------------------------

  it('should store minOrderAmount as x100 (cents) on save', async () => {
    const result = await beforeChangeHook({
      data: {
        minOrderAmount: 120,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed', value: 15 },
            partnerSplit: 50,
            customerSplit: 50,
          },
        ],
      },
    })

    // Admin input: 120 → stored as 12000
    expect(result.minOrderAmount).toBe(12000)
  })

  it('should store maxPartnerCommissionPerOrder and maxCustomerDiscountPerOrder as x100 on save', async () => {
    const result = await beforeChangeHook({
      data: {
        maxPartnerCommissionPerOrder: 40,
        maxCustomerDiscountPerOrder: 25.5,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
            customerSplit: 50,
          },
        ],
      },
    })

    // Admin inputs: 40 → 4000, 25.5 → 2550
    expect(result.maxPartnerCommissionPerOrder).toBe(4000)
    expect(result.maxCustomerDiscountPerOrder).toBe(2550)
  })

  it('should store fractional normal-currency values correctly as x100 integers', async () => {
    const result = await beforeChangeHook({
      data: {
        minOrderAmount: 9.99,
        maxPartnerCommissionPerOrder: 0.5,
        maxCustomerDiscountPerOrder: 1.25,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 30,
            customerSplit: 70,
          },
        ],
      },
    })

    expect(result.minOrderAmount).toBe(999)
    expect(result.maxPartnerCommissionPerOrder).toBe(50)
    expect(result.maxCustomerDiscountPerOrder).toBe(125)
  })

  it('should store null for missing top-level monetary caps and minOrderAmount', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
            customerSplit: 50,
          },
        ],
      },
    })

    expect(result.minOrderAmount).toBeNull()
    expect(result.maxPartnerCommissionPerOrder).toBeNull()
    expect(result.maxCustomerDiscountPerOrder).toBeNull()
  })

  it('should accept zero as a valid minOrderAmount and store it as 0 (x100)', async () => {
    const result = await beforeChangeHook({
      data: {
        minOrderAmount: 0,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 50,
            customerSplit: 50,
          },
        ],
      },
    })

    // 0 * 100 = 0
    expect(result.minOrderAmount).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // beforeChange — commission rule handling
  // ---------------------------------------------------------------------------

  it('should auto-calculate customerSplit from partnerSplit for percentage rules', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 35,
          },
        ],
      },
    })

    expect(result.commissionRules[0].customerSplit).toBe(65)
  })

  it('should allow fixed rules without a commission value and custom splits', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerSplit: 10,
            customerSplit: 5,
          },
        ],
      },
    })

    expect(result.commissionRules[0].partnerSplit).toBe(10)
    expect(result.commissionRules[0].customerSplit).toBe(5)
  })

  it('should allow segments rule with tags', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'segments',
            tags: ['tag-1'],
            totalCommission: { type: 'fixed', value: 12 },
            partnerSplit: 50,
          },
        ],
      },
    })

    expect(result.commissionRules[0].appliesTo).toBe('segments')
    expect(result.commissionRules[0].customerSplit).toBe(50)
  })

  it('should preserve fixed partner/customer per-item amounts without x100 scaling', async () => {
    // partnerAmount / customerAmount are per-item fixed currency values — NOT scaled.
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerAmount: 12.5,
            customerAmount: 4.25,
          },
        ],
      },
    })

    expect(result.commissionRules[0].partnerSplit).toBe(12.5)
    expect(result.commissionRules[0].customerSplit).toBe(4.25)
  })

  it('should NOT apply x100 normalization to fixed per-item amounts (large values stay as-is)', async () => {
    // Large fixed amounts like 1250 are legitimate per-item prices (e.g., $1250 AED).
    // The old legacy normalization would have divided these; new policy keeps them intact.
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed' },
            partnerAmount: 1250,
            customerAmount: 4500,
          },
        ],
      },
    })

    // Stored exactly as provided — no /100 division.
    expect(result.commissionRules[0].partnerSplit).toBe(1250)
    expect(result.commissionRules[0].customerSplit).toBe(4500)
  })

  it('should set splitWarning when percentage split total is greater than 50', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerPercent: 40,
            customerPercent: 20,
          },
        ],
      },
    })

    expect(result.commissionRules[0].partnerPercent).toBe(40)
    expect(result.commissionRules[0].customerPercent).toBe(20)
    expect(result.commissionRules[0].splitWarning).toBe(
      'High total split configured: 60% (partner + customer).',
    )
  })

  it('should not set splitWarning when percentage split total is 50 or less', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerPercent: 30,
            customerPercent: 20,
          },
        ],
      },
    })

    expect(result.commissionRules[0].splitWarning).toBeNull()
  })

  it('should preserve totalCommission.value and maxAmount on save', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 18, maxAmount: 22 },
            partnerPercent: 10,
            customerPercent: 8,
          },
        ],
      },
    })

    expect(result.commissionRules[0].totalCommission.value).toBe(18)
    expect(result.commissionRules[0].totalCommission.maxAmount).toBe(22)
  })

  it('should remap categories appliesTo to segments', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'categories',
            categories: ['cat-1'],
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 50,
          },
        ],
      },
    })

    expect(result.commissionRules[0].appliesTo).toBe('segments')
  })

  // ---------------------------------------------------------------------------
  // afterRead — ÷100 unscaling of monetary cap fields
  // ---------------------------------------------------------------------------

  it('should unscale x100 stored minOrderAmount back to normal currency on read', () => {
    const doc = {
      minOrderAmount: 12000,
      maxPartnerCommissionPerOrder: null,
      maxCustomerDiscountPerOrder: null,
    }
    const result = afterReadHook({ doc })

    // 12000 / 100 = 120
    expect(result.minOrderAmount).toBe(120)
  })

  it('should unscale x100 stored maxPartnerCommissionPerOrder on read', () => {
    const doc = {
      minOrderAmount: null,
      maxPartnerCommissionPerOrder: 4000,
      maxCustomerDiscountPerOrder: null,
    }
    const result = afterReadHook({ doc })

    // 4000 / 100 = 40
    expect(result.maxPartnerCommissionPerOrder).toBe(40)
  })

  it('should unscale x100 stored maxCustomerDiscountPerOrder on read', () => {
    const doc = {
      minOrderAmount: null,
      maxPartnerCommissionPerOrder: null,
      maxCustomerDiscountPerOrder: 2550,
    }
    const result = afterReadHook({ doc })

    // 2550 / 100 = 25.5
    expect(result.maxCustomerDiscountPerOrder).toBe(25.5)
  })

  it('should unscale all three monetary fields in one read', () => {
    const doc = {
      minOrderAmount: 10000,
      maxPartnerCommissionPerOrder: 5000,
      maxCustomerDiscountPerOrder: 3075,
    }
    const result = afterReadHook({ doc })

    expect(result.minOrderAmount).toBe(100)
    expect(result.maxPartnerCommissionPerOrder).toBe(50)
    expect(result.maxCustomerDiscountPerOrder).toBe(30.75)
  })

  it('should keep null values as null on afterRead', () => {
    const doc = {
      minOrderAmount: null,
      maxPartnerCommissionPerOrder: null,
      maxCustomerDiscountPerOrder: null,
    }
    const result = afterReadHook({ doc })

    expect(result.minOrderAmount).toBeNull()
    expect(result.maxPartnerCommissionPerOrder).toBeNull()
    expect(result.maxCustomerDiscountPerOrder).toBeNull()
  })

  it('should unscale zero correctly on afterRead', () => {
    const doc = {
      minOrderAmount: 0,
      maxPartnerCommissionPerOrder: 0,
      maxCustomerDiscountPerOrder: 0,
    }
    const result = afterReadHook({ doc })

    expect(result.minOrderAmount).toBe(0)
    expect(result.maxPartnerCommissionPerOrder).toBe(0)
    expect(result.maxCustomerDiscountPerOrder).toBe(0)
  })

  it('should return doc unchanged if doc is falsy', () => {
    const result = afterReadHook({ doc: null })
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Round-trip: beforeChange (×100) then afterRead (÷100) restores original values
  // ---------------------------------------------------------------------------

  it('should round-trip normal currency values through beforeChange and afterRead', async () => {
    const inputMinOrder = 99.99
    const inputMaxPartner = 50
    const inputMaxCustomer = 25.5

    const saved = await beforeChangeHook({
      data: {
        minOrderAmount: inputMinOrder,
        maxPartnerCommissionPerOrder: inputMaxPartner,
        maxCustomerDiscountPerOrder: inputMaxCustomer,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 40,
            customerSplit: 60,
          },
        ],
      },
    })

    // Simulate reading from DB
    const read = afterReadHook({ doc: saved })

    expect(read.minOrderAmount).toBe(inputMinOrder)
    expect(read.maxPartnerCommissionPerOrder).toBe(inputMaxPartner)
    expect(read.maxCustomerDiscountPerOrder).toBe(inputMaxCustomer)
  })

  it('should round-trip zero through beforeChange and afterRead', async () => {
    const saved = await beforeChangeHook({
      data: {
        minOrderAmount: 0,
        maxPartnerCommissionPerOrder: 0,
        maxCustomerDiscountPerOrder: 0,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 10 },
            partnerSplit: 50,
            customerSplit: 50,
          },
        ],
      },
    })

    const read = afterReadHook({ doc: saved })

    expect(read.minOrderAmount).toBe(0)
    expect(read.maxPartnerCommissionPerOrder).toBe(0)
    expect(read.maxCustomerDiscountPerOrder).toBe(0)
  })
})
