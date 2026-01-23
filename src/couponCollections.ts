import type { CollectionConfig, Field } from 'payload'

export type BuildCollectionsArgs = {
  couponsSlug: string
  referralProgramsSlug: string
  referralCodesSlug: string
  defaultCurrency?: string
}

export const buildCouponCollections = ({
  couponsSlug,
  referralCodesSlug,
  referralProgramsSlug,
  defaultCurrency = 'USD',
}: BuildCollectionsArgs): {
  couponsCollection: CollectionConfig
  referralProgramsCollection: CollectionConfig
  referralCodesCollection: CollectionConfig
} => {
  const couponsCollection: CollectionConfig = {
    slug: couponsSlug,
    admin: {
      useAsTitle: 'code',
      defaultColumns: ['code', 'type', 'value', 'activeFrom', 'activeUntil'],
    },
    access: {
      read: () => true,
      create: ({ req }) => Boolean(req.user),
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    fields: [
      {
        name: 'code',
        type: 'text',
        required: true,
        unique: true,
      },
      {
        name: 'description',
        type: 'text',
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
      },
      {
        name: 'value',
        type: 'number',
        required: true,
        admin: {
          description:
            'If percentage, 10 = 10%. If fixed, interpreted in smallest currency units unless overridden.',
        },
      },
      {
        name: 'maxDiscountAmount',
        type: 'number',
        admin: {
          description: 'Maximum discount amount in smallest currency unit. Leave empty for no cap.',
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
      },
      {
        name: 'activeUntil',
        type: 'date',
      },
      {
        name: 'conditions',
        type: 'group',
        fields: [
          {
            name: 'minOrderValue',
            type: 'number',
          },
          {
            name: 'appliesTo',
            type: 'select',
            options: [
              { label: 'Entire Order', value: 'order' },
              { label: 'Specific Products', value: 'products' },
              { label: 'Product Categories', value: 'categories' },
            ],
            defaultValue: 'order',
          },
          {
            name: 'productIDs',
            type: 'relationship',
            relationTo: 'products',
            hasMany: true,
            admin: {
              condition: (data) => data?.conditions?.appliesTo === 'products',
            },
          },
          {
            name: 'categoryIDs',
            type: 'relationship',
            relationTo: 'categories',
            hasMany: true,
            admin: {
              condition: (data) => data?.conditions?.appliesTo === 'categories',
            },
          },
        ],
      },
      {
        name: 'isActive',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  }

  const referralProgramsCollection: CollectionConfig = {
    slug: referralProgramsSlug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'appliesTo', 'totalValueType', 'totalValue'],
    },
    access: {
      read: ({ req }) => Boolean(req.user),
      create: ({ req }) => Boolean(req.user),
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
      },
      {
        name: 'description',
        type: 'text',
      },
      {
        name: 'totalValueType',
        type: 'select',
        required: true,
        options: [
          { label: 'Percentage', value: 'percentage' },
          { label: 'Fixed Amount', value: 'fixed' },
        ],
        defaultValue: 'percentage',
      },
      {
        name: 'totalValue',
        type: 'number',
        required: true,
        admin: {
          description:
            'Total value that will be split between partner commission and customer coupon.',
        },
      },
      {
        name: 'split',
        type: 'group',
        fields: [
          {
            name: 'partnerShare',
            type: 'number',
            required: true,
            defaultValue: 50,
            admin: {
              description: 'Percentage of totalValue that goes to the partner.',
            },
          },
          {
            name: 'customerShare',
            type: 'number',
            required: true,
            defaultValue: 50,
            admin: {
              description: 'Percentage of totalValue that is used as customer coupon.',
            },
          },
        ],
      },
      {
        name: 'appliesTo',
        type: 'select',
        options: [
          { label: 'Entire Order', value: 'order' },
          { label: 'Specific Products', value: 'products' },
          { label: 'Referral Product Category', value: 'referral-category' },
        ],
        defaultValue: 'order',
      },
      {
        name: 'referralProductCategory',
        type: 'relationship',
        relationTo: 'categories',
        hasMany: true,
        admin: {
          condition: (data) => data?.appliesTo === 'referral-category',
        },
      },
      {
        name: 'isActive',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  }

  const referralCodesCollection: CollectionConfig = {
    slug: referralCodesSlug,
    admin: {
      useAsTitle: 'code',
      defaultColumns: ['code', 'program', 'usageCount', 'isActive'],
    },
    access: {
      read: ({ req }) => Boolean(req.user),
      create: ({ req }) => Boolean(req.user),
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    fields: [
      {
        name: 'code',
        type: 'text',
        required: true,
        unique: true,
      },
      {
        name: 'program',
        type: 'relationship',
        relationTo: referralProgramsSlug,
        required: true,
      },
      {
        name: 'partner',
        type: 'relationship',
        relationTo: 'users',
        admin: {
          description: 'Referral partner associated with this code.',
        },
      },
      {
        name: 'usageCount',
        type: 'number',
        defaultValue: 0,
      },
      {
        name: 'maxUsages',
        type: 'number',
      },
      {
        name: 'isActive',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  }

  return {
    couponsCollection,
    referralProgramsCollection,
    referralCodesCollection,
  }
}
