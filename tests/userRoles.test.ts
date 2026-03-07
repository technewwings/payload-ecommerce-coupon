import { describe, expect, it } from 'bun:test'
import {
  buildPartnerUserFilterWhere,
  isAdminUser,
  isPartnerUser,
  resolveUserRoles,
  userHasAnyRole,
} from '../src/utilities/userRoles'
import { sanitizePluginConfig } from '../src/utilities/sanitizePluginConfig'

describe('userRoles utilities', () => {
  const defaultRoleConfig = sanitizePluginConfig({ pluginConfig: {} }).roleConfig

  describe('resolveUserRoles', () => {
    it('returns empty array when user is missing', () => {
      const roles = resolveUserRoles({ user: null, roleConfig: defaultRoleConfig })
      expect(roles).toEqual([])
    })

    it('reads roles from string role fields', () => {
      const user = { role: 'Admin' }
      const roles = resolveUserRoles({ user, roleConfig: defaultRoleConfig })
      expect(roles).toEqual(['admin'])
    })

    it('reads and normalizes roles from array field', () => {
      const user = { roles: [' Partner ', 'ADMIN', ''] }
      const roles = resolveUserRoles({ user, roleConfig: defaultRoleConfig })
      expect(roles).toEqual(['partner', 'admin'])
    })

    it('deduplicates roles from multiple paths', () => {
      const user = { role: 'admin', roles: ['Admin', 'partner'] }
      const roles = resolveUserRoles({ user, roleConfig: defaultRoleConfig })
      expect(roles).toEqual(['admin', 'partner'])
    })

    it('supports nested roleFieldPaths', () => {
      const roleConfig = sanitizePluginConfig({
        pluginConfig: {
          roleConfig: {
            roleFieldPaths: ['profile.permissions.roles'],
          },
        },
      }).roleConfig

      const user = {
        profile: {
          permissions: {
            roles: ['partner', 'admin'],
          },
        },
      }

      const roles = resolveUserRoles({ user, roleConfig })
      expect(roles).toEqual(['partner', 'admin'])
    })

    it('uses customRoleResolver when provided', () => {
      const roleConfig = sanitizePluginConfig({
        pluginConfig: {
          roleConfig: {
            customRoleResolver: () => [' PARTNER ', 'Admin'],
          },
        },
      }).roleConfig

      const roles = resolveUserRoles({ user: { ignored: true }, roleConfig })
      expect(roles).toEqual(['partner', 'admin'])
    })

    it('returns empty array when customRoleResolver returns non-array', () => {
      const roleConfig = sanitizePluginConfig({
        pluginConfig: {
          roleConfig: {
            customRoleResolver: (() => 'admin') as any,
          },
        },
      }).roleConfig

      const roles = resolveUserRoles({ user: { role: 'admin' }, roleConfig })
      expect(roles).toEqual([])
    })
  })

  describe('userHasAnyRole / isAdminUser / isPartnerUser', () => {
    it('matches roles case-insensitively', () => {
      const user = { role: 'PaRtNeR' }
      expect(userHasAnyRole({ user, roleConfig: defaultRoleConfig, targetRoles: ['partner'] })).toBe(
        true,
      )
    })

    it('returns false when user has no target roles', () => {
      const user = { roles: ['customer'] }
      expect(userHasAnyRole({ user, roleConfig: defaultRoleConfig, targetRoles: ['partner'] })).toBe(
        false,
      )
    })

    it('detects admin role with default config', () => {
      const user = { role: 'admin' }
      expect(isAdminUser({ user, roleConfig: defaultRoleConfig })).toBe(true)
      expect(isPartnerUser({ user, roleConfig: defaultRoleConfig })).toBe(false)
    })

    it('detects partner role with custom partnerRoleValues', () => {
      const roleConfig = sanitizePluginConfig({
        pluginConfig: {
          roleConfig: {
            partnerRoleValues: ['affiliate', 'partner'],
          },
        },
      }).roleConfig

      const user = { roles: ['affiliate'] }
      expect(isPartnerUser({ user, roleConfig })).toBe(true)
      expect(isAdminUser({ user, roleConfig })).toBe(false)
    })
  })

  describe('buildPartnerUserFilterWhere', () => {
    it('returns true when roleFieldPaths are empty', () => {
      const where = buildPartnerUserFilterWhere({
        roleConfig: {
          ...defaultRoleConfig,
          roleFieldPaths: [],
        },
      })
      expect(where).toBe(true)
    })

    it('returns true when partnerRoleValues are empty', () => {
      const where = buildPartnerUserFilterWhere({
        roleConfig: {
          ...defaultRoleConfig,
          partnerRoleValues: [],
        },
      })
      expect(where).toBe(true)
    })

    it('returns single condition for one roleFieldPath', () => {
      const where = buildPartnerUserFilterWhere({
        roleConfig: {
          ...defaultRoleConfig,
          roleFieldPaths: ['role'],
          partnerRoleValues: ['partner', 'affiliate'],
        },
      })

      expect(where).toEqual({
        role: { in: ['partner', 'affiliate'] },
      })
    })

    it('returns OR conditions for multiple roleFieldPaths', () => {
      const where = buildPartnerUserFilterWhere({
        roleConfig: {
          ...defaultRoleConfig,
          roleFieldPaths: ['role', 'profile.roles'],
          partnerRoleValues: ['partner'],
        },
      })

      expect(where).toEqual({
        or: [{ role: { in: ['partner'] } }, { 'profile.roles': { in: ['partner'] } }],
      })
    })
  })
})
