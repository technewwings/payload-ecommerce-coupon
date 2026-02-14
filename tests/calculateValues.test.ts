import { describe, expect, it } from 'bun:test'
import { calculateCommissionAndDiscount, calculateCouponDiscount } from '../src/utilities/calculateValues'

describe('calculateCouponDiscount', () => {
    it('should calculate percentage discount correctly', () => {
        const coupon = { type: 'percentage', value: 10 }
        const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
        expect(discount).toBe(10)
    })

    it('should round percentage discount to 2 decimal places', () => {
        const coupon = { type: 'percentage', value: 10 }
        const discount = calculateCouponDiscount({ coupon, cartTotal: 55.55 })
        expect(discount).toBe(5.56) // 5.555 -> 5.56
    })

    it('should cap percentage discount at maxDiscountAmount', () => {
        const coupon = { type: 'percentage', value: 50, maxDiscountAmount: 20 }
        const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
        expect(discount).toBe(20)
    })

    it('should calculate fixed discount correctly', () => {
        const coupon = { type: 'fixed', value: 15 }
        const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
        expect(discount).toBe(15)
    })

    it('should not exceed cart total for fixed discount', () => {
        const coupon = { type: 'fixed', value: 150 }
        const discount = calculateCouponDiscount({ coupon, cartTotal: 100 })
        expect(discount).toBe(100)
    })
})

describe('calculateCommissionAndDiscount', () => {
    describe('Direct Basis (Legacy)', () => {
        it('should calculate direct commission and discount', () => {
            const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
            const program = {
                commissionRules: [
                    {
                        appliesTo: 'all',
                        referrerReward: { type: 'percentage', value: 10 },
                        refereeReward: { type: 'percentage', value: 5 },
                    }
                ]
            }

            const result = calculateCommissionAndDiscount({ cartItems, program })
            expect(result.partnerCommission).toBe(10)
            expect(result.customerDiscount).toBe(5)
        })
    })

    describe('Shared Basis', () => {
        it('should calculate shared commission with 50/50 split', () => {
            const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
            const program = {
                commissionRules: [
                    {
                        appliesTo: 'all',
                        basis: 'shared',
                        totalCommission: { type: 'percentage', value: 20 },
                        referrerSplit: 50,
                        refereeSplit: 50,
                    }
                ]
            }

            const result = calculateCommissionAndDiscount({ cartItems, program })
            // Pot: 20 (20% of 100)
            // Partner: 10 (50% of 20)
            // Customer: 10 (50% of 20)
            expect(result.partnerCommission).toBe(10)
            expect(result.customerDiscount).toBe(10)
        })

        it('should calculate shared commission with 70/30 split', () => {
            const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1' } }]
            const program = {
                commissionRules: [
                    {
                        appliesTo: 'all',
                        basis: 'shared',
                        totalCommission: { type: 'percentage', value: 10 }, // Pot: 10
                        referrerSplit: 70,
                        refereeSplit: 30,
                    }
                ]
            }

            const result = calculateCommissionAndDiscount({ cartItems, program })
            expect(result.partnerCommission).toBe(7) // 70% of 10
            expect(result.customerDiscount).toBe(3)  // 30% of 10
        })

        it('should use Math.floor for shared splits as per requirement', () => {
            // 2499.5 example
            const cartItems = [{ id: '1', price: 24995, quantity: 1, product: { id: 'p1' } }] // 24995 total
            const program = {
                commissionRules: [
                    {
                        appliesTo: 'all',
                        basis: 'shared',
                        totalCommission: { type: 'percentage', value: 20 }, // Pot: 4999
                        referrerSplit: 50,
                        refereeSplit: 50,
                    }
                ]
            }

            // Pot: 4999
            // Split 50%: 2499.5
            // Math.floor -> 2499

            const result = calculateCommissionAndDiscount({ cartItems, program })
            expect(result.partnerCommission).toBe(2499)
            expect(result.customerDiscount).toBe(2499)
        })
    })

    describe('Rule Selection', () => {
        it('should prioritize product-specific rules', () => {
            const cartItems = [{ id: '1', price: 100, quantity: 1, product: { id: 'p1', category: 'c1' } }]
            const program = {
                commissionRules: [
                    {
                        appliesTo: 'products',
                        products: [{ id: 'p1' }],
                        referrerReward: { type: 'fixed', value: 50 },
                        refereeReward: { type: 'fixed', value: 0 }
                    },
                    {
                        appliesTo: 'categories',
                        categories: [{ id: 'c1' }],
                        referrerReward: { type: 'fixed', value: 20 },
                        refereeReward: { type: 'fixed', value: 0 }
                    }
                ]
            }

            const result = calculateCommissionAndDiscount({ cartItems, program })
            expect(result.partnerCommission).toBe(50)
        })
    })
})
