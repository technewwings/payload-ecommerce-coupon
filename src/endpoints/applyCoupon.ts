import { addDataAndFileToRequest, type Endpoint, type PayloadHandler } from 'payload'
import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../utilities/calculateValues'
import { roundTo2 } from '../utilities/roundTo2'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

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

function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

async function ensureRequestData(req: any): Promise<Record<string, unknown>> {
  if (req?.data && typeof req.data === 'object') return req.data as Record<string, unknown>

  try {
    await addDataAndFileToRequest(req)
  } catch {
    // Fallback for non-standard test/mocked requests where payload parser cannot run.
  }

  if (req?.data && typeof req.data === 'object') return req.data as Record<string, unknown>

  try {
    const parsed = await req?.json?.()
    if (parsed && typeof parsed === 'object') {
      req.data = parsed
      return parsed as Record<string, unknown>
    }
  } catch {
    // Ignore malformed/empty body; validation below will return proper 400 errors.
  }

  req.data = {}
  return req.data
}

async function findByNormalizedCode({
  payload,
  collection,
  normalizedCode,
}: {
  payload: any
  collection: string
  normalizedCode: string
}): Promise<any | null> {
  const exactQuery = await payload.find({
    collection,
    where: {
      normalizedCode: { equals: normalizedCode },
    },
    limit: 1,
  })

  if (exactQuery?.docs?.[0]) return exactQuery.docs[0]

  const lowerQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode.toLowerCase() },
    },
    limit: 1,
  })

  if (lowerQuery?.docs?.[0]) return lowerQuery.docs[0]

  const upperQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode.toUpperCase() },
    },
    limit: 1,
  })

  if (upperQuery?.docs?.[0]) return upperQuery.docs[0]

  const exactCodeQuery = await payload.find({
    collection,
    where: {
      code: { equals: normalizedCode },
    },
    limit: 1,
  })

  return exactCodeQuery?.docs?.[0] ?? null
}

