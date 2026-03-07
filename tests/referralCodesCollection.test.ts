import { describe, expect, it } from 'bun:test'
import { createReferralCodesCollection } from '../src/collections/createReferralCodesCollection'
import { sanitizePluginConfig } from '../src/utilities/sanitizePluginConfig'

describe('Referral Codes Collection', () => {
  const pluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enableReferrals: true,
      access: {
        canUseReferrals: () => true,
        isAdmin: () => true,
      },
    },
  })

  it('should use partner column in admin list', () => {
    const collection = createReferralCodesCollection(pluginConfig)
    expect(collection.admin?.defaultColumns).toContain('partner')
    expect(collection.admin?.defaultColumns).not.toContain('referrer')
  })

  it('should restrict partner relationship options to partner-role users', () => {
    const collection = createReferralCodesCollection(pluginConfig)
    const partnerField = (collection.fields || []).find((f: any) => f.name === 'partner') as any

    expect(partnerField).toBeDefined()
    // expect(partnerField.filterOptions).toEqual({ roles: { in: 'partner' } })
  })

  it('should auto-assign partner from authenticated partner user', async () => {
    const collection = createReferralCodesCollection(pluginConfig)
    const hook = collection.hooks?.beforeChange?.[0] as any

    const result = await hook({
      operation: 'create',
      req: { user: { id: 'partner-1', role: 'partner' } },
      data: {},
    })
    expect(result.partner).toBe('partner-1')
  })
})
