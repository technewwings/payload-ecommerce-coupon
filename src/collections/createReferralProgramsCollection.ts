import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, referralConfig } = pluginConfig

  const beforeChange: NonNullable<CollectionConfig['hooks']>['beforeChange'] = [
    ({ data }: { data: Record<string, unknown> }) => {
      // Commission rules are required; each rule must have referrerReward and refereeReward
      if (
        !data.commissionRules ||
        !Array.isArray(data.commissionRules) ||
        data.commissionRules.length === 0
      ) {
        throw new Error('At least one commission rule is required')
      }
      data.commissionRules.forEach((rule: Record<string, unknown>, index: number) => {
        const r = rule as {
          basis?: 'direct' | 'shared'
          referrerReward?: { type?: string; value?: number }
          refereeReward?: { type?: string; value?: number }
          totalCommission?: { type?: string; value?: number }
          referrerSplit?: number
          refereeSplit?: number
        }

        // Shared Basis Validation
        if (r.basis === 'shared') {
          if (!r.totalCommission || r.totalCommission.value == null) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission is required for Shared Basis`,
            )
          }
          if (r.referrerSplit == null) {
            throw new Error(
              `Commission rule ${index + 1}: Referrer Split is required for Shared Basis`,
            )
          }
          if (r.refereeSplit == null) {
            throw new Error(
              `Commission rule ${index + 1}: Referee Split is required for Shared Basis`,
            )
          }
          if ((r.referrerSplit || 0) + (r.refereeSplit || 0) > 100) {
            throw new Error(
              `Commission rule ${index + 1}: Referrer + Referee split cannot exceed 100%`,
            )
          }
        }
        // Direct Basis Validation (Legacy)
        else {
          if (!r.referrerReward || r.referrerReward.value == null) {
            throw new Error(`Commission rule ${index + 1}: Referrer Reward is required`)
          }
          if (!r.refereeReward || r.refereeReward.value == null) {
            throw new Error(`Commission rule ${index + 1}: Referee Reward is required`)
          }
          if (r.referrerReward?.type === 'percentage' && r.refereeReward?.type === 'percentage') {
            const total = (r.referrerReward.value || 0) + (r.refereeReward.value || 0)
            if (total > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Referrer + Referee percentage cannot exceed 100%`,
              )
            }
          }
        }
      })
      return data
    },
  ]

  return {
    slug: collections.referralProgramsSlug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'commissionRules', 'isActive'],
      group: adminGroups.referralsGroup,
    },
    access: {
      read: access.canUseReferrals || (() => true),
      create: access.isAdmin || (() => false),
      update: access.isAdmin || (() => false),
      delete: access.isAdmin || (() => false),
    },
    hooks: {
      beforeChange,
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        admin: {
          description: 'Name of the referral program for admin reference',
        },
      },
      {
        name: 'description',
        type: 'textarea',
        admin: {
          description: 'Description of the referral program',
        },
      },
      {
        name: 'isActive',
        type: 'checkbox',
        defaultValue: true,
        admin: {
          description: 'Whether this referral program is currently active',
        },
      },
      {
        name: 'commissionRules',
        type: 'array',
        required: true,
        minRows: 1,
        admin: {
          description:
            'Commission rules: each rule defines who it applies to and Referrer Reward + Referee Reward inside the rule.',
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            admin: { description: 'Name of this rule' },
          },
          {
            name: 'appliesTo',
            type: 'select',
            required: true,
            options: [
              { label: 'All Products', value: 'all' },
              { label: 'Specific Categories', value: 'categories' },
              { label: 'Specific Products', value: 'products' },
            ],
            defaultValue: 'all',
          },
          {
            name: 'categories',
            type: 'relationship',
            relationTo: 'categories',
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === 'categories',
              description: 'Categories this rule applies to',
            },
          },
          {
            name: 'products',
            type: 'relationship',
            relationTo: 'products',
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === 'products',
              description: 'Products this rule applies to',
            },
          },
          {
            name: 'basis',
            type: 'select',
            required: true,
            defaultValue: 'direct',
            options: [
              { label: 'Direct Values', value: 'direct' },
              { label: 'Shared Commission', value: 'shared' },
            ],
            admin: {
              description:
                'Direct: Set specific reward/discount for each. Shared: Set a total commission and split it.',
            },
          },
          {
            name: 'totalCommission',
            type: 'group',
            admin: {
              condition: (_: unknown, siblingData: { basis?: string }) =>
                siblingData?.basis === 'shared',
              description: 'Total commission available to be split between partner and customer',
            },
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: [
                  { label: 'Fixed Amount', value: 'fixed' },
                  { label: 'Percentage of Order', value: 'percentage' },
                ],
                defaultValue: 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                required: true,
                admin: {
                  description: `Total commission value`,
                },
              },
              {
                name: 'maxAmount',
                type: 'number',
                admin: {
                  description: `Max commission cap per item in ${defaultCurrency}`,
                },
              },
            ],
          },
          {
            name: 'referrerSplit',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { basis?: string }) =>
                siblingData?.basis === 'shared',
              description: 'Percentage of total commission given to the Partner (0-100)',
            },
          },
          {
            name: 'refereeSplit',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { basis?: string }) =>
                siblingData?.basis === 'shared',
              description: 'Percentage of total commission given as Discount to Customer (0-100)',
            },
          },
          {
            name: 'referrerReward',
            type: 'group',
            admin: {
              condition: (_: unknown, siblingData: { basis?: string }) =>
                siblingData?.basis !== 'shared',
              description: 'Reward given to the partner who refers others',
            },
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: [
                  { label: 'Fixed Amount', value: 'fixed' },
                  { label: 'Percentage of Order', value: 'percentage' },
                ],
                defaultValue: 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                required: true,
                defaultValue: referralConfig.defaultPartnerSplit,
                admin: {
                  description: `For percentage: 10 = 10% of order value. For fixed: amount in ${defaultCurrency}`,
                },
              },
              {
                name: 'maxReward',
                type: 'number',
                admin: {
                  description: `Max reward in ${defaultCurrency}. Leave empty for no cap.`,
                },
              },
            ],
          },
          {
            name: 'refereeReward',
            type: 'group',
            admin: {
              condition: (_: unknown, siblingData: { basis?: string }) =>
                siblingData?.basis !== 'shared',
              description: 'Discount given to the customer who was referred',
            },
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: [
                  { label: 'Fixed Amount', value: 'fixed' },
                  { label: 'Percentage Discount', value: 'percentage' },
                ],
                defaultValue: 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                required: true,
                defaultValue: referralConfig.defaultCustomerSplit,
                admin: {
                  description: `For percentage: 10 = 10% discount. For fixed: amount in ${defaultCurrency}`,
                },
              },
              {
                name: 'maxReward',
                type: 'number',
                admin: {
                  description: `Max discount in ${defaultCurrency}. Leave empty for no cap.`,
                },
              },
            ],
          },
        ],
      },
      {
        name: 'minOrderValue',
        type: 'number',
        admin: {
          description: `Minimum order value required for referral in ${defaultCurrency}`,
        },
      },
      {
        name: 'maxReferralsPerUser',
        type: 'number',
        admin: {
          description: 'Maximum number of referrals a partner can make. Empty = unlimited.',
        },
      },
      {
        name: 'referralCodePrefix',
        type: 'text',
        admin: {
          description: 'Prefix for generated referral codes (e.g., "REF" will create REF123)',
        },
      },
      {
        name: 'activeFrom',
        type: 'date',
        admin: {
          description: 'Program becomes active from this date',
        },
      },
      {
        name: 'activeUntil',
        type: 'date',
        admin: {
          description: 'Program expires after this date',
        },
      },
      {
        name: 'totalReferrals',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'Total number of successful referrals through this program',
          readOnly: true,
        },
      },
      {
        name: 'totalRewardsPaid',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: `Total rewards paid out in ${defaultCurrency}`,
          readOnly: true,
        },
      },
    ],
    timestamps: true,
  }
}
