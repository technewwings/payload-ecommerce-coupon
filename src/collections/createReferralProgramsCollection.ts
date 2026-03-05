import type { CollectionConfig } from "payload";

import type { SanitizedCouponPluginOptions } from "../types";

type RuleData = {
  appliesTo?: "all" | "products" | "segments" | "categories";
  products?: unknown[];
  categories?: unknown[];
  tags?: unknown[];
  totalCommission?: { type?: "fixed" | "percentage"; value?: number; maxAmount?: number };
  partnerSplit?: number;
  customerSplit?: number;
  minOrderAmount?: number;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const deriveCustomerSplit = (
  partnerSplit: unknown,
  totalCommission?: { type?: string; value?: number },
): number => {
  // if fixed-type commission and the value is absent we’re in direct-split
  // mode. In that case the UI allows entering both partner and customer
  // amounts; the helper isn’t responsible for computing anything useful, so
  // just echo the partner value to avoid `undefined`.
  if (totalCommission?.type === "fixed" && totalCommission.value == null) {
    const partner = toNumber(partnerSplit);
    return partner != null ? partner : 0;
  }

  // for all other cases (percentage rules and fixed-with-value rules) we
  // derive the customer percentage as the complement of the partner
  // percentage. Bounds are enforced elsewhere.
  const partner = toNumber(partnerSplit);
  if (partner == null) return 0;
  if (partner < 0) return 100;
  if (partner > 100) return 0;
  return 100 - partner;
};

export const createReferralProgramsCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, defaultCurrency, adminGroups, referralConfig } = pluginConfig;
  const allowedTotalCommissionTypes = referralConfig.allowedTotalCommissionTypes;

  const beforeChange: NonNullable<CollectionConfig["hooks"]>["beforeChange"] = [
    ({ data }: { data: Record<string, unknown> }) => {
      if (
        !data.commissionRules ||
        !Array.isArray(data.commissionRules) ||
        data.commissionRules.length === 0
      ) {
        throw new Error("At least one commission rule is required");
      }

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

          const totalValue = toNumber(r.totalCommission.value);
          // when the type is fixed we no longer require a value – splits are entered
          // directly. Ignore the value when calculating rewards below. Nevertheless
          // validate it if it exists so we never accidentally store a bad number.
          if (r.totalCommission.type === "percentage" && (totalValue == null || totalValue < 0)) {
            throw new Error(
              `Commission rule ${index + 1}: Total Commission value must be a non-negative number`,
            );
          }
          if (r.totalCommission.type === "percentage" && totalValue && totalValue > 100) {
            throw new Error(
              `Commission rule ${index + 1}: Percentage Total Commission cannot exceed 100`,
            );
          }

          const maxAmount = toNumber(r.totalCommission.maxAmount);
          if (maxAmount != null && maxAmount < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Max Amount must be a non-negative number`,
            );
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

          const partnerSplit = toNumber(r.partnerSplit);
          if (partnerSplit == null || partnerSplit < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Partner Split must be a non-negative number`,
            );
          }
          const hasFixedValue =
            r.totalCommission.type === "fixed" && toNumber(r.totalCommission.value) != null;
          if (!hasFixedValue && r.totalCommission.type !== "fixed" && partnerSplit > 100) {
            // percentage rule with too-large split
            throw new Error(
              `Commission rule ${index + 1}: Partner Split must be between 0 and 100`,
            );
          }
          if (hasFixedValue && partnerSplit > 100) {
            // fixed-with-value also treated as percentage
            throw new Error(
              `Commission rule ${index + 1}: Partner Split must be between 0 and 100`,
            );
          }

          let customerSplit: number | null = null;
          if (r.totalCommission.type === "fixed" && !hasFixedValue) {
            // direct mode: require explicit customerSplit
            customerSplit = toNumber(r.customerSplit);
            if (customerSplit == null || customerSplit < 0) {
              throw new Error(
                `Commission rule ${index + 1}: For fixed commissions with no value, both partnerSplit and customerSplit must be non-negative numbers`,
              );
            }
          } else {
            // percentage rules and fixed-with-value automatically derive
            customerSplit = 100 - partnerSplit;
          }

          const minOrderAmount = toNumber(
            (r as RuleData & { minOrderAmount?: number }).minOrderAmount,
          );
          if (minOrderAmount != null && minOrderAmount < 0) {
            throw new Error(
              `Commission rule ${index + 1}: Minimum Order Amount must be a non-negative number`,
            );
          }

          return {
            ...rule,
            appliesTo: appliesTo === "categories" ? "segments" : appliesTo,
            totalCommission: {
              type: r.totalCommission.type,
              // keep the value when present, but it is ignored for fixed-amount rules
              value: totalValue,
              maxAmount: maxAmount ?? null,
            },
            partnerSplit,
            customerSplit,
            minOrderAmount: minOrderAmount ?? null,
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
      defaultColumns: ["name", "commissionRules", "isActive"],
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
          description: "Name of the referral program for admin reference",
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
        name: "commissionRules",
        type: "array",
        required: true,
        minRows: 1,
        admin: {
          description: "Rules for referral commission and customer discount distribution.",
        },
        fields: [
          {
            name: "name",
            type: "text",
            required: false,
            admin: { description: "Optional rule label for admin clarity" },
          },
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
            relationTo: "products",
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
            relationTo: "categories",
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
            relationTo: "tags",
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
              description: "Total commission pool to split between partner and customer",
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
              {
                name: "value",
                type: "number",
                admin: {
                  condition: ({ siblingData }) => siblingData?.type === "percentage",
                  description:
                    "Total commission value (shown for percentage rules; ignored when using fixed split amounts)",
                },
                min: 0,
              },
              {
                name: "maxAmount",
                type: "number",
                min: 0,
                admin: {
                  description: `Max commission cap per item in ${defaultCurrency}`,
                },
              },
            ],
          },
          {
            name: "partnerSplit",
            type: "number",
            required: true,
            min: 0,
            admin: {
              description:
                "For percentage rules this is the percent that goes to the partner; when using fixed type it becomes the literal amount per item",
            },
          },
          {
            name: "minOrderAmount",
            type: "number",
            min: 0,
            admin: {
              description: `Minimum cart subtotal required for this rule in ${defaultCurrency}. Leave empty for no minimum.`,
            },
          },
          {
            name: "customerSplit",
            type: "number",
            min: 0,
            admin: {
              condition: ({ siblingData }: { siblingData?: { totalCommission?: any } }) =>
                siblingData?.totalCommission?.type !== "fixed",
              description:
                "When using percentage rules this is auto-calculated; for fixed-type rules you may enter a literal amount",
            },
            hooks: {
              beforeValidate: [
                ({
                  siblingData,
                }: {
                  siblingData?: { partnerSplit?: number; totalCommission?: any };
                }) =>
                  deriveCustomerSplit(
                    siblingData?.partnerSplit,
                    siblingData?.totalCommission?.type,
                  ),
              ],
              beforeChange: [
                ({
                  siblingData,
                }: {
                  siblingData?: { partnerSplit?: number; totalCommission?: any };
                }) =>
                  deriveCustomerSplit(
                    siblingData?.partnerSplit,
                    siblingData?.totalCommission?.type,
                  ),
              ],
            },
          },
        ],
      },
    ],
    timestamps: true,
  };
};
