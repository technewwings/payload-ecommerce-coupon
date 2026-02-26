import type { Endpoint, PayloadHandler } from 'payload'

import type { PartnerDashboardData, PartnerStats, SanitizedCouponPluginOptions } from '../types'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

export const partnerStatsHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload, user } = req

    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const typedUser = user as { id: string; role?: string; roles?: string[] }

    // Check if user is a partner
    const isPartner =
      typedUser.role === 'partner' ||
      (Array.isArray(typedUser.roles) && typedUser.roles.includes('partner'))

    const isAdmin =
      typedUser.role === 'admin' ||
      (Array.isArray(typedUser.roles) && typedUser.roles.includes('admin'))

    if (!isPartner && !isAdmin) {
      return Response.json({ success: false, error: 'Partner access required' }, { status: 403 })
    }

    try {
      // Get partner's referral codes
      const referralCodesQuery = await payload.find({
        collection: pluginConfig.collections.referralCodesSlug,
        where: {
          partner: { equals: typedUser.id },
        },
        limit: 100,
      })

      const referralCodes = referralCodesQuery.docs

      // Calculate stats
      let totalEarnings = 0
      let pendingEarnings = 0
      let paidEarnings = 0
      let totalReferrals = 0
      let successfulReferrals = 0

      const referralCodeData = referralCodes.map((code: any) => {
        totalEarnings += code.totalEarnings || 0
        pendingEarnings += code.pendingEarnings || 0
        paidEarnings += code.paidEarnings || 0
        totalReferrals += code.usageCount || 0
        successfulReferrals += code.successfulReferralsCount || 0

        return {
          id: code.id,
          code: code.code,
          usageCount: code.usageCount || 0,
          totalEarnings: code.totalEarnings || 0,
          isActive: code.isActive,
        }
      })

      // Calculate conversion rate
      const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0

      // Get recent referrals (from orders with this partner's referral codes)
      const recentReferrals: PartnerStats['recentReferrals'] = []

      // Try to get orders with applied referral codes
      try {
        const ordersQuery = await payload.find({
          collection: 'orders',
          where: {
            appliedReferralCode: {
              in: referralCodes.map((c: any) => c.id),
            },
          },
          limit: 10,
          sort: '-createdAt',
        })

        for (const order of ordersQuery.docs as any[]) {
          recentReferrals.push({
            id: order.id,
            code: referralCodes.find((c: any) => c.id === order.appliedReferralCode)?.code || '',
            orderValue: order.total || 0,
            commission: order.partnerCommission || 0,
            date: order.createdAt,
            status: order.paymentStatus === 'paid' ? 'paid' : 'pending',
          })
        }
      } catch {
        // Orders collection might not exist or have different structure
      }

      // Calculate monthly earnings (last 6 months)
      const monthlyEarnings: PartnerStats['monthlyEarnings'] = []
      const now = new Date()

      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthName = monthDate.toLocaleString('default', { month: 'short', year: 'numeric' })

        // This would need actual order data to calculate properly
        // For now, we'll provide placeholder structure
        monthlyEarnings.push({
          month: monthName,
          earnings: 0,
          referrals: 0,
        })
      }

      // Get the partner's active program
      let program: PartnerDashboardData['program'] = null

      if (referralCodes.length > 0) {
        const firstCode = referralCodes[0] as any
        if (firstCode.program) {
          try {
            const programData = await payload.findByID({
              collection: pluginConfig.collections.referralProgramsSlug,
              id: typeof firstCode.program === 'string' ? firstCode.program : firstCode.program.id,
            })

            if (programData) {
              const typedProgram = programData as any
              const firstRule = typedProgram.commissionRules?.[0]
              const partnerSplit =
                firstRule?.partnerSplit ??
                firstRule?.referrerSplit ??
                firstRule?.split?.partnerPercentage ??
                0
              const customerSplit =
                firstRule?.customerSplit ??
                firstRule?.refereeSplit ??
                firstRule?.split?.customerPercentage ??
                100 - partnerSplit
              program = {
                name: typedProgram.name,
                commissionRate: partnerSplit,
                customerDiscount: customerSplit,
              }
            }
          } catch {
            // Program might not exist
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
