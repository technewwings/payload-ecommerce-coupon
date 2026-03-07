import type { SanitizedCouponPluginOptions } from '../types'
import type { Where } from 'payload'

type RoleConfig = SanitizedCouponPluginOptions['roleConfig']

function readByPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== 'object' || !path) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, input)
}

function toRoleArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim().length > 0) return [value]
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeRoleValue = (value: string): string => value.trim().toLowerCase()

export const resolveUserRoles = ({
  user,
  roleConfig,
}: {
  user: unknown
  roleConfig: RoleConfig
}): string[] => {
  if (!user) return []

  if (typeof roleConfig.customRoleResolver === 'function') {
    const custom = roleConfig.customRoleResolver(user)
    return Array.isArray(custom) ? custom.map(normalizeRoleValue).filter(Boolean) : []
  }

  const roles = roleConfig.roleFieldPaths.flatMap((path) => toRoleArray(readByPath(user, path)))
  return [...new Set(roles.map(normalizeRoleValue).filter(Boolean))]
}

export const userHasAnyRole = ({
  user,
  roleConfig,
  targetRoles,
}: {
  user: unknown
  roleConfig: RoleConfig
  targetRoles: string[]
}): boolean => {
  const userRoles = new Set(resolveUserRoles({ user, roleConfig }))
  for (const target of targetRoles) {
    if (userRoles.has(normalizeRoleValue(target))) return true
  }
  return false
}

export const isPartnerUser = ({
  user,
  roleConfig,
}: {
  user: unknown
  roleConfig: RoleConfig
}): boolean =>
  userHasAnyRole({
    user,
    roleConfig,
    targetRoles: roleConfig.partnerRoleValues,
  })

export const isAdminUser = ({
  user,
  roleConfig,
}: {
  user: unknown
  roleConfig: RoleConfig
}): boolean =>
  userHasAnyRole({
    user,
    roleConfig,
    targetRoles: roleConfig.adminRoleValues,
  })

export const buildPartnerUserFilterWhere = ({
  roleConfig,
}: {
  roleConfig: RoleConfig
}): Where | true => {
  if (!roleConfig.roleFieldPaths.length || !roleConfig.partnerRoleValues.length) return true

  const conditions = roleConfig.roleFieldPaths.map((fieldPath) => ({
    [fieldPath]: { in: roleConfig.partnerRoleValues },
  }))

  if (conditions.length === 1) return conditions[0] as Where
  return { or: conditions } as Where
}
