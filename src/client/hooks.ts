import type { ApplyCouponHook, ApplyCouponResponse } from '../types'

/**
 * Apply a coupon code to a cart
 * @param options - Coupon code, cart ID, and customer email
 * @returns Response with success status, discount amount, and coupon details
 */
export async function useCouponCode(options: ApplyCouponHook): Promise<ApplyCouponResponse> {
  const { code, cartID, customerEmail } = options

  if (!code) {
    return {
      success: false,
      message: 'Coupon code is required',
      error: 'Code is missing',
    }
  }

  try {
    const response = await fetch('/api/ecommerce/coupons/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartID, customerEmail }),
    })

    const data: any = await response.json()

    if (!response.ok) {
      return {
        success: false,
        message: data.error || 'Failed to apply coupon',
        error: data.error,
      }
    }

    return {
      success: data.success,
      message: data.message,
      discount: data.discount,
      coupon: data.coupon,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, message, error: message }
  }
}

/**
 * Validate a coupon code without applying it
 * @param code - Coupon code to validate
 * @param cartValue - Optional cart value in smallest currency unit
 * @returns Response with validation result and coupon details
 */
export async function validateCouponCode(
  code: string,
  cartValue?: number,
): Promise<ApplyCouponResponse> {
  if (!code) {
    return {
      success: false,
      message: 'Code required',
      error: 'Code missing',
    }
  }

  try {
    const response = await fetch('/api/ecommerce/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartValue }),
    })

    const data: any = await response.json()

    if (!response.ok) {
      return {
        success: false,
        message: data.error || 'Invalid coupon',
        error: data.error,
      }
    }

    return {
      success: data.success,
      message: data.message,
      coupon: data.coupon,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, message, error: message }
  }
}
