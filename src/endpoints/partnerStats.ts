import type { Endpoint, PayloadHandler } from 'payload'

import type { PartnerDashboardData, PartnerStats, SanitizedCouponPluginOptions } from '../types'
import { isAdminUser, isPartnerUser } from '../utilities/userRoles'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

type RelationValue = string | number | { id?: string | number } | null | undefined

function relationId(value: RelationValue): string | number | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && (typeof value.id === 'string' || typeof value.id === 'number')) {
    return value.id
  }
  return null
}

function readField<T = unknown>(doc: unknown, field: string): T | undefined {
  if (!doc || typeof doc !== 'object') return undefined
  return (doc as Record<string, unknown>)[field] as T | undefined
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStatsStatus(value: unknown): 'pending' | 'paid' | 'cancelled' {
  if (value === 'paid') return 'paid'
  if (value === 'cancelled') return 'cancelled'
  return 'pending'
}

export const partnerStatsHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload, user } = req
    const fields = pluginConfig.integration.fields
    const collections = pluginConfig.integration.collections

    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const typedUser = user as { id?: string | number }
    const userID = pluginConfig.integration.resolvers.getUserID({ req, user })

    if (userID == null) {
      return Response.json(
        { success: false, error: 'Unable to resolve user identity' },
        { status: 403 },
      )
    }

    const isPartner =
      isPartnerUser({ user: typedUser, roleConfig: pluginConfig.roleConfig }) ||
      (await Promise.resolve(pluginConfig.access.isPartner?.({ req } as any)))

    const isAdmin =
      isAdminUser({ user: typedUser, roleConfig: pluginConfig.roleConfig }) ||
      (await Promise.resolve(pluginConfig.access.isAdmin?.({ req } as any)))

    const policyAllowed = await Promise.resolve(
      pluginConfig.policies.canViewPartnerStats({
        req,
        user,
        payload,
        requestedPartnerID: userID,
      }),
    )

    if (!policyAllowed && !isAdmin && !isPartner) {
      return Response.json({ success: false, error: 'Partner access required' }, { status: 403 })
    }

    try {
      const referralCodesQuery = await payload.find({
        collection: pluginConfig.collections.referralCodesSlug,
        where: {
          partner: { equals: userID },
        },
        limit: 100,
      })

      const referralCodes = Array.isArray(referralCodesQuery?.docs) ? referralCodesQuery.docs : []

      let totalEarnings = 0
      let pendingEarnings = 0
      let paidEarnings = 0
      let totalReferrals = 0
      let successfulReferrals = 0

      const referralCodeData = referralCodes.map((code: any) => {
        totalEarnings += asNumber(code?.totalEarnings)
        pendingEarnings += asNumber(code?.pendingEarnings)
        paidEarnings += asNumber(code?.paidEarnings)
        totalReferrals += asNumber(code?.usageCount)
        successfulReferrals += asNumber(code?.successfulReferralsCount)

        return {
          id: String(code?.id ?? ''),
          code: asString(code?.code),
          usageCount: asNumber(code?.usageCount),
          totalEarnings: asNumber(code?.totalEarnings),
          isActive: Boolean(code?.isActive),
        }
      })

      const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0
      const recentReferrals: PartnerStats['recentReferrals'] = []

      try {
        const referralCodeIDs = referralCodes
          .map((c: any) => relationId(c?.id as RelationValue))
          .filter((id): id is string | number => id != null)

        if (referralCodeIDs.length > 0) {
          const ordersQuery = await payload.find({
            collection: collections.ordersSlug,
            where: {
              [fields.orderAppliedReferralCodeField]: {
                in: referralCodeIDs,
              },
            },
            limit: 10,
            sort: `-${fields.orderCreatedAtField}`,
          })

          for (const order of (ordersQuery?.docs || []) as any[]) {
            const orderReferralRelation = readField(order, fields.orderAppliedReferralCodeField)
            const orderReferralID = relationId(orderReferralRelation as RelationValue)

            const matchedCode = referralCodes.find(
              (c: any) => relationId(c?.id as RelationValue) === orderReferralID,
            )

            const paymentStatus = readField(order, fields.orderPaymentStatusField)
            const createdAt = readField(order, fields.orderCreatedAtField)

            recentReferrals.push({
              id: String(order?.id ?? ''),
              code: asString(matchedCode?.code),
              orderValue: asNumber(readField(order, fields.cartTotalField) ?? order?.total),
              commission: asNumber(readField(order, fields.orderPartnerCommissionField)),
              date: asString(createdAt),
              status: toStatsStatus(paymentStatus),
            })
          }
        }
      } catch {
        // Host app may not expose expected order structure.
      }

      const monthlyEarnings: PartnerStats['monthlyEarnings'] = []
      const now = new Date()

      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthName = monthDate.toLocaleString('default', { month: 'short', year: 'numeric' })

        monthlyEarnings.push({
          month: monthName,
          earnings: 0,
          referrals: 0,
        })
      }

      let program: PartnerDashboardData['program'] = null

      if (referralCodes.length > 0) {
        const firstCode = referralCodes[0] as any
        const programID = relationId(firstCode?.program as RelationValue)

        if (programID != null) {
          try {
            const programData = await payload.findByID({
              collection: pluginConfig.collections.referralProgramsSlug,
              id: programID,
            })

            if (programData) {
              const typedProgram = programData as any
              const firstRule = typedProgram?.commissionRules?.[0]

              const partnerSplit =
                asNumber(firstRule?.partnerSplit) ||
                asNumber(firstRule?.referrerSplit) ||
                asNumber(firstRule?.split?.partnerPercentage)

              const customerSplit =
                asNumber(firstRule?.customerSplit) ||
                asNumber(firstRule?.refereeSplit) ||
                asNumber(firstRule?.split?.customerPercentage) ||
                Math.max(0, 100 - partnerSplit)

              program = {
                name: asString(typedProgram?.name),
                commissionRate: partnerSplit,
                customerDiscount: customerSplit,
              }
            }
          } catch {
            // Program lookup failed or removed.
          }
        }
      }

      const stats: PartnerStats = {
        totalEarnings,
        pendingEarnings,
        paidEarnings,
        totalReferrals,
        successfulReferrals,
        conversionRate: Math.round(conversionRate * 100) / 100,
        recentReferrals,
        monthlyEarnings,
      }

      const dashboardData: PartnerDashboardData = {
        stats,
        referralCodes: referralCodeData,
        program,
      }

      return Response.json({
        success: true,
        data: dashboardData,
        currency: pluginConfig.defaultCurrency,
      })
    } catch (error) {
      console.error('Partner stats error:', error)
      return Response.json(
        { success: false, error: 'Failed to fetch partner stats' },
        { status: 500 },
      )
    }
  }

export const partnerStatsEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.partnerStats,
  method: 'get',
  handler: partnerStatsHandler({ pluginConfig }),
})
