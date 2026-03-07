import { roundTo2 } from './roundTo2'
import { getCartItemUnitPrice } from './pricing'

export function calculateCouponDiscount({ coupon, cartTotal }: { coupon: any; cartTotal: number }) {
  let discount = 0

  if (coupon.type === 'percentage') {
    discount = roundTo2((cartTotal * coupon.value) / 100)
    if (coupon.maxDiscountAmount != null && discount > coupon.maxDiscountAmount) {
      discount = roundTo2(coupon.maxDiscountAmount)
    }
  } else if (coupon.type === 'fixed') {
    discount = roundTo2(coupon.value)
    if (discount > cartTotal) {
      discount = roundTo2(cartTotal)
    }
  }

  return roundTo2(discount)
}

function relationId(value: any): string | number | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && (typeof value.id === 'string' || typeof value.id === 'number')) {
    return value.id
  }
  return null
}

const allowedCommissionTypesSet = (
  allowed: Array<'fixed' | 'percentage'> | undefined,
): Set<string> =>
  new Set((allowed && allowed.length ? allowed : ['fixed', 'percentage']).map((v) => v))

function normalizeIds(values: any[] | null | undefined): Array<string | number> {
  if (!Array.isArray(values)) return []
  return values.map(relationId).filter((v): v is string | number => v != null)
}

function getRuleSplits(rule: any): { partnerSplit: number; customerSplit: number } | null {
  const partnerRaw =
    typeof rule.partnerSplit === 'number'
      ? rule.partnerSplit
      : typeof rule.referrerSplit === 'number'
        ? rule.referrerSplit
        : null
  if (partnerRaw == null) return null

  const customerRaw =
    typeof rule.customerSplit === 'number'
      ? rule.customerSplit
      : typeof rule.refereeSplit === 'number'
        ? rule.refereeSplit
        : 100 - partnerRaw

  return {
    partnerSplit: partnerRaw,
    customerSplit: customerRaw,
  }
}

function calculateItemRewardByRule({
  rule,
  itemTotal,
  quantity,
  allowedTotalCommissionTypes,
}: {
  rule: any
  itemTotal: number
  quantity: number
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): { partner: number; customer: number } | null {
  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)

  // Shared model (v2)
  if (rule.totalCommission) {
    if (!allowedTypes.has(rule.totalCommission.type)) return null

    const resolvedMaxAmount =
      typeof rule.totalCommission.maxAmount === 'number' &&
      Number.isFinite(rule.totalCommission.maxAmount)
        ? rule.totalCommission.maxAmount
        : null

    // Fixed direct mode (new): partner/customer are literal per-unit amounts.
    // Apply max cap consistently to the combined per-line payout.
    if (rule.totalCommission.type === 'fixed' && rule.totalCommission.value == null) {
      const partnerAmtPerUnit = typeof rule.partnerSplit === 'number' ? rule.partnerSplit : null
      const customerAmtPerUnit = typeof rule.customerSplit === 'number' ? rule.customerSplit : null
      if (partnerAmtPerUnit == null || customerAmtPerUnit == null) return null

      let partner = partnerAmtPerUnit * quantity
      let customer = customerAmtPerUnit * quantity

      if (resolvedMaxAmount != null) {
        const maxPotForLine = resolvedMaxAmount * quantity
        const totalPot = partner + customer
        if (totalPot > maxPotForLine && totalPot > 0) {
          const ratio = maxPotForLine / totalPot
          partner = Math.floor(partner * ratio)
          customer = Math.floor(customer * ratio)
        }
      }

      return { partner, customer }
    }

    let totalPot = 0
    if (rule.totalCommission.type === 'percentage') {
      const commissionValue =
        typeof rule.totalCommission.value === 'number' &&
        Number.isFinite(rule.totalCommission.value)
          ? rule.totalCommission.value
          : null

      if (commissionValue == null) {
        const partnerPercentInput =
          typeof rule.partnerPercent === 'number'
            ? rule.partnerPercent
            : typeof rule.partnerSplit === 'number'
              ? rule.partnerSplit
              : null
        if (partnerPercentInput == null || partnerPercentInput < 0 || partnerPercentInput > 100) {
          return null
        }

        const customerPercentInput =
          typeof rule.customerPercent === 'number'
            ? rule.customerPercent
            : typeof rule.customerSplit === 'number'
              ? rule.customerSplit
              : 100 - partnerPercentInput

        if (
          customerPercentInput == null ||
          customerPercentInput < 0 ||
          customerPercentInput > 100
        ) {
          return null
        }

        const partner = (itemTotal * partnerPercentInput) / 100
        const customer = (itemTotal * customerPercentInput) / 100

        if (resolvedMaxAmount != null) {
          const maxPotForLine = resolvedMaxAmount * quantity
          const totalForLine = partner + customer
          if (totalForLine > maxPotForLine && totalForLine > 0) {
            const ratio = maxPotForLine / totalForLine
            return {
              partner: Math.floor(partner * ratio),
              customer: Math.floor(customer * ratio),
            }
          }
        }

        return {
          partner: Math.floor(partner),
          customer: Math.floor(customer),
        }
      }

      totalPot = (itemTotal * commissionValue) / 100
    } else {
      const splits = getRuleSplits(rule)
      if (!splits) return null
      totalPot = rule.totalCommission.value * quantity

      if (resolvedMaxAmount != null) {
        const maxPotForLine = resolvedMaxAmount * quantity
        if (totalPot > maxPotForLine) {
          totalPot = maxPotForLine
        }
      }

      return {
        partner: Math.floor((totalPot * splits.partnerSplit) / 100),
        customer: Math.floor((totalPot * splits.customerSplit) / 100),
      }
    }

    if (resolvedMaxAmount != null) {
      const maxPotForLine = resolvedMaxAmount * quantity
      if (totalPot > maxPotForLine) {
        totalPot = maxPotForLine
      }
    }

    const splits = getRuleSplits(rule)
    if (!splits) return null

    return {
      partner: Math.floor((totalPot * splits.partnerSplit) / 100),
      customer: Math.floor((totalPot * splits.customerSplit) / 100),
    }
  }

  // Compatibility fallback for legacy direct rules during migration window.
  if (rule.referrerReward && rule.refereeReward) {
    let partner = 0
    if (rule.referrerReward.type === 'percentage') {
      partner = (itemTotal * rule.referrerReward.value) / 100
    } else {
      partner = rule.referrerReward.value * quantity
    }
    if (rule.referrerReward.maxReward != null && partner > rule.referrerReward.maxReward) {
      partner = rule.referrerReward.maxReward
    }

    let customer = 0
    if (rule.refereeReward.type === 'percentage') {
      customer = (itemTotal * rule.refereeReward.value) / 100
    } else {
      customer = rule.refereeReward.value * quantity
    }
    if (rule.refereeReward.maxReward != null && customer > rule.refereeReward.maxReward) {
      customer = rule.refereeReward.maxReward
    }

    return { partner, customer }
  }

  return null
}

