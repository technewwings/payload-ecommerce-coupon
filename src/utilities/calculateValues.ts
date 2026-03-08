import { getCartItemUnitPrice } from './pricing'

// ---------------------------------------------------------------------------
// Cent-safe arithmetic helpers
//
// Policy:
//   • All monetary values arrive from the DB / admin in NORMAL CURRENCY units
//     (e.g. 10.50 means $10.50).
//   • Before any arithmetic we scale UP to integer CENTS (×100) so every
//     intermediate result is a safe integer with no floating-point drift.
//   • Results are scaled back DOWN (÷100) before being returned to callers,
//     who then store them in DB as normal currency again.
//   • Percentage values (0-100) stay as-is; they act as divisors inside the
//     formula and do not need independent scaling.
// ---------------------------------------------------------------------------

/** Convert a normal-currency amount to integer cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Convert integer cents back to a normal-currency amount (2 dp max). */
function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

// ---------------------------------------------------------------------------
// Public: coupon discount
// ---------------------------------------------------------------------------

/**
 * Calculate the discount amount for a coupon.
 *
 * @param coupon    - Coupon document from DB (values in normal currency).
 * @param cartTotal - Cart subtotal in normal currency.
 * @returns Discount amount in normal currency (2 dp).
 */
export function calculateCouponDiscount({
  coupon,
  cartTotal,
}: {
  coupon: any
  cartTotal: number
}): number {
  const cartCents = toCents(cartTotal)
  let discountCents = 0

  if (coupon.type === 'percentage') {
    // percentage value is 0-100, no scaling needed
    discountCents = Math.floor((cartCents * coupon.value) / 100)
    if (coupon.maxDiscountAmount != null) {
      const maxCents = toCents(coupon.maxDiscountAmount)
      if (discountCents > maxCents) discountCents = maxCents
    }
  } else if (coupon.type === 'fixed') {
    discountCents = toCents(coupon.value)
    if (discountCents > cartCents) discountCents = cartCents
  }

  return fromCents(discountCents)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

  return { partnerSplit: partnerRaw, customerSplit: customerRaw }
}

// ---------------------------------------------------------------------------
// Core per-item reward calculation (all values in CENTS)
// ---------------------------------------------------------------------------

/**
 * Calculate partner and customer reward for a single line item.
 *
 * ALL inputs are expected in CENTS.
 * Returns rewards in CENTS, or null if the rule is inapplicable.
 */
