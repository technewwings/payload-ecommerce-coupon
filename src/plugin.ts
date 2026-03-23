import type { Config } from 'payload'

import { createCouponsCollection } from './collections/createCouponsCollection'
import { createReferralCodesCollection } from './collections/createReferralCodesCollection'
import { createReferralProgramsCollection } from './collections/createReferralProgramsCollection'
import { applyCouponEndpoint } from './endpoints/applyCoupon'
import { partnerStatsEndpoint } from './endpoints/partnerStats'
import { validateCouponEndpoint } from './endpoints/validateCoupon'
import { recalculateCartHook } from './hooks/recalculateCart'
import { CouponPluginOptions } from './types'
import { recordCouponUsageForOrder } from './utilities/recordCouponUsageForOrder'
import { sanitizePluginConfig } from './utilities/sanitizePluginConfig'

const RECALCULATE_HOOK_KEY = '__payloadEcommerceCouponRecalculateHook__'

type GenericCollection = {
  slug: string
  fields?: Array<Record<string, unknown>>
  endpoints?: Array<Record<string, unknown>>
  hooks?: {
    beforeChange?: Array<unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

const asArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

const hasNamedField = (collection: GenericCollection, fieldName: string): boolean =>
  asArray(collection.fields).some((f) => f?.name === fieldName)

const normalizePath = (path: string): string => {
  if (!path) return '/'
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

const toCollectionEndpointPath = ({
  endpointPath,
  collectionSlug,
}: {
  endpointPath: string
  collectionSlug: string
}): string | null => {
  const normalizedEndpointPath = normalizePath(endpointPath)
  const normalizedCollectionPath = normalizePath(`/${collectionSlug}`)

  if (!normalizedEndpointPath.startsWith(`${normalizedCollectionPath}/`)) return null
  const relative = normalizedEndpointPath.slice(normalizedCollectionPath.length)
  return relative.startsWith('/') ? relative : `/${relative}`
}

const ensureCouponCollectionEndpoints = ({
  collection,
  pluginConfig,
}: {
  collection: GenericCollection
  pluginConfig: ReturnType<typeof sanitizePluginConfig>
}): GenericCollection => {
  const couponsSlug = pluginConfig.collections.couponsSlug
  const applyPath = toCollectionEndpointPath({
    endpointPath: pluginConfig.endpoints.applyCoupon,
    collectionSlug: couponsSlug,
  })
  const validatePath = toCollectionEndpointPath({
    endpointPath: pluginConfig.endpoints.validateCoupon,
    collectionSlug: couponsSlug,
  })

  if (!applyPath && !validatePath) return collection

  const endpoints = asArray(collection.endpoints)
  const endpointKeys = new Set(
    endpoints.map((e: any) => `${(e?.method || 'get').toLowerCase()}:${e?.path || ''}`),
  )

  if (validatePath) {
    const validateKey = `post:${validatePath}`
    if (!endpointKeys.has(validateKey)) {
      endpointKeys.add(validateKey)
      endpoints.push({
        path: validatePath,
        method: 'post',
        handler: validateCouponEndpoint({ pluginConfig }).handler,
      })
    }
  }

  if (applyPath) {
    const applyKey = `post:${applyPath}`
    if (!endpointKeys.has(applyKey)) {
      endpointKeys.add(applyKey)
      endpoints.push({
        path: applyPath,
        method: 'post',
        handler: applyCouponEndpoint({ pluginConfig }).handler,
      })
    }
  }

  collection.endpoints = endpoints
  return collection
}

const addFieldsToCollection = (
  config: Config,
  targetSlug: string,
  newFields: Array<Record<string, unknown>>,
): void => {
  const collections = asArray(config.collections as GenericCollection[])
  const idx = collections.findIndex((c) => c.slug === targetSlug)
  if (idx === -1) return

  const collection = collections[idx]
  collection.fields = asArray(collection.fields)

  for (const field of newFields) {
    const name = typeof field.name === 'string' ? field.name : ''
    if (!name) continue
    if (!hasNamedField(collection, name)) {
      collection.fields.push(field)
    }
  }

  collections[idx] = collection
  config.collections = collections as any
}

type RecalculateHookFn = (...args: any[]) => any

const markHook = <T extends RecalculateHookFn>(fn: T): T => {
  ;(fn as any)[RECALCULATE_HOOK_KEY] = true
  return fn
}

const hasMarkedHook = (hook: unknown): boolean =>
  Boolean(hook && typeof hook === 'function' && (hook as any)[RECALCULATE_HOOK_KEY])

const createRecordOrderUsageEndpoint = ({
  pluginConfig,
}: {
  pluginConfig: ReturnType<typeof sanitizePluginConfig>
}) => ({
  path: pluginConfig.endpoints.recordOrderUsage,
  method: 'post' as const,
  handler: async (req: any) => {
    try {
      const payload = req?.payload
      const orderId = req?.data?.orderId ?? req?.json?.orderId

      if (!payload) {
        return Response.json(
          { success: false, error: 'Payload instance is required' },
          { status: 500 },
        )
      }

      if (!orderId) {
        return Response.json({ success: false, error: 'orderId is required' }, { status: 400 })
      }

      const policyAllowed = await Promise.resolve(
        pluginConfig.policies.canRecordOrderUsage({
          req,
          user: req?.user,
          payload,
          order: { id: orderId },
        }),
      )

      if (!policyAllowed) {
        return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }

      const order = await payload.findByID({
        collection: pluginConfig.integration.collections.ordersSlug as any,
        id: orderId,
      })

      if (!order) {
        return Response.json({ success: false, error: 'Order not found' }, { status: 404 })
      }

      const result = await recordCouponUsageForOrder(payload, order, pluginConfig)

      return Response.json({
        success: true,
        result,
      })
    } catch (error) {
      console.error('record-order-usage endpoint error:', error)
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
  },
})

export const payloadEcommerceCouponPlugin =
  (pluginOptions: CouponPluginOptions = {}) =>
  async (incomingConfig: Config): Promise<Config> => {
    const pluginConfig = sanitizePluginConfig({ pluginConfig: pluginOptions })

    if (!pluginConfig.enabled) return incomingConfig || {}

    if (!incomingConfig) {
      incomingConfig = { collections: [], endpoints: [] } as any
    }

    incomingConfig.collections = asArray(incomingConfig.collections as any) as Config['collections']
    incomingConfig.endpoints = asArray(incomingConfig.endpoints as any) as Config['endpoints']

    const collectionsToAdd: GenericCollection[] = []

    if (pluginConfig.enableReferrals) {
      let referralProgramsCollection = createReferralProgramsCollection(
        pluginConfig,
      ) as GenericCollection
      let referralCodesCollection = createReferralCodesCollection(pluginConfig) as GenericCollection

      if (pluginOptions.collections?.referralProgramsCollectionOverride) {
        referralProgramsCollection =
          await pluginOptions.collections.referralProgramsCollectionOverride({
            defaultCollection: referralProgramsCollection,
          })
      }

      if (pluginOptions.collections?.referralCodesCollectionOverride) {
        referralCodesCollection = await pluginOptions.collections.referralCodesCollectionOverride({
          defaultCollection: referralCodesCollection,
        })
      }

      collectionsToAdd.push(referralProgramsCollection, referralCodesCollection)
    }

    {
      let couponsCollection = createCouponsCollection(pluginConfig) as GenericCollection
      if (pluginOptions.collections?.couponsCollectionOverride) {
        couponsCollection = await pluginOptions.collections.couponsCollectionOverride({
          defaultCollection: couponsCollection,
        })
      }
      couponsCollection = ensureCouponCollectionEndpoints({
        collection: couponsCollection,
        pluginConfig,
      })
      collectionsToAdd.push(couponsCollection)
    }

    const existingSlugs = new Set(
      asArray(incomingConfig.collections as GenericCollection[]).map((c) => c.slug),
    )
    const toAppend = collectionsToAdd.filter((c) => !existingSlugs.has(c.slug))
    incomingConfig.collections = [
      ...asArray(incomingConfig.collections as GenericCollection[]),
      ...toAppend,
    ] as any

    const endpointPaths = new Set(
      asArray(incomingConfig.endpoints as any[]).map(
        (e: any) => `${e?.method || 'get'}:${e?.path || ''}`,
      ),
    )

    const maybePushEndpoint = (endpoint: any) => {
      const key = `${endpoint?.method || 'get'}:${endpoint?.path || ''}`
      if (!endpointPaths.has(key)) {
        endpointPaths.add(key)
        ;(incomingConfig.endpoints as any[]).push(endpoint)
      }
    }

    maybePushEndpoint(validateCouponEndpoint({ pluginConfig }))
    maybePushEndpoint(applyCouponEndpoint({ pluginConfig }))

    if (pluginOptions.endpoints?.recordOrderUsage) {
      maybePushEndpoint(createRecordOrderUsageEndpoint({ pluginConfig }))
    }

    if (pluginConfig.enableReferrals) {
      maybePushEndpoint(partnerStatsEndpoint({ pluginConfig }))
    }

    if (pluginConfig.autoIntegrate) {
      const allSlugs = new Set(
        asArray(incomingConfig.collections as GenericCollection[]).map((c) => c.slug),
      )

      const cartsSlug = pluginConfig.integration.collections.cartsSlug
      const ordersSlug = pluginConfig.integration.collections.ordersSlug

      const {
        cartAppliedReferralCodeField,
        cartPartnerCommissionField,
        cartCustomerDiscountField,
        cartAppliedCouponField,
        cartDiscountAmountField,
        orderAppliedReferralCodeField,
        orderPartnerCommissionField,
        orderCustomerDiscountField,
        orderAppliedCouponField,
        orderDiscountAmountField,
      } = pluginConfig.integration.fields

      if (
        pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.referralCodesSlug)
      ) {
        const cartReferralFields: Array<Record<string, unknown>> = [
          {
            name: cartAppliedReferralCodeField,
            type: 'relationship',
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: { description: 'Referral code applied to this cart' },
          },
          {
            name: cartPartnerCommissionField,
            type: 'number',
            admin: { description: 'Partner commission amount for this cart' },
          },
          {
            name: cartCustomerDiscountField,
            type: 'number',
            admin: { description: 'Customer discount amount for this cart' },
          },
        ]

        if (allSlugs.has(pluginConfig.collections.couponsSlug)) {
          cartReferralFields.push(
            {
              name: cartAppliedCouponField,
              type: 'relationship',
              relationTo: pluginConfig.collections.couponsSlug,
              admin: { description: 'Coupon applied to this cart' },
            },
            {
              name: cartDiscountAmountField,
              type: 'number',
              admin: { description: 'Discount amount from coupon' },
            },
          )
        }

        addFieldsToCollection(incomingConfig, cartsSlug, cartReferralFields)

        const orderReferralFields: Array<Record<string, unknown>> = [
          {
            name: orderAppliedReferralCodeField,
            type: 'relationship',
            relationTo: pluginConfig.collections.referralCodesSlug,
            admin: {
              description: 'Referral code applied to this order',
              readOnly: true,
            },
          },
          {
            name: orderPartnerCommissionField,
            type: 'number',
            admin: {
              description: 'Partner commission amount for this order',
              readOnly: true,
            },
          },
          {
            name: orderCustomerDiscountField,
            type: 'number',
            admin: {
              description: 'Customer discount amount for this order',
              readOnly: true,
            },
          },
        ]

        if (allSlugs.has(pluginConfig.collections.couponsSlug)) {
          orderReferralFields.push(
            {
              name: orderAppliedCouponField,
              type: 'relationship',
              relationTo: pluginConfig.collections.couponsSlug,
              admin: {
                description: 'Coupon applied to this order',
                readOnly: true,
              },
            },
            {
              name: orderDiscountAmountField,
              type: 'number',
              admin: {
                description: 'Discount amount from coupon',
                readOnly: true,
              },
            },
          )
        }

        addFieldsToCollection(incomingConfig, ordersSlug, orderReferralFields)
      } else if (
        !pluginConfig.enableReferrals &&
        allSlugs.has(pluginConfig.collections.couponsSlug)
      ) {
        const cartCouponFields: Array<Record<string, unknown>> = [
          {
            name: cartAppliedCouponField,
            type: 'relationship',
            relationTo: pluginConfig.collections.couponsSlug,
            admin: { description: 'Coupon applied to this cart' },
          },
          {
            name: cartDiscountAmountField,
            type: 'number',
            admin: { description: 'Discount amount from coupon' },
          },
        ]

        const orderCouponFields: Array<Record<string, unknown>> = [
          {
            name: orderAppliedCouponField,
            type: 'relationship',
            relationTo: pluginConfig.collections.couponsSlug,
            admin: {
              description: 'Coupon applied to this order',
              readOnly: true,
            },
          },
          {
            name: orderDiscountAmountField,
            type: 'number',
            admin: {
              description: 'Discount amount from coupon',
              readOnly: true,
            },
          },
        ]

        addFieldsToCollection(incomingConfig, cartsSlug, cartCouponFields)
        addFieldsToCollection(incomingConfig, ordersSlug, orderCouponFields)
      }
    }

    const cartsSlug = pluginConfig.integration.collections.cartsSlug
    const cartIndex = asArray(incomingConfig.collections as GenericCollection[]).findIndex(
      (c) => c.slug === cartsSlug,
    )

    if (cartIndex > -1) {
      const collection = (incomingConfig.collections as GenericCollection[])[cartIndex]
      const beforeChangeHooks = asArray(collection.hooks?.beforeChange)

      const alreadyAdded = beforeChangeHooks.some((h) => hasMarkedHook(h))
      if (!alreadyAdded) {
        const hook = markHook(recalculateCartHook(pluginConfig))
        collection.hooks = {
          ...(collection.hooks || {}),
          beforeChange: [...beforeChangeHooks, hook],
        }
      }

      ;(incomingConfig.collections as GenericCollection[])[cartIndex] = collection
    }

    return incomingConfig
  }
