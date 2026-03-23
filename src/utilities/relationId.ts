/**
 * Normalize Payload relationship field values to a primitive id for queries and comparisons.
 * Handles bigint (e.g. Postgres), populated objects, and plain ids.
 */
export type RelationValue =
  | string
  | number
  | bigint
  | { id?: string | number | bigint }
  | null
  | undefined

export function relationId(value: RelationValue): string | number | null {
  if (value == null) return null
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : String(value)
  }
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (id == null) return null
    if (typeof id === 'bigint') {
      const n = Number(id)
      return Number.isSafeInteger(n) ? n : String(id)
    }
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

/** Compare two ids that may differ in type (number vs string vs bigint). */
export function idsEqual(a: string | number | null, b: unknown): boolean {
  if (a == null || b == null) return false
  return String(a) === String(b)
}
