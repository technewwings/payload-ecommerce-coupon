import type { Endpoint, PayloadHandler } from "payload";
import type { SanitizedCouponPluginOptions } from "../types";
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
} from "../utilities/calculateValues";
import { roundTo2 } from "../utilities/roundTo2";

type Args = {
  pluginConfig: SanitizedCouponPluginOptions;
};

// Debug Capture
const globalDebugLogs: string[] = [];

export const applyCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    globalDebugLogs.length = 0; // Reset logs
    const { payload } = req;
    const { code, cartID, customerEmail } = req.data || {};

    if (!code || !cartID) {
      return Response.json(
        {
          success: false,
          error: `${pluginConfig.enableReferrals ? "Referral code" : "Coupon code"} and cart ID are required`,
        },
        { status: 400 },
      );
    }

    try {
      // Find the cart first to check for existing codes
      const cartQuery = await payload.findByID({
        collection: "carts",
        id: cartID,
        depth: 2,
      });

      if (!cartQuery) {
        return Response.json({ success: false, error: "Cart not found" }, { status: 404 });
      }

      // Check if single code per cart is enforced
      if (pluginConfig.referralConfig.singleCodePerCart) {
        const hasExistingCoupon = cartQuery.appliedCoupon;
        const hasExistingReferral = cartQuery.appliedReferralCode;

        if (hasExistingCoupon || hasExistingReferral) {
          return Response.json(
            {
              success: false,
              error:
                "A code has already been applied to this cart. Only one code can be used per order.",
            },
            { status: 400 },
          );
        }
      }

      if (pluginConfig.enableReferrals) {
        // Try referral code first
        const referralResult = await handleReferralCode({
          payload,
          code,
          cartID,
          cart: cartQuery,
          customerEmail,
          pluginConfig,
        });

        // If referral code not found and both systems allowed, try coupon
        if (
          !referralResult.ok &&
          referralResult.status === 404 &&
          pluginConfig.referralConfig.allowBothSystems
        ) {
          return await handleCouponCode({
            payload,
            code,
            cartID,
            cart: cartQuery,
            customerEmail,
            pluginConfig,
          });
        }

        return referralResult;
      } else {
        // Coupon mode: handle coupons
        return await handleCouponCode({
          payload,
          code,
          cartID,
          cart: cartQuery,
          customerEmail,
          pluginConfig,
        });
      }
    } catch (error) {
      console.error("Code application error:", error);
      return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };

// Handle coupon application
async function handleCouponCode({
  payload,
  code,
  cartID,
  cart,
  customerEmail,
  pluginConfig,
}: {
  payload: any;
  code: string;
  cartID: string;
  cart: any;
  customerEmail?: string;
  pluginConfig: SanitizedCouponPluginOptions;
}) {
  // Find the coupon
  // Find the coupon (Case insensitive check: Exact -> Lower -> Upper)
  let couponQuery = await payload.find({
    collection: pluginConfig.collections.couponsSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  });

  if (!couponQuery.docs.length) {
    couponQuery = await payload.find({
      collection: pluginConfig.collections.couponsSlug,
      where: {
        code: { equals: code.toLowerCase() },
      },
      limit: 1,
    });
  }

  if (!couponQuery.docs.length) {
    couponQuery = await payload.find({
      collection: pluginConfig.collections.couponsSlug,
      where: {
        code: { equals: code.toUpperCase() },
      },
      limit: 1,
    });
  }

  if (!couponQuery.docs.length) {
    return Response.json({ success: false, error: "Invalid coupon code" }, { status: 404 });
  }

  const coupon = couponQuery.docs[0];

  // Check if coupon is active
  const now = new Date();
  const activeFrom = coupon.activeFrom ? new Date(coupon.activeFrom) : null;
  const activeUntil = coupon.activeUntil ? new Date(coupon.activeUntil) : null;

  if (activeFrom && now < activeFrom) {
    return Response.json({ success: false, error: "Coupon is not yet active" }, { status: 400 });
  }

  if (activeUntil && now > activeUntil) {
    return Response.json({ success: false, error: "Coupon has expired" }, { status: 400 });
  }

  // Check usage limits
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return Response.json({ success: false, error: "Coupon usage limit exceeded" }, { status: 400 });
  }

  // Per-customer limit: require customer email and count paid orders with this coupon for this customer
  if (coupon.perCustomerLimit != null && coupon.perCustomerLimit > 0) {
    const email = typeof customerEmail === "string" ? customerEmail.trim() : "";
    if (!email) {
      return Response.json(
        { success: false, error: "Customer email is required for this coupon." },
        { status: 400 },
      );
    }
    const { ordersSlug, orderCustomerEmailField, orderPaymentStatusField, orderPaidStatusValue } =
      pluginConfig.orderIntegration;
    const ordersQuery = await payload.find({
      collection: ordersSlug,
      where: {
        and: [
          { appliedCoupon: { equals: coupon.id } },
          { [orderCustomerEmailField]: { equals: email } },
          { [orderPaymentStatusField]: { equals: orderPaidStatusValue } },
        ],
      },
      limit: 0,
    });
    if (ordersQuery.totalDocs >= coupon.perCustomerLimit) {
      return Response.json(
        { success: false, error: "You have reached the maximum uses for this coupon." },
        { status: 400 },
      );
    }
  }

  // Check if coupon already applied to this cart
  if (cart.appliedCoupon === coupon.id) {
    return Response.json(
      { success: false, error: "Coupon already applied to this cart" },
      { status: 400 },
    );
  }

  // Calculate discount based on cart total
  const cartTotal = cart.subtotal || cart.total || 0;

  // Check minimum order value
  if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${coupon.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    );
  }

  // Check maximum order value
  if (coupon.maxOrderValue && cartTotal > coupon.maxOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Maximum order value of ${coupon.maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
      },
      { status: 400 },
    );
  }

  const discountAmount = calculateCouponDiscount({ coupon, cartTotal });
  const total = roundTo2(Math.max(0, cartTotal - discountAmount));

  // Apply coupon to cart (usage is counted when order is placed via recordCouponUsageForOrder)
  await payload.update({
    collection: "carts",
    id: cartID,
    data: {
      appliedCoupon: coupon.id,
      discountAmount,
      total,
    },
  });

  return Response.json({
    success: true,
    message: "Coupon applied successfully",
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
    },
    discount: discountAmount,
    currency: pluginConfig.defaultCurrency,
    debug: globalDebugLogs,
  });
}

