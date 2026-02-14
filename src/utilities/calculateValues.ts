import { roundTo2 } from './roundTo2'
import { getCartItemUnitPrice } from './pricing'

export function calculateCouponDiscount({ coupon, cartTotal }: { coupon: any; cartTotal: number }) {
  let discount = 0

  if (coupon.type === 'percentage') {
    discount = roundTo2((cartTotal * coupon.value) / 100)
    // Apply max discount cap if set
    if (coupon.maxDiscountAmount != null && discount > coupon.maxDiscountAmount) {
      discount = roundTo2(coupon.maxDiscountAmount)
    }
  } else if (coupon.type === 'fixed') {
    discount = roundTo2(coupon.value)
    // Ensure discount doesn't exceed cart total
    if (discount > cartTotal) {
      discount = roundTo2(cartTotal)
    }
  }

  return roundTo2(discount)
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
  const rules = program.commissionRules || []

  if (rules.length === 0) {
    return { partnerCommission: 0, customerDiscount: 0 }
  }

  let totalPartnerCommission = 0
  let totalCustomerDiscount = 0

  for (const item of cartItems) {
    const rule = findApplicableCommissionRule(rules, item)
    if (!rule) continue

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

    let itemPartner
    let itemCustomer

    // Shared Basis Calculation
    if (rule.basis === 'shared') {
      if (!rule.totalCommission || rule.referrerSplit == null || rule.refereeSplit == null) {
        continue
      }

      let totalPot
      if (rule.totalCommission.type === 'percentage') {
        totalPot = (itemTotal * rule.totalCommission.value) / 100
      } else {
        totalPot = rule.totalCommission.value * quantity
      }

      if (rule.totalCommission.maxAmount != null && totalPot > rule.totalCommission.maxAmount) {
        totalPot = rule.totalCommission.maxAmount
      }

      // Using Math.floor as per customer requirement (e.g. 2499.5 -> 2499)
      itemPartner = Math.floor((totalPot * (rule.referrerSplit || 0)) / 100)
      itemCustomer = Math.floor((totalPot * (rule.refereeSplit || 0)) / 100)
    }
    // Direct Basis Calculation (Legacy)
    else {
      if (!rule.referrerReward || !rule.refereeReward) continue

      // Partner commission from this rule's referrerReward
      if (rule.referrerReward.type === 'percentage') {
        itemPartner = (itemTotal * rule.referrerReward.value) / 100
      } else {
        itemPartner = rule.referrerReward.value * quantity
      }
      if (rule.referrerReward.maxReward != null && itemPartner > rule.referrerReward.maxReward) {
        itemPartner = rule.referrerReward.maxReward
      }

      // Customer discount from this rule's refereeReward
      if (rule.refereeReward.type === 'percentage') {
        itemCustomer = (itemTotal * rule.refereeReward.value) / 100
      } else {
        itemCustomer = rule.refereeReward.value * quantity
      }
      if (rule.refereeReward.maxReward != null && itemCustomer > rule.refereeReward.maxReward) {
        itemCustomer = rule.refereeReward.maxReward
      }
    }

    totalPartnerCommission += itemPartner
    totalCustomerDiscount += itemCustomer
  }

  return { partnerCommission: totalPartnerCommission, customerDiscount: totalCustomerDiscount }
}

function findApplicableCommissionRule(rules: any[], item: any) {
  const productId = typeof item.product === 'string' ? item.product : item.product?.id
  const categoryId = item.category ?? item.product?.category

  const productRule = rules.find(
    (r: any) =>
      r.appliesTo === 'products' &&
      r.products?.some((p: any) => (typeof p === 'string' ? p : p?.id) === productId),
  )
  if (productRule) return productRule

  if (categoryId) {
    const categoryRule = rules.find(
      (r: any) =>
        r.appliesTo === 'categories' &&
        r.categories?.some((c: any) => (typeof c === 'string' ? c : c?.id) === categoryId),
    )
    if (categoryRule) return categoryRule
  }

  return rules.find((r: any) => r.appliesTo === 'all') ?? null
}