function calculateItemRewardByRule({
  rule,
  itemTotalCents,
  quantity,
  allowedTotalCommissionTypes,
}: {
  rule: any
  itemTotalCents: number
  quantity: number
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): { partner: number; customer: number } | null {
  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)

  // ── Shared / v2 model ────────────────────────────────────────────────────
  if (rule.totalCommission) {
    if (!allowedTypes.has(rule.totalCommission.type)) return null

    // maxAmount is stored in normal currency → convert to cents
    const resolvedMaxAmountCents =
      typeof rule.totalCommission.maxAmount === 'number' &&
      Number.isFinite(rule.totalCommission.maxAmount)
        ? toCents(rule.totalCommission.maxAmount)
        : null

    // ── Fixed direct mode: partnerSplit / customerSplit are per-unit currency amounts
    if (rule.totalCommission.type === 'fixed' && rule.totalCommission.value == null) {
      const partnerAmtPerUnitCents =
        typeof rule.partnerSplit === 'number' ? toCents(rule.partnerSplit) : null
      const customerAmtPerUnitCents =
        typeof rule.customerSplit === 'number' ? toCents(rule.customerSplit) : null
      if (partnerAmtPerUnitCents == null || customerAmtPerUnitCents == null) return null

      let partner = partnerAmtPerUnitCents * quantity
      let customer = customerAmtPerUnitCents * quantity

      if (resolvedMaxAmountCents != null) {
        const maxPotForLine = resolvedMaxAmountCents * quantity
        const totalPot = partner + customer
        if (totalPot > maxPotForLine && totalPot > 0) {
          const ratio = maxPotForLine / totalPot
          partner = Math.floor(partner * ratio)
          customer = Math.floor(customer * ratio)
        }
      }

      return { partner, customer }
    }

    // ── Percentage mode ───────────────────────────────────────────────────
    if (rule.totalCommission.type === 'percentage') {
      const commissionValue =
        typeof rule.totalCommission.value === 'number' &&
        Number.isFinite(rule.totalCommission.value)
          ? rule.totalCommission.value
          : null

      if (commissionValue == null) {
        // Direct percent splits (no totalCommission.value)
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

        let partner = Math.floor((itemTotalCents * partnerPercentInput) / 100)
        let customer = Math.floor((itemTotalCents * customerPercentInput) / 100)

        if (resolvedMaxAmountCents != null) {
          const maxPotForLine = resolvedMaxAmountCents * quantity
          const totalForLine = partner + customer
          if (totalForLine > maxPotForLine && totalForLine > 0) {
            const ratio = maxPotForLine / totalForLine
            partner = Math.floor(partner * ratio)
            customer = Math.floor(customer * ratio)
          }
        }

        return { partner, customer }
      }

      // totalCommission.value drives the total pool (percentage of item total)
      let totalPotCents = Math.floor((itemTotalCents * commissionValue) / 100)

      if (resolvedMaxAmountCents != null) {
        const maxPotForLine = resolvedMaxAmountCents * quantity
        if (totalPotCents > maxPotForLine) totalPotCents = maxPotForLine
      }

      const splits = getRuleSplits(rule)
      if (!splits) return null

      return {
        partner: Math.floor((totalPotCents * splits.partnerSplit) / 100),
        customer: Math.floor((totalPotCents * splits.customerSplit) / 100),
      }
    }

    // ── Fixed pool mode: totalCommission.value is a per-unit currency amount
    {
      const splits = getRuleSplits(rule)
      if (!splits) return null

      // totalCommission.value is a per-unit currency amount → convert to cents
      let totalPotCents = toCents(rule.totalCommission.value) * quantity

      if (resolvedMaxAmountCents != null) {
        const maxPotForLine = resolvedMaxAmountCents * quantity
        if (totalPotCents > maxPotForLine) totalPotCents = maxPotForLine
      }

      return {
        partner: Math.floor((totalPotCents * splits.partnerSplit) / 100),
        customer: Math.floor((totalPotCents * splits.customerSplit) / 100),
      }
    }
  }

  // ── Legacy direct-reward model (migration compatibility) ─────────────────
  if (rule.referrerReward && rule.refereeReward) {
    let partner = 0
    if (rule.referrerReward.type === 'percentage') {
      partner = Math.floor((itemTotalCents * rule.referrerReward.value) / 100)
    } else {
      partner = toCents(rule.referrerReward.value) * quantity
    }
    if (rule.referrerReward.maxReward != null) {
      const maxCents = toCents(rule.referrerReward.maxReward)
      if (partner > maxCents) partner = maxCents
    }

    let customer = 0
    if (rule.refereeReward.type === 'percentage') {
      customer = Math.floor((itemTotalCents * rule.refereeReward.value) / 100)
    } else {
      customer = toCents(rule.refereeReward.value) * quantity
    }
    if (rule.refereeReward.maxReward != null) {
      const maxCents = toCents(rule.refereeReward.maxReward)
      if (customer > maxCents) customer = maxCents
    }

    return { partner, customer }
  }

  return null
}

