import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

type RuleData = {
  appliesTo?: 'all' | 'products' | 'segments' | 'categories'
  products?: unknown[]
  categories?: unknown[]
  tags?: unknown[]
  totalCommission?: { type?: 'fixed' | 'percentage'; value?: number; maxAmount?: number }
  partnerSplit?: number
  customerSplit?: number
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const deriveCustomerSplit = (partnerSplit: unknown): number => {
  const partner = toNumber(partnerSplit)
  if (partner == null) return 0
  if (partner < 0) return 100
  if (partner > 100) return 0
  return 100 - partner
}

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, referralConfig } = pluginConfig

  const beforeChange: NonNullable<CollectionConfig['hooks']>['beforeChange'] = [
    ({ data }: { data: Record<string, unknown> }) => {
      if (
        !data.commissionRules ||
        !Array.isArray(data.commissionRules) ||
        data.commissionRules.length === 0
      ) {
        throw new Error('At least one commission rule is required')
      }

      data.commissionRules = data.commissionRules.map(
        (rule: Record<string, unknown>, index: number) => {
          const r = rule as RuleData

          if (!r.totalCommission) {
            throw new Error(`Commission rule ${index + 1}: Total Commission is required`)
          }

          if (
            !r.totalCommission.type ||
            !['fixed', 'percentage'].includes(r.totalCommission.type)
          ) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission type must be fixed or percentage`,
            )
          }

          const totalValue = toNumber(r.totalCommission.value)
          if (totalValue == null || totalValue < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission value must be a non-negative number`,
            )
          }
          if (r.totalCommission.type === 'percentage' && totalValue > 100) {
            throw new Error(
              `Commission rule ${index + 1}: Percentage Total Commission cannot exceed 100`,
            )
          }

          const maxAmount = toNumber(r.totalCommission.maxAmount)
          if (maxAmount != null && maxAmount < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Max Amount must be a non-negative number`,
            )
          }

          const appliesTo = r.appliesTo ?? 'all'
          if (appliesTo === 'products' && (!r.products || r.products.length === 0)) {
            throw new Error(`Commission rule ${index + 1}: At least one product is required`)
          }

          if (
            (appliesTo === 'segments' || appliesTo === 'categories') &&
            (!r.categories || r.categories.length === 0) &&
            (!r.tags || r.tags.length === 0)
          ) {
            throw new Error(
              `Commission rule ${index + 1}: At least one category or tag is required`,
            )
          }

          const partnerSplit = toNumber(r.partnerSplit)
          if (partnerSplit == null || partnerSplit < 0 || partnerSplit > 100) {
            throw new Error(`Commission rule ${index + 1}: Partner Split must be between 0 and 100`)
          }

          const customerSplit = 100 - partnerSplit

          return {
            ...rule,
            appliesTo: appliesTo === 'categories' ? 'segments' : appliesTo,
            totalCommission: {
              type: r.totalCommission.type,
              value: totalValue,
              maxAmount: maxAmount ?? null,
            },
            partnerSplit,
            customerSplit,
          }
        },
      )

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
          description: 'Rules for referral commission and customer discount distribution.',
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: false,
            admin: { description: 'Optional rule label for admin clarity' },
          },
          {
            name: 'appliesTo',
            type: 'select',
            required: true,
            options: [
              { label: 'All Products', value: 'all' },
              { label: 'Specific Products', value: 'products' },
              { label: 'Categories and Tags', value: 'segments' },
            ],
            defaultValue: 'all',
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
            name: 'categories',
            type: 'relationship',
            relationTo: 'categories',
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === 'segments',
              description: 'Any matching category can activate this rule',
            },
          },
          {
            name: 'tags',
            type: 'relationship',
            relationTo: 'tags',
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === 'segments',
              description: 'Any matching tag can activate this rule',
            },
          },
          {
            name: 'totalCommission',
            type: 'group',
            admin: {
              description: 'Total commission pool to split between partner and customer',
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
                min: 0,
                admin: {
                  description: `Total commission value`,
                },
              },
              {
                name: 'maxAmount',
                type: 'number',
                min: 0,
                admin: {
                  description: `Max commission cap per item in ${defaultCurrency}`,
                },
              },
            ],
          },
          {
            name: 'partnerSplit',
            type: 'number',
            required: true,
            min: 0,
            max: 100,
            defaultValue: referralConfig.defaultPartnerSplit,
            admin: {
              description: 'Percentage of total commission given to Partner (0-100)',
            },
          },
          {
            name: 'customerSplit',
            type: 'number',
            min: 0,
            max: 100,
            hooks: {
              beforeValidate: [
                ({ siblingData }: { siblingData?: { partnerSplit?: number } }) =>
                  deriveCustomerSplit(siblingData?.partnerSplit),
              ],
              beforeChange: [
                ({ siblingData }: { siblingData?: { partnerSplit?: number } }) =>
                  deriveCustomerSplit(siblingData?.partnerSplit),
              ],
            },
            admin: {
              readOnly: true,
              description: 'Auto-calculated from Partner Split (saved automatically)',
            },
          },
        ],
      },
    ],
    timestamps: true,
  }
}
