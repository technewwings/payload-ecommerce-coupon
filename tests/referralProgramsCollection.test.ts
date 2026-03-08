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

  beforeEach(() => {
    expect(beforeChangeHook).toBeDefined()
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

  it('should not register an afterRead hook (no DB-level scaling needed)', () => {
    // These fields are stored as normal currency; the calc layer handles
    // toCents() internally. No afterRead transformation is required.
    expect(collection.hooks?.afterRead).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // beforeChange — validation errors
  // ---------------------------------------------------------------------------

  it('should throw when commissionRules array is empty', () => {
    expect(() =>
      beforeChangeHook({
        data: { commissionRules: [] },
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
  // beforeChange — monetary cap fields stored as normal currency (pass-through)
  //
  // Policy: admin inputs normal currency (e.g. 100 = $100.00).
  // beforeChange validates and stores the value as-is.
  // The calculation layer (calculateValues.ts) converts to integer cents
  // internally via toCents() before any arithmetic.
  // ---------------------------------------------------------------------------

  it('should store minOrderAmount as normal currency (not scaled)', async () => {
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

    // Stored as-is: 120 means $120.00
    expect(result.minOrderAmount).toBe(120)
  })

  it('should store maxPartnerCommissionPerOrder as normal currency (not scaled)', async () => {
    const result = await beforeChangeHook({
      data: {
        maxPartnerCommissionPerOrder: 40,
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

    // Stored as-is: 40 means $40.00
    expect(result.maxPartnerCommissionPerOrder).toBe(40)
  })

  it('should store maxCustomerDiscountPerOrder as normal currency (not scaled)', async () => {
    const result = await beforeChangeHook({
      data: {
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

    // Stored as-is: 25.5 means $25.50
    expect(result.maxCustomerDiscountPerOrder).toBe(25.5)
  })

  it('should store all three monetary fields as normal currency in one save', async () => {
    const result = await beforeChangeHook({
      data: {
        minOrderAmount: 99.99,
        maxPartnerCommissionPerOrder: 50,
        maxCustomerDiscountPerOrder: 25.5,
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

    expect(result.minOrderAmount).toBe(99.99)
    expect(result.maxPartnerCommissionPerOrder).toBe(50)
    expect(result.maxCustomerDiscountPerOrder).toBe(25.5)
  })

  it('should store fractional monetary values exactly as provided', async () => {
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

    expect(result.minOrderAmount).toBe(9.99)
    expect(result.maxPartnerCommissionPerOrder).toBe(0.5)
    expect(result.maxCustomerDiscountPerOrder).toBe(1.25)
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

  it('should accept zero as a valid minOrderAmount and store it as 0', async () => {
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

    expect(result.minOrderAmount).toBe(0)
  })

  it('should accept zero for maxPartnerCommissionPerOrder and maxCustomerDiscountPerOrder', async () => {
    const result = await beforeChangeHook({
      data: {
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

    expect(result.maxPartnerCommissionPerOrder).toBe(0)
    expect(result.maxCustomerDiscountPerOrder).toBe(0)
  })

  it('should store large normal-currency values as-is (no division applied)', async () => {
    // e.g. a high-value market where $2500 is a normal cap amount — must not be divided
    const result = await beforeChangeHook({
      data: {
        maxPartnerCommissionPerOrder: 2500,
        maxCustomerDiscountPerOrder: 1200,
        minOrderAmount: 15000,
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

    // Stored exactly as provided — NOT divided by 100
    expect(result.maxPartnerCommissionPerOrder).toBe(2500)
    expect(result.maxCustomerDiscountPerOrder).toBe(1200)
    expect(result.minOrderAmount).toBe(15000)
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

  it('should preserve fixed partner/customer per-item amounts without scaling', async () => {
    // partnerAmount / customerAmount are per-item fixed currency values stored as-is.
    // The calc layer does toCents() on them before arithmetic.
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

  it('should store large fixed per-item amounts as-is', async () => {
    // e.g. $1250 per-item commission in a high-value market — stored exactly
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
})
