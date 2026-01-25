import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, referralConfig } = pluginConfig

  const beforeChange: any = [
    ({ data }: any) => {
      // Validate commission split for referral program
      if (data.referrerReward?.type === 'percentage' && data.refereeReward?.type === 'percentage') {
        const total = (data.referrerReward.value || 0) + (data.refereeReward.value || 0)
        if (total > 100) {
          throw new Error('Total commission split between partner and customer cannot exceed 100%')
        }
      }

      // Validate commission split for commission rules
      if (data.commissionRules && Array.isArray(data.commissionRules)) {
        data.commissionRules.forEach((rule: any, index: number) => {
          if (rule.split) {
            const total = (rule.split.partnerPercentage || 0) + (rule.split.customerPercentage || 0)
            if (total > 100) {
              throw new Error(`Commission split for rule ${index + 1} cannot exceed 100%`)
            }
          }
        })
      }

      return data
    },
  ]

  return {
    slug: collections.referralProgramsSlug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'referrerReward', 'refereeReward', 'isActive'],
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
        name: 'referrerReward',
        type: 'group',
        admin: {
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
              description: `Reward value. For percentage, 10 = 10% of order value. For fixed, amount in ${defaultCurrency}`,
            },
          },
          {
            name: 'maxReward',
            type: 'number',
            admin: {
              description: `Maximum reward amount in ${defaultCurrency}. Leave empty for no cap.`,
            },
          },
        ],
      },
      {
        name: 'refereeReward',
        type: 'group',
        admin: {
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
              description: `Reward value. For percentage, 10 = 10% discount. For fixed, discount amount in ${defaultCurrency}`,
            },
          },
          {
            name: 'maxReward',
            type: 'number',
            admin: {
              description: `Maximum reward amount in ${defaultCurrency}. Leave empty for no cap.`,
            },
          },
        ],
      },
      {
        name: 'commissionRules',
        type: 'array',
        admin: {
          description: 'Define commission rules for different products or categories',
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            admin: {
              description: 'Name of this commission rule',
            },
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
              condition: (data, siblingData) => siblingData?.appliesTo === 'categories',
              description: 'Select categories this rule applies to',
            },
          },
          {
            name: 'products',
            type: 'relationship',
            relationTo: 'products',
            hasMany: true,
            admin: {
              condition: (data, siblingData) => siblingData?.appliesTo === 'products',
              description: 'Select products this rule applies to',
            },
          },
          {
            name: 'totalCommission',
            type: 'group',
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: [
                  { label: 'Percentage', value: 'percentage' },
                  { label: 'Fixed Amount', value: 'fixed' },
                ],
                defaultValue: 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                required: true,
                admin: {
                  description: 'Total commission value to be split between partner and customer',
                },
              },
            ],
          },
          {
            name: 'split',
            type: 'group',
            admin: {
              description: 'How to split the total commission between partner and customer',
            },
            fields: [
              {
                name: 'partnerPercentage',
                type: 'number',
                required: true,
                defaultValue: referralConfig.defaultPartnerSplit,
                min: 0,
                max: 100,
                admin: {
                  description: 'Percentage of commission that goes to the partner',
                },
              },
              {
                name: 'customerPercentage',
                type: 'number',
                required: true,
                defaultValue: referralConfig.defaultCustomerSplit,
                min: 0,
                max: 100,
                admin: {
                  description: 'Percentage of commission that goes to the customer as discount',
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
