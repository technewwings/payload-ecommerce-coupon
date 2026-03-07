import type { CollectionBeforeChangeHook } from 'payload'
import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../utilities/calculateValues'
import { roundTo2 } from '../utilities/roundTo2'

type RelationValue = string | number | { id?: string | number } | null | undefined

function relationId(value: RelationValue): string | number | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && (typeof value.id === 'string' || typeof value.id === 'number')) {
    return value.id
  }
  return null
}

function readField<T = unknown>(doc: unknown, field: string): T | undefined {
  if (!doc || typeof doc !== 'object') return undefined
  return (doc as Record<string, unknown>)[field] as T | undefined
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

    const effectiveItems =
      readField<any[]>(mutableData, fields.cartItemsField) ??
      readField<any[]>(original, fields.cartItemsField) ??
      []

    const effectiveAppliedReferral =
      readField<RelationValue>(mutableData, fields.cartAppliedReferralCodeField) !== undefined
        ? readField<RelationValue>(mutableData, fields.cartAppliedReferralCodeField)
        : readField<RelationValue>(original, fields.cartAppliedReferralCodeField)

    const effectiveAppliedCoupon =
      readField<RelationValue>(mutableData, fields.cartAppliedCouponField) !== undefined
        ? readField<RelationValue>(mutableData, fields.cartAppliedCouponField)
        : readField<RelationValue>(original, fields.cartAppliedCouponField)

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
          currencyCode: pluginConfig.defaultCurrency,
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

    writeField(mutableData, fields.cartSubtotalField, roundTo2(calculatedSubtotal))

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

          if (typeof minOrderAmount === 'number' && calculatedSubtotal < minOrderAmount) {
            clearReferralFields(mutableData, fields)
          } else {
            const result = calculateCommissionAndDiscount({
              cartItems: enrichedItems,
              program,
              currencyCode: pluginConfig.defaultCurrency,
              cartTotal: calculatedSubtotal,
              allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
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

    const appliedCouponID = relationId(effectiveAppliedCoupon)
    const canUseCouponWithReferral =
      !pluginConfig.enableReferrals ||
      pluginConfig.referralConfig.allowBothSystems ||
      relationId(readField(mutableData, fields.cartAppliedReferralCodeField) as RelationValue) ==
        null

    if (appliedCouponID != null && canUseCouponWithReferral) {
      const couponQuery = await req.payload.find({
        collection: pluginConfig.collections.couponsSlug,
        where: { id: { equals: appliedCouponID } },
        limit: 1,
      })

      const coupon = couponQuery?.docs?.[0]
      if (!coupon) {
        clearCouponFields(mutableData, fields)
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
        } else {
          couponDiscount = roundTo2(
            calculateCouponDiscount({ coupon, cartTotal: calculatedSubtotal }),
          )
          writeField(mutableData, fields.cartDiscountAmountField, couponDiscount)
        }
      }
    } else {
      if (readField(mutableData, fields.cartAppliedCouponField) === null) {
        clearCouponFields(mutableData, fields)
        writeField(mutableData, fields.cartCustomerDiscountField, 0)
        writeField(mutableData, fields.cartPartnerCommissionField, 0)
        writeField(
          mutableData,
          fields.cartTotalField,
          roundTo2(Number(resolvers.getCartSubtotal(mutableData)) || calculatedSubtotal),
        )
        return mutableData
      }
    }

    const nextTotal = roundTo2(Math.max(0, calculatedSubtotal - customerDiscount - couponDiscount))
    writeField(mutableData, fields.cartTotalField, nextTotal)

    return mutableData
  }
