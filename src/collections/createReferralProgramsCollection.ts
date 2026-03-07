import type { CollectionConfig } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

type CommissionType = 'fixed' | 'percentage'

type RuleData = {
  appliesTo?: 'all' | 'products' | 'segments' | 'categories'
  products?: unknown[]
  categories?: unknown[]
  tags?: unknown[]
  totalCommission?: { type?: CommissionType; value?: number; maxAmount?: number }
  partnerSplit?: number
  customerSplit?: number
  partnerPercent?: number
  customerPercent?: number
  partnerAmount?: number
  customerAmount?: number
  minOrderAmount?: number
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, referralConfig, integration } =
    pluginConfig
  const allowedTotalCommissionTypes = referralConfig.allowedTotalCommissionTypes
  const relationSlugs = integration.collections

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
            !allowedTotalCommissionTypes.includes(r.totalCommission.type)
          ) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission type must be one of ${allowedTotalCommissionTypes.join(', ')}`,
            )
          }

          const type = r.totalCommission.type
          const totalValue = toNumber(r.totalCommission.value)
          const maxAmount = toNumber(r.totalCommission.maxAmount)

          if (type === 'percentage') {
            if (totalValue == null || totalValue < 0) {
              throw new Error(
                `Commission rule ${index + 1}: Total Commission value must be a non-negative number`,
              )
            }
            if (totalValue > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Percentage Total Commission cannot exceed 100`,
              )
            }
          }

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

          let partnerSplit: number
          let customerSplit: number
          let partnerPercent: number | null = null
          let customerPercent: number | null = null
          let partnerAmount: number | null = null
          let customerAmount: number | null = null

          if (type === 'percentage') {
            const partnerPctInput = toNumber(r.partnerPercent) ?? toNumber(r.partnerSplit)
            if (partnerPctInput == null || partnerPctInput < 0 || partnerPctInput > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Partner Split must be between 0 and 100`,
              )
            }

            const customerPctComputed = 100 - partnerPctInput
            if (customerPctComputed < 0 || customerPctComputed > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Customer percentage must be between 0 and 100`,
              )
            }

            partnerPercent = partnerPctInput
            customerPercent = customerPctComputed
            partnerSplit = partnerPctInput
            customerSplit = customerPctComputed
          } else {
            const partnerAmountInput = toNumber(r.partnerAmount)
            const customerAmountInput = toNumber(r.customerAmount)
            const legacyPartnerSplitInput = toNumber(r.partnerSplit)
            const legacyCustomerSplitInput = toNumber(r.customerSplit)

            const hasNewFixedInputs = partnerAmountInput != null || customerAmountInput != null
            const hasLegacyFixedInputs =
              legacyPartnerSplitInput != null || legacyCustomerSplitInput != null

            if (hasNewFixedInputs) {
              if (partnerAmountInput == null || partnerAmountInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: Partner fixed amount must be a non-negative number`,
                )
              }

              if (customerAmountInput == null || customerAmountInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: Customer fixed amount must be a non-negative number`,
                )
              }

              partnerAmount = partnerAmountInput
              customerAmount = customerAmountInput
              partnerSplit = toCents(partnerAmountInput)
              customerSplit = toCents(customerAmountInput)
            } else if (hasLegacyFixedInputs) {
              if (legacyPartnerSplitInput == null || legacyPartnerSplitInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                )
              }

              const legacyHasTotalValue = toNumber(r.totalCommission?.value) != null
              const resolvedLegacyCustomerSplit =
                legacyCustomerSplitInput ??
                (legacyHasTotalValue ? 100 - legacyPartnerSplitInput : null)

              if (resolvedLegacyCustomerSplit == null || resolvedLegacyCustomerSplit < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                )
              }

              partnerSplit = legacyPartnerSplitInput
              customerSplit = resolvedLegacyCustomerSplit
              partnerAmount = null
              customerAmount = null
            } else {
              throw new Error(
                `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be provided`,
              )
            }
          }

          const minOrderAmount = toNumber(r.minOrderAmount)
          if (minOrderAmount != null && minOrderAmount < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Minimum Order Amount must be a non-negative number`,
            )
          }

          return {
            ...rule,
            appliesTo: appliesTo === 'categories' ? 'segments' : appliesTo,
            totalCommission: {
              type,
              value: type === 'percentage' ? totalValue : null,
              maxAmount: maxAmount ?? null,
            },
            partnerPercent,
            customerPercent,
            partnerAmount,
            customerAmount,
            partnerSplit,
            customerSplit,
            minOrderAmount: minOrderAmount ?? null,
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
            relationTo: relationSlugs.productsSlug,
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
            relationTo: relationSlugs.categoriesSlug,
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
            relationTo: relationSlugs.tagsSlug,
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
              description: 'Total commission pool configuration',
            },
            fields: [
              {
                name: 'type',
                type: 'select',
                required: true,
                options: allowedTotalCommissionTypes.map((value) => ({
                  label: value === 'fixed' ? 'Fixed Amount' : 'Percentage of Order',
                  value,
                })),
                defaultValue: allowedTotalCommissionTypes.includes('fixed')
                  ? 'fixed'
                  : 'percentage',
              },
              {
                name: 'value',
                type: 'number',
                min: 0,
                max: 100,
                admin: {
                  condition: ({ siblingData }) => siblingData?.type === 'percentage',
                  description:
                    'Total commission percentage for this rule (0-100). Partner/Customer percentages split this 100-based bucket.',
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
            name: 'partnerPercent',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              condition: ({
                siblingData,
              }: {
                siblingData?: { totalCommission?: { type?: string } }
              }) => siblingData?.totalCommission?.type === 'percentage',
              description:
                'Partner share in percent (0-100). Customer share is auto-calculated as 100 - Partner.',
            },
          },
          {
            name: 'customerPercent',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              readOnly: true,
              condition: ({
                siblingData,
              }: {
                siblingData?: { totalCommission?: { type?: string } }
              }) => siblingData?.totalCommission?.type === 'percentage',
              description: 'Auto-calculated customer share percentage.',
            },
            hooks: {
              beforeValidate: [
                ({
                  siblingData,
                }: {
                  siblingData?: {
                    totalCommission?: { type?: string }
                    partnerPercent?: number
                    partnerSplit?: number
                  }
                }) => {
                  if (!siblingData || siblingData.totalCommission?.type !== 'percentage') {
                    return null
                  }
                  const partner =
                    toNumber(siblingData.partnerPercent) ?? toNumber(siblingData.partnerSplit) ?? 0
                  if (partner < 0) return 100
                  if (partner > 100) return 0
                  return 100 - partner
                },
              ],
            },
          },
          {
            name: 'partnerAmount',
            type: 'number',
            min: 0,
            admin: {
              condition: ({
                siblingData,
              }: {
                siblingData?: { totalCommission?: { type?: string } }
              }) => siblingData?.totalCommission?.type === 'fixed',
              description: `Fixed partner commission amount per item in ${defaultCurrency}. Stored as cents internally.`,
            },
          },
          {
            name: 'customerAmount',
            type: 'number',
            min: 0,
            admin: {
              condition: ({
                siblingData,
              }: {
                siblingData?: { totalCommission?: { type?: string } }
              }) => siblingData?.totalCommission?.type === 'fixed',
              description: `Fixed customer discount amount per item in ${defaultCurrency}. Stored as cents internally.`,
            },
          },
          {
            name: 'partnerSplit',
            type: 'number',
            min: 0,
            admin: {
              hidden: true,
              description:
                'Canonical storage field. Percentage mode: percent. Fixed mode: amount in cents.',
            },
          },
          {
            name: 'customerSplit',
            type: 'number',
            min: 0,
            admin: {
              hidden: true,
              description:
                'Canonical storage field. Percentage mode: percent. Fixed mode: amount in cents.',
            },
          },
          {
            name: 'minOrderAmount',
            type: 'number',
            min: 0,
            admin: {
              description: `Minimum cart subtotal required for this rule in ${defaultCurrency}. Leave empty for no minimum.`,
            },
          },
        ],
      },
    ],
    timestamps: true,
  }
}
