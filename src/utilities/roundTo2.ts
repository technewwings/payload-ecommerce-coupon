/**
 * Rounds a number to 2 decimal places (standard for monetary values).
 */
export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}
