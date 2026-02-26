import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'
import { calculateCommissionAndDiscount } from '../utilities/calculateValues'
import { roundTo2 } from '../utilities/roundTo2'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

export const validateCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const { code: rawCode, cartValue, cartID, customerEmail } = req.data || {}
    const code = typeof rawCode === 'string' ? rawCode.trim() : rawCode

    if (!code) {
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
        // Referral mode: validate referral codes
        return await validateReferralCode({ payload, code, cartID, pluginConfig })
      } else {
        // Coupon mode: validate coupons
        return await validateCouponCode({
          payload,
          code,
          cartValue,
          customerEmail,
          pluginConfig,
        })
      }
    } catch (error) {
      console.error('Code validation error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

// Validate coupon code (existing logic)
async function validateCouponCode({
  payload,
  code,
  cartValue,
  customerEmail,
  pluginConfig,
}: {
  payload: any
  code: string
  cartValue?: number
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  // Find the coupon
  // Find the coupon (Case insensitive check: Exact -> Lower -> Upper)
  let coupon = await payload.find({
    collection: pluginConfig.collections.couponsSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

  if (!coupon.docs.length) {
    coupon = await payload.find({
      collection: pluginConfig.collections.couponsSlug,
      where: {
        code: { equals: code.toLowerCase() },
      },
      limit: 1,
    })
  }

  if (!coupon.docs.length) {
    coupon = await payload.find({
      collection: pluginConfig.collections.couponsSlug,
      where: {
        code: { equals: code.toUpperCase() },
      },
      limit: 1,
    })
  }

  if (!coupon.docs.length) {
    return Response.json({ success: false, error: 'Invalid coupon code' }, { status: 404 })
  }

  const couponData = coupon.docs[0]

  // Check if coupon is active
  const now = new Date()
  const activeFrom = couponData.activeFrom ? new Date(couponData.activeFrom) : null
  const activeUntil = couponData.activeUntil ? new Date(couponData.activeUntil) : null

  if (activeFrom && now < activeFrom) {
    return Response.json({ success: false, error: 'Coupon is not yet active' }, { status: 400 })
  }

  if (activeUntil && now > activeUntil) {
    return Response.json({ success: false, error: 'Coupon has expired' }, { status: 400 })
  }

  // Check usage limits
  if (couponData.usageLimit && couponData.usageCount >= couponData.usageLimit) {
    return Response.json({ success: false, error: 'Coupon usage limit exceeded' }, { status: 400 })
  }

  // Optional: per-customer limit (when customer identifier provided)
  if (
    couponData.perCustomerLimit != null &&
    couponData.perCustomerLimit > 0 &&
    typeof customerEmail === 'string' &&
    customerEmail.trim().length > 0
  ) {
    const email = customerEmail.trim()
    const { ordersSlug, orderCustomerEmailField, orderPaymentStatusField, orderPaidStatusValue } =
      pluginConfig.orderIntegration
    const ordersQuery = await payload.find({
      collection: ordersSlug,
      where: {
        and: [
          { appliedCoupon: { equals: couponData.id } },
          { [orderCustomerEmailField]: { equals: email } },
          { [orderPaymentStatusField]: { equals: orderPaidStatusValue } },
        ],
      },
      limit: 0,
    })
    if (ordersQuery.totalDocs >= couponData.perCustomerLimit) {
      return Response.json(
        { success: false, error: 'You have reached the maximum uses for this coupon.' },
        { status: 400 },
      )
    }
  }

  // Check minimum/maximum order value (top-level fields, same as apply endpoint)
  if (cartValue !== undefined) {
    const minOrderValue = couponData.minOrderValue
    const maxOrderValue = couponData.maxOrderValue

    if (minOrderValue && cartValue < minOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Minimum order value of ${minOrderValue} ${pluginConfig.defaultCurrency} required`,
        },
        { status: 400 },
      )
    }

    if (maxOrderValue && cartValue > maxOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Maximum order value of ${maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
        },
        { status: 400 },
      )
    }
  }

  // Calculate discount preview (2 decimal standard)
  let discount = 0
  if (cartValue !== undefined) {
    if (couponData.type === 'percentage') {
      discount = roundTo2((cartValue * couponData.value) / 100)
      if (couponData.maxDiscountAmount != null && discount > couponData.maxDiscountAmount) {
        discount = roundTo2(couponData.maxDiscountAmount)
      }
    } else if (couponData.type === 'fixed') {
      discount = roundTo2(couponData.value)
      if (discount > cartValue) discount = roundTo2(cartValue)
    }
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

// Validate referral code (new logic)
async function validateReferralCode({
  payload,
  code,
  cartID,
  pluginConfig,
}: {
  payload: any
  code: string
  cartID?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  // Find the referral code
  // Find the referral code (Case insensitive check: Exact -> Lower -> Upper)
  let referral = await payload.find({
    collection: pluginConfig.collections.referralCodesSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

  if (!referral.docs.length) {
    referral = await payload.find({
      collection: pluginConfig.collections.referralCodesSlug,
      where: {
        code: { equals: code.toLowerCase() },
      },
      limit: 1,
    })
  }

  if (!referral.docs.length) {
    referral = await payload.find({
      collection: pluginConfig.collections.referralCodesSlug,
      where: {
        code: { equals: code.toUpperCase() },
      },
      limit: 1,
    })
  }

  if (!referral.docs.length) {
    return Response.json({ success: false, error: 'Referral code not found' }, { status: 404 })
  }

  const referralData = referral.docs[0]

  // Check if referral code is active
  if (!referralData.isActive) {
    return Response.json({ success: false, error: 'Referral code is not active' }, { status: 400 })
  }

  // Check expiration
  if (referralData.expiresAt && new Date() > new Date(referralData.expiresAt)) {
    return Response.json({ success: false, error: 'Referral code has expired' }, { status: 400 })
  }

  // Check usage limit
  if (referralData.usageLimit && referralData.usageCount >= referralData.usageLimit) {
    return Response.json(
      { success: false, error: 'Referral code usage limit exceeded' },
      { status: 400 },
    )
  }

  // Get the referral program
  const programId =
    typeof referralData.program === 'string' ? referralData.program : referralData.program?.id

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
        collection: 'carts',
        id: cartID,
        depth: 2,
      })
    : null

  const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
    cartItems: cart?.items || [],
    program,
    currencyCode: pluginConfig.defaultCurrency,
  })

  const cartTotal = cart ? cart.subtotal || cart.total || 0 : 0
  const cappedCustomerDiscount =
    cartTotal > 0 ? Math.min(customerDiscount, cartTotal) : customerDiscount

  const roundedPartnerCommission = roundTo2(partnerCommission)
  const roundedCustomerDiscount = roundTo2(cappedCustomerDiscount)

  return Response.json({
    success: true,
    referralCode: {
      code: referralData.code,
      description: `Get ${roundedCustomerDiscount.toFixed(2)} discount with this referral code`,
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
