import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'
import { roundTo2 } from '../utilities/roundTo2'

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
  customerEmail,
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

  // Per-customer limit: require customer email and count paid orders with this coupon for this customer
  if (coupon.perCustomerLimit != null && coupon.perCustomerLimit > 0) {
    const email = typeof customerEmail === 'string' ? customerEmail.trim() : ''
    if (!email) {
      return Response.json(
        { success: false, error: 'Customer email is required for this coupon.' },
        { status: 400 },
      )
    }
    const { ordersSlug, orderCustomerEmailField, orderPaymentStatusField, orderPaidStatusValue } =
      pluginConfig.orderIntegration
    const ordersQuery = await payload.find({
      collection: ordersSlug,
      where: {
        and: [
          { appliedCoupon: { equals: coupon.id } },
          { [orderCustomerEmailField]: { equals: email } },
          { [orderPaymentStatusField]: { equals: orderPaidStatusValue } },
        ],
      },
      limit: 0,
    })
    if (ordersQuery.totalDocs >= coupon.perCustomerLimit) {
      return Response.json(
        { success: false, error: 'You have reached the maximum uses for this coupon.' },
        { status: 400 },
      )
    }
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
    discount = roundTo2((cartTotal * coupon.value) / 100)
    // Apply max discount cap if set
    if (coupon.maxDiscountAmount != null && discount > coupon.maxDiscountAmount) {
      discount = roundTo2(coupon.maxDiscountAmount)
    }
  } else if (coupon.type === 'fixed') {
    discount = roundTo2(coupon.value)
    // Ensure discount doesn't exceed cart total
    if (discount > cartTotal) {
      discount = roundTo2(cartTotal)
    }
  }

  const discountAmount = roundTo2(discount)
  const total = roundTo2(Math.max(0, cartTotal - discountAmount))

  // Apply coupon to cart (usage is counted when order is placed via recordCouponUsageForOrder)
  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedCoupon: coupon.id,
      discountAmount,
      total,
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
    discount: discountAmount,
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

  const roundedPartnerCommission = roundTo2(partnerCommission)
  const roundedCustomerDiscount = roundTo2(customerDiscount)
  const total = roundTo2(Math.max(0, cartTotal - roundedCustomerDiscount))

  // Apply referral to cart (usage and partner earnings are recorded when order is placed via recordCouponUsageForOrder)
  await payload.update({
    collection: 'carts',
    id: cartID,
    data: {
      appliedReferralCode: referralCode.id,
      partnerCommission: roundedPartnerCommission,
      customerDiscount: roundedCustomerDiscount,
      total,
    },
  })

  return Response.json({
    success: true,
    message: 'Referral code applied successfully',
    referralCode: {
      code: referralCode.code,
    },
    partnerCommission: roundedPartnerCommission,
    customerDiscount: roundedCustomerDiscount,
    currency: pluginConfig.defaultCurrency,
  })
}

// Calculate commission and discount from program commission rules (each rule has referrerReward + refereeReward)
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
  const rules = program.commissionRules || []

  if (rules.length === 0) {
    return { partnerCommission: 0, customerDiscount: 0 }
  }

  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0

  for (const item of cartItems) {
    const rule = findApplicableCommissionRule(rules, item)
    if (!rule) continue

    const itemPrice = item.price ?? item.unitPrice ?? 0
    const quantity = item.quantity ?? 1
    const itemTotal = itemPrice * quantity

    let itemPartner = 0
    let itemCustomer = 0

    // Shared Basis Calculation
    if (rule.basis === 'shared') {
      if (!rule.totalCommission || rule.referrerSplit == null || rule.refereeSplit == null) continue

      let totalPot = 0
      if (rule.totalCommission.type === 'percentage') {
        totalPot = (itemTotal * rule.totalCommission.value) / 100
      } else {
        totalPot = rule.totalCommission.value * quantity
      }

      if (rule.totalCommission.maxAmount != null && totalPot > rule.totalCommission.maxAmount) {
        totalPot = rule.totalCommission.maxAmount
      }

      itemPartner = (totalPot * rule.referrerSplit) / 100
      itemCustomer = (totalPot * rule.refereeSplit) / 100
    }
    // Direct Basis Calculation (Legacy)
    else {
      if (!rule.referrerReward || !rule.refereeReward) continue

      // Partner commission from this rule's referrerReward
      if (rule.referrerReward.type === 'percentage') {
        itemPartner = (itemTotal * rule.referrerReward.value) / 100
      } else {
        itemPartner = rule.referrerReward.value * quantity
      }
      if (rule.referrerReward.maxReward != null && itemPartner > rule.referrerReward.maxReward) {
        itemPartner = rule.referrerReward.maxReward
      }

      // Customer discount from this rule's refereeReward
      if (rule.refereeReward.type === 'percentage') {
        itemCustomer = (itemTotal * rule.refereeReward.value) / 100
      } else {
        itemCustomer = rule.refereeReward.value * quantity
      }
      if (rule.refereeReward.maxReward != null && itemCustomer > rule.refereeReward.maxReward) {
        itemCustomer = rule.refereeReward.maxReward
      }
    }

    totalPartnerCommission += itemPartner
    totalCustomerDiscount += itemCustomer
  }

  if (totalCustomerDiscount > cartTotal) {
    totalCustomerDiscount = cartTotal
  }

  return { partnerCommission: totalPartnerCommission, customerDiscount: totalCustomerDiscount }
}

function findApplicableCommissionRule(rules: any[], item: any) {
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

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.applyCoupon,
  method: 'post',
  handler: applyCouponHandler({ pluginConfig }),
})
