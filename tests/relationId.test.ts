import { describe, expect, it } from 'bun:test'
import { idsEqual, relationId } from '../src/utilities/relationId'

describe('relationId', () => {
  it('returns null for nullish', () => {
    expect(relationId(null)).toBeNull()
    expect(relationId(undefined)).toBeNull()
  })

  it('returns string and number as-is', () => {
    expect(relationId('abc')).toBe('abc')
    expect(relationId(42)).toBe(42)
  })

  it('coerces bigint to number when safe', () => {
    expect(relationId(42n)).toBe(42)
  })

  it('reads id from populated object', () => {
    expect(relationId({ id: 7 })).toBe(7)
    expect(relationId({ id: 'x' })).toBe('x')
  })

  it('reads bigint id from populated object', () => {
    expect(relationId({ id: 99n })).toBe(99)
  })
})

describe('idsEqual', () => {
  it('compares across types', () => {
    expect(idsEqual(1, 1)).toBe(true)
    expect(idsEqual(1, '1')).toBe(true)
    expect(idsEqual(1, 2)).toBe(false)
    expect(idsEqual(null, 1)).toBe(false)
  })
})