export const applyCouponHandler =
  ({ pluginConfig }: Args): PayloadHandler =>
  async (req) => {
    const { payload } = req
    const fields = pluginConfig.integration.fields
    const collections = pluginConfig.integration.collections
    const data = await ensureRequestData(req)

    const rawCode = data?.code
    const cartID = data?.cartID
    const customerEmail = data?.customerEmail

    const normalizedCode = normalizeCode(rawCode)

    if (!normalizedCode || !cartID) {
      return Response.json(
        {
          success: false,
          error: `${pluginConfig.enableReferrals ? 'Referral code' : 'Coupon code'} and cart ID are required`,
        },
        { status: 400 },
      )
    }

    const allowCoupon = await Promise.resolve(
      pluginConfig.policies.canApplyCoupon({ req, user: req?.user, payload }),
    )

    const allowReferral = await Promise.resolve(
      pluginConfig.policies.canApplyReferral({ req, user: req?.user, payload }),
    )

    if (!allowCoupon && !(pluginConfig.enableReferrals && allowReferral)) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    try {
      const cart = await payload.findByID({
        collection: collections.cartsSlug,
        id: cartID,
        depth: 2,
      })

      if (!cart) {
        return Response.json({ success: false, error: 'Cart not found' }, { status: 404 })
      }

      const cartAppliedCoupon = relationId(
        readField(cart, fields.cartAppliedCouponField) as RelationValue,
      )
      const cartAppliedReferral = relationId(
        readField(cart, fields.cartAppliedReferralCodeField) as RelationValue,
      )

      if (
        pluginConfig.referralConfig.singleCodePerCart &&
        (cartAppliedCoupon || cartAppliedReferral)
      ) {
        return Response.json(
          {
            success: false,
            error:
              'A code has already been applied to this cart. Only one code can be used per order.',
          },
          { status: 400 },
        )
      }

      if (pluginConfig.enableReferrals && allowReferral) {
        const referralResult = await handleReferralCode({
          payload,
          cart,
          cartID,
          normalizedCode,
          pluginConfig,
        })

        if (
          !referralResult.ok &&
          referralResult.status === 404 &&
          pluginConfig.referralConfig.allowBothSystems &&
          allowCoupon
        ) {
          return await handleCouponCode({
            payload,
            cart,
            cartID,
            normalizedCode,
            customerEmail,
            pluginConfig,
          })
        }

        return referralResult
      }

      if (!allowCoupon) {
        return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }

      return await handleCouponCode({
        payload,
        cart,
        cartID,
        normalizedCode,
        customerEmail,
        pluginConfig,
      })
    } catch (error) {
      console.error('Code application error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  }

async function handleCouponCode({
  payload,
  cart,
  cartID,
  normalizedCode,
  customerEmail,
  pluginConfig,
}: {
  payload: any
  cart: any
  cartID: string
  normalizedCode: string
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  const fields = pluginConfig.integration.fields
  const resolvers = pluginConfig.integration.resolvers
  const coupon = await findByNormalizedCode({
    payload,
    collection: pluginConfig.collections.couponsSlug,
    normalizedCode,
  })

  if (!coupon) {
    return Response.json({ success: false, error: 'Invalid coupon code' }, { status: 404 })
  }

  const now = new Date()
  const activeFrom = coupon.activeFrom ? new Date(coupon.activeFrom) : null
  const activeUntil = coupon.activeUntil ? new Date(coupon.activeUntil) : null

  if (activeFrom && now < activeFrom) {
    return Response.json({ success: false, error: 'Coupon is not yet active' }, { status: 400 })
  }

  if (activeUntil && now > activeUntil) {
    return Response.json({ success: false, error: 'Coupon has expired' }, { status: 400 })
  }

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return Response.json({ success: false, error: 'Coupon usage limit exceeded' }, { status: 400 })
  }

  if (coupon.perCustomerLimit != null && coupon.perCustomerLimit > 0) {
    const email = typeof customerEmail === 'string' ? customerEmail.trim() : ''
    if (!email) {
      return Response.json(
        {
          success: false,
          error: 'Customer email is required for this coupon.',
        },
        { status: 400 },
      )
    }

    const ordersQuery = await payload.find({
      collection: pluginConfig.orderIntegration.ordersSlug,
      where: {
        and: [
          { [fields.orderAppliedCouponField]: { equals: coupon.id } },
          {
            [pluginConfig.orderIntegration.orderCustomerEmailField]: {
              equals: email,
            },
          },
          {
            [pluginConfig.orderIntegration.orderPaymentStatusField]: {
              equals: pluginConfig.orderIntegration.orderPaidStatusValue,
            },
          },
        ],
      },
      limit: 0,
    })

    if (ordersQuery.totalDocs >= coupon.perCustomerLimit) {
      return Response.json(
        {
          success: false,
          error: 'You have reached the maximum uses for this coupon.',
        },
        { status: 400 },
      )
    }
  }

  const existingCouponId = relationId(
    readField(cart, fields.cartAppliedCouponField) as RelationValue,
  )
  if (existingCouponId === coupon.id) {
    return Response.json(
      { success: false, error: 'Coupon already applied to this cart' },
      { status: 400 },
    )
  }

  const cartSubtotal = Number(resolvers.getCartSubtotal(cart)) || 0
  const cartTotal = Number(resolvers.getCartTotal(cart)) || cartSubtotal || 0

  if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${coupon.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    )
  }

  if (coupon.maxOrderValue && cartTotal > coupon.maxOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Maximum order value of ${coupon.maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
      },
      { status: 400 },
    )
  }

  const discountAmount = calculateCouponDiscount({ coupon, cartTotal })
  const nextTotal = roundTo2(Math.max(0, cartTotal - discountAmount))

  const data: Record<string, unknown> = {}
  writeField(data, fields.cartAppliedCouponField, coupon.id)
  writeField(data, fields.cartDiscountAmountField, discountAmount)
  writeField(data, fields.cartTotalField, nextTotal)

  await payload.update({
    collection: pluginConfig.integration.collections.cartsSlug,
    id: cartID,
    data,
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

async function handleReferralCode({
  payload,
  cart,
  cartID,
  normalizedCode,
  pluginConfig,
}: {
  payload: any
  cart: any
  cartID: string
  normalizedCode: string
  pluginConfig: SanitizedCouponPluginOptions
}) {
  const fields = pluginConfig.integration.fields
  const resolvers = pluginConfig.integration.resolvers

  const referralCode = await findByNormalizedCode({
    payload,
    collection: pluginConfig.collections.referralCodesSlug,
    normalizedCode,
  })

  if (!referralCode) {
    return Response.json({ success: false, error: 'Invalid referral code' }, { status: 404 })
  }

  if (!referralCode.isActive) {
    return Response.json({ success: false, error: 'Referral code is not active' }, { status: 400 })
  }

  if (referralCode.expiresAt && new Date() > new Date(referralCode.expiresAt)) {
    return Response.json({ success: false, error: 'Referral code has expired' }, { status: 400 })
  }

  if (referralCode.usageLimit && referralCode.usageCount >= referralCode.usageLimit) {
    return Response.json(
      { success: false, error: 'Referral code usage limit exceeded' },
      { status: 400 },
    )
  }

  const programId =
    typeof referralCode.program === 'string' || typeof referralCode.program === 'number'
      ? referralCode.program
      : referralCode.program?.id

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

  const existingReferralId = relationId(
    readField(cart, fields.cartAppliedReferralCodeField) as RelationValue,
  )

  if (existingReferralId === referralCode.id) {
    return Response.json(
      { success: false, error: 'Referral code already applied to this cart' },
      { status: 400 },
    )
  }

  const cartItems = resolvers.getCartItems(cart)
  const cartTotal =
    Number(resolvers.getCartTotal(cart)) || Number(resolvers.getCartSubtotal(cart)) || 0

  const minOrderAmount = getProgramMinimumOrderAmount({
    program,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
  })

  if (typeof minOrderAmount === 'number' && cartTotal < minOrderAmount) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${minOrderAmount} ${pluginConfig.defaultCurrency} required for this referral program`,
      },
      { status: 400 },
    )
  }

  const { partnerCommission, customerDiscount } = calculateCommissionAndDiscount({
    cartItems,
    program,
    currencyCode: pluginConfig.defaultCurrency,
    cartTotal,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
  })

  const roundedPartnerCommission = roundTo2(partnerCommission)
  const roundedCustomerDiscount = roundTo2(customerDiscount)
  const nextTotal = roundTo2(Math.max(0, cartTotal - roundedCustomerDiscount))

  const data: Record<string, unknown> = {}
  writeField(data, fields.cartAppliedReferralCodeField, referralCode.id)
  writeField(data, fields.cartPartnerCommissionField, roundedPartnerCommission)
  writeField(data, fields.cartCustomerDiscountField, roundedCustomerDiscount)
  writeField(data, fields.cartTotalField, nextTotal)

  await payload.update({
    collection: pluginConfig.integration.collections.cartsSlug,
    id: cartID,
    data,
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

export const applyCouponEndpoint = ({ pluginConfig }: Args): Endpoint => ({
  path: pluginConfig.endpoints.applyCoupon,
  method: 'post',
  handler: applyCouponHandler({ pluginConfig }),
})
