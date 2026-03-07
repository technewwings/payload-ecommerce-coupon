import type { CollectionConfig } from "payload";

import type { SanitizedCouponPluginOptions } from "../types";
import { buildPartnerUserFilterWhere, isAdminUser, isPartnerUser } from "../utilities/userRoles";

const normalizeCode = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export const createReferralCodesCollection = (
  pluginConfig: SanitizedCouponPluginOptions,
): CollectionConfig => {
  const { collections, access, adminGroups, defaultCurrency, roleConfig, policies, integration } =
    pluginConfig;

  const usersSlug = integration.collections.usersSlug;

  return {
    slug: collections.referralCodesSlug,
    admin: {
      useAsTitle: "code",
      defaultColumns: ["code", "normalizedCode", "partner", "program", "usageCount", "isActive"],
      group: adminGroups.referralsGroup,
    },
    access: {
      read: async ({ req }) => {
        const user = req?.user as { id?: string | number } | undefined;
        if (!user) return false;

        const isAdmin =
          isAdminUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isAdmin?.({ req } as any)));
        if (isAdmin) return true;

        const hasPolicyAccess = await Promise.resolve(
          policies.canApplyReferral({ req, user, payload: req?.payload }),
        );

        if (!hasPolicyAccess) return false;

        const isPartner =
          isPartnerUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isPartner?.({ req } as any)));

        if (isPartner) {
          return {
            partner: {
              equals: user.id,
            },
          };
        }

        return access.canUseReferrals ? access.canUseReferrals({ req } as any) : false;
      },

      create: async ({ req }) => {
        const user = req?.user;
        if (!user) return false;

        const policyAllowed = await Promise.resolve(
          policies.canApplyReferral({ req, user, payload: req?.payload }),
        );
        if (!policyAllowed) return false;

        if (
          isAdminUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isAdmin?.({ req } as any)))
        ) {
          return true;
        }

        if (
          isPartnerUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isPartner?.({ req } as any)))
        ) {
          return true;
        }

        return access.isAdmin ? access.isAdmin({ req } as any) : false;
      },

      update: async ({ req }) => {
        const user = req?.user;
        if (!user) return false;

        const isAdmin =
          isAdminUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isAdmin?.({ req } as any)));
        if (isAdmin) return true;

        return false;
      },

      delete: async ({ req }) => {
        const user = req?.user;
        if (!user) return false;

        const isAdmin =
          isAdminUser({ user, roleConfig }) ||
          (await Promise.resolve(access.isAdmin?.({ req } as any)));
        return isAdmin;
      },
    },

    fields: [
      {
        name: "code",
        type: "text",
        required: true,
        unique: true,
        admin: {
          description: "The referral code that customers will enter",
        },
      },
      {
        name: "normalizedCode",
        type: "text",
        required: true,
        unique: true,
        index: true,
        admin: {
          readOnly: true,
          description: "Uppercased normalized code for fast case-insensitive lookup",
        },
      },
      {
        name: "program",
        type: "relationship",
        relationTo: collections.referralProgramsSlug,
        required: true,
        admin: {
          description: "The referral program this code belongs to",
        },
      },
      {
        name: "partner",
        type: "relationship",
        relationTo: usersSlug,
        required: true,
        filterOptions: async ({ req, user }) => {
          const currentUser = (user || req?.user) as unknown;

          if (
            isAdminUser({ user: currentUser, roleConfig }) ||
            (await Promise.resolve(access.isAdmin?.({ req } as any)))
          ) {
            return true;
          }

          return buildPartnerUserFilterWhere({ roleConfig });
        },
        admin: {
          description: `The partner who owns this referral code (relation: ${usersSlug})`,
        },
      },
      {
        name: "isActive",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Whether this referral code is currently active",
        },
      },
      {
        name: "usageCount",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "How many times this referral code has been used",
          readOnly: true,
        },
      },
      {
        name: "usageLimit",
        type: "number",
        admin: {
          description: "Maximum times this code can be used. Empty = unlimited.",
        },
      },
      {
        name: "expiresAt",
        type: "date",
        admin: {
          description: "When this referral code expires",
        },
      },
      {
        name: "successfulReferralsCount",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Total count of successful referrals using this code",
          readOnly: true,
        },
      },
      {
        name: "totalEarnings",
        type: "number",
        defaultValue: 0,
        admin: {
          description: `Total earnings generated by this code in ${defaultCurrency}`,
          readOnly: true,
        },
      },
      {
        name: "pendingEarnings",
        type: "number",
        defaultValue: 0,
        admin: {
          description: `Pending earnings awaiting payout in ${defaultCurrency}`,
          readOnly: true,
        },
      },
      {
        name: "paidEarnings",
        type: "number",
        defaultValue: 0,
        admin: {
          description: `Total earnings paid out in ${defaultCurrency}`,
          readOnly: true,
        },
      },
      {
        name: "metadata",
        type: "json",
        admin: {
          description: "Additional metadata for the referral code",
          position: "sidebar",
        },
      },
    ],

    hooks: {
      beforeValidate: [
        ({ data }) => {
          if (!data) return data;
          data.normalizedCode = normalizeCode(data.code);
          return data;
        },
      ],
      beforeChange: [
        ({ operation, req, data }) => {
          if (!data) return data;

          if (operation === "create" && !data.code && data.partner) {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).slice(2, 8);
            data.code = `REF-${timestamp}-${random}`.toUpperCase();
          }

          data.normalizedCode = normalizeCode(data.code);

          if (operation === "create" && req.user) {
            const user = req.user as { id?: string | number };
            if (isPartnerUser({ user, roleConfig }) && user.id != null) {
              data.partner = user.id;
            }
          }

          return data;
        },
      ],
    },

    timestamps: true,
  };
};
