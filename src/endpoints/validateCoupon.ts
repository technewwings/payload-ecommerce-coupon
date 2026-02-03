import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

export const validateCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const { code, cartValue, cartID } = req.data || {}

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
        return await validateCouponCode({ payload, code, cartValue, pluginConfig })
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
  pluginConfig,
}: {
  payload: any
  code: string
  cartValue?: number
  pluginConfig: SanitizedCouponPluginOptions
}) {
  // Find the coupon
  const coupon = await payload.find({
    collection: pluginConfig.collections.couponsSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

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

  // Check conditions
  if (cartValue !== undefined && couponData.conditions) {
    const { minOrderValue, maxOrderValue } = couponData.conditions

    if (minOrderValue && cartValue < minOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Minimum order value of ${minOrderValue} required`,
        },
        { status: 400 },
      )
    }

    if (maxOrderValue && cartValue > maxOrderValue) {
      return Response.json(
        {
          success: false,
          error: `Maximum order value of ${maxOrderValue} exceeded`,
        },
        { status: 400 },
      )
    }
  }

  // Calculate discount preview
  let discount = 0
  if (cartValue !== undefined) {
    if (couponData.type === 'percentage') {
      discount = Math.round((cartValue * couponData.value) / 100)
      if (couponData.maxDiscountAmount && discount > couponData.maxDiscountAmount) {
        discount = couponData.maxDiscountAmount
      }
    } else if (couponData.type === 'fixed') {
      discount = couponData.value
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
  const referral = await payload.find({
    collection: pluginConfig.collections.referralCodesSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

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
  const program = await payload.findByID({
    collection: pluginConfig.collections.referralProgramsSlug,
    id: referralData.program,
  })

  if (!program || !program.isActive) {
    return Response.json(
      { success: false, error: 'Referral program is not active' },
      { status: 400 },
    )
  }

  // Calculate from commission rules (each rule has referrerReward + refereeReward)
  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0
  const rules = (program as any).commissionRules || []

  if (cartID && rules.length > 0) {
    const cart = await payload.findByID({
      collection: 'carts',
      id: cartID,
    })
    const cartTotal = cart ? (cart.subtotal || cart.total || 0) : 0
    const items = cart?.items || []

    for (const item of items) {
      const rule = findApplicableReferralRule(rules, item)
      if (!rule?.referrerReward || !rule?.refereeReward) continue

      const itemPrice = item.price ?? item.unitPrice ?? 0
      const quantity = item.quantity ?? 1
      const itemTotal = itemPrice * quantity

      let itemPartner = 0
      if (rule.referrerReward.type === 'percentage') {
        itemPartner = (itemTotal * rule.referrerReward.value) / 100
      } else {
        itemPartner = rule.referrerReward.value * quantity
      }
      if (rule.referrerReward.maxReward != null && itemPartner > rule.referrerReward.maxReward) {
        itemPartner = rule.referrerReward.maxReward
      }
      totalPartnerCommission += itemPartner

      let itemCustomer = 0
      if (rule.refereeReward.type === 'percentage') {
        itemCustomer = (itemTotal * rule.refereeReward.value) / 100
      } else {
        itemCustomer = rule.refereeReward.value * quantity
      }
      if (rule.refereeReward.maxReward != null && itemCustomer > rule.refereeReward.maxReward) {
        itemCustomer = rule.refereeReward.maxReward
      }
      totalCustomerDiscount += itemCustomer
    }

    if (totalCustomerDiscount > cartTotal) totalCustomerDiscount = cartTotal
  }

  return Response.json({
    success: true,
    referralCode: {
      code: referralData.code,
      description: `Get ${totalCustomerDiscount.toFixed(2)} discount with this referral code`,
    },
    partnerCommission: totalPartnerCommission,
    customerDiscount: totalCustomerDiscount,
    currency: pluginConfig.defaultCurrency,
  })
}

function findApplicableReferralRule(rules: any[], item: any) {
  const productId = typeof item.product === 'string' ? item.product : item.product?.id
  const categoryId = item.category ?? item.product?.category

  const productRule = rules.find(
    (r) =>
      r.appliesTo === 'products' &&
      r.products?.some((p: any) => (typeof p === 'string' ? p : p?.id) === productId),
  )
  if (productRule) return productRule

  if (categoryId) {
    const categoryRule = rules.find(
      (r) =>
        r.appliesTo === 'categories' &&
        r.categories?.some((c: any) => (typeof c === 'string' ? c : c?.id) === categoryId),
    )
    if (categoryRule) return categoryRule
  }

  return rules.find((r) => r.appliesTo === 'all') ?? null
}

export const validateCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.validateCoupon,
  method: 'post',
  handler: validateCouponHandler({ pluginConfig }),
})
