import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createReferralCodesCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access } = pluginConfig

  return {
    slug: collections.referralCodesSlug,
    admin: {
      useAsTitle: 'code',
      defaultColumns: ['code', 'referrer', 'program', 'usageCount', 'isActive'],
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
        name: 'code',
        type: 'text',
        required: true,
        unique: true,
        admin: {
          description: 'The referral code that customers will enter',
        },
      },
      {
        name: 'program',
        type: 'relationship',
        relationTo: collections.referralProgramsSlug,
        required: true,
        admin: {
          description: 'The referral program this code belongs to',
        },
      },
      {
        name: 'referrer',
        type: 'relationship',
        relationTo: 'users', // Assuming users collection
        required: true,
        admin: {
          description: 'The user who created this referral code',
        },
      },
      {
        name: 'isActive',
        type: 'checkbox',
        defaultValue: true,
        admin: {
          description: 'Whether this referral code is currently active',
        },
      },
      {
        name: 'usageCount',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'How many times this referral code has been used',
          readOnly: true,
        },
      },
      {
        name: 'usageLimit',
        type: 'number',
        admin: {
          description: 'Maximum times this code can be used. Empty = unlimited.',
        },
      },
      {
        name: 'expiresAt',
        type: 'date',
        admin: {
          description: 'When this referral code expires',
        },
      },
      {
        name: 'successfulReferralsCount',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'Total count of successful referrals using this code',
          readOnly: true,
        },
      },
      {
        name: 'totalRewardsPaid',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'Total rewards paid out for this referral code',
          readOnly: true,
        },
      },
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional metadata for the referral code',
          position: 'sidebar',
        },
      },
    ],
    hooks: {
      beforeChange: [
        ({ operation, data }) => {
          // Auto-generate code if not provided
          if (operation === 'create' && !data.code && data.referrer) {
            const timestamp = Date.now().toString(36)
            const random = Math.random().toString(36).substring(2, 8)
            data.code = `REF-${timestamp}-${random}`.toUpperCase()
          }
          return data
        },
      ],
    },
    timestamps: true,
  }
}
