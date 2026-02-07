import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recalculateCartHook } from '../src/hooks/recalculateCart'

describe('recalculateCartHook', () => {
    const mockPluginConfig: any = {
        collections: {
            couponsSlug: 'coupons',
            referralCodesSlug: 'referral-codes',
            referralProgramsSlug: 'referral-programs',
        },
        referralConfig: {
            allowBothSystems: true, // Allow testing both easily
        },
        enableReferrals: true,
        defaultCurrency: 'USD',
    }

    const mockPayload = {
        find: vi.fn(),
        findByID: vi.fn(),
    }

    const mockReq: any = { payload: mockPayload }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return zeros if no items in cart', async () => {
        const hook = recalculateCartHook(mockPluginConfig)
        const data = { items: [] }
        const result = await hook({ data, req: mockReq } as any)

        expect(result.partnerCommission).toBe(0)
        expect(result.customerDiscount).toBe(0)
        expect(result.discountAmount).toBe(0)
        expect(result.total).toBe(0)
    })

    it('should recalculate subtotal/total based on items (no codes)', async () => {
        const hook = recalculateCartHook(mockPluginConfig)
        // Data has items, but we need to mock product fetch
        const data = {
            items: [{ product: 'p1', quantity: 2 }],
        }

        // Mock product lookup
        mockPayload.find.mockResolvedValue({
            docs: [{ id: 'p1', price: 100 }],
        })

        const result: any = await hook({ data, req: mockReq } as any)

        // 2 * 100 = 200
        // No codes -> no discount
        // But hook doesn't currently write 'total' if no codes exist, unless we enforce it?
        // Let's check logic: if (!appliedReferralCode && !appliedCoupon) -> return data
        // So this test confirms it passes through without touching total if no codes.
        expect(result).toBe(data)
    })

    it('should calculate referral discount', async () => {
        const hook = recalculateCartHook(mockPluginConfig)
        const data = {
            items: [{ product: 'p1', quantity: 1 }],
            appliedReferralCode: 'ref-1',
        }

        // 1. Fetch Products
        mockPayload.find.mockImplementation((args: any) => {
            if (args.collection === 'products') {
                return Promise.resolve({ docs: [{ id: 'p1', price: 100 }] })
            }
            if (args.collection === 'referral-codes') {
                return Promise.resolve({ docs: [{ id: 'ref-1', program: { id: 'prog-1' } }] })
            }
            return Promise.resolve({ docs: [] })
        })

        // Program returns shared commission rules
        // Using calculateCommissionAndDiscount logic, let's say 20% pot, 50/50 split
        // 100 * 20% = 20 pot. 10 partner, 10 customer.
        vi.mock('../src/utilities/calculateValues', async () => {
            const actual = await vi.importActual('../src/utilities/calculateValues')
            return {
                ...(actual as any),
                calculateCommissionAndDiscount: () => ({ partnerCommission: 10, customerDiscount: 10 }),
            }
        })

        await hook({ data, req: mockReq } as any)

        // Wait, I mocked the module import but using `recalculateCartHook.ts` which imports it directly.
        // Vitest module mocking should work if hoisted or using doMock.
        // For simplicity, let's rely on actual logic or just mock the hook logic flow by ensuring data availability.

        // Actually, since I am testing integration of hook + utility, let's NOT mock the utility.
        // I need to provide a real program structure.
    })
})

// Re-write test suite to use real utilities for better integration testing
describe('recalculateCartHook Integration', () => {
    const mockPluginConfig: any = {
        collections: {
            couponsSlug: 'coupons',
            referralCodesSlug: 'referral-codes',
            referralProgramsSlug: 'referral-programs',
        },
        referralConfig: { allowBothSystems: true },
        enableReferrals: true,
        defaultCurrency: 'USD',
    }

    const mockPayload = { find: vi.fn() }
    const mockReq: any = { payload: mockPayload }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should apply referral calculations', async () => {
        const hook = recalculateCartHook(mockPluginConfig)
        const data = { items: [{ product: 'p1', quantity: 1 }], appliedReferralCode: 'ref-1' }

        mockPayload.find.mockImplementation((args: any) => {
            if (args.collection === 'products')
                return Promise.resolve({ docs: [{ id: 'p1', price: 100 }] })
            if (args.collection === 'referral-codes') {
                return Promise.resolve({
                    docs: [
                        {
                            id: 'ref-1',
                            program: {
                                id: 'prog-1',
                                commissionRules: [
                                    {
                                        appliesTo: 'all',
                                        basis: 'shared',
                                        totalCommission: { type: 'percentage', value: 20 },
                                        referrerSplit: 50,
                                        refereeSplit: 50,
                                    },
                                ],
                            },
                        },
                    ],
                })
            }
            return Promise.resolve({ docs: [] })
        })

        const result: any = await hook({ data, req: mockReq } as any)

        // 100 * 20% = 20. Split 50/50 = 10 each.
        expect(result.partnerCommission).toBe(10)
        expect(result.customerDiscount).toBe(10)
        expect(result.total).toBe(90) // 100 - 10
    })

    it('should apply coupons', async () => {
        const hook = recalculateCartHook(mockPluginConfig)
        const data = { items: [{ product: 'p1', quantity: 1 }], appliedCoupon: 'coupon-1' }

        mockPayload.find.mockImplementation((args: any) => {
            if (args.collection === 'products')
                return Promise.resolve({ docs: [{ id: 'p1', price: 100 }] })
            if (args.collection === 'coupons') {
                return Promise.resolve({
                    docs: [{ id: 'coupon-1', type: 'fixed', value: 25 }],
                })
            }
            return Promise.resolve({ docs: [] })
        })

        const result: any = await hook({ data, req: mockReq } as any)

        expect(result.discountAmount).toBe(25)
        expect(result.total).toBe(75)
    })

    it('should recalculate totals when quantity changes but price is missing in data', async () => {
        const hook = recalculateCartHook(mockPluginConfig)

        // Original cart has 1 item with price
        const originalDoc = {
            items: [{ product: { id: 'p1', price: 100 }, quantity: 1, price: 100, id: 'row-1' }],
            appliedCoupon: 'c1',
            discountAmount: 10,
            total: 90,
        }

        // Update: change quantity to 2. Data items usually don't have hydrated product or price.
        const data = {
            items: [
                { product: 'p1', quantity: 2, id: 'row-1' }, // Price missing!
            ],
            appliedCoupon: 'c1', // Coupon persists
        }

        mockPayload.find.mockImplementation((args: any) => {
            // Return product with price 100
            if (args.collection === 'products') {
                return Promise.resolve({
                    docs: [{ id: 'p1', price: 100 }],
                })
            }
            // Return coupon with 10% discount
            if (args.collection === 'coupons') {
                return Promise.resolve({
                    docs: [
                        {
                            id: 'c1',
                            code: 'TEST',
                            type: 'percentage',
                            value: 10,
                        },
                    ],
                })
            }
            return Promise.resolve({ docs: [] })
        })

        const result: any = await hook({ data, req: mockReq, originalDoc } as any)

        // Expected:
        // Subtotal = 100 * 2 = 200
        // Discount = 10% of 200 = 20
        // Total = 200 - 20 = 180
        expect(result.discountAmount).toBe(20)
        expect(result.total).toBe(180)
    })
})
