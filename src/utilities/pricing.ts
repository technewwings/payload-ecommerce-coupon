export const DEFAULT_PRICE_CURRENCY = 'AED'

type PriceEntity = {
  price?: number | null
} & Record<string, unknown>

function normalizeCurrencyCode(currencyCode?: string): string {
  if (!currencyCode) return DEFAULT_PRICE_CURRENCY
  return currencyCode.toUpperCase()
}

function readNumberField(entity: unknown, key: string): number | undefined {
  if (!entity || typeof entity !== 'object') return undefined
  const value = (entity as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

export function getPriceFieldKey(currencyCode: string): string {
  return `priceIn${normalizeCurrencyCode(currencyCode)}`
}

export function readMoneyField(
  entity: PriceEntity | null | undefined,
  currencyCode: string,
  defaultCurrencyCode = DEFAULT_PRICE_CURRENCY,
): number | undefined {
  if (!entity) return undefined

  const primaryField = getPriceFieldKey(currencyCode)
  const primary = readNumberField(entity, primaryField)
  if (typeof primary === 'number') return primary

  const fallbackField = getPriceFieldKey(defaultCurrencyCode)
  if (fallbackField !== primaryField) {
    const fallback = readNumberField(entity, fallbackField)
    if (typeof fallback === 'number') return fallback
  }

  return typeof entity.price === 'number' ? entity.price : undefined
}

export function resolveMoneyField(
  entity: PriceEntity | null | undefined,
  currencyCode: string,
  defaultCurrencyCode = DEFAULT_PRICE_CURRENCY,
): number {
  return readMoneyField(entity, currencyCode, defaultCurrencyCode) ?? 0
}

export function getCartItemUnitPrice({
  item,
  product,
  variant,
  currencyCode,
  defaultCurrencyCode = DEFAULT_PRICE_CURRENCY,
}: {
  item?: {
    price?: number | null
    unitPrice?: number | null
  } | null
  product?: PriceEntity | null
  variant?: PriceEntity | null
  currencyCode: string
  defaultCurrencyCode?: string
}): number {
  if (typeof item?.price === 'number') return item.price
  if (typeof item?.unitPrice === 'number') return item.unitPrice
  if (variant) return resolveMoneyField(variant, currencyCode, defaultCurrencyCode)
  return resolveMoneyField(product, currencyCode, defaultCurrencyCode)
}
