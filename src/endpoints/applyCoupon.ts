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
      // Find the cart first to check for existing codes
      const cartQuery = await payload.findByID({
        collection: 'carts',
        id: cartID,
      })

      if (!cartQuery) {
        return Response.json({ success: false, error: 'Cart not found' }, { status: 404 })
      }

      // Check if single code per cart is enforced
      if (pluginConfig.referralConfig.singleCodePerCart) {
        const hasExistingCoupon = cartQuery.appliedCoupon
        const hasExistingReferral = cartQuery.appliedReferralCode

        if (hasExistingCoupon || hasExistingReferral) {
          return Response.json(
            {
              success: false,
              error:
                'A code has already been applied to this cart. Only one code can be used per order.',
            },
            { status: 400 },
          )
        }
      }

      if (pluginConfig.enableReferrals) {
        // Try referral code first
        const referralResult = await handleReferralCode({
          payload,
          code,
          cartID,
          cart: cartQuery,
          customerEmail,
          pluginConfig,
        })

        // If referral code not found and both systems allowed, try coupon
        if (
          !referralResult.ok &&
          referralResult.status === 404 &&
          pluginConfig.referralConfig.allowBothSystems
        ) {
          return await handleCouponCode({
            payload,
            code,
            cartID,
            cart: cartQuery,
            customerEmail,
            pluginConfig,
          })
        }

        return referralResult
      } else {
        // Coupon mode: handle coupons
        return await handleCouponCode({
          payload,
          code,
          cartID,
          cart: cartQuery,
          customerEmail,
          pluginConfig,
        })
      }
    } catch (error) {
      console.error('Code application error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

// Handle coupon application
async function handleCouponCode({
  payload,
  code,
  cartID,
  cart,
  customerEmail: _customerEmail,
  pluginConfig,
}: {
  payload: any
  code: string
  cartID: string
  cart: any
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

  // Check if coupon already applied to this cart
  if (cart.appliedCoupon === coupon.id) {
    return Response.json(
      { success: false, error: 'Coupon already applied to this cart' },
      { status: 400 },
    )
  }

  // Calculate discount based on cart total
  const cartTotal = cart.subtotal || cart.total || 0

  // Check minimum order value
  if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${coupon.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    )
  }

  // Check maximum order value
  if (coupon.maxOrderValue && cartTotal > coupon.maxOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Maximum order value of ${coupon.maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
      },
      { status: 400 },
    )
  }

  let discount = 0

  if (coupon.type === 'percentage') {
    // Calculate percentage discount
    discount = Math.round((cartTotal * coupon.value) / 100)
    // Apply max discount cap if set
    if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
      discount = coupon.maxDiscountAmount
    }
  } else if (coupon.type === 'fixed') {
    discount = coupon.value
    // Ensure discount doesn't exceed cart total
    if (discount > cartTotal) {
      discount = cartTotal
    }
  }

  // Apply coupon to cart
  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedCoupon: coupon.id,
      discountAmount: discount,
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

// Handle referral code application
async function handleReferralCode({
  payload,
  code,
  cartID,
  cart,
  customerEmail: _customerEmail,
  pluginConfig,
}: {
  payload: any
  code: string
  cartID: string
  cart: any
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
    depth: 1, // Include program data
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
  const programId =
    typeof referralCode.program === 'string' ? referralCode.program : referralCode.program?.id

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

  // Check program dates
  const now = new Date()
  if (program.activeFrom && now < new Date(program.activeFrom)) {
    return Response.json(
      { success: false, error: 'Referral program is not yet active' },
      { status: 400 },
    )
  }

  if (program.activeUntil && now > new Date(program.activeUntil)) {
    return Response.json({ success: false, error: 'Referral program has expired' }, { status: 400 })
  }

  // Check if referral code already applied to this cart
  if (cart.appliedReferralCode === referralCode.id) {
    return Response.json(
      { success: false, error: 'Referral code already applied to this cart' },
      { status: 400 },
    )
  }

  // Calculate commission and discount
  const cartTotal = cart.subtotal || cart.total || 0

  // Check minimum order value
  if (program.minOrderValue && cartTotal < program.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${program.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    )
  }

  // Calculate based on commission rules or default program rewards
  const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
    cart,
    program,
    pluginConfig,
    payload,
  })

  // Apply referral to cart
  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedReferralCode: referralCode.id,
      partnerCommission: Math.round(partnerCommission * 100) / 100,
      customerDiscount: Math.round(customerDiscount * 100) / 100,
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
    partnerCommission: Math.round(partnerCommission * 100) / 100,
    customerDiscount: Math.round(customerDiscount * 100) / 100,
    currency: pluginConfig.defaultCurrency,
  })
}

