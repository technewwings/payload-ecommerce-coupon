import type { CollectionBeforeChangeHook } from 'payload'
import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../utilities/calculateValues'
import { logCouponCartDebug, logRecalculateCartCouponSnapshot } from '../utilities/couponDebug'
import { majorToMinor2dp, minorToMajor2dp } from '../utilities/ecommerceMoney'
import { roundTo2 } from '../utilities/roundTo2'
import {
  type SkipRecalculateContext,
  SKIP_COUPON_RECALCULATE_CONTEXT_KEY,
} from '../utilities/applyCouponContext'
import { type RelationValue, relationId } from '../utilities/relationId'

function readField<T = unknown>(doc: unknown, field: string): T | undefined {
  if (!doc || typeof doc !== 'object') return undefined
  return (doc as Record<string, unknown>)[field] as T | undefined
}

/**
 * Prefer incoming patch when that field is present on `data`; otherwise use `originalDoc`.
 * If the key exists but the value is `undefined` (common with merged Payload update objects),
 * treat it like a missing patch and fall back to `originalDoc`.
 * Explicit `null` still means "clear relation".
 */
function effectiveRelationField(
  mutableData: Record<string, unknown>,
  original: Record<string, unknown>,
  fieldName: string,
): RelationValue | undefined {
  if (Object.prototype.hasOwnProperty.call(mutableData, fieldName)) {
    const v = readField<RelationValue>(mutableData, fieldName)
    if (v === undefined) {
      return readField<RelationValue>(original, fieldName)
    }
    return v
  }
  return readField<RelationValue>(original, fieldName)
}

function writeField(doc: Record<string, unknown>, field: string, value: unknown): void {
  doc[field] = value
}

function clearCouponFields(
  target: Record<string, unknown>,
  fields: SanitizedCouponPluginOptions['integration']['fields'],
): void {
  writeField(target, fields.cartAppliedCouponField, null)
  writeField(target, fields.cartDiscountAmountField, 0)
}

function clearReferralFields(
  target: Record<string, unknown>,
  fields: SanitizedCouponPluginOptions['integration']['fields'],
): void {
  writeField(target, fields.cartAppliedReferralCodeField, null)
  writeField(target, fields.cartPartnerCommissionField, 0)
  writeField(target, fields.cartCustomerDiscountField, 0)
}

