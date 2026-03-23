import type { ApplyCouponHook, ApplyCouponResponse, PartnerDashboardData } from '../types'

type EndpointInput =
  | string
  | {
      applyCoupon?: string
      validateCoupon?: string
      partnerStats?: string
      baseURL?: string
    }

const DEFAULT_ENDPOINTS = {
  applyCoupon: '/api/coupons/apply',
  validateCoupon: '/api/coupons/validate',
  partnerStats: '/api/referrals/partner-stats',
} as const

function normalizePath(path: string): string {
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

function withBaseURL(path: string, baseURL?: string): string {
  if (!baseURL) return path
  const trimmedBase = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
  const normalizedPath = normalizePath(path)
  return `${trimmedBase}${normalizedPath}`
}

function resolveEndpoints(input?: EndpointInput) {
  if (typeof input === 'string') {
    return {
      ...DEFAULT_ENDPOINTS,
      partnerStats: input,
    }
  }

  const baseURL = input?.baseURL
  return {
    applyCoupon: withBaseURL(input?.applyCoupon || DEFAULT_ENDPOINTS.applyCoupon, baseURL),
    validateCoupon: withBaseURL(input?.validateCoupon || DEFAULT_ENDPOINTS.validateCoupon, baseURL),
    partnerStats: withBaseURL(input?.partnerStats || DEFAULT_ENDPOINTS.partnerStats, baseURL),
  }
}

/**
 * Apply a coupon/referral code to a cart
 * @param options - Code, cart ID, and optional customerEmail
 * @param endpointConfig - Optional endpoint override config
 */
export async function useCouponCode(
  options: ApplyCouponHook,
  endpointConfig?: EndpointInput,
): Promise<ApplyCouponResponse> {
  const { code, cartID, customerEmail, secret } = options

  if (!code) {
    return {
      success: false,
      message: 'Coupon code is required',
      error: 'Code is missing',
    }
  }

  const endpoints = resolveEndpoints(endpointConfig)

  try {
    const response = await fetch(endpoints.applyCoupon, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        cartID,
        customerEmail,
        ...(typeof secret === 'string' && secret.trim().length > 0
          ? { secret: secret.trim() }
          : {}),
      }),
    })

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      return {
        success: false,
        message: (data.error as string) || 'Failed to apply coupon',
        error: data.error as string,
      }
    }

    const couponData = data.coupon as Record<string, unknown> | undefined
    const referralData = data.referralCode as Record<string, unknown> | undefined

    return {
      success: Boolean(data.success),
      message: (data.message as string) || 'Code applied',
      discount: (data.discount as number) || (data.customerDiscount as number),
      partnerCommission: data.partnerCommission as number,
      customerDiscount: data.customerDiscount as number,

      coupon: couponData
        ? {
            code: (couponData.code as string) || '',
            type: (couponData.type as 'percentage' | 'fixed') || 'percentage',
            value: (couponData.value as number) || 0,
          }
        : undefined,
      referralCode: referralData
        ? {
            code: (referralData.code as string) || '',
          }
        : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, message, error: message }
  }
}

/**
 * Validate a coupon/referral code without applying it
 * @param code - Code to validate
 * @param cartValue - Optional cart value
 * @param cartID - Optional cart ID
 * @param customerEmail - Optional customer email (for per-customer limits)
 * @param endpointConfig - Optional endpoint override config
 */
export async function validateCouponCode(
  code: string,
  cartValue?: number,
  cartID?: string,
  customerEmail?: string,
  endpointConfig?: EndpointInput,
): Promise<ApplyCouponResponse> {
  if (!code) {
    return {
      success: false,
      message: 'Code required',
      error: 'Code missing',
    }
  }

  const endpoints = resolveEndpoints(endpointConfig)

  try {
    const response = await fetch(endpoints.validateCoupon, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartValue, cartID, customerEmail }),
    })

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      return {
        success: false,
        message: (data.error as string) || 'Invalid coupon',
        error: data.error as string,
      }
    }

    const couponData = data.coupon as Record<string, unknown> | undefined
    const referralData = data.referralCode as Record<string, unknown> | undefined

    return {
      success: Boolean(data.success),
      message: (data.message as string) || 'Code is valid',
      coupon: couponData
        ? {
            code: (couponData.code as string) || '',
            type: (couponData.type as 'percentage' | 'fixed') || 'percentage',
            value: (couponData.value as number) || 0,
          }
        : undefined,
      referralCode: referralData
        ? {
            code: (referralData.code as string) || '',
          }
        : undefined,
      discount: data.discount as number,
      partnerCommission: data.partnerCommission as number,
      customerDiscount: data.customerDiscount as number,
      currency: data.currency as string,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, message, error: message }
  }
}

export type PartnerStatsResponse = {
  success: boolean
  data?: PartnerDashboardData
  currency?: string
  error?: string
}

/**
 * Fetch partner dashboard statistics
 * @param endpointConfig - Optional endpoint override config
 */
export async function usePartnerStats(
  endpointConfig?: EndpointInput,
): Promise<PartnerStatsResponse> {
  const endpoints = resolveEndpoints(endpointConfig)

  try {
    const response = await fetch(endpoints.partnerStats, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })

    const data = (await response.json()) as Record<string, unknown>

    if (!response.ok) {
      return {
        success: false,
        error: (data.error as string) || 'Failed to fetch partner stats',
      }
    }

    return {
      success: Boolean(data.success),
      data: data.data as PartnerDashboardData,
      currency: data.currency as string,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { success: false, error: message }
  }
}
