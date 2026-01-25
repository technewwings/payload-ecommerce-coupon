import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createCouponsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency } = pluginConfig

  return {
    slug: collections.couponsSlug,
    admin: {
      useAsTitle: 'code',
      defaultColumns: ['code', 'type', 'value', 'activeFrom', 'activeUntil'],
      group: 'Ecommerce',
    },
    access: {
      read: access.canUseCoupons || (() => true),
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
          description: 'The coupon code that customers will enter',
        },
      },
      {
        name: 'description',
        type: 'text',
        admin: {
          description: 'Optional description for admin reference',
        },
      },
      {
        name: 'type',
        type: 'select',
        required: true,
        options: [
          { label: 'Percentage', value: 'percentage' },
          { label: 'Fixed Amount', value: 'fixed' },
        ],
        defaultValue: 'percentage',
        admin: {
          description: 'Whether this is a percentage or fixed amount discount',
        },
      },
      {
        name: 'value',
        type: 'number',
        required: true,
        admin: {
          description: `If percentage, 10 = 10%. If fixed, interpreted in ${defaultCurrency} (smallest currency units)`,
          step: 0.01,
        },
      },
      {
        name: 'maxDiscountAmount',
        type: 'number',
        admin: {
          description: `Maximum discount amount in ${defaultCurrency} (smallest currency unit). Leave empty for no cap.`,
        },
      },
      {
        name: 'usageLimit',
        type: 'number',
        admin: {
          description:
            'Total times this coupon can be used across all customers. Empty = unlimited.',
        },
      },
      {
        name: 'perCustomerLimit',
        type: 'number',
        admin: {
          description: 'Times a single customer can use this coupon. Empty = unlimited.',
        },
      },
      {
        name: 'activeFrom',
        type: 'date',
        admin: {
          description:
            'Coupon becomes active from this date. Leave empty for immediate activation.',
        },
      },
      {
        name: 'activeUntil',
        type: 'date',
        admin: {
          description: 'Coupon expires after this date. Leave empty for no expiration.',
        },
      },
      {
        name: 'minOrderValue',
        type: 'number',
        admin: {
          description: `Minimum order value required in ${defaultCurrency} (smallest currency units)`,
        },
      },
      {
        name: 'maxOrderValue',
        type: 'number',
        admin: {
          description: `Maximum order value allowed in ${defaultCurrency} (smallest currency units)`,
        },
      },
      {
        name: 'usageCount',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'How many times this coupon has been used',
          readOnly: true,
        },
      },
      {
        name: 'createdBy',
        type: 'relationship',
        relationTo: 'users',
        admin: {
          readOnly: true,
          position: 'sidebar',
        },
      },
    ],
    hooks: {
      beforeChange: [
        ({ operation, req, data }) => {
          if (operation === 'create' && req.user) {
            data.createdBy = req.user.id
          }
          return data
        },
      ],
    },
    timestamps: true,
  }
}