// Handle referral code application
async function handleReferralCode({
  payload,
  code,
  cartID,
  cart,
  customerEmail: _customerEmail,
  pluginConfig,
}: {
  payload: any;
  code: string;
  cartID: string;
  cart: any;
  customerEmail?: string;
  pluginConfig: SanitizedCouponPluginOptions;
}) {
  // Find the referral code
  // Find the referral code (Case insensitive check: Exact -> Lower -> Upper)
  let referralQuery = await payload.find({
    collection: pluginConfig.collections.referralCodesSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
    depth: 1,
  });

  if (!referralQuery.docs.length) {
    referralQuery = await payload.find({
      collection: pluginConfig.collections.referralCodesSlug,
      where: {
        code: { equals: code.toLowerCase() },
      },
      limit: 1,
      depth: 1,
    });
  }

  if (!referralQuery.docs.length) {
    referralQuery = await payload.find({
      collection: pluginConfig.collections.referralCodesSlug,
      where: {
        code: { equals: code.toUpperCase() },
      },
      limit: 1,
      depth: 1,
    });
  }

  if (!referralQuery.docs.length) {
    return Response.json({ success: false, error: "Invalid referral code" }, { status: 404 });
  }

  const referralCode = referralQuery.docs[0];

  // Check if referral code is active
  if (!referralCode.isActive) {
    return Response.json({ success: false, error: "Referral code is not active" }, { status: 400 });
  }

  // Check expiration
  if (referralCode.expiresAt && new Date() > new Date(referralCode.expiresAt)) {
    return Response.json({ success: false, error: "Referral code has expired" }, { status: 400 });
  }

  // Check usage limit
  if (referralCode.usageLimit && referralCode.usageCount >= referralCode.usageLimit) {
    return Response.json(
      { success: false, error: "Referral code usage limit exceeded" },
      { status: 400 },
    );
  }

  // Get the referral program
  const programId =
    typeof referralCode.program === "string" ? referralCode.program : referralCode.program?.id;

  const program = await payload.findByID({
    collection: pluginConfig.collections.referralProgramsSlug,
    id: programId,
  });

  if (!program || !program.isActive) {
    return Response.json(
      { success: false, error: "Referral program is not active" },
      { status: 400 },
    );
  }

  // Check program dates
  const now = new Date();
  if (program.activeFrom && now < new Date(program.activeFrom)) {
    return Response.json(
      { success: false, error: "Referral program is not yet active" },
      { status: 400 },
    );
  }

  if (program.activeUntil && now > new Date(program.activeUntil)) {
    return Response.json(
      { success: false, error: "Referral program has expired" },
      { status: 400 },
    );
  }

  // Check if referral code already applied to this cart
  if (cart.appliedReferralCode === referralCode.id) {
    return Response.json(
      { success: false, error: "Referral code already applied to this cart" },
      { status: 400 },
    );
  }

  // Calculate commission and discount
  const cartTotal = cart.subtotal || cart.total || 0;

  // Check minimum order value
  if (program.minOrderValue && cartTotal < program.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${program.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    );
  }

  // Calculate based on commission rules
  const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
    cartItems: cart.items || [],
    program,
  });

  // Round commission and discount
  const roundedPartnerCommission = roundTo2(partnerCommission);
  const roundedCustomerDiscount = roundTo2(customerDiscount);
  const total = roundTo2(Math.max(0, cartTotal - roundedCustomerDiscount));

  // Apply referral to cart
  await payload.update({
    collection: "carts",
    id: cartID,
    data: {
      appliedReferralCode: referralCode.id,
      partnerCommission: roundedPartnerCommission,
      customerDiscount: roundedCustomerDiscount,
      total,
    },
  });

  return Response.json({
    success: true,
    message: "Referral code applied successfully",
    referralCode: {
      code: referralCode.code,
    },
    partnerCommission: roundedPartnerCommission,
    customerDiscount: roundedCustomerDiscount,
    currency: pluginConfig.defaultCurrency,
    debug: globalDebugLogs,
  });
}

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.applyCoupon,
  method: "post",
  handler: applyCouponHandler({ pluginConfig }),
});
