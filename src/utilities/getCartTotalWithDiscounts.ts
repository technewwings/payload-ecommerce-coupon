import { roundTo2 } from "./roundTo2";

export type CartLike = {
  subtotal?: number;
  total?: number;
  discountAmount?: number;
  customerDiscount?: number;
};

/**
 * Computes the cart total after applying plugin discounts.
 * Use this in your host app's cart beforeChange (or wherever you compute total)
 * so the amount always reflects coupon/referral discounts and is not overwritten incorrectly.
 *
 * Formula: subtotal - discountAmount - customerDiscount (each defaulting to 0).
 */
export function getCartTotalWithDiscounts(cart: CartLike): number {
  const subtotal = cart.subtotal ?? cart.total ?? 0;
  const discountAmount = cart.discountAmount ?? 0;
  const customerDiscount = cart.customerDiscount ?? 0;
  return roundTo2(Math.max(0, subtotal - discountAmount - customerDiscount));
}
