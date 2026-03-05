import type { Payload } from "payload";

import type { SanitizedCouponPluginOptions } from "../types";

export type OrderWithCouponFields = {
  id?: string;
  appliedCoupon?: string | { id: string };
  appliedReferralCode?: string | { id: string };
  partnerCommission?: number;
  customerDiscount?: number;
  discountAmount?: number;
};

export type RecordCouponUsageResult = {
  recordedCoupon: boolean;
  recordedReferral: boolean;
};

/**
 * Record coupon and referral usage when an order is placed successfully.
 * Call this once when the order is created/paid (e.g. from Orders collection afterChange hook).
 *
 * - Coupon: increments the coupon's usageCount.
 * - Referral: increments the referral code's usageCount and successfulReferralsCount,
 *   and adds order.partnerCommission to totalEarnings and pendingEarnings (partner gets commission;
 *   referee discount is already on the order).
 */
export async function recordCouponUsageForOrder(
  payload: Payload,
  order: OrderWithCouponFields,
  pluginConfig: SanitizedCouponPluginOptions,
): Promise<RecordCouponUsageResult> {
  const result: RecordCouponUsageResult = { recordedCoupon: false, recordedReferral: false };

  const couponId =
    order.appliedCoupon == null
      ? null
      : typeof order.appliedCoupon === "string"
        ? order.appliedCoupon
        : order.appliedCoupon?.id;

  const referralCodeId =
    order.appliedReferralCode == null
      ? null
      : typeof order.appliedReferralCode === "string"
        ? order.appliedReferralCode
        : order.appliedReferralCode?.id;

  if (couponId) {
    const coupon = await payload.findByID({
      collection: pluginConfig.collections.couponsSlug,
      id: couponId,
    });
    if (coupon) {
      await payload.update({
        collection: pluginConfig.collections.couponsSlug,
        id: couponId,
        data: {
          usageCount: (coupon.usageCount ?? 0) + 1,
        },
      });
      result.recordedCoupon = true;
    }
  }

  if (referralCodeId) {
    const referralCode = await payload.findByID({
      collection: pluginConfig.collections.referralCodesSlug,
      id: referralCodeId,
    });
    if (referralCode) {
      const commission = Number(order.partnerCommission) || 0;
      const currentTotal = Number((referralCode as any).totalEarnings) || 0;
      const currentPending = Number((referralCode as any).pendingEarnings) || 0;
      const currentUsageCount = Number((referralCode as any).usageCount) || 0;
      const currentSuccessful = Number((referralCode as any).successfulReferralsCount) || 0;

      await payload.update({
        collection: pluginConfig.collections.referralCodesSlug,
        id: referralCodeId,
        data: {
          usageCount: currentUsageCount + 1,
          successfulReferralsCount: currentSuccessful + 1,
          totalEarnings: currentTotal + commission,
          pendingEarnings: currentPending + commission,
        },
      });
      result.recordedReferral = true;
    }
  }

  return result;
}
