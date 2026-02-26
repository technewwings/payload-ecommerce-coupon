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
}: {
  rule: any
  itemTotal: number
  quantity: number
}): { partner: number; customer: number } | null {
  // Shared model (v2)
  if (rule.totalCommission) {
    const splits = getRuleSplits(rule)
    if (!splits) return null

    let totalPot = 0
    if (rule.totalCommission.type === 'percentage') {
      totalPot = (itemTotal * rule.totalCommission.value) / 100
    } else {
      totalPot = rule.totalCommission.value * quantity
    }

    if (rule.totalCommission.maxAmount != null) {
      const maxPotForLine = rule.totalCommission.maxAmount * quantity
      if (totalPot > maxPotForLine) {
        totalPot = maxPotForLine
      }
    }

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
}: {
  rules: any[]
  item: any
  itemTotal: number
  quantity: number
}): { rule: any; reward: { partner: number; customer: number } } | null {
  const productId = relationId(item.product)
  const itemCategoryIds = new Set(getItemCategoryIds(item))
  const itemTagIds = new Set(getItemTagIds(item))

  const productCandidates = rules.filter(
    (r: any) =>
      r.appliesTo === 'products' &&
      normalizeIds(r.products).some((id) => productId != null && id === productId),
  )

  const segmentCategoryCandidates = rules.filter((r: any) => {
    const isSegment = r.appliesTo === 'segments' || r.appliesTo === 'categories'
    if (!isSegment) return false
    return normalizeIds(r.categories).some((id) => itemCategoryIds.has(id))
  })

  const segmentTagCandidates = rules.filter((r: any) => {
    if (r.appliesTo !== 'segments') return false
    return normalizeIds(r.tags).some((id) => itemTagIds.has(id))
  })

  const allCandidates = rules.filter((r: any) => r.appliesTo === 'all')

  const levels = [productCandidates, segmentCategoryCandidates, segmentTagCandidates, allCandidates]
  const candidates = levels.find((level) => level.length > 0) ?? []
  if (!candidates.length) return null

  let best: { rule: any; reward: { partner: number; customer: number } } | null = null

  for (const rule of candidates) {
    const reward = calculateItemRewardByRule({ rule, itemTotal, quantity })
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

export function calculateCommissionAndDiscount({
  cartItems,
  program,
  currencyCode = 'AED',
}: {
  cartItems: any[]
  program: any
  currencyCode?: string
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
    })

    if (!bestMatch) continue

    totalPartnerCommission += bestMatch.reward.partner
    totalCustomerDiscount += bestMatch.reward.customer
  }

  return { partnerCommission: totalPartnerCommission, customerDiscount: totalCustomerDiscount }
}