export const recalculateCartHook =
  (pluginConfig: SanitizedCouponPluginOptions): CollectionBeforeChangeHook =>
  async ({ data, req, originalDoc }) => {
    if (!req.payload) return data

    // The apply-coupon/referral endpoint pre-computes all discount and total values
    // before calling payload.update. Trust those values and skip recalculation to
    // avoid Payload's beforeChange merge quirks overwriting the correct numbers.
    //
    // Payload strips relationship field IDs during its internal beforeChange merge,
    // so we also restore the applied coupon/referral ID from context before returning,
    // ensuring the correct ID is actually persisted to the database.
    const skipCtx = (req as { context?: Record<string, unknown> })?.context?.[
      SKIP_COUPON_RECALCULATE_CONTEXT_KEY
    ]
    if (skipCtx != null) {
      const mutableData = (data || {}) as Record<string, unknown>
      if (typeof skipCtx === 'object') {
        const { couponId, referralId } = skipCtx as SkipRecalculateContext
        const f = pluginConfig.integration?.fields
        const couponField = f?.cartAppliedCouponField ?? 'appliedCoupon'
        const referralField = f?.cartAppliedReferralCodeField ?? 'appliedReferralCode'
        if (couponId != null) mutableData[couponField] = couponId
        if (referralId != null) mutableData[referralField] = referralId
        logCouponCartDebug(
          'recalculateCart: skip flag active — passing through and restoring IDs',
          { couponId: couponId ?? null, referralId: referralId ?? null },
          req as any,
        )
      }
      return mutableData
    }

    const cartMinor = pluginConfig.integration?.cartAmountsInMinorUnits === true
    const integration = pluginConfig.integration || ({} as any)
    const collections = integration.collections || {
      cartsSlug: 'carts',
      ordersSlug: 'orders',
      productsSlug: 'products',
      usersSlug: 'users',
      categoriesSlug: 'categories',
      tagsSlug: 'tags',
    }
    const fields = integration.fields || {
      cartItemsField: 'items',
      cartSubtotalField: 'subtotal',
      cartTotalField: 'total',
      cartAppliedCouponField: 'appliedCoupon',
      cartAppliedReferralCodeField: 'appliedReferralCode',
      cartDiscountAmountField: 'discountAmount',
      cartCustomerDiscountField: 'customerDiscount',
      cartPartnerCommissionField: 'partnerCommission',
      orderAppliedCouponField: 'appliedCoupon',
      orderAppliedReferralCodeField: 'appliedReferralCode',
      orderDiscountAmountField: 'discountAmount',
      orderCustomerDiscountField: 'customerDiscount',
      orderPartnerCommissionField: 'partnerCommission',
      orderCustomerEmailField: 'customerEmail',
      orderPaymentStatusField: 'paymentStatus',
      orderCreatedAtField: 'createdAt',
      productPriceField: 'price',
      productCurrencyCodeField: 'currencyCode',
    }
    const resolvers = integration.resolvers || {
      getUserID: ({ user }: { user?: unknown }) => {
        if (!user || typeof user !== 'object') return null
        const id = (user as Record<string, unknown>).id
        if (typeof id === 'string' || typeof id === 'number') return id
        return null
      },
      getCartItems: (cart: unknown) => {
        if (!cart || typeof cart !== 'object') return []
        const value = (cart as Record<string, unknown>)[fields.cartItemsField]
        return Array.isArray(value) ? value : []
      },
      getCartSubtotal: (cart: unknown) => {
        if (!cart || typeof cart !== 'object') return 0
        const value = (cart as Record<string, unknown>)[fields.cartSubtotalField]
        return typeof value === 'number' ? value : 0
      },
      getCartTotal: (cart: unknown) => {
        if (!cart || typeof cart !== 'object') return 0
        const value = (cart as Record<string, unknown>)[fields.cartTotalField]
        return typeof value === 'number' ? value : 0
      },
      isOrderPaid: (_order: unknown) => false,
      getProductUnitPrice: ({ item, product, variant, currencyCode }: any) => {
        if (item && typeof item === 'object') {
          const itemPrice = (item as Record<string, unknown>).price
          if (typeof itemPrice === 'number') return itemPrice
          const unitPrice = (item as Record<string, unknown>).unitPrice
          if (typeof unitPrice === 'number') return unitPrice
        }

        const readPrice = (entity: unknown, code?: string) => {
          if (!entity || typeof entity !== 'object') return undefined
          const map = entity as Record<string, unknown>
          if (code && typeof code === 'string') {
            const key = `priceIn${code.toUpperCase()}`
            const value = map[key]
            if (typeof value === 'number') return value
          }
          const base = map.price
          return typeof base === 'number' ? base : undefined
        }

        return readPrice(variant, currencyCode) ?? readPrice(product, currencyCode) ?? 0
      },
    }

    const mutableData = (data || {}) as Record<string, unknown>
    const original = (originalDoc || {}) as Record<string, unknown>

    const rawCurrency =
      readField<string>(mutableData, 'currency') ?? readField<string>(original, 'currency')
    const cartCurrency =
      typeof rawCurrency === 'string' && rawCurrency.trim().length > 0
        ? rawCurrency.trim()
        : pluginConfig.defaultCurrency

    const effectiveItems =
      readField<any[]>(mutableData, fields.cartItemsField) ??
      readField<any[]>(original, fields.cartItemsField) ??
      []

    const effectiveAppliedReferral = effectiveRelationField(
      mutableData,
      original,
      fields.cartAppliedReferralCodeField,
    )

    const effectiveAppliedCoupon = effectiveRelationField(
      mutableData,
      original,
      fields.cartAppliedCouponField,
    )

    const appliedCouponID = relationId(effectiveAppliedCoupon as RelationValue)
    logRecalculateCartCouponSnapshot(
      {
        cartAppliedCouponField: fields.cartAppliedCouponField,
        mutableData,
        original,
        effectiveAppliedCoupon,
        appliedCouponID,
      },
      req as any,
    )

    if (!Array.isArray(effectiveItems) || effectiveItems.length === 0) {
      clearReferralFields(mutableData, fields)
      clearCouponFields(mutableData, fields)
      writeField(mutableData, fields.cartTotalField, 0)
      return mutableData
    }

    const getRelationID = (value: unknown): string | number | null =>
      relationId(value as RelationValue)

    const productIds = effectiveItems
      .map((item: any) => getRelationID(item?.product))
      .filter((id: string | number | null): id is string | number => id != null)

    let productsMap = new Map<string, any>()
    if (productIds.length > 0) {
      const productsQuery = await req.payload.find({
        collection: collections.productsSlug,
        where: {
          id: { in: productIds },
        },
        limit: productIds.length,
      })
      productsMap = new Map((productsQuery?.docs || []).map((p: any) => [String(p.id), p]))
    }

    let calculatedSubtotal = 0
    const enrichedItems = effectiveItems.map((item: any) => {
      const pid = getRelationID(item?.product)
      const product = pid != null ? productsMap.get(String(pid)) || {} : {}
      const variant = typeof item?.variant === 'object' ? item.variant : undefined

      const unitPrice = Number(
        resolvers.getProductUnitPrice({
          item,
          product,
          variant,
          currencyCode: cartCurrency,
        }),
      )

      const quantity =
        typeof item?.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 1
      const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
      calculatedSubtotal += safeUnitPrice * quantity

      return {
        ...item,
        product,
        price: safeUnitPrice,
        quantity,
      }
    })

    const subtotalMajor = cartMinor ? minorToMajor2dp(calculatedSubtotal) : calculatedSubtotal

    writeField(
      mutableData,
      fields.cartSubtotalField,
      cartMinor ? Math.round(calculatedSubtotal) : roundTo2(calculatedSubtotal),
    )

    let customerDiscount = 0
    let couponDiscount = 0

    const appliedReferralID = relationId(effectiveAppliedReferral)
    if (pluginConfig.enableReferrals && appliedReferralID != null) {
      const referralQuery = await req.payload.find({
        collection: pluginConfig.collections.referralCodesSlug,
        where: { id: { equals: appliedReferralID } },
        limit: 1,
        depth: 1,
      })

      const referralCode = referralQuery?.docs?.[0]
      if (!referralCode || referralCode.isActive === false) {
        clearReferralFields(mutableData, fields)
      } else {
        const programId = relationId(referralCode.program as RelationValue)
        const program =
          typeof referralCode.program === 'object'
            ? referralCode.program
            : programId != null
              ? await req.payload.findByID({
                  collection: pluginConfig.collections.referralProgramsSlug,
                  id: programId,
                })
              : null

        if (!program || program.isActive === false) {
          clearReferralFields(mutableData, fields)
        } else {
          const minOrderAmount = getProgramMinimumOrderAmount({
            program,
            allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
          })

          if (typeof minOrderAmount === 'number' && subtotalMajor < minOrderAmount) {
            clearReferralFields(mutableData, fields)
          } else {
            const result = calculateCommissionAndDiscount({
              cartItems: enrichedItems,
              program,
              currencyCode: cartCurrency,
              cartTotal: calculatedSubtotal,
              allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
              cartAmountsInMinorUnits: cartMinor,
            })

            const roundedPartnerCommission = roundTo2(result.partnerCommission)
            const roundedCustomerDiscount = roundTo2(Math.max(0, result.customerDiscount))

            writeField(mutableData, fields.cartPartnerCommissionField, roundedPartnerCommission)
            writeField(mutableData, fields.cartCustomerDiscountField, roundedCustomerDiscount)
            customerDiscount = roundedCustomerDiscount
          }
        }
      }
    } else {
      if (readField(mutableData, fields.cartAppliedReferralCodeField) === null) {
        clearReferralFields(mutableData, fields)
      }
    }

    const referralOnCart = appliedReferralID != null
    const canUseCouponWithReferral =
      !pluginConfig.enableReferrals ||
      pluginConfig.referralConfig.allowBothSystems ||
      !referralOnCart

    if (appliedCouponID != null && !canUseCouponWithReferral) {
      clearCouponFields(mutableData, fields)
      couponDiscount = 0
      logCouponCartDebug(
        'recalculateCart: cleared coupon (referral on cart with allowBothSystems=false)',
        {
          cartCurrency,
          cartMinor,
          calculatedSubtotal,
          subtotalMajor,
          appliedCouponID,
          referralOnCart,
        },
        req as any,
      )
    } else if (appliedCouponID != null && canUseCouponWithReferral) {
      const couponQuery = await req.payload.find({
        collection: pluginConfig.collections.couponsSlug,
        where: { id: { equals: appliedCouponID } },
        limit: 1,
      })

      const coupon = couponQuery?.docs?.[0]
      if (!coupon) {
        clearCouponFields(mutableData, fields)
        logCouponCartDebug(
          'recalculateCart: cleared coupon (document not found)',
          { appliedCouponID },
          req as any,
        )
      } else {
        const now = new Date()
        const activeFrom = coupon.activeFrom ? new Date(coupon.activeFrom) : null
        const activeUntil = coupon.activeUntil ? new Date(coupon.activeUntil) : null
        const isValidDate =
          (!activeFrom || now >= activeFrom) && (!activeUntil || now <= activeUntil)
        const underUsage =
          !coupon.usageLimit || Number(coupon.usageCount || 0) < Number(coupon.usageLimit || 0)

        if (!isValidDate || !underUsage) {
          clearCouponFields(mutableData, fields)
          logCouponCartDebug(
            'recalculateCart: cleared coupon (inactive or usage limit)',
            {
              appliedCouponID,
              isValidDate,
              underUsage,
            },
            req as any,
          )
        } else {
          const discountMajor = calculateCouponDiscount({
            coupon,
            cartTotal: subtotalMajor,
          })
          couponDiscount = cartMinor ? majorToMinor2dp(discountMajor) : roundTo2(discountMajor)
          writeField(mutableData, fields.cartDiscountAmountField, couponDiscount)
          logCouponCartDebug(
            'recalculateCart: coupon discount computed',
            {
              couponId: appliedCouponID,
              couponType: coupon.type,
              couponValue: coupon.value,
              cartCurrency,
              cartMinor,
              calculatedSubtotal,
              subtotalMajor,
              discountMajor,
              couponDiscountStored: couponDiscount,
            },
            req as any,
          )
        }
      }
    } else {
      if (readField(mutableData, fields.cartAppliedCouponField) === null) {
        clearCouponFields(mutableData, fields)

        if (!referralOnCart) {
          // No coupon and no referral — full reset and early return.
          writeField(mutableData, fields.cartCustomerDiscountField, 0)
          writeField(mutableData, fields.cartPartnerCommissionField, 0)
          const st = Number(resolvers.getCartSubtotal(mutableData)) || calculatedSubtotal
          writeField(mutableData, fields.cartTotalField, cartMinor ? Math.round(st) : roundTo2(st))
          logCouponCartDebug(
            'recalculateCart: no applied coupon field (early exit)',
            {
              cartCurrency,
              cartMinor,
              calculatedSubtotal,
              totalSetTo: cartMinor ? Math.round(st) : roundTo2(st),
            },
            req as any,
          )
          return mutableData
        }

        // Referral is active — coupon fields are already cleared above.
        // Fall through so the final total calculation includes the referral discount.
        logCouponCartDebug(
          'recalculateCart: no coupon; referral present, computing total with referral discount',
          { cartCurrency, cartMinor, calculatedSubtotal, referralOnCart },
          req as any,
        )
      }
    }

    const nextTotal = cartMinor
      ? Math.max(
          0,
          Math.round(calculatedSubtotal) -
            Math.round(customerDiscount) -
            Math.round(couponDiscount),
        )
      : roundTo2(Math.max(0, calculatedSubtotal - customerDiscount - couponDiscount))
    writeField(mutableData, fields.cartTotalField, nextTotal)

    logCouponCartDebug(
      'recalculateCart: final',
      {
        cartCurrency,
        cartMinor,
        calculatedSubtotal,
        subtotalMajor,
        customerDiscount,
        couponDiscount,
        nextTotal,
        appliedCouponIDAfter: relationId(
          readField(mutableData, fields.cartAppliedCouponField) as RelationValue,
        ),
        referralOnCart,
        canUseCouponWithReferral,
      },
      req as any,
    )

    return mutableData
  }
