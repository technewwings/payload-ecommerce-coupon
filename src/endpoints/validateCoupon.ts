import type { Endpoint, PayloadHandler } from 'payload'

import type { SanitizedCouponPluginOptions } from '../types'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

export const validateCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const { code, cartValue } = req.data || {}

    if (!code) {
      return Response.json({ success: false, error: 'Coupon code is required' }, { status: 400 })
    }

    try {
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
        return Response.json(
          { success: false, error: 'Coupon usage limit exceeded' },
          { status: 400 },
        )
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
      if (couponData.type === 'percentage') {
        discount = Math.round((cartValue * couponData.value) / 100)
        if (couponData.maxDiscountAmount && discount > couponData.maxDiscountAmount) {
          discount = couponData.maxDiscountAmount
        }
      } else if (couponData.type === 'fixed') {
        discount = couponData.value
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
    } catch (error) {
      console.error('Coupon validation error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

export const validateCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: '/coupons/validate',
  method: 'post',
  handler: validateCouponHandler({ pluginConfig }),
})
