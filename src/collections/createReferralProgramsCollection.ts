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
