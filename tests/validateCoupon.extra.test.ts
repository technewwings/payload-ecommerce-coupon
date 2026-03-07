import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { validateCouponHandler } from "../src/endpoints/validateCoupon";
import { sanitizePluginConfig } from "../src/utilities/sanitizePluginConfig";

const mockPayload = {
  find: jest.fn(),
  findByID: jest.fn(),
};

describe("Validate Coupon Endpoint (extra branches)", () => {
  const couponPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      enabled: true,
      enableReferrals: false,
      defaultCurrency: "USD",
      collections: {
        couponsSlug: "coupons",
        referralProgramsSlug: "referral-programs",
        referralCodesSlug: "referral-codes",
        referralPartnersSlug: "referral-partners",
      },
      endpoints: {
        applyCoupon: "/coupons/apply",
        validateCoupon: "/coupons/validate",
      },
      orderIntegration: {
        ordersSlug: "orders",
        orderCustomerEmailField: "customerEmail",
        orderPaymentStatusField: "paymentStatus",
        orderPaidStatusValue: "paid",
      },
    },
  });

  const referralPluginConfig = sanitizePluginConfig({
    pluginConfig: {
      ...couponPluginConfig,
      enableReferrals: true,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Coupon mode extras", () => {
    it("tries lowercase lookup after exact match miss", async () => {
      mockPayload.find
        .mockResolvedValueOnce({ docs: [], totalDocs: 0 }) // exact
        .mockResolvedValueOnce({
          docs: [
            {
              id: "coupon-1",
              code: "test10",
              type: "fixed",
              value: 10,
            },
          ],
          totalDocs: 1,
        }); // lowercase hit

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "TEST10" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.coupon.code).toBe("test10");
      expect(mockPayload.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { code: { equals: "test10" } },
        }),
      );
    });

    it("tries uppercase lookup after exact/lowercase miss", async () => {
      mockPayload.find
        .mockResolvedValueOnce({ docs: [], totalDocs: 0 }) // exact
        .mockResolvedValueOnce({ docs: [], totalDocs: 0 }) // lowercase
        .mockResolvedValueOnce({
          docs: [
            {
              id: "coupon-2",
              code: "TEST20",
              type: "percentage",
              value: 20,
            },
          ],
          totalDocs: 1,
        }); // uppercase hit

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "test20" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.coupon.code).toBe("TEST20");
      expect(mockPayload.find).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: { code: { equals: "TEST20" } },
        }),
      );
    });

    it("enforces per-customer limit when customerEmail is provided", async () => {
      mockPayload.find
        .mockResolvedValueOnce({
          docs: [
            {
              id: "coupon-3",
              code: "LIMITED",
              type: "fixed",
              value: 5,
              perCustomerLimit: 2,
            },
          ],
          totalDocs: 1,
        }) // coupon lookup
        .mockResolvedValueOnce({
          docs: [],
          totalDocs: 2,
        }); // paid orders count

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "LIMITED", customerEmail: "user@example.com" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.error).toBe("You have reached the maximum uses for this coupon.");
      expect(mockPayload.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          collection: "orders",
          where: {
            and: [
              { appliedCoupon: { equals: "coupon-3" } },
              { customerEmail: { equals: "user@example.com" } },
              { paymentStatus: { equals: "paid" } },
            ],
          },
          limit: 0,
        }),
      );
    });

    it("does not enforce per-customer limit when customerEmail is missing/blank", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "coupon-4",
            code: "EMAILOPT",
            type: "fixed",
            value: 8,
            perCustomerLimit: 1,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "EMAILOPT", customerEmail: "   " },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(mockPayload.find).toHaveBeenCalledTimes(1);
    });

    it("enforces minimum order value using cartValue", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "coupon-5",
            code: "MIN100",
            type: "fixed",
            value: 10,
            minOrderValue: 100,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "MIN100", cartValue: 75 },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toContain("Minimum order value of 100 USD required");
    });

    it("enforces maximum order value using cartValue", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "coupon-6",
            code: "MAX100",
            type: "fixed",
            value: 10,
            maxOrderValue: 100,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "MAX100", cartValue: 150 },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toContain("Maximum order value of 100 USD exceeded");
    });

    it("caps percentage discount by maxDiscountAmount", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "coupon-7",
            code: "PERCENTCAP",
            type: "percentage",
            value: 50,
            maxDiscountAmount: 20,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "PERCENTCAP", cartValue: 100 },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.discount).toBe(20);
    });

    it("caps fixed discount to cartValue", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "coupon-8",
            code: "FIXEDCAP",
            type: "fixed",
            value: 50,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "FIXEDCAP", cartValue: 30 },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.discount).toBe(30);
    });

    it("returns 500 on unexpected coupon validation errors", async () => {
      mockPayload.find.mockRejectedValue(new Error("db down"));

      const handler = validateCouponHandler({ pluginConfig: couponPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "ANY" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Internal server error");
    });
  });

  describe("Referral mode extras", () => {
    it("returns 400 when referral code is inactive", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [{ id: "ref-1", code: "REF1", isActive: false }],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REF1" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe("Referral code is not active");
    });

    it("returns 400 when referral code is expired", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "ref-2",
            code: "REF2",
            isActive: true,
            expiresAt: "2020-01-01T00:00:00.000Z",
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REF2" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe("Referral code has expired");
    });

    it("returns 400 when referral usage limit is exceeded", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "ref-3",
            code: "REF3",
            isActive: true,
            usageLimit: 5,
            usageCount: 5,
          },
        ],
        totalDocs: 1,
      });

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REF3" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe("Referral code usage limit exceeded");
    });

    it("returns 400 when referral program is missing or inactive", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "ref-4",
            code: "REF4",
            isActive: true,
            program: "missing-program",
          },
        ],
        totalDocs: 1,
      });
      mockPayload.findByID.mockResolvedValueOnce(null);

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REF4" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe("Referral program is not active");
    });

    it("uses cart total fallback (subtotal -> total -> 0) and caps customer discount by cart total", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "ref-5",
            code: "REF5",
            isActive: true,
            program: "program-5",
          },
        ],
        totalDocs: 1,
      });
      mockPayload.findByID.mockImplementation((args: any) => {
        if (args.collection === "referral-programs") {
          return Promise.resolve({
            id: "program-5",
            isActive: true,
            commissionRules: [
              {
                appliesTo: "all",
                totalCommission: { type: "fixed", value: 100 },
                partnerSplit: 0,
                customerSplit: 100,
              },
            ],
          });
        }

        if (args.collection === "carts") {
          return Promise.resolve({
            id: "cart-5",
            total: 30,
            items: [{ product: { id: "p1" }, quantity: 1, price: 30 }],
          });
        }

        return Promise.resolve(null);
      });

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REF5", cartID: "cart-5" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.customerDiscount).toBe(30);
    });

    it("returns 500 on unexpected referral validation errors", async () => {
      mockPayload.find.mockRejectedValue(new Error("lookup failed"));

      const handler = validateCouponHandler({ pluginConfig: referralPluginConfig });
      const response = await handler({
        payload: mockPayload,
        data: { code: "REFX" },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Internal server error");
    });
  });
});
