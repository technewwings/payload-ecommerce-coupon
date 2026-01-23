import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency } = pluginConfig

  return {
    slug: collections.referralProgramsSlug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'referrerReward', 'refereeReward', 'isActive'],
      group: 'Ecommerce',
    },
    access: {
      read: access.canUseReferrals || (() => true),
      create: access.isAdmin || (() => false),
      update: access.isAdmin || (() => false),
      delete: access.isAdmin || (() => false),
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
          description: 'Reward given to the person who refers others',
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
          description: 'Reward given to the person who was referred',
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
          description: 'Commission rules for different products/categories',
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            admin: {
              description: 'Name for this commission rule (e.g., "Electronics", "All Products")',
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
            relationTo: 'categories', // Assuming categories collection exists
            hasMany: true,
            index: false,
            admin: {
              description: 'Select categories this rule applies to',
              condition: (data) => data.appliesTo === 'categories',
            },
          },
          {
            name: 'products',
            type: 'relationship',
            relationTo: 'products', // Assuming products collection exists
            hasMany: true,
            index: false,
            admin: {
              description: 'Select specific products this rule applies to',
              condition: (data) => data.appliesTo === 'products',
            },
          },
          {
            name: 'totalCommission',
            type: 'group',
            admin: {
              description: 'Total commission pool from which partner and customer shares are taken',
            },
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: [
                  { label: 'Percentage of Product Price', value: 'percentage' },
                  { label: 'Fixed Amount per Product', value: 'fixed' },
                ],
                defaultValue: 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                required: true,
                admin: {
                  description:
                    'Commission value. For percentage: 10 = 10% of product price. For fixed: amount per product.',
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
                min: 0,
                max: 100,
                defaultValue: 70,
                admin: {
                  description: 'Percentage of total commission that goes to the partner (0-100)',
                },
              },
              {
                name: 'customerPercentage',
                type: 'number',
                required: true,
                min: 0,
                max: 100,
                defaultValue: 30,
                admin: {
                  description:
                    'Percentage of total commission that goes to the customer as discount (0-100)',
                },
              },
            ],
          },
        ],
      },
      {
        name: 'conditions',
        type: 'group',
        admin: {
          description: 'Conditions for referral program eligibility',
        },
        fields: [
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
              description: 'Maximum number of referrals a user can make. Empty = unlimited.',
            },
          },
          {
            name: 'referralCodePrefix',
            type: 'text',
            admin: {
              description: 'Prefix for generated referral codes (e.g., "REF" will create REF123)',
            },
          },
        ],
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
