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

  // Calculate potential discount and commission preview
  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0

  if (cartID) {
    // Get cart items for accurate calculation
    const cart = await payload.findByID({
      collection: 'carts',
      id: cartID,
    })

    if (cart && cart.items) {
      for (const item of cart.items) {
        const product = await payload.findByID({
          collection: 'products',
          id: item.product,
        })

        if (!product) continue

        const applicableRule = findApplicableCommissionRule(program.commissionRules || [], product)

        if (applicableRule) {
          const itemPrice = item.price || product.price || 0
          const quantity = item.quantity || 1

          let itemCommission = 0
          if (applicableRule.totalCommission.type === 'percentage') {
            itemCommission = (itemPrice * applicableRule.totalCommission.value) / 100
          } else {
            itemCommission = applicableRule.totalCommission.value
          }
          itemCommission *= quantity

          const partnerShare = (itemCommission * applicableRule.split.partnerPercentage) / 100
          const customerShare = (itemCommission * applicableRule.split.customerPercentage) / 100

          totalPartnerCommission += partnerShare
          totalCustomerDiscount += customerShare
        }
      }
    }
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

export const validateCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.validateCoupon,
  method: 'post',
  handler: validateCouponHandler({ pluginConfig }),
})
