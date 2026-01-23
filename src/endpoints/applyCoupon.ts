import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

export const applyCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const { code, cartID, customerEmail } = req.data || {}

    if (!code || !cartID) {
      return Response.json(
        {
          success: false,
          error: `${pluginConfig.enableReferrals ? 'Referral code' : 'Coupon code'} and cart ID are required`,
        },
        { status: 400 },
      )
    }

    try {
      if (pluginConfig.enableReferrals) {
        // Referral mode: handle referral codes
        return await handleReferralCode({ payload, code, cartID, customerEmail, pluginConfig })
      } else {
        // Coupon mode: handle coupons
        return await handleCouponCode({ payload, code, cartID, customerEmail, pluginConfig })
      }
    } catch (error) {
      console.error('Code application error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

// Handle coupon application (existing logic)
async function handleCouponCode({
  payload,
  code,
  cartID,
  customerEmail: _customerEmail,
  pluginConfig,
}: {
  payload: any
  code: string
  cartID: string
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  // Find the coupon
  const couponQuery = await payload.find({
    collection: pluginConfig.collections.couponsSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

  if (!couponQuery.docs.length) {
    return Response.json({ success: false, error: 'Invalid coupon code' }, { status: 404 })
  }

  const coupon = couponQuery.docs[0]

  // Check if coupon is active
  const now = new Date()
  const activeFrom = coupon.activeFrom ? new Date(coupon.activeFrom) : null
  const activeUntil = coupon.activeUntil ? new Date(coupon.activeUntil) : null

  if (activeFrom && now < activeFrom) {
    return Response.json({ success: false, error: 'Coupon is not yet active' }, { status: 400 })
  }

  if (activeUntil && now > activeUntil) {
    return Response.json({ success: false, error: 'Coupon has expired' }, { status: 400 })
  }

  // Check usage limits
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return Response.json({ success: false, error: 'Coupon usage limit exceeded' }, { status: 400 })
  }

  // Find the cart
  const cartQuery = await payload.findByID({
    collection: 'carts',
    id: cartID,
  })

  if (!cartQuery) {
    return Response.json({ success: false, error: 'Cart not found' }, { status: 404 })
  }

  // Check if coupon already applied to this cart
  const existingCoupon = cartQuery.appliedCoupons?.find(
    (applied: any) => applied.coupon === coupon.id,
  )

  if (existingCoupon) {
    return Response.json(
      { success: false, error: 'Coupon already applied to this cart' },
      { status: 400 },
    )
  }

  // Calculate discount based on cart total
  let discount = 0
  const cartTotal = cartQuery.subtotal || 0

  if (coupon.type === 'percentage') {
    discount = Math.round((cartTotal * coupon.value) / 100)
    if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
      discount = coupon.maxDiscountAmount
    }
  } else if (coupon.type === 'fixed') {
    discount = coupon.value
  }

  // Apply coupon to cart
  const appliedCoupons = cartQuery.appliedCoupons || []
  appliedCoupons.push({
    coupon: coupon.id,
    discountAmount: discount,
  })

  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedCoupons,
    },
  })

  // Increment coupon usage count
  await payload.update({
    collection: pluginConfig.collections.couponsSlug,
    id: coupon.id,
    data: {
      usageCount: (coupon.usageCount || 0) + 1,
    },
  })

  return Response.json({
    success: true,
    message: 'Coupon applied successfully',
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
    },
    discount,
    currency: pluginConfig.defaultCurrency,
  })
}

