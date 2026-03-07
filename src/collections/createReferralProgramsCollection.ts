import type { CollectionConfig } from "payload";

import type { SanitizedCouponPluginOptions } from "../types";

type CommissionType = "fixed" | "percentage";

type RuleData = {
  appliesTo?: "all" | "products" | "segments" | "categories";
  products?: unknown[];
  categories?: unknown[];
  tags?: unknown[];
  totalCommission?: { type?: CommissionType; value?: number };
  partnerSplit?: number;
  customerSplit?: number;
  partnerPercent?: number;
  customerPercent?: number;
  partnerAmount?: number;
  customerAmount?: number;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, adminGroups, referralConfig, integration } = pluginConfig;
  const allowedTotalCommissionTypes = referralConfig.allowedTotalCommissionTypes;
  const relationSlugs = integration.collections;

  const beforeChange: NonNullable<CollectionConfig["hooks"]>["beforeChange"] = [
    ({ data }: { data: Record<string, unknown> }) => {
      if (
        !data.commissionRules ||
        !Array.isArray(data.commissionRules) ||
        data.commissionRules.length === 0
      ) {
        throw new Error("At least one commission rule is required");
      }

      const maxAmount = toNumber(data.maxAmount);
      if (maxAmount != null && maxAmount < 0) {
        throw new Error("Max Amount must be a non-negative number");
      }

      const minOrderAmount = toNumber(data.minOrderAmount);
      if (minOrderAmount != null && minOrderAmount < 0) {
        throw new Error("Minimum Order Amount must be a non-negative number");
      }

      data.maxAmount = maxAmount ?? null;
      data.minOrderAmount = minOrderAmount ?? null;

      data.commissionRules = data.commissionRules.map(
        (rule: Record<string, unknown>, index: number) => {
          const r = rule as RuleData;

          if (!r.totalCommission) {
            throw new Error(`Commission rule ${index + 1}: Total Commission is required`);
          }

          if (
            !r.totalCommission.type ||
            !allowedTotalCommissionTypes.includes(r.totalCommission.type)
          ) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission type must be one of ${allowedTotalCommissionTypes.join(", ")}`,
            );
          }

          const type = r.totalCommission.type;
          const totalValue = toNumber(r.totalCommission.value);

          if (type === "percentage") {
            if (totalValue == null || totalValue < 0) {
              throw new Error(
                `Commission rule ${index + 1}: Total Commission value must be a non-negative number`,
              );
            }
            if (totalValue > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Percentage Total Commission cannot exceed 100`,
              );
            }
          }

          const appliesTo = r.appliesTo ?? "all";
          if (appliesTo === "products" && (!r.products || r.products.length === 0)) {
            throw new Error(`Commission rule ${index + 1}: At least one product is required`);
          }

          if (
            (appliesTo === "segments" || appliesTo === "categories") &&
            (!r.categories || r.categories.length === 0) &&
            (!r.tags || r.tags.length === 0)
          ) {
            throw new Error(
              `Commission rule ${index + 1}: At least one category or tag is required`,
            );
          }

          let partnerSplit: number;
          let customerSplit: number;
          let partnerPercent: number | null = null;
          let customerPercent: number | null = null;
          let partnerAmount: number | null = null;
          let customerAmount: number | null = null;
          let splitWarning: string | null = null;

          if (type === "percentage") {
            const partnerPctInput = toNumber(r.partnerPercent) ?? toNumber(r.partnerSplit);
            const customerPctInput = toNumber(r.customerPercent) ?? toNumber(r.customerSplit);

            if (partnerPctInput == null || partnerPctInput < 0 || partnerPctInput > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Partner Split must be between 0 and 100`,
              );
            }

            if (customerPctInput != null && (customerPctInput < 0 || customerPctInput > 100)) {
              throw new Error(
                `Commission rule ${index + 1}: Customer percentage must be between 0 and 100`,
              );
            }

            const customerPctComputed =
              customerPctInput != null ? customerPctInput : 100 - partnerPctInput;
            const percentTotal = partnerPctInput + customerPctComputed;

            if (percentTotal > 100) {
              throw new Error(
                `Commission rule ${index + 1}: Partner percentage + Customer percentage cannot exceed 100`,
              );
            }

            if (percentTotal > 50) {
              splitWarning = `High total split configured: ${percentTotal}% (partner + customer).`;
            }

            partnerPercent = partnerPctInput;
            customerPercent = customerPctComputed;
            partnerSplit = partnerPctInput;
            customerSplit = customerPctComputed;
          } else {
            const partnerAmountInput = toNumber(r.partnerAmount);
            const customerAmountInput = toNumber(r.customerAmount);
            const legacyPartnerSplitInput = toNumber(r.partnerSplit);
            const legacyCustomerSplitInput = toNumber(r.customerSplit);

            const hasNewFixedInputs = partnerAmountInput != null || customerAmountInput != null;
            const hasLegacyFixedInputs =
              legacyPartnerSplitInput != null || legacyCustomerSplitInput != null;

            if (hasNewFixedInputs) {
              if (partnerAmountInput == null || partnerAmountInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: Partner fixed amount must be a non-negative number`,
                );
              }

              if (customerAmountInput == null || customerAmountInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: Customer fixed amount must be a non-negative number`,
                );
              }

              partnerAmount = partnerAmountInput;
              customerAmount = customerAmountInput;
              partnerSplit = toCents(partnerAmountInput);
              customerSplit = toCents(customerAmountInput);
            } else if (hasLegacyFixedInputs) {
              if (legacyPartnerSplitInput == null || legacyPartnerSplitInput < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                );
              }

              const legacyHasTotalValue = toNumber(r.totalCommission?.value) != null;
              const resolvedLegacyCustomerSplit =
                legacyCustomerSplitInput ??
                (legacyHasTotalValue ? 100 - legacyPartnerSplitInput : null);

              if (resolvedLegacyCustomerSplit == null || resolvedLegacyCustomerSplit < 0) {
                throw new Error(
                  `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be non-negative numbers`,
                );
              }

              partnerSplit = legacyPartnerSplitInput;
              customerSplit = resolvedLegacyCustomerSplit;
              partnerAmount = null;
              customerAmount = null;
            } else {
              throw new Error(
                `Commission rule ${index + 1}: For fixed commissions, both partner and customer values must be provided`,
              );
            }
          }

          return {
            ...rule,
            appliesTo: appliesTo === "categories" ? "segments" : appliesTo,
            totalCommission: {
              type,
              value: type === "percentage" ? totalValue : null,
            },
            partnerPercent,
            customerPercent,
            partnerAmount,
            customerAmount,
            partnerSplit,
            customerSplit,
            splitWarning,
          };
        },
      );

      return data;
    },
  ];

  return {
    slug: collections.referralProgramsSlug,
    admin: {
      useAsTitle: "name",
      defaultColumns: ["id", "name", "commissionRules", "isActive"],
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
        name: "name",
        type: "text",
        required: true,
        admin: {
          description: "Name of the referral program",
        },
      },
      {
        name: "isActive",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Whether this referral program is currently active",
        },
      },
      {
        name: "maxAmount",
        type: "number",
        min: 0,
        admin: {
          description: "Maximum commission cap per item. Leave empty for no cap.",
        },
      },
      {
        name: "minOrderAmount",
        type: "number",
        min: 0,
        admin: {
          description:
            "Minimum cart subtotal required for this program. Leave empty for no minimum.",
        },
      },
      {
        name: "commissionRules",
        type: "array",
        required: true,
        minRows: 1,
        admin: {
          description: "Rules for referral commission and customer discount distribution.",
        },
        fields: [
          {
            name: "appliesTo",
            type: "select",
            required: true,
            options: [
              { label: "All Products", value: "all" },
              { label: "Specific Products", value: "products" },
              { label: "Categories and Tags", value: "segments" },
            ],
            defaultValue: "all",
          },
          {
            name: "products",
            type: "relationship",
            relationTo: relationSlugs.productsSlug,
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === "products",
              description: "Products this rule applies to",
            },
          },
          {
            name: "categories",
            type: "relationship",
            relationTo: relationSlugs.categoriesSlug,
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === "segments",
              description: "Any matching category can activate this rule",
            },
          },
          {
            name: "tags",
            type: "relationship",
            relationTo: relationSlugs.tagsSlug,
            hasMany: true,
            admin: {
              condition: (_: unknown, siblingData: { appliesTo?: string }) =>
                siblingData?.appliesTo === "segments",
              description: "Any matching tag can activate this rule",
            },
          },
          {
            name: "totalCommission",
            type: "group",
            admin: {
              description: "Total commission pool configuration",
            },
            fields: [
              {
                name: "type",
                type: "select",
                required: true,
                options: allowedTotalCommissionTypes.map((value) => ({
                  label: value === "fixed" ? "Fixed Amount" : "Percentage of Order",
                  value,
                })),
                defaultValue: allowedTotalCommissionTypes.includes("fixed")
                  ? "fixed"
                  : "percentage",
              },
            ],
          },
          {
            name: "partnerPercent",
            type: "number",
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === "percentage",
              description: "Partner share in percent (0-100)",
            },
          },
          {
            name: "customerPercent",
            type: "number",
            min: 0,
            max: 100,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === "percentage",
              description:
                "Customer share percentage. (0-100). Partner + Customer cannot exceed 100.",
            },
          },
          {
            name: "partnerAmount",
            type: "number",
            min: 0,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === "fixed",
              description: "Fixed partner commission amount per item.",
            },
          },
          {
            name: "customerAmount",
            type: "number",
            min: 0,
            admin: {
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === "fixed",
              description: "Fixed customer discount amount per item.",
            },
          },
          {
            name: "partnerSplit",
            type: "number",
            min: 0,
            admin: {
              hidden: true,
              description:
                "Canonical storage field. Percentage mode: percent. Fixed mode: amount in cents.",
            },
          },
          {
            name: "customerSplit",
            type: "number",
            min: 0,
            admin: {
              hidden: true,
              description:
                "Canonical storage field. Percentage mode: percent. Fixed mode: amount in cents.",
            },
          },
          {
            name: "splitWarning",
            type: "text",
            virtual: true,
            admin: {
              readOnly: true,
              condition: (_: unknown, siblingData: { totalCommission?: { type?: string } }) =>
                siblingData?.totalCommission?.type === "percentage",
              description:
                "Non-blocking warning shown when partnerPercent + customerPercent is greater than 50%.",
            },
          },
        ],
      },
    ],
    timestamps: true,
  };
};
