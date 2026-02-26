import type { CollectionBeforeChangeHook } from 'payload'
import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
} from '../utilities/calculateValues'
import { getCartItemUnitPrice } from '../utilities/pricing'
import { roundTo2 } from '../utilities/roundTo2'

export const recalculateCartHook =
  (pluginConfig: SanitizedCouponPluginOptions): CollectionBeforeChangeHook =>
  async ({ data, req, originalDoc }) => {
    // If no Payload, can't fetch relations
    if (!req.payload) return data

    // Determine effective state
    // data.items might be replacing or merging. In standard ecommerce, usually it replaces.
    // We need to calculate based on the *final* state of items.
    // If data.items is present, use it. If not, use originalDoc.items.
    const effectiveItems = data.items || originalDoc?.items || []

    console.log('[RecalculateCart] Hook triggered', {
      hasDataItems: !!data.items,
      dataItemsCount: data.items?.length,
      originalItemsCount: originalDoc?.items?.length,
      effectiveItemsCount: effectiveItems.length,
    })

    // If no items, ensure totals are 0
    if (!effectiveItems.length) {
      return {
        ...data,
        partnerCommission: 0,
        customerDiscount: 0,
        discountAmount: 0,
        total: 0,
      }
    }

    // Determine effective codes
    const appliedReferralCode =
      data.appliedReferralCode !== undefined
        ? data.appliedReferralCode
        : originalDoc?.appliedReferralCode
    const appliedCoupon =
      data.appliedCoupon !== undefined ? data.appliedCoupon : originalDoc?.appliedCoupon

    if (!appliedReferralCode && !appliedCoupon) {
      // No codes applied, just return data (cleanup done by other logic if needed, or we explicitly clear?)
      // Use case: user removed code. data.appliedCoupon would be null.
      // If we are just updating items, and code was removed, these should be 0.
      // But if code was removed, data.appliedCoupon is null.
      if (data.appliedReferralCode === null || data.appliedCoupon === null) {
        const fallbackSubtotal =
          typeof data.subtotal === 'number'
            ? data.subtotal
            : typeof originalDoc?.subtotal === 'number'
              ? originalDoc.subtotal
              : undefined

        return {
          ...data,
          partnerCommission: 0,
          customerDiscount: 0,
          discountAmount: 0,
          total: fallbackSubtotal,
        }
      }
      return data
    }

    // We need fully hydrated items to calculate prices
    // Optimized: Only fetch if we really need to recalculate.
    // Standard ecommerce recalculates 'total' and 'subtotal' in its hooks.
    // We need to know the *new* subtotal.
    // Since we don't know the order of hooks, we can't rely on data.subtotal being correct yet if we run before ecommerce.
    // SAFEST: We calculate our own subtotal based on current prices.

    const getRelationID = (value: unknown): number | string | undefined => {
      if (value === null || value === undefined) return undefined
      if (typeof value === 'object') return (value as { id?: number | string }).id
      if (typeof value === 'string' || typeof value === 'number') return value
      return undefined
    }

    const productIds = effectiveItems
      .map((item: any) => getRelationID(item.product))
      .filter((id: any): id is number | string => id !== undefined)

    if (!productIds.length) return data

    // Fetch products to get prices
    const productsQuery = await req.payload.find({
      collection: 'products', // Assumption: standard shops have products
      where: {
        id: { in: productIds },
      },
      limit: productIds.length,
    })

    const productsMap = new Map(productsQuery.docs.map((p) => [String(p.id), p]))

    let calculatedSubtotal = 0
    const enrichedItems = effectiveItems.map((item: any) => {
      const productId = getRelationID(item.product)
      const product: any = productId !== undefined ? productsMap.get(String(productId)) || {} : {}

      // We might need variants logic too, keeping it simple for now based on available info
      // Ideally we should replicate the price finding logic fully.
      // For now, let's map what we have.

      const itemPrice = getCartItemUnitPrice({
        item,
        product,
        variant: typeof item.variant === 'object' ? item.variant : undefined,
        currencyCode: pluginConfig.defaultCurrency,
      })

      calculatedSubtotal += itemPrice * (item.quantity ?? 1)

      console.log('[RecalculateCart] Item processed', {
        productId,
        quantity: item.quantity,
        priceUsed: itemPrice,
        currentSubtotal: calculatedSubtotal,
      })

      return {
        ...item,
        product, // Attach full product for rules
        price: itemPrice, // Normalized price
      }
    })

    // 1. Handle Referral
    if (appliedReferralCode && pluginConfig.enableReferrals) {
      const appliedReferralCodeID = getRelationID(appliedReferralCode)
      if (appliedReferralCodeID === undefined) {
        data.partnerCommission = 0
        data.customerDiscount = 0
        data.total = calculatedSubtotal
        return data
      }

      // Fetch referral code & program
      const referralQuery = await req.payload.find({
        collection: pluginConfig.collections.referralCodesSlug,
        where: {
          id: { equals: appliedReferralCodeID },
        },
        limit: 1,
        depth: 1,
      })

      if (referralQuery.docs.length) {
        const referralCode = referralQuery.docs[0]
        const programId =
          typeof referralCode.program === 'string' ? referralCode.program : referralCode.program?.id
        const program =
          typeof referralCode.program === 'object'
            ? referralCode.program
            : programId
              ? await req.payload.findByID({
                  collection: pluginConfig.collections.referralProgramsSlug,
                  id: programId,
                })
              : null

        if (program) {
          const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
            cartItems: enrichedItems,
            program,
            currencyCode: pluginConfig.defaultCurrency,
          })

          const roundedCustomerDiscount = roundTo2(customerDiscount)
          data.partnerCommission = roundTo2(partnerCommission)
          data.customerDiscount = roundedCustomerDiscount

          // Update total
          // Use calculated subtotal or trust data.subtotal if present?
          // Best to use our calculated subtotal to be safely independent.
          data.total = Math.max(0, calculatedSubtotal - roundedCustomerDiscount)
        } else {
          // If referral code exists but program is unavailable, clear referral discount fields.
          data.partnerCommission = 0
          data.customerDiscount = 0
          data.total = calculatedSubtotal
        }
      }
    }

    // 2. Handle Coupon
    if (appliedCoupon && (!appliedReferralCode || pluginConfig.referralConfig.allowBothSystems)) {
      const appliedCouponID = getRelationID(appliedCoupon)
      if (appliedCouponID === undefined) {
        return data
      }

      const couponQuery = await req.payload.find({
        collection: pluginConfig.collections.couponsSlug,
        where: {
          id: { equals: appliedCouponID },
        },
        limit: 1,
      })

      if (couponQuery.docs.length) {
        const coupon = couponQuery.docs[0]
        const discountAmount = calculateCouponDiscount({
          coupon,
          cartTotal: calculatedSubtotal,
        })

        console.log('[RecalculateCart] Coupon Logic', {
          appliedCoupon,
          couponId: coupon.id,
          cartTotal: calculatedSubtotal,
          discountAmount,
        })

        data.discountAmount = discountAmount

        // If referral also applied, subtract from the already reduced total?
        // Usually discounts stack or are applied to subtotal.
        // Let's assume applied to subtotal for simplicity unless logic dictates otherwise.
        // But wait, referral discount reduces total. Coupon reduces total.
        // Standard approach: Total = Subtotal - ReferralDiscount - CouponDiscount

        const currentDiscount = data.customerDiscount || 0
        data.total = Math.max(0, calculatedSubtotal - currentDiscount - discountAmount)
      }
    }

    return data
  }
