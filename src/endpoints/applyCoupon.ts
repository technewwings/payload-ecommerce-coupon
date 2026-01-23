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
        { success: false, error: 'Coupon code and cart ID are required' },
        { status: 400 },
      )
    }

    try {
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
        return Response.json(
          { success: false, error: 'Coupon usage limit exceeded' },
          { status: 400 },
        )
      }

      // Check per-customer limits if customer email provided
      if (customerEmail && coupon.perCustomerLimit) {
        // This would require tracking per-customer usage
        // For now, we'll skip this check as it requires additional data structure
      }

      // Find the cart
      const cartQuery = await payload.findByID({
        collection: 'carts', // Assuming carts collection exists
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
    } catch (error) {
      console.error('Coupon application error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: '/coupons/apply',
  method: 'post',
  handler: applyCouponHandler({ pluginConfig }),
})
