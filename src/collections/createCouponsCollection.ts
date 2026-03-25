import { APIError, type CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

export const createCouponsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, integration } = pluginConfig
  const usersSlug = integration.collections.usersSlug

  return {
    slug: collections.couponsSlug,
    admin: {
      useAsTitle: 'code',
      defaultColumns: ['code', 'type', 'value', 'activeFrom', 'activeUntil'],
      group: adminGroups.couponsGroup,
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
        name: 'normalizedCode',
        type: 'text',
        unique: true,
        index: true,
        admin: {
          hidden: true,
          description: 'Uppercased, trimmed code used for fast case-insensitive lookups',
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
          description: `Percentage: use 10 for 10%, or a decimal between 0 and 1 for a fraction of the cart (0.1 = 10%, 0.01 = 1%). Values from 1 upward are percent points (1 = 1%, 100 = 100%). Fixed: amount in ${defaultCurrency} (e.g. 10.99).`,
          step: 0.01,
        },
      },
      {
        name: 'maxDiscountAmount',
        type: 'number',
        admin: {
          description: `Maximum discount in ${defaultCurrency} (major units, e.g. 20.00). Leave empty for no cap.`,
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
          description: `Minimum cart subtotal in ${defaultCurrency} (major units, e.g. 50.00)`,
        },
      },
      {
        name: 'maxOrderValue',
        type: 'number',
        admin: {
          description: `Maximum cart subtotal allowed in ${defaultCurrency} (major units, e.g. 500.00)`,
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
        relationTo: usersSlug,
        admin: {
          readOnly: true,
          position: 'sidebar',
        },
      },
    ],
    hooks: {
      beforeValidate: [
        ({ data }) => {
          if (data && typeof data.code === 'string') {
            data.code = data.code.trim()
            data.normalizedCode = data.code.toUpperCase()
          }
          if (data?.type === 'percentage' && typeof data.value === 'number') {
            if (data.value < 0 || data.value > 100) {
              throw new APIError('Percentage coupon value must be between 0 and 100', 400)
            }
          }
          if (data?.type === 'fixed' && typeof data.value === 'number' && data.value < 0) {
            throw new APIError('Fixed coupon value must be non-negative', 400)
          }
          return data
        },
      ],
      beforeChange: [
        ({ operation, req, data }) => {
          if (data && typeof data.code === 'string') {
            data.code = data.code.trim()
            data.normalizedCode = data.code.toUpperCase()
          }

          if (operation === 'create' && req.user && !data.createdBy) {
            data.createdBy = (req.user as { id?: string | number }).id
          }

          return data
        },
      ],
    },
    timestamps: true,
  }
}