// ---------------------------------------------------------------------------
// Rule selection helpers
// ---------------------------------------------------------------------------

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
  itemTotalCents,
  quantity,
  cartTotalCents,
  minOrderAmountCents,
  allowedTotalCommissionTypes,
}: {
  rules: any[]
  item: any
  itemTotalCents: number
  quantity: number
  cartTotalCents: number
  minOrderAmountCents?: number | null
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): { rule: any; reward: { partner: number; customer: number } } | null {
  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)

  const eligibleRules = rules.filter((rule: any) => {
    const hasSharedType = rule?.totalCommission?.type
      ? allowedTypes.has(rule.totalCommission.type)
      : true
    if (!hasSharedType) return false

    // minOrderAmount on the rule itself is stored in normal currency → cents
    const resolvedMinCents =
      minOrderAmountCents != null && Number.isFinite(minOrderAmountCents)
        ? minOrderAmountCents
        : typeof rule?.minOrderAmount === 'number' && Number.isFinite(rule.minOrderAmount)
          ? toCents(rule.minOrderAmount)
          : null

    if (resolvedMinCents != null) {
      return cartTotalCents >= resolvedMinCents
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
      itemTotalCents,
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

// ---------------------------------------------------------------------------
// Public: minimum order amount
// ---------------------------------------------------------------------------

/**
 * Returns the effective minimum order amount for a program in NORMAL CURRENCY.
 * Returns null if there is no minimum.
 */
export function getProgramMinimumOrderAmount({
  program,
  allowedTotalCommissionTypes,
}: {
  program: any
  allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
}): number | null {
  if (typeof program?.minOrderAmount === 'number' && Number.isFinite(program.minOrderAmount)) {
    return program.minOrderAmount
  }

  const rules = Array.isArray(program?.commissionRules) ? program.commissionRules : []
  if (!rules.length) return null

  const allowedTypes = allowedCommissionTypesSet(allowedTotalCommissionTypes)

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

// ---------------------------------------------------------------------------
// Public: commission + discount calculation
// ---------------------------------------------------------------------------

/**
 * Calculate total partner commission and customer discount for a cart.
 *
 * All monetary inputs are in NORMAL CURRENCY.
 * Returns results in NORMAL CURRENCY (2 dp).
 */
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

  // Scale cart total to cents for eligibility checks
  const cartTotalCents = toCents(cartTotal)

  // Scale program-level minOrderAmount to cents (if present) for rule filtering
  const programMinOrderAmountCents =
    typeof program?.minOrderAmount === 'number' && Number.isFinite(program.minOrderAmount)
      ? toCents(program.minOrderAmount)
      : null

  let totalPartnerCents = 0
  let totalCustomerCents = 0

  for (const item of cartItems) {
    const product = typeof item.product === 'object' ? item.product : {}
    const variant = typeof item.variant === 'object' ? item.variant : {}

    // Unit price from DB is in normal currency → convert to cents
    const itemPriceCurrency = getCartItemUnitPrice({
      item,
      product,
      variant,
      currencyCode,
    })

    const quantity = item.quantity ?? 1
    const itemTotalCents = toCents(itemPriceCurrency) * quantity

    const bestMatch = selectBestRuleForItem({
      rules,
      item: { ...item, product },
      itemTotalCents,
      quantity,
      cartTotalCents,
      minOrderAmountCents: programMinOrderAmountCents,
      allowedTotalCommissionTypes,
    })

    if (!bestMatch) continue

    totalPartnerCents += bestMatch.reward.partner
    totalCustomerCents += bestMatch.reward.customer
  }

  // Per-order caps are stored in normal currency → convert to cents for comparison
  const maxPartnerCents =
    typeof program?.maxPartnerCommissionPerOrder === 'number' &&
    Number.isFinite(program.maxPartnerCommissionPerOrder)
      ? toCents(program.maxPartnerCommissionPerOrder)
      : null

  const maxCustomerCents =
    typeof program?.maxCustomerDiscountPerOrder === 'number' &&
    Number.isFinite(program.maxCustomerDiscountPerOrder)
      ? toCents(program.maxCustomerDiscountPerOrder)
      : null

  if (maxPartnerCents != null) {
    totalPartnerCents = Math.min(totalPartnerCents, maxPartnerCents)
  }
  if (maxCustomerCents != null) {
    totalCustomerCents = Math.min(totalCustomerCents, maxCustomerCents)
  }

  // Convert back to normal currency for return
  return {
    partnerCommission: fromCents(totalPartnerCents),
    customerDiscount: fromCents(totalCustomerCents),
  }
}