// Handle referral code application (new logic)
async function handleReferralCode({
  payload,
  code,
  cartID,
  customerEmail: _customerEmail,
  pluginConfig,
}: {
  payload: any
  code: string
  cartID: string
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  // Find the referral code
  const referralQuery = await payload.find({
    collection: pluginConfig.collections.referralCodesSlug,
    where: {
      code: { equals: code },
    },
    limit: 1,
  })

  if (!referralQuery.docs.length) {
    return Response.json({ success: false, error: 'Invalid referral code' }, { status: 404 })
  }

  const referralCode = referralQuery.docs[0]

  // Check if referral code is active
  if (!referralCode.isActive) {
    return Response.json({ success: false, error: 'Referral code is not active' }, { status: 400 })
  }

  // Check expiration
  if (referralCode.expiresAt && new Date() > new Date(referralCode.expiresAt)) {
    return Response.json({ success: false, error: 'Referral code has expired' }, { status: 400 })
  }

  // Check usage limit
  if (referralCode.usageLimit && referralCode.usageCount >= referralCode.usageLimit) {
    return Response.json(
      { success: false, error: 'Referral code usage limit exceeded' },
      { status: 400 },
    )
  }

  // Get the referral program
  const program = await payload.findByID({
    collection: pluginConfig.collections.referralProgramsSlug,
    id: referralCode.program,
  })

  if (!program || !program.isActive) {
    return Response.json(
      { success: false, error: 'Referral program is not active' },
      { status: 400 },
    )
  }

  // Find the cart
  const cartQuery = await payload.findByID({
    collection: 'carts',
    id: cartID,
  })

  if (!cartQuery) {
    return Response.json({ success: false, error: 'Cart not found' }, { status: 404 })
  }

  // Check if referral code already applied to this cart
  const existingReferral = cartQuery.appliedReferrals?.find(
    (applied: any) => applied.referralCode === referralCode.id,
  )

  if (existingReferral) {
    return Response.json(
      { success: false, error: 'Referral code already applied to this cart' },
      { status: 400 },
    )
  }

  // Calculate commission and discount based on cart items and commission rules
  const cartItems = cartQuery.items || []
  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0

  for (const item of cartItems) {
    // Get product details (assuming product relationship exists)
    const product = await payload.findByID({
      collection: 'products', // Assuming products collection
      id: item.product,
    })

    if (!product) continue

    // Find applicable commission rule
    const applicableRule = findApplicableCommissionRule(program.commissionRules || [], product)

    if (applicableRule) {
      const itemPrice = item.price || product.price || 0
      const quantity = item.quantity || 1

      // Calculate total commission for this item
      let itemCommission = 0
      if (applicableRule.totalCommission.type === 'percentage') {
        itemCommission = (itemPrice * applicableRule.totalCommission.value) / 100
      } else {
        itemCommission = applicableRule.totalCommission.value
      }
      itemCommission *= quantity

      // Split between partner and customer
      const partnerShare = (itemCommission * applicableRule.split.partnerPercentage) / 100
      const customerShare = (itemCommission * applicableRule.split.customerPercentage) / 100

      totalPartnerCommission += partnerShare
      totalCustomerDiscount += customerShare
    }
  }

  // Apply referral to cart
  const appliedReferrals = cartQuery.appliedReferrals || []
  appliedReferrals.push({
    referralCode: referralCode.id,
    partnerCommission: Math.round(totalPartnerCommission * 100) / 100, // Round to 2 decimal places
    customerDiscount: Math.round(totalCustomerDiscount * 100) / 100,
  })

  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedReferrals,
    },
  })

  // Increment referral code usage count
  await payload.update({
    collection: pluginConfig.collections.referralCodesSlug,
    id: referralCode.id,
    data: {
      usageCount: (referralCode.usageCount || 0) + 1,
    },
  })

  return Response.json({
    success: true,
    message: 'Referral code applied successfully',
    referralCode: {
      code: referralCode.code,
    },
    partnerCommission: totalPartnerCommission,
    customerDiscount: totalCustomerDiscount,
    currency: pluginConfig.defaultCurrency,
  })
}

// Helper function to find applicable commission rule
function findApplicableCommissionRule(rules: any[], product: any) {
  // First try specific product rules
  const productRule = rules.find(
    (rule) => rule.appliesTo === 'products' && rule.products?.includes(product.id),
  )
  if (productRule) return productRule

  // Then try category rules
  const categoryRule = rules.find(
    (rule) =>
      rule.appliesTo === 'categories' &&
      product.category &&
      rule.categories?.includes(product.category),
  )
  if (categoryRule) return categoryRule

  // Finally try "all products" rule
  const allRule = rules.find((rule) => rule.appliesTo === 'all')
  return allRule
}

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.applyCoupon,
  method: 'post',
  handler: applyCouponHandler({ pluginConfig }),
})