// Calculate commission and discount based on program configuration
function calculateCommissionAndDiscount({
  cart,
  program,
  pluginConfig: _pluginConfig,
  payload: _payload,
}: {
  cart: any
  program: any
  pluginConfig: SanitizedCouponPluginOptions
  payload: any
}): { partnerCommission: number; customerDiscount: number } {
  const cartTotal = cart.subtotal || cart.total || 0
  const cartItems = cart.items || []

  // If there are commission rules, use item-level calculation
  if (program.commissionRules && program.commissionRules.length > 0) {
    let totalPartnerCommission = 0
    let totalCustomerDiscount = 0

    for (const item of cartItems) {
      const itemPrice = item.price || item.unitPrice || 0
      const quantity = item.quantity || 1
      const itemTotal = itemPrice * quantity

      // Find applicable commission rule
      const applicableRule = findApplicableCommissionRule(program.commissionRules, item)

      if (applicableRule) {
        // Calculate total commission for this item
        let itemCommission = 0
        if (applicableRule.totalCommission?.type === 'percentage') {
          itemCommission = (itemTotal * applicableRule.totalCommission.value) / 100
        } else if (applicableRule.totalCommission?.type === 'fixed') {
          itemCommission = applicableRule.totalCommission.value * quantity
        }

        // Split between partner and customer
        const partnerPercentage = applicableRule.split?.partnerPercentage || 70
        const customerPercentage = applicableRule.split?.customerPercentage || 30

        totalPartnerCommission += (itemCommission * partnerPercentage) / 100
        totalCustomerDiscount += (itemCommission * customerPercentage) / 100
      }
    }

    return {
      partnerCommission: totalPartnerCommission,
      customerDiscount: totalCustomerDiscount,
    }
  }

  // Use default program rewards (referrerReward and refereeReward)
  let partnerCommission = 0
  let customerDiscount = 0

  // Calculate partner commission (referrer reward)
  if (program.referrerReward) {
    if (program.referrerReward.type === 'percentage') {
      partnerCommission = (cartTotal * program.referrerReward.value) / 100
      // Apply max cap if set
      if (
        program.referrerReward.maxReward &&
        partnerCommission > program.referrerReward.maxReward
      ) {
        partnerCommission = program.referrerReward.maxReward
      }
    } else if (program.referrerReward.type === 'fixed') {
      partnerCommission = program.referrerReward.value
    }
  }

  // Calculate customer discount (referee reward)
  if (program.refereeReward) {
    if (program.refereeReward.type === 'percentage') {
      customerDiscount = (cartTotal * program.refereeReward.value) / 100
      // Apply max cap if set
      if (program.refereeReward.maxReward && customerDiscount > program.refereeReward.maxReward) {
        customerDiscount = program.refereeReward.maxReward
      }
    } else if (program.refereeReward.type === 'fixed') {
      customerDiscount = program.refereeReward.value
    }
  }

  // Ensure customer discount doesn't exceed cart total
  if (customerDiscount > cartTotal) {
    customerDiscount = cartTotal
  }

  return { partnerCommission, customerDiscount }
}

// Helper function to find applicable commission rule
function findApplicableCommissionRule(rules: any[], item: any) {
  const productId = typeof item.product === 'string' ? item.product : item.product?.id
  const categoryId = item.category || item.product?.category

  // First try specific product rules
  const productRule = rules.find(
    (rule) =>
      rule.appliesTo === 'products' &&
      rule.products?.some((p: any) => (typeof p === 'string' ? p : p?.id) === productId),
  )
  if (productRule) return productRule

  // Then try category rules
  if (categoryId) {
    const categoryRule = rules.find(
      (rule) =>
        rule.appliesTo === 'categories' &&
        rule.categories?.some((c: any) => (typeof c === 'string' ? c : c?.id) === categoryId),
    )
    if (categoryRule) return categoryRule
  }

  // Finally try "all products" rule
  const allRule = rules.find((rule) => rule.appliesTo === 'all')
  return allRule
}

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.applyCoupon,
  method: 'post',
  handler: applyCouponHandler({ pluginConfig }),
})
