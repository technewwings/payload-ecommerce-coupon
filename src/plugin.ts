import type { Config } from "payload";

import { createCouponsCollection } from "./collections/createCouponsCollection";
import { createReferralCodesCollection } from "./collections/createReferralCodesCollection";
import { createReferralProgramsCollection } from "./collections/createReferralProgramsCollection";
import { applyCouponEndpoint } from "./endpoints/applyCoupon";
import { partnerStatsEndpoint } from "./endpoints/partnerStats";
import { validateCouponEndpoint } from "./endpoints/validateCoupon";
import { recalculateCartHook } from "./hooks/recalculateCart";
import { CouponPluginOptions } from "./types";
import { sanitizePluginConfig } from "./utilities/sanitizePluginConfig";

// Fields to append to orders (referral mode)

export const payloadEcommerceCouponPlugin =
  (pluginOptions: CouponPluginOptions = {}) =>
  async (incomingConfig: Config): Promise<Config> => {
    const pluginConfig = sanitizePluginConfig({ pluginConfig: pluginOptions });

    if (!pluginConfig.enabled) return incomingConfig || {};

    // Handle null or undefined incoming config
    if (!incomingConfig) {
      incomingConfig = { collections: [], endpoints: [] } as any;
    }
    if (!incomingConfig.collections) {
      incomingConfig.collections = [];
    }

    const collectionsToAdd = [];

    // When enableReferrals is true, both coupon and referral collections are created
    // The referralConfig.allowBothSystems determines if both can be used simultaneously
    if (pluginConfig.enableReferrals) {
      // Referral mode: create referral collections
      let referralProgramsCollection = createReferralProgramsCollection(pluginConfig);
      let referralCodesCollection = createReferralCodesCollection(pluginConfig);

      // Apply collection overrides if provided
      if (pluginOptions.collections?.referralProgramsCollectionOverride) {
        referralProgramsCollection =
          await pluginOptions.collections.referralProgramsCollectionOverride({
            defaultCollection: referralProgramsCollection,
          });
      }

      if (pluginOptions.collections?.referralCodesCollectionOverride) {
        referralCodesCollection = await pluginOptions.collections.referralCodesCollectionOverride({
          defaultCollection: referralCodesCollection,
        });
      }

      collectionsToAdd.push(referralProgramsCollection, referralCodesCollection);

      // If allowBothSystems is true, also create coupon collection
      if (pluginConfig.referralConfig.allowBothSystems) {
        let couponsCollection = createCouponsCollection(pluginConfig);
        if (pluginOptions.collections?.couponsCollectionOverride) {
          couponsCollection = await pluginOptions.collections.couponsCollectionOverride({
            defaultCollection: couponsCollection,
          });
        }
        collectionsToAdd.push(couponsCollection);
      }
    } else {
      // Coupon mode: create coupon collections only
      let couponsCollection = createCouponsCollection(pluginConfig);
      if (pluginOptions.collections?.couponsCollectionOverride) {
        couponsCollection = await pluginOptions.collections.couponsCollectionOverride({
          defaultCollection: couponsCollection,
        });
      }
      collectionsToAdd.push(couponsCollection);
    }

    // Add collections to config (avoid duplicates)
    const existingSlugs = new Set(incomingConfig.collections.map((c: any) => c.slug));
    const collectionsToAddFiltered = collectionsToAdd.filter(
      (c: any) => !existingSlugs.has(c.slug),
    );
    incomingConfig.collections = [...incomingConfig.collections, ...collectionsToAddFiltered];

    // Add endpoints
    if (!incomingConfig.endpoints) {
      incomingConfig.endpoints = [];
    }

    incomingConfig.endpoints = [
      ...incomingConfig.endpoints,
      validateCouponEndpoint({ pluginConfig }),
      applyCouponEndpoint({ pluginConfig }),
    ];

    // Add partner stats endpoint if referrals are enabled
    if (pluginConfig.enableReferrals) {
      incomingConfig.endpoints.push(partnerStatsEndpoint({ pluginConfig }));
    }

    // Safe autoIntegrate implementation — ensure referral collection exists before injecting relationships
    if (pluginConfig.autoIntegrate) {
      // Ensure collections array exists
      incomingConfig.collections = incomingConfig.collections || [];

      // After we already appended the plugin collections above, recompute slug set
      const allSlugs = new Set<string>(incomingConfig.collections.map((c: any) => c.slug));

      // Helper that adds a field group to an existing collection (by slug) if not already present
      const addFieldsToCollection = (targetSlug: string, newFields: any[]) => {
        const idx = incomingConfig.collections!.findIndex((c: any) => c.slug === targetSlug);
        if (idx === -1) return;
        const collection = incomingConfig.collections![idx];
        collection.fields = collection.fields || [];

        // Avoid adding duplicate fields (by name)
        const existingFieldNames = new Set(collection.fields.map((f: any) => f.name));
        for (const f of newFields) {
          if (!existingFieldNames.has(f.name)) {
            collection.fields.push(f);
          }
        }

        // Replace the collection entry (mutation is OK here)
        incomingConfig.collections![idx] = collection;
      };

      // Only inject referral integration if the referral collection slug is actually present
      if (
        pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.referralCodesSlug)
      ) {
        // Fields to append to carts (referral mode)
        const cartReferralFields = [
          {
            name: "appliedReferralCode",
            type: "relationship",
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: { description: "Referral code applied to this cart" },
          },
          {
            name: "partnerCommission",
            type: "number",
            admin: { description: "Partner commission amount for this cart" },
          },
          {
            name: "customerDiscount",
            type: "number",
            admin: { description: "Customer discount amount for this cart" },
          },
        ];

        // If both systems allowed, also add coupon field
        if (
          pluginConfig.referralConfig.allowBothSystems &&
          allSlugs.has(pluginConfig.collections.couponsSlug)
        ) {
          cartReferralFields.push({
            name: "appliedCoupon",
            type: "relationship",
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: "Coupon applied to this cart" },
          });
          cartReferralFields.push({
            name: "discountAmount",
            type: "number",
            admin: { description: "Discount amount from coupon" },
          });
        }

        addFieldsToCollection("carts", cartReferralFields);

        // Fields to append to orders (referral mode)
        const orderReferralFields = [
          {
            name: "appliedReferralCode",
            type: "relationship",
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: { description: "Referral code applied to this order", readOnly: true },
          },
          {
            name: "partnerCommission",
            type: "number",
            admin: { description: "Partner commission amount for this order", readOnly: true },
          },
          {
            name: "customerDiscount",
            type: "number",
            admin: { description: "Customer discount amount for this order", readOnly: true },
          },
        ];

        // If both systems allowed, also add coupon field to orders
        if (
          pluginConfig.referralConfig.allowBothSystems &&
          allSlugs.has(pluginConfig.collections.couponsSlug)
        ) {
          orderReferralFields.push({
            name: "appliedCoupon",
            type: "relationship",
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: "Coupon applied to this order", readOnly: true },
          });
          orderReferralFields.push({
            name: "discountAmount",
            type: "number",
            admin: { description: "Discount amount from coupon", readOnly: true },
          });
        }

        addFieldsToCollection("orders", orderReferralFields);
      } else if (
        !pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.couponsSlug)
      ) {
        // coupon mode — similar safe injection for appliedCoupons
        const cartCouponFields = [
          {
            name: "appliedCoupon",
            type: "relationship",
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: "Coupon applied to this cart" },
          },
          {
            name: "discountAmount",
            type: "number",
            admin: { description: "Discount amount from coupon" },
          },
        ];
        addFieldsToCollection("carts", cartCouponFields);

        const orderCouponFields = [
          {
            name: "appliedCoupon",
            type: "relationship",
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: "Coupon applied to this order", readOnly: true },
          },
          {
            name: "discountAmount",
            type: "number",
            admin: { description: "Discount amount from coupon", readOnly: true },
          },
        ];
        addFieldsToCollection("orders", orderCouponFields);
      }
    }

    // Add Recalculate Cart Hook
    const cartIndex = incomingConfig.collections!.findIndex((c: any) => c.slug === "carts");
    if (cartIndex > -1) {
      const collection = incomingConfig.collections![cartIndex];
      collection.hooks = {
        ...collection.hooks,
        beforeChange: [
          ...(collection.hooks?.beforeChange || []),
          recalculateCartHook(pluginConfig),
        ],
      };
      incomingConfig.collections![cartIndex] = collection;
    }

    return incomingConfig;
  };