function getItemCategoryIds(item: any): Array<string | number> {
  const productCategories = Array.isArray(item?.product?.categories)
    ? normalizeIds(item.product.categories)
    : []
  const singleCategory = relationId(item?.category ?? item?.product?.category)
  return [...productCategories, ...(singleCategory != null ? [singleCategory] : [])]
}

function getItemTagIds(item: any): Array<string | number> {
  return Array.isArray(item?.product?.tags) ? normalizeIds(item.product.tags) : []
}

function selectBestRuleForItem({
  rules,
  item,
  itemTotal,
  quantity,
  cartTotal,
  minOrderAmount,
  allowedTotalCommissionTypes,
}: {
  rules: any[]
  item: any
  itemTotal: number
  quantity: number
  cartTotal: number
  minOrderAmount?: number | null
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): { rule: any; reward: { partner: number; customer: number } } | null {
  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)
  const eligibleRules = rules.filter((rule: any) => {
    const hasSharedType = rule?.totalCommission?.type
      ? allowedTypes.has(rule.totalCommission.type)
      : true
    if (!hasSharedType) return false
    const resolvedMinOrderAmount =
      typeof minOrderAmount === 'number' && Number.isFinite(minOrderAmount)
        ? minOrderAmount
        : typeof rule?.minOrderAmount === 'number' && Number.isFinite(rule.minOrderAmount)
          ? rule.minOrderAmount
          : null
    const shouldApplyMinOrder = rule?.totalCommission?.type !== 'fixed'
    if (resolvedMinOrderAmount != null && shouldApplyMinOrder) {
      return cartTotal >= resolvedMinOrderAmount
    }
    return true
  })

  const productId = relationId(item.product)
  const itemCategoryIds = new Set(getItemCategoryIds(item))
  const itemTagIds = new Set(getItemTagIds(item))

  const productCandidates = eligibleRules.filter(
    (r: any) =>
      r.appliesTo === 'products' &&
      normalizeIds(r.products).some((id) => productId != null && id === productId),
  )

  const segmentCategoryCandidates = eligibleRules.filter((r: any) => {
    const isSegment = r.appliesTo === 'segments' || r.appliesTo === 'categories'
    if (!isSegment) return false
    return normalizeIds(r.categories).some((id) => itemCategoryIds.has(id))
  })

  const segmentTagCandidates = eligibleRules.filter((r: any) => {
    if (r.appliesTo !== 'segments') return false
    return normalizeIds(r.tags).some((id) => itemTagIds.has(id))
  })

  const allCandidates = eligibleRules.filter((r: any) => r.appliesTo === 'all')

  const levels = [productCandidates, segmentCategoryCandidates, segmentTagCandidates, allCandidates]
  const candidates = levels.find((level) => level.length > 0) ?? []
  if (!candidates.length) return null

  let best: { rule: any; reward: { partner: number; customer: number } } | null = null

  for (const rule of candidates) {
    const reward = calculateItemRewardByRule({
      rule,
      itemTotal,
      quantity,
      allowedTotalCommissionTypes,
    })
    if (!reward) continue

    if (!best) {
      best = { rule, reward }
      continue
    }

    if (reward.customer > best.reward.customer) {
      best = { rule, reward }
      continue
    }

    if (reward.customer === best.reward.customer && reward.partner > best.reward.partner) {
      best = { rule, reward }
    }
  }

  return best
}

