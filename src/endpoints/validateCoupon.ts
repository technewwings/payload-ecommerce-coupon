import { addDataAndFileToRequest, type Endpoint, type PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../utilities/calculateValues'
import { majorToMinor2dp, minorToMajor2dp } from '../utilities/ecommerceMoney'
import { roundTo2 } from '../utilities/roundTo2'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

type RelationValue = string | number | { id?: string | number } | null | undefined

function relationId(value: RelationValue): string | number | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && (typeof value.id === 'string' || typeof value.id === 'number')) {
    return value.id
  }
  return null
}

function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

async function ensureRequestData(req: any): Promise<Record<string, unknown>> {
  if (req?.data && typeof req.data === 'object') return req.data as Record<string, unknown>

  try {
    await addDataAndFileToRequest(req)
  } catch {
    // Fallback for non-standard test/mocked requests where payload parser cannot run.
  }

  if (req?.data && typeof req.data === 'object') return req.data as Record<string, unknown>

  try {
    const parsed = await req?.json?.()
    if (parsed && typeof parsed === 'object') {
      req.data = parsed
      return parsed as Record<string, unknown>
    }
  } catch {
    // Ignore malformed/empty body; validation below will return proper 400 errors.
  }

  req.data = {}
  return req.data
}

async function findByNormalizedCode({
  payload,
  collection,
  normalizedCode,
}: {
  payload: any
  collection: string
  normalizedCode: string
}): Promise<any | null> {
  const normalizedQuery = await payload.find({
    collection,
    where: {
      normalizedCode: { equals: normalizedCode },
    },
    limit: 1,
  })

  if (normalizedQuery?.docs?.length) return normalizedQuery.docs[0]

  const lowerQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode.toLowerCase() },
    },
    limit: 1,
  })

  if (lowerQuery?.docs?.length) return lowerQuery.docs[0]

  const upperQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode.toUpperCase() },
    },
    limit: 1,
  })

  if (upperQuery?.docs?.length) return upperQuery.docs[0]

  const exactQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode },
    },
    limit: 1,
  })

  return exactQuery?.docs?.[0] ?? null
}

