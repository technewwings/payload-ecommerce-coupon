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
    expect(names).toContain('commissionRules')
    expect(names).not.toContain('description')
    expect(names).not.toContain('activeFrom')
    expect(names).not.toContain('activeUntil')
    expect(names).not.toContain('minOrderValue')
  })

  it('should auto-calculate customerSplit from partnerSplit', async () => {
    const result = await beforeChangeHook({
      data: {
        name: 'Program',
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
          name: 'Program',
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
          name: 'Program',
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

  it('should allow segments rule with tags', async () => {
    const result = await beforeChangeHook({
      data: {
        name: 'Program',
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
})
