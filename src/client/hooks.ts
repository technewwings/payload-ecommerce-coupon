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

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      return {
        success: false,
        message: (data.error as string) || 'Failed to apply coupon',
        error: data.error as string,
      }
    }

    return {
      success: data.success as boolean,
      message: data.message as string,
      discount: data.discount as number,
      coupon: data.coupon as Record<string, unknown>,
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

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      return {
        success: false,
        message: (data.error as string) || 'Invalid coupon',
        error: data.error as string,
      }
    }

    return {
      success: data.success as boolean,
      message: data.message as string,
      coupon: data.coupon as Record<string, unknown>,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, message, error: message }
  }
}
