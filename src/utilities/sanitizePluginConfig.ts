import type { CouponPluginOptions, SanitizedCouponPluginOptions } from "../types";
import { getCartItemUnitPrice } from "./pricing";
import { isAdminUser, isPartnerUser } from "./userRoles";

const toCleanStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off"
    ) {
      return false;
    }
  }
  return fallback;
};

export const sanitizePluginConfig = ({
  pluginConfig,
}: {
  pluginConfig: CouponPluginOptions;
}): SanitizedCouponPluginOptions => {
  const roleConfig = {
    roleFieldPaths:
      toCleanStringArray(pluginConfig?.roleConfig?.roleFieldPaths).length > 0
        ? toCleanStringArray(pluginConfig?.roleConfig?.roleFieldPaths)
        : ["role", "roles"],
    adminRoleValues:
      toCleanStringArray(pluginConfig?.roleConfig?.adminRoleValues).length > 0
        ? toCleanStringArray(pluginConfig?.roleConfig?.adminRoleValues)
        : ["admin"],
    partnerRoleValues:
      toCleanStringArray(pluginConfig?.roleConfig?.partnerRoleValues).length > 0
        ? toCleanStringArray(pluginConfig?.roleConfig?.partnerRoleValues)
        : ["partner"],
    customRoleResolver:
      typeof pluginConfig?.roleConfig?.customRoleResolver === "function"
        ? pluginConfig.roleConfig.customRoleResolver
        : undefined,
  };

  const normalizedAllowedTotalCommissionTypes = Array.isArray(
    pluginConfig?.referralConfig?.allowedTotalCommissionTypes,
  )
    ? [
        ...new Set(
          pluginConfig.referralConfig.allowedTotalCommissionTypes.filter(
            (value): value is "fixed" | "percentage" => value === "fixed" || value === "percentage",
          ),
        ),
      ]
    : [];

  const integrationCollections = {
    cartsSlug:
      typeof pluginConfig?.integration?.collections?.cartsSlug === "string" &&
      pluginConfig.integration.collections.cartsSlug.trim().length > 0
        ? pluginConfig.integration.collections.cartsSlug.trim()
        : "carts",
    ordersSlug:
      typeof pluginConfig?.integration?.collections?.ordersSlug === "string" &&
      pluginConfig.integration.collections.ordersSlug.trim().length > 0
        ? pluginConfig.integration.collections.ordersSlug.trim()
        : "orders",
    productsSlug:
      typeof pluginConfig?.integration?.collections?.productsSlug === "string" &&
      pluginConfig.integration.collections.productsSlug.trim().length > 0
        ? pluginConfig.integration.collections.productsSlug.trim()
        : "products",
    usersSlug:
      typeof pluginConfig?.integration?.collections?.usersSlug === "string" &&
      pluginConfig.integration.collections.usersSlug.trim().length > 0
        ? pluginConfig.integration.collections.usersSlug.trim()
        : "users",
    categoriesSlug:
      typeof pluginConfig?.integration?.collections?.categoriesSlug === "string" &&
      pluginConfig.integration.collections.categoriesSlug.trim().length > 0
        ? pluginConfig.integration.collections.categoriesSlug.trim()
        : "categories",
    tagsSlug:
      typeof pluginConfig?.integration?.collections?.tagsSlug === "string" &&
      pluginConfig.integration.collections.tagsSlug.trim().length > 0
        ? pluginConfig.integration.collections.tagsSlug.trim()
        : "tags",
  };

  const integrationFields = {
    cartItemsField: pluginConfig?.integration?.fields?.cartItemsField?.trim() || "items",
    cartSubtotalField: pluginConfig?.integration?.fields?.cartSubtotalField?.trim() || "subtotal",
    cartTotalField: pluginConfig?.integration?.fields?.cartTotalField?.trim() || "total",
    cartAppliedCouponField:
      pluginConfig?.integration?.fields?.cartAppliedCouponField?.trim() || "appliedCoupon",
    cartAppliedReferralCodeField:
      pluginConfig?.integration?.fields?.cartAppliedReferralCodeField?.trim() ||
      "appliedReferralCode",
    cartDiscountAmountField:
      pluginConfig?.integration?.fields?.cartDiscountAmountField?.trim() || "discountAmount",
    cartCustomerDiscountField:
      pluginConfig?.integration?.fields?.cartCustomerDiscountField?.trim() || "customerDiscount",
    cartPartnerCommissionField:
      pluginConfig?.integration?.fields?.cartPartnerCommissionField?.trim() || "partnerCommission",
    orderAppliedCouponField:
      pluginConfig?.integration?.fields?.orderAppliedCouponField?.trim() || "appliedCoupon",
    orderAppliedReferralCodeField:
      pluginConfig?.integration?.fields?.orderAppliedReferralCodeField?.trim() ||
      "appliedReferralCode",
    orderDiscountAmountField:
      pluginConfig?.integration?.fields?.orderDiscountAmountField?.trim() || "discountAmount",
    orderCustomerDiscountField:
      pluginConfig?.integration?.fields?.orderCustomerDiscountField?.trim() || "customerDiscount",
    orderPartnerCommissionField:
      pluginConfig?.integration?.fields?.orderPartnerCommissionField?.trim() || "partnerCommission",
    orderCustomerEmailField:
      pluginConfig?.integration?.fields?.orderCustomerEmailField?.trim() ||
      pluginConfig?.orderIntegration?.orderCustomerEmailField?.trim() ||
      "customerEmail",
    orderPaymentStatusField:
      pluginConfig?.integration?.fields?.orderPaymentStatusField?.trim() ||
      pluginConfig?.orderIntegration?.orderPaymentStatusField?.trim() ||
      "paymentStatus",
    orderCreatedAtField:
      pluginConfig?.integration?.fields?.orderCreatedAtField?.trim() || "createdAt",
    productPriceField: pluginConfig?.integration?.fields?.productPriceField?.trim() || "price",
    productCurrencyCodeField:
      pluginConfig?.integration?.fields?.productCurrencyCodeField?.trim() || "currencyCode",
  };

  const integrationResolvers = {
    getUserID:
      pluginConfig?.integration?.resolvers?.getUserID ||
      (({ user }: { user?: unknown }) => {
        if (!user || typeof user !== "object") return null;
        const id = (user as Record<string, unknown>).id;
        if (typeof id === "string" || typeof id === "number") return id;
        return null;
      }),
    getCartItems:
      pluginConfig?.integration?.resolvers?.getCartItems ||
      ((cart: unknown) => {
        if (!cart || typeof cart !== "object") return [];
        const value = (cart as Record<string, unknown>)[integrationFields.cartItemsField];
        return Array.isArray(value) ? value : [];
      }),
    getCartSubtotal:
      pluginConfig?.integration?.resolvers?.getCartSubtotal ||
      ((cart: unknown) => {
        if (!cart || typeof cart !== "object") return 0;
        const value = (cart as Record<string, unknown>)[integrationFields.cartSubtotalField];
        return typeof value === "number" ? value : 0;
      }),
    getCartTotal:
      pluginConfig?.integration?.resolvers?.getCartTotal ||
      ((cart: unknown) => {
        if (!cart || typeof cart !== "object") return 0;
        const value = (cart as Record<string, unknown>)[integrationFields.cartTotalField];
        return typeof value === "number" ? value : 0;
      }),
    isOrderPaid:
      pluginConfig?.integration?.resolvers?.isOrderPaid ||
      ((order: unknown) => {
        if (!order || typeof order !== "object") return false;
        const status = (order as Record<string, unknown>)[
          integrationFields.orderPaymentStatusField
        ];
        return status === (pluginConfig?.orderIntegration?.orderPaidStatusValue ?? "paid");
      }),
    getProductUnitPrice:
      pluginConfig?.integration?.resolvers?.getProductUnitPrice ||
      ((args: { item: unknown; product: unknown; variant?: unknown; currencyCode?: string }) =>
        getCartItemUnitPrice({
          item: (args.item as any) ?? null,
          product: (args.product as any) ?? null,
          variant: (args.variant as any) ?? null,
          currencyCode: args.currencyCode || "USD",
        })),
  };

  return {
    enabled: toBoolean(pluginConfig?.enabled, true),
    enableReferrals: toBoolean(pluginConfig?.enableReferrals, false),
    allowStackWithOtherCoupons: toBoolean(pluginConfig?.allowStackWithOtherCoupons, false),
    defaultCurrency:
      typeof pluginConfig?.defaultCurrency === "string" &&
      pluginConfig.defaultCurrency.length > 0 &&
      pluginConfig.defaultCurrency.length <= 3
        ? pluginConfig.defaultCurrency
        : "USD",
    collections: {
      couponsSlug:
        typeof pluginConfig?.collections?.couponsSlug === "string" &&
        pluginConfig.collections.couponsSlug.trim().length > 0 &&
        pluginConfig.collections.couponsSlug.length <= 100
          ? pluginConfig.collections.couponsSlug
          : "coupons",
      referralProgramsSlug:
        typeof pluginConfig?.collections?.referralProgramsSlug === "string" &&
        pluginConfig.collections.referralProgramsSlug.trim().length > 0 &&
        pluginConfig.collections.referralProgramsSlug.length <= 100
          ? pluginConfig.collections.referralProgramsSlug
          : "referral-programs",
      referralCodesSlug:
        typeof pluginConfig?.collections?.referralCodesSlug === "string" &&
        pluginConfig.collections.referralCodesSlug.trim().length > 0 &&
        pluginConfig.collections.referralCodesSlug.length <= 100
          ? pluginConfig.collections.referralCodesSlug
          : "referral-codes",
      referralPartnersSlug:
        typeof pluginConfig?.collections?.referralPartnersSlug === "string" &&
        pluginConfig.collections.referralPartnersSlug.trim().length > 0 &&
        pluginConfig.collections.referralPartnersSlug.length <= 100
          ? pluginConfig.collections.referralPartnersSlug
          : "referral-partners",
    },
    endpoints: {
      applyCoupon:
        typeof pluginConfig?.endpoints?.applyCoupon === "string" &&
        pluginConfig.endpoints.applyCoupon.trim().length > 0
          ? pluginConfig.endpoints.applyCoupon.trim()
          : "/coupons/apply",
      validateCoupon:
        typeof pluginConfig?.endpoints?.validateCoupon === "string" &&
        pluginConfig.endpoints.validateCoupon.trim().length > 0
          ? pluginConfig.endpoints.validateCoupon.trim()
          : "/coupons/validate",
      partnerStats:
        typeof pluginConfig?.endpoints?.partnerStats === "string" &&
        pluginConfig.endpoints.partnerStats.trim().length > 0
          ? pluginConfig.endpoints.partnerStats.trim()
          : "/referrals/partner-stats",
      recordOrderUsage:
        typeof pluginConfig?.endpoints?.recordOrderUsage === "string" &&
        pluginConfig.endpoints.recordOrderUsage.trim().length > 0
          ? pluginConfig.endpoints.recordOrderUsage.trim()
          : "/coupons/record-order-usage",
    },
    autoIntegrate: pluginConfig?.autoIntegrate !== false,
    access: {
      canUseCoupons:
        typeof pluginConfig?.access?.canUseCoupons === "function"
          ? pluginConfig.access.canUseCoupons
          : () => true,
      canUseReferrals:
        typeof pluginConfig?.access?.canUseReferrals === "function"
          ? pluginConfig.access.canUseReferrals
          : () => false,
      isAdmin:
        typeof pluginConfig?.access?.isAdmin === "function"
          ? pluginConfig.access.isAdmin
          : ({ req }) => isAdminUser({ user: req?.user, roleConfig }),
      isPartner:
        typeof pluginConfig?.access?.isPartner === "function"
          ? pluginConfig.access.isPartner
          : ({ req }) => isPartnerUser({ user: req?.user, roleConfig }),
    },
    policies: {
      canApplyCoupon:
        typeof pluginConfig?.policies?.canApplyCoupon === "function"
          ? pluginConfig.policies.canApplyCoupon
          : () => true,
      canApplyReferral:
        typeof pluginConfig?.policies?.canApplyReferral === "function"
          ? pluginConfig.policies.canApplyReferral
          : () => true,
      canViewPartnerStats:
        typeof pluginConfig?.policies?.canViewPartnerStats === "function"
          ? pluginConfig.policies.canViewPartnerStats
          : ({ req }) =>
              isPartnerUser({ user: (req as any)?.user, roleConfig }) ||
              isAdminUser({ user: (req as any)?.user, roleConfig }),
      canRecordOrderUsage:
        typeof pluginConfig?.policies?.canRecordOrderUsage === "function"
          ? pluginConfig.policies.canRecordOrderUsage
          : () => true,
    },
    integration: {
      collections: integrationCollections,
      fields: integrationFields,
      resolvers: integrationResolvers,
    },
    referralConfig: {
      allowBothSystems: pluginConfig?.referralConfig?.allowBothSystems ?? false,
      singleCodePerCart: pluginConfig?.referralConfig?.singleCodePerCart ?? true,
      defaultPartnerSplit: pluginConfig?.referralConfig?.defaultPartnerSplit ?? 70,
      defaultCustomerSplit: pluginConfig?.referralConfig?.defaultCustomerSplit ?? 30,
      allowedTotalCommissionTypes:
        normalizedAllowedTotalCommissionTypes.length > 0
          ? normalizedAllowedTotalCommissionTypes
          : ["fixed", "percentage"],
    },
    adminGroups: {
      couponsGroup: pluginConfig?.adminGroups?.couponsGroup ?? "Coupons",
      referralsGroup: pluginConfig?.adminGroups?.referralsGroup ?? "Referrals",
    },
    partnerDashboard: {
      enabled: pluginConfig?.partnerDashboard?.enabled ?? true,
      showEarningsSummary: pluginConfig?.partnerDashboard?.showEarningsSummary ?? true,
      showReferralPerformance: pluginConfig?.partnerDashboard?.showReferralPerformance ?? true,
      showRecentReferrals: pluginConfig?.partnerDashboard?.showRecentReferrals ?? true,
      showCommissionBreakdown: pluginConfig?.partnerDashboard?.showCommissionBreakdown ?? true,
    },
    orderIntegration: {
      ordersSlug:
        typeof pluginConfig?.orderIntegration?.ordersSlug === "string" &&
        pluginConfig.orderIntegration.ordersSlug.trim().length > 0
          ? pluginConfig.orderIntegration.ordersSlug
          : integrationCollections.ordersSlug,
      orderCustomerEmailField: integrationFields.orderCustomerEmailField,
      orderPaymentStatusField: integrationFields.orderPaymentStatusField,
      orderPaidStatusValue:
        typeof pluginConfig?.orderIntegration?.orderPaidStatusValue === "string"
          ? pluginConfig.orderIntegration.orderPaidStatusValue
          : "paid",
    },
    roleConfig,
  };
};
