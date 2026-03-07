import { APIError, type CollectionConfig } from 'payload'

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
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, adminGroups, referralConfig, integration } = pluginConfig
  const allowedTotalCommissionTypes = referralConfig.allowedTotalCommissionTypes
  const relationSlugs = integration.collections

  const beforeChange: NonNullable<CollectionConfig['hooks']>['beforeChange'] = [
    ({ data }: { data: Record<string, unknown> }) => {
      if (
        !data.commissionRules ||
        !Array.isArray(data.commissionRules) ||
        data.commissionRules.length === 0
      ) {
        throw new APIError('At least one commission rule is required', 400)
      }

      const maxPartnerCommissionPerOrder = toNumber(data.maxPartnerCommissionPerOrder)
      if (maxPartnerCommissionPerOrder != null && maxPartnerCommissionPerOrder < 0) {
        throw new APIError(
          'Maximum commission per order for partner must be a non-negative number',
          400,
        )
      }

      const maxCustomerDiscountPerOrder = toNumber(data.maxCustomerDiscountPerOrder)
      if (maxCustomerDiscountPerOrder != null && maxCustomerDiscountPerOrder < 0) {
        throw new APIError(
          'Maximum discount for customer per order must be a non-negative number',
          400,
        )
      }

      const minOrderAmount = toNumber(data.minOrderAmount)
      if (minOrderAmount != null && minOrderAmount < 0) {
        throw new APIError('Minimum Order Amount must be a non-negative number', 400)
      }

      data.maxPartnerCommissionPerOrder =
        maxPartnerCommissionPerOrder != null ? maxPartnerCommissionPerOrder : null
      data.maxCustomerDiscountPerOrder =
        maxCustomerDiscountPerOrder != null ? maxCustomerDiscountPerOrder : null
      data.minOrderAmount = minOrderAmount ?? null

      data.commissionRules = data.commissionRules.map(
        (rule: Record<string, unknown>, index: number) => {
          const r = rule as RuleData

          if (!r.totalCommission) {
            throw new APIError(`Commission rule ${index + 1}: Total Commission is required`, 400)
          }

          if (
            !r.totalCommission.type ||
            !allowedTotalCommissionTypes.includes(r.totalCommission.type)
          ) {
            throw new APIError(
              `Commission rule ${index + 1}: Total Commission type must be one of ${allowedTotalCommissionTypes.join(', ')}`,
              400,
            )
          }

          const type = r.totalCommission.type

          const appliesTo = r.appliesTo ?? 'all'
          if (appliesTo === 'products' && (!r.products || r.products.length === 0)) {
            throw new APIError(
              `Commission rule ${index + 1}: At least one product is required`,
              400,
            )
          }

          if (
            (appliesTo === 'segments' || appliesTo === 'categories') &&
            (!r.categories || r.categories.length === 0) &&
            (!r.tags || r.tags.length === 0)
          ) {
            throw new APIError(
              `Commission rule ${index + 1}: At least one category or tag is required`,
              400,
            )
          }

          let partnerSplit: number
          let customerSplit: number
          let partnerPercent: number | null = null
          let customerPercent: number | null = null
          let partnerAmount: number | null = null
          let customerAmount: number | null = null
          let splitWarning: string | null = null

          if (type === 'percentage') {
            const partnerPctInput = toNumber(r.partnerPercent) ?? toNumber(r.partnerSplit)
            const customerPctInput = toNumber(r.customerPercent) ?? toNumber(r.customerSplit)

            if (partnerPctInput == null || partnerPctInput < 0 || partnerPctInput > 100) {
              throw new APIError(
                `Commission rule ${index + 1}: Partner Split must be between 0 and 100`,
                400,
              )
            }

            if (customerPctInput != null && (customerPctInput < 0 || customerPctInput > 100)) {
              throw new APIError(
                `Commission rule ${index + 1}: Customer percentage must be between 0 and 100`,
                400,
              )
            }

            const customerPctComputed =
              customerPctInput != null ? customerPctInput : 100 - partnerPctInput
            const percentTotal = partnerPctInput + customerPctComputed

            if (percentTotal > 100) {
              throw new APIError(
                `Commission rule ${index + 1}: Partner percentage + Customer percentage cannot exceed 100`,
                400,
              )
            }

            if (percentTotal > 50) {
              splitWarning = `High total split configured: ${percentTotal}% (partner + customer).`
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
                throw new APIError(
                  `Commission rule ${index + 1}: Partner fixed amount must be a non-negative number`,
                  400,
                )
              }

              if (customerAmountInput == null || customerAmountInput < 0) {
                throw new APIError(
                  `Commission rule ${index + 1}: Customer fixed amount must be a non-negative number`,
                  400,
                )
              }

              partnerAmount = partnerAmountInput
              customerAmount = customerAmountInput
              partnerSplit = partnerAmountInput
              customerSplit = customerAmountInput
            } else if (hasLegacyFixedInputs) {
              if (legacyPartnerSplitInput == null || legacyPartnerSplitInput < 0) {
                throw new APIError(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                  400,
                )
              }

              const resolvedLegacyCustomerSplit =
                legacyCustomerSplitInput ?? 100 - legacyPartnerSplitInput

              if (resolvedLegacyCustomerSplit == null || resolvedLegacyCustomerSplit < 0) {
                throw new APIError(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                  400,
                )
              }

              partnerSplit = legacyPartnerSplitInput
              customerSplit = resolvedLegacyCustomerSplit
              partnerAmount = null
              customerAmount = null
            } else {
              throw new APIError(
                `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be provided`,
                400,
              )
            }
          }

          return {
            ...rule,
            appliesTo: appliesTo === 'categories' ? 'segments' : appliesTo,
            totalCommission: {
              type,
              ...(typeof r.totalCommission.value === 'number'
                ? { value: r.totalCommission.value }
                : {}),
              ...(typeof r.totalCommission.maxAmount === 'number'
                ? { maxAmount: r.totalCommission.maxAmount }
                : {}),
            },
            partnerPercent,
            customerPercent,
            partnerAmount,
            customerAmount,
            partnerSplit,
            customerSplit,
            splitWarning,
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
      defaultColumns: ['id', 'name', 'commissionRules', 'isActive'],
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
          description: 'Name of the referral program',
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
        name: 'maxPartnerCommissionPerOrder',
        type: 'number',
        min: 0,
        admin: {
          description: 'Maximum commission per order for partner. Leave empty for no cap.',
        },
      },
      {
        name: 'maxCustomerDiscountPerOrder',
        type: 'number',
        min: 0,
        admin: {
          description: 'Maximum customer discount per order. Leave empty for no cap.',
        },
      },
      {
        name: 'minOrderAmount',
        type: 'number',
        min: 0,
        admin: {
          description:
            'Minimum cart subtotal required for this program. Leave empty for no minimum.',
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
            ],
          },
          {
            name: 'partnerPercent',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === 'percentage',
              description: 'Partner share in percent (0-100)',
            },
          },
          {
            name: 'customerPercent',
            type: 'number',
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === 'percentage',
              description:
                'Customer share percentage. (0-100). Partner + Customer cannot exceed 100.',
            },
          },
          {
            name: 'partnerAmount',
            type: 'number',
            min: 0,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === 'fixed',
              description: 'Fixed partner commission amount per item.',
            },
          },
          {
            name: 'customerAmount',
            type: 'number',
            min: 0,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === 'fixed',
              description: 'Fixed customer discount amount per item.',
            },
          },
          {
            name: 'partnerSplit',
            type: 'number',
            min: 0,
            admin: {
              hidden: true,
              description: 'Canonical storage field. Percentage mode: percent. Fixed mode: amount.',
            },
          },
          {
            name: 'customerSplit',
            type: 'number',
            min: 0,
            admin: {
              hidden: true,
              description: 'Canonical storage field. Percentage mode: percent. Fixed mode: amount.',
            },
          },
        ],
      },
    ],
    timestamps: true,
  }
}
