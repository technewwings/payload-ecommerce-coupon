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

  it('should remove old top-level fields from admin schema', () => {
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
    // existing behaviour: value present still triggers auto-calculation
    expect(result.commissionRules[0].customerSplit).toBe(50)
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

  it('should preserve top-level minOrderAmount when provided', async () => {
    const result = await beforeChangeHook({
      data: {
        minOrderAmount: 120,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'fixed', value: 15 },
            partnerSplit: 50,
          },
        ],
      },
    })

    expect(result.minOrderAmount).toBe(120)
    expect(result.commissionRules[0].minOrderAmount).toBeUndefined()
  })

  it('should preserve per-order max caps as entered values', async () => {
    const result = await beforeChangeHook({
      data: {
        maxPartnerCommissionPerOrder: 40,
        maxCustomerDiscountPerOrder: 25.5,
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
          },
        ],
      },
    })

    expect(result.maxPartnerCommissionPerOrder).toBe(40)
    expect(result.maxCustomerDiscountPerOrder).toBe(25.5)
  })

  it('should normalize legacy x100 top-level caps and min order amount to normal currency values', async () => {
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
          },
        ],
      },
    })

    expect(result.maxPartnerCommissionPerOrder).toBe(25)
    expect(result.maxCustomerDiscountPerOrder).toBe(12)
    expect(result.minOrderAmount).toBe(150)
  })

  it('should preserve fixed partner/customer amounts without cent conversion', async () => {
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

  it('should normalize legacy x100 fixed partner/customer amounts to normal currency values', async () => {
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

    expect(result.commissionRules[0].partnerSplit).toBe(12.5)
    expect(result.commissionRules[0].customerSplit).toBe(45)
  })

  it('should normalize missing top-level minOrderAmount and per-order max caps to null', async () => {
    const result = await beforeChangeHook({
      data: {
        commissionRules: [
          {
            appliesTo: 'all',
            totalCommission: { type: 'percentage', value: 20 },
            partnerSplit: 50,
          },
        ],
      },
    })

    expect(result.minOrderAmount).toBeNull()
    expect(result.maxPartnerCommissionPerOrder).toBeNull()
    expect(result.maxCustomerDiscountPerOrder).toBeNull()
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
})