export const validateCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const data = await ensureRequestData(req)

    const rawCode = data?.code
    const cartValue = typeof data?.cartValue === 'number' ? data.cartValue : undefined
    const cartIDRaw = data?.cartID
    const cartID =
      typeof cartIDRaw === 'string' || typeof cartIDRaw === 'number' ? cartIDRaw : undefined
    const customerEmail = typeof data?.customerEmail === 'string' ? data.customerEmail : undefined

    const normalizedCode = normalizeCode(rawCode)

    if (!normalizedCode) {
      return Response.json(
        {
          success: false,
          error: 'Code is required',
        },
        { status: 400 },
      )
    }

    try {
      if (pluginConfig.enableReferrals) {
        const canApplyReferral = await Promise.resolve(
          pluginConfig.policies.canApplyReferral({
            req,
            user: req?.user,
            payload,
          }),
        )

        if (!canApplyReferral) {
          return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
        }

        return await validateReferralCode({
          payload,
          normalizedCode,
          cartID,
          pluginConfig,
        })
      }

      const canApplyCoupon = await Promise.resolve(
        pluginConfig.policies.canApplyCoupon({ req, user: req?.user, payload }),
      )

      if (!canApplyCoupon) {
        return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }

      return await validateCouponCode({
        payload,
        normalizedCode,
        cartValue,
        customerEmail,
        pluginConfig,
      })
    } catch (error) {
      console.error('Code validation error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

async function validateCouponCode({
  payload,
  normalizedCode,
  cartValue,
  customerEmail,
  pluginConfig,
}: {
  payload: any
  normalizedCode: string
  cartValue?: number
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  const fields = pluginConfig.integration.fields
  const cartMinor = pluginConfig.integration?.cartAmountsInMinorUnits === true
  const couponData = await findByNormalizedCode({
    payload,
    collection: pluginConfig.collections.couponsSlug,
    normalizedCode,
  })

  if (!couponData) {
    return Response.json({ success: false, error: 'Invalid coupon code' }, { status: 404 })
  }

  const now = new Date()
  const activeFrom = couponData.activeFrom ? new Date(couponData.activeFrom) : null
  const activeUntil = couponData.activeUntil ? new Date(couponData.activeUntil) : null

  if (activeFrom && now < activeFrom) {
    return Response.json({ success: false, error: 'Coupon is not yet active' }, { status: 400 })
  }

  if (activeUntil && now > activeUntil) {
    return Response.json({ success: false, error: 'Coupon has expired' }, { status: 400 })
  }

  if (couponData.usageLimit && couponData.usageCount >= couponData.usageLimit) {
    return Response.json({ success: false, error: 'Coupon usage limit exceeded' }, { status: 400 })
  }

  if (
    couponData.perCustomerLimit != null &&
    couponData.perCustomerLimit > 0 &&
    typeof customerEmail === 'string' &&
    customerEmail.trim().length > 0
  ) {
    const email = customerEmail.trim()
    const ordersQuery = await payload.find({
      collection: pluginConfig.orderIntegration.ordersSlug,
      where: {
        and: [
          { [fields.orderAppliedCouponField]: { equals: couponData.id } },
          {
            [pluginConfig.orderIntegration.orderCustomerEmailField]: {
              equals: email,
            },
          },
          {
            [pluginConfig.orderIntegration.orderPaymentStatusField]: {
              equals: pluginConfig.orderIntegration.orderPaidStatusValue,
            },
          },
        ],
      },
      limit: 0,
    })

    if (ordersQuery.totalDocs >= couponData.perCustomerLimit) {
      return Response.json(
        {
          success: false,
          error: 'You have reached the maximum uses for this coupon.',
        },
        { status: 400 },
      )
    }
  }

  // cartValue is the caller-supplied cart subtotal (pre-discount baseline).
  // Using the subtotal ensures min/max checks and discount calculations are
  // always based on the original item total, not a post-discount total.
  if (cartValue !== undefined) {
    const minOrderValue = couponData.minOrderValue
    const maxOrderValue = couponData.maxOrderValue
    const cartValueMajor = cartMinor ? minorToMajor2dp(cartValue) : cartValue

    if (minOrderValue && cartValueMajor < minOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Minimum order value of ${minOrderValue} ${pluginConfig.defaultCurrency} required`,
        },
        { status: 400 },
      )
    }

    if (maxOrderValue && cartValueMajor > maxOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Maximum order value of ${maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
        },
        { status: 400 },
      )
    }
  }

  let discount = 0
  if (cartValue !== undefined) {
    const cartValueMajor = cartMinor ? minorToMajor2dp(cartValue) : cartValue
    const discountMajor = calculateCouponDiscount({
      coupon: couponData,
      cartTotal: cartValueMajor,
    })
    discount = cartMinor ? majorToMinor2dp(discountMajor) : discountMajor
  }

  return Response.json({
    success: true,
    coupon: {
      code: couponData.code,
      type: couponData.type,
      value: couponData.value,
      description: couponData.description,
    },
    discount,
    currency: pluginConfig.defaultCurrency,
  })
}

async function validateReferralCode({
  payload,
  normalizedCode,
  cartID,
  pluginConfig,
}: {
  payload: any
  normalizedCode: string
  cartID?: string | number
  pluginConfig: SanitizedCouponPluginOptions
}) {
  const collections = pluginConfig.integration.collections
  const resolvers = pluginConfig.integration.resolvers
  const cartMinor = pluginConfig.integration?.cartAmountsInMinorUnits === true

  const referralData = await findByNormalizedCode({
    payload,
    collection: pluginConfig.collections.referralCodesSlug,
    normalizedCode,
  })

  if (!referralData) {
    return Response.json({ success: false, error: 'Referral code not found' }, { status: 404 })
  }

  if (!referralData.isActive) {
    return Response.json({ success: false, error: 'Referral code is not active' }, { status: 400 })
  }

  if (referralData.expiresAt && new Date() > new Date(referralData.expiresAt)) {
    return Response.json({ success: false, error: 'Referral code has expired' }, { status: 400 })
  }

  if (referralData.usageLimit && referralData.usageCount >= referralData.usageLimit) {
    return Response.json(
      { success: false, error: 'Referral code usage limit exceeded' },
      { status: 400 },
    )
  }

  const programId = relationId(referralData.program as RelationValue)
  if (programId == null) {
    return Response.json({ success: false, error: 'Referral program not found' }, { status: 404 })
  }

  const program = await payload.findByID({
    collection: pluginConfig.collections.referralProgramsSlug,
    id: programId,
  })

  if (!program || !program.isActive) {
    return Response.json(
      { success: false, error: 'Referral program is not active' },
      { status: 400 },
    )
  }

  const cart = cartID
    ? await payload.findByID({
        collection: collections.cartsSlug,
        id: cartID,
        depth: 2,
      })
    : null

  // Use cartSubtotal (pre-discount baseline) for min-order enforcement and
  // commission calculations, consistent with applyCoupon and recalculateCart.
  const cartSubtotal = cart
    ? Number(resolvers.getCartSubtotal(cart)) || Number(resolvers.getCartTotal(cart)) || 0
    : 0
  const cartTotalMajor = cartMinor ? minorToMajor2dp(cartSubtotal) : cartSubtotal

  const minOrderAmount = getProgramMinimumOrderAmount({
    program,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
  })

  if (typeof minOrderAmount === 'number' && cartTotalMajor < minOrderAmount) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${minOrderAmount} ${pluginConfig.defaultCurrency} required for this referral program`,
      },
      { status: 400 },
    )
  }

  const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
    cartItems: cart ? resolvers.getCartItems(cart) : [],
    program,
    currencyCode: pluginConfig.defaultCurrency,
    cartTotal: cartSubtotal,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
    cartAmountsInMinorUnits: cartMinor,
  })

  const cappedCustomerDiscount =
    cartSubtotal > 0 ? Math.min(customerDiscount, cartSubtotal) : customerDiscount
  const roundedPartnerCommission = roundTo2(partnerCommission)
  const roundedCustomerDiscount = roundTo2(cappedCustomerDiscount)
  const displayDiscount = cartMinor
    ? minorToMajor2dp(roundedCustomerDiscount)
    : roundedCustomerDiscount

  return Response.json({
    success: true,
    referralCode: {
      code: referralData.code,
      description: `Get ${displayDiscount.toFixed(2)} discount with this referral code`,
    },
    partnerCommission: roundedPartnerCommission,
    customerDiscount: roundedCustomerDiscount,
    currency: pluginConfig.defaultCurrency,
  })
}

export const validateCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.validateCoupon,
  method: 'post',
  handler: validateCouponHandler({ pluginConfig }),
})