export function getProgramMinimumOrderAmount({
  program,
  allowedTotalCommissionTypes,
}: {
  program: any
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): number | null {
  const rules = Array.isArray(program?.commissionRules) ? program.commissionRules : []

  if (!rules.length) return null

  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)
  const hasEligiblePercentageRule = rules.some((rule: any) => {
    if (rule?.totalCommission?.type) {
      return (
        rule.totalCommission.type === 'percentage' && allowedTypes.has(rule.totalCommission.type)
      )
    }
    return true
  })

  if (
    hasEligiblePercentageRule &&
    typeof program?.minOrderAmount === 'number' &&
    Number.isFinite(program.minOrderAmount)
  ) {
    return program.minOrderAmount
  }

  const minValues = rules
    .filter((rule: any) => {
      if (rule?.totalCommission?.type) return allowedTypes.has(rule.totalCommission.type)
      return true
    })
    .map((rule: any) => rule?.minOrderAmount)
    .filter(
      (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value),
    )

  if (!minValues.length) return null
  return Math.min(...minValues)
}

export function calculateCommissionAndDiscount({
  cartItems,
  program,
  currencyCode = 'AED',
  cartTotal = 0,
  allowedTotalCommissionTypes,
}: {
  cartItems: any[]
  program: any
  currencyCode?: string
  cartTotal?: number
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): { partnerCommission: number; customerDiscount: number } {
  const rules = Array.isArray(program?.commissionRules) ? program.commissionRules : []

  if (!rules.length) {
    return { partnerCommission: 0, customerDiscount: 0 }
  }

  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0

  for (const item of cartItems) {
    const product = typeof item.product === 'object' ? item.product : {}
    const variant = typeof item.variant === 'object' ? item.variant : {}

    const itemPrice = getCartItemUnitPrice({
      item,
      product,
      variant,
      currencyCode,
    })

    const quantity = item.quantity ?? 1
    const itemTotal = itemPrice * quantity

    const bestMatch = selectBestRuleForItem({
      rules,
      item: { ...item, product },
      itemTotal,
      quantity,
      cartTotal,
      minOrderAmount:
        typeof program?.minOrderAmount === 'number' && Number.isFinite(program.minOrderAmount)
          ? program.minOrderAmount
          : null,
      allowedTotalCommissionTypes,
    })

    if (!bestMatch) continue

    totalPartnerCommission += bestMatch.reward.partner
    totalCustomerDiscount += bestMatch.reward.customer
  }

  const maxPartnerCommissionPerOrder =
    typeof program?.maxPartnerCommissionPerOrder === 'number' &&
    Number.isFinite(program.maxPartnerCommissionPerOrder)
      ? program.maxPartnerCommissionPerOrder
      : null
  const maxCustomerDiscountPerOrder =
    typeof program?.maxCustomerDiscountPerOrder === 'number' &&
    Number.isFinite(program.maxCustomerDiscountPerOrder)
      ? program.maxCustomerDiscountPerOrder
      : null

  if (maxPartnerCommissionPerOrder != null) {
    totalPartnerCommission = Math.min(totalPartnerCommission, maxPartnerCommissionPerOrder)
  }
  if (maxCustomerDiscountPerOrder != null) {
    totalCustomerDiscount = Math.min(totalCustomerDiscount, maxCustomerDiscountPerOrder)
  }

  return { partnerCommission: totalPartnerCommission, customerDiscount: totalCustomerDiscount }
}
