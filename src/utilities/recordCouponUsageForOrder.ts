import type { Payload } from "payload";

import type { SanitizedCouponPluginOptions } from "../types";

type RelationValue = string | number | { id?: string | number } | null | undefined;

export type OrderWithCouponFields = {
  id?: string | number;
  [key: string]: unknown;
};

export type RecordCouponUsageResult = {
  recordedCoupon: boolean;
  recordedReferral: boolean;
  alreadyRecorded: boolean;
};

const USAGE_MARKER_FIELD = "couponUsageRecordedAt";

function relationId(value: RelationValue): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object" && (typeof value.id === "string" || typeof value.id === "number")) {
    return value.id;
  }
  return null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readField<T = unknown>(doc: unknown, field: string): T | undefined {
  if (!doc || typeof doc !== "object") return undefined;
  return (doc as Record<string, unknown>)[field] as T | undefined;
}

async function markOrderUsageRecorded({
  payload,
  pluginConfig,
  orderID,
}: {
  payload: Payload;
  pluginConfig: SanitizedCouponPluginOptions;
  orderID: string | number;
}): Promise<boolean> {
  const ordersSlug = pluginConfig.integration.collections.ordersSlug;

  const latestOrder = await payload.findByID({
    collection: ordersSlug as any,
    id: orderID,
    depth: 0,
  });

  if (!latestOrder) return false;

  const alreadyRecorded = Boolean(readField(latestOrder, USAGE_MARKER_FIELD));
  if (alreadyRecorded) return false;

  await payload.update({
    collection: ordersSlug as any,
    id: orderID,
    data: {
      [USAGE_MARKER_FIELD]: new Date().toISOString(),
    },
  });

  return true;
}

/**
 * Record coupon and referral usage when an order is placed successfully.
 * This function is idempotent and integration-field aware.
 *
 * Behavior:
 * - Uses configured order field names from `pluginConfig.integration.fields`
 * - Uses configured paid-order resolver (`integration.resolvers.isOrderPaid`)
 * - Marks the order with `couponUsageRecordedAt` before mutating counters to avoid duplicate counting
 * - If marker already exists, returns `alreadyRecorded: true` and performs no increments
 */
export async function recordCouponUsageForOrder(
  payload: Payload,
  order: OrderWithCouponFields,
  pluginConfig: SanitizedCouponPluginOptions,
): Promise<RecordCouponUsageResult> {
  const result: RecordCouponUsageResult = {
    recordedCoupon: false,
    recordedReferral: false,
    alreadyRecorded: false,
  };

  const orderID = order.id;
  if (orderID == null) return result;

  const isPaid = await Promise.resolve(pluginConfig.integration.resolvers.isOrderPaid(order));
  if (!isPaid) return result;

  const policyAllowed = await Promise.resolve(
    pluginConfig.policies.canRecordOrderUsage({
      req: {},
      user: undefined,
      payload,
      order,
    }),
  );

  if (!policyAllowed) return result;

  const acquiredMarker = await markOrderUsageRecorded({
    payload,
    pluginConfig,
    orderID,
  });

  if (!acquiredMarker) {
    result.alreadyRecorded = true;
    return result;
  }

  const fields = pluginConfig.integration.fields;

  const couponField = fields.orderAppliedCouponField;
  const referralField = fields.orderAppliedReferralCodeField;
  const partnerCommissionField = fields.orderPartnerCommissionField;

  const couponId = relationId(readField(order, couponField) as RelationValue);
  const referralCodeId = relationId(readField(order, referralField) as RelationValue);
  const commission = asNumber(readField(order, partnerCommissionField));

  if (couponId) {
    const coupon = await payload.findByID({
      collection: pluginConfig.collections.couponsSlug as any,
      id: couponId,
      depth: 0,
    });

    if (coupon) {
      const currentUsage = asNumber((coupon as Record<string, unknown>).usageCount);
      await payload.update({
        collection: pluginConfig.collections.couponsSlug as any,
        id: couponId,
        data: {
          usageCount: currentUsage + 1,
        },
      });
      result.recordedCoupon = true;
    }
  }

  if (referralCodeId) {
    const referralCode = await payload.findByID({
      collection: pluginConfig.collections.referralCodesSlug as any,
      id: referralCodeId,
      depth: 0,
    });

    if (referralCode) {
      const rc = referralCode as Record<string, unknown>;
      const currentTotal = asNumber(rc.totalEarnings);
      const currentPending = asNumber(rc.pendingEarnings);
      const currentUsage = asNumber(rc.usageCount);
      const currentSuccessful = asNumber(rc.successfulReferralsCount);

      await payload.update({
        collection: pluginConfig.collections.referralCodesSlug as any,
        id: referralCodeId,
        data: {
          usageCount: currentUsage + 1,
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
