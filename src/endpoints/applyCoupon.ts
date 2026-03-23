import {
  addDataAndFileToRequest,
  type Endpoint,
  type PayloadHandler,
  type PayloadRequest,
} from 'payload'
import type { SanitizedCouponPluginOptions } from '../types'
import {
  calculateCommissionAndDiscount,
  calculateCouponDiscount,
  getProgramMinimumOrderAmount,
} from '../utilities/calculateValues'
import { isCouponCartDebugEnabled, logCouponCartDebug } from '../utilities/couponDebug'
import { majorToMinor2dp, minorToMajor2dp } from '../utilities/ecommerceMoney'
import {
  type SkipRecalculateContext,
  SKIP_COUPON_RECALCULATE_CONTEXT_KEY,
} from '../utilities/applyCouponContext'
import { idsEqual, type RelationValue, relationId } from '../utilities/relationId'
import { roundTo2 } from '../utilities/roundTo2'

type Args = {
  pluginConfig: SanitizedCouponPluginOptions
}

function buildReqWithCartSecret(req: PayloadRequest, secret: string | undefined): PayloadRequest {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) return req
  return {
    ...req,
    context: { ...(req.context || {}), cartSecret: secret.trim() },
  } as PayloadRequest
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
    const cartIDRaw = data?.cartID
    const cartID = typeof cartIDRaw === 'string' || typeof cartIDRaw === 'number' ? cartIDRaw : null
    const customerEmail = typeof data?.customerEmail === 'string' ? data.customerEmail : undefined
    const rawSecret = data?.secret
    const cartSecret =
      typeof rawSecret === 'string' && rawSecret.trim().length > 0 ? rawSecret.trim() : undefined
    const reqForCart = buildReqWithCartSecret(req, cartSecret)

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
        overrideAccess: true,
        req: reqForCart,
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
          reqForCart,
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
            req,
            reqForCart,
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
        req,
        reqForCart,
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
  req,
  reqForCart,
}: {
  payload: any
  cart: any
  cartID: string | number
  normalizedCode: string
  customerEmail?: string
  pluginConfig: SanitizedCouponPluginOptions
  req: PayloadRequest
  reqForCart: PayloadRequest
}) {
  const fields = pluginConfig.integration.fields
  const resolvers = pluginConfig.integration.resolvers
  const cartMinor = pluginConfig.integration?.cartAmountsInMinorUnits === true
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
  if (idsEqual(existingCouponId, coupon.id)) {
    return Response.json(
      { success: false, error: 'Coupon already applied to this cart' },
      { status: 400 },
    )
  }

  const referralOnCart =
    relationId(readField(cart, fields.cartAppliedReferralCodeField) as RelationValue) != null
  if (
    pluginConfig.enableReferrals &&
    !pluginConfig.referralConfig.allowBothSystems &&
    referralOnCart
  ) {
    logCouponCartDebug(
      'applyCoupon: rejected — referral on cart (allowBothSystems=false)',
      { cartID, referralOnCart, couponId: coupon.id },
      req,
    )
    return Response.json(
      {
        success: false,
        error:
          'A referral code is already applied to this cart. Remove it before applying a coupon.',
      },
      { status: 400 },
    )
  }

  // Use cartSubtotal (pre-discount baseline) for all order-value eligibility checks
  // and discount calculations. cartTotal may already reflect a previously applied
  // discount and would produce an inconsistent baseline for min/max enforcement.
  const cartSubtotalRaw = Number(resolvers.getCartSubtotal(cart)) || 0
  const cartSubtotalMajor = cartMinor ? minorToMajor2dp(cartSubtotalRaw) : cartSubtotalRaw
  const cartTotalRaw = Number(resolvers.getCartTotal(cart)) || cartSubtotalRaw || 0

  if (coupon.minOrderValue && cartSubtotalMajor < coupon.minOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Minimum order value of ${coupon.minOrderValue} ${pluginConfig.defaultCurrency} required`,
      },
      { status: 400 },
    )
  }

  if (coupon.maxOrderValue && cartSubtotalMajor > coupon.maxOrderValue) {
    return Response.json(
      {
        success: false,
        error: `Maximum order value of ${coupon.maxOrderValue} ${pluginConfig.defaultCurrency} exceeded`,
      },
      { status: 400 },
    )
  }

  const discountMajor = calculateCouponDiscount({ coupon, cartTotal: cartSubtotalMajor })
  const discountAmount = cartMinor ? majorToMinor2dp(discountMajor) : discountMajor
  const nextTotal = cartMinor
    ? Math.max(0, Math.round(cartTotalRaw) - Math.round(discountAmount))
    : roundTo2(Math.max(0, cartTotalRaw - discountAmount))

  const data: Record<string, unknown> = {}
  writeField(data, fields.cartAppliedCouponField, coupon.id)
  writeField(data, fields.cartDiscountAmountField, discountAmount)
  writeField(data, fields.cartTotalField, nextTotal)

  reqForCart.context = {
    ...(reqForCart.context || {}),
    [SKIP_COUPON_RECALCULATE_CONTEXT_KEY]: { couponId: coupon.id } satisfies SkipRecalculateContext,
  }

  await payload.update({
    collection: pluginConfig.integration.collections.cartsSlug,
    id: cartID,
    data,
    overrideAccess: true,
    req: reqForCart,
  })

  if (isCouponCartDebugEnabled()) {
    try {
      const cartAfter = await payload.findByID({
        collection: pluginConfig.integration.collections.cartsSlug,
        id: cartID,
        depth: 0,
        overrideAccess: true,
        req: reqForCart,
      })
      // eslint-disable-next-line no-console -- DEBUG_COUPON_CART diagnostic
      console.log('[payload-ecommerce-coupon] applyCoupon: cart after update', {
        cartID,
        wroteAppliedCoupon: data[fields.cartAppliedCouponField],
        appliedCouponOnDoc: readField(cartAfter, fields.cartAppliedCouponField),
        discountAmountOnDoc: readField(cartAfter, fields.cartDiscountAmountField),
        totalOnDoc: readField(cartAfter, fields.cartTotalField),
      })
    } catch (err) {
      // eslint-disable-next-line no-console -- DEBUG_COUPON_CART diagnostic
      console.log('[payload-ecommerce-coupon] applyCoupon: cart after update (read failed)', err)
    }
  }

  logCouponCartDebug(
    'applyCoupon: success',
    {
      cartID,
      cartMinor,
      cartSubtotalRaw,
      cartSubtotalMajor,
      cartTotalRaw,
      discountMajor,
      discountAmount,
      nextTotal,
      couponId: coupon.id,
      couponType: coupon.type,
      couponValue: coupon.value,
    },
    req,
  )

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
  reqForCart,
}: {
  payload: any
  cart: any
  cartID: string | number
  normalizedCode: string
  pluginConfig: SanitizedCouponPluginOptions
  reqForCart: PayloadRequest
}) {
  const fields = pluginConfig.integration.fields
  const resolvers = pluginConfig.integration.resolvers
  const cartMinor = pluginConfig.integration?.cartAmountsInMinorUnits === true

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

  if (idsEqual(existingReferralId, referralCode.id)) {
    return Response.json(
      { success: false, error: 'Referral code already applied to this cart' },
      { status: 400 },
    )
  }

  const cartItems = resolvers.getCartItems(cart)
  // Use cartSubtotal as the pre-discount baseline for min-order enforcement and
  // commission/discount calculations, matching the recalculateCart hook policy.
  const cartSubtotal = Number(resolvers.getCartSubtotal(cart)) || 0
  const cartSubtotalMajor = cartMinor ? minorToMajor2dp(cartSubtotal) : cartSubtotal
  const cartTotal = Number(resolvers.getCartTotal(cart)) || cartSubtotal || 0

  const minOrderAmount = getProgramMinimumOrderAmount({
    program,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
  })

  if (typeof minOrderAmount === 'number' && cartSubtotalMajor < minOrderAmount) {
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
    cartTotal: cartSubtotal,
    allowedTotalCommissionTypes: pluginConfig.referralConfig.allowedTotalCommissionTypes,
    cartAmountsInMinorUnits: cartMinor,
  })

  const roundedPartnerCommission = roundTo2(partnerCommission)
  const roundedCustomerDiscount = roundTo2(customerDiscount)
  const nextTotal = cartMinor
    ? Math.max(0, Math.round(cartTotal) - Math.round(roundedCustomerDiscount))
    : roundTo2(Math.max(0, cartTotal - roundedCustomerDiscount))

  const data: Record<string, unknown> = {}
  writeField(data, fields.cartAppliedReferralCodeField, referralCode.id)
  writeField(data, fields.cartPartnerCommissionField, roundedPartnerCommission)
  writeField(data, fields.cartCustomerDiscountField, roundedCustomerDiscount)
  writeField(data, fields.cartTotalField, nextTotal)

  reqForCart.context = {
    ...(reqForCart.context || {}),
    [SKIP_COUPON_RECALCULATE_CONTEXT_KEY]: {
      referralId: referralCode.id,
    } satisfies SkipRecalculateContext,
  }

  await payload.update({
    collection: pluginConfig.integration.collections.cartsSlug,
    id: cartID,
    data,
    overrideAccess: true,
    req: reqForCart,
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
