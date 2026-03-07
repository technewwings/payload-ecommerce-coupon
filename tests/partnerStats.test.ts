import { describe, expect, it, jest, beforeEach, afterEach } from "bun:test";
import { partnerStatsHandler } from "../src/endpoints/partnerStats";
import { sanitizePluginConfig } from "../src/utilities/sanitizePluginConfig";

const makePluginConfig = (overrides: Record<string, unknown> = {}) =>
  sanitizePluginConfig({
    pluginConfig: {
      enableReferrals: true,
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
        partnerStats: "/referrals/partner-stats",
      },
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: () => false,
        isPartner: () => false,
      },
      ...overrides,
    } as any,
  });

const createMockPayload = () => ({
  find: jest.fn(),
  findByID: jest.fn(),
});

describe("Partner Stats Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 401 when user is missing", async () => {
    const pluginConfig = makePluginConfig();
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    const response = await handler({ payload, user: null } as any);
    const result = await response.json();

    expect(response.status).toBe(401);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication required");
  });

  it("returns 403 when authenticated user is neither partner nor admin", async () => {
    const pluginConfig = makePluginConfig({
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: () => false,
        isPartner: () => false,
      },
    });
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    const response = await handler({
      payload,
      user: { id: "u-1", role: "customer" },
    } as any);
    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Partner access required");
  });

  it("allows partner users via role config and returns aggregated stats", async () => {
    const pluginConfig = makePluginConfig({
      roleConfig: {
        roleFieldPaths: ["roles"],
        partnerRoleValues: ["partner"],
        adminRoleValues: ["admin"],
      },
    });
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    payload.find.mockImplementation((args: any) => {
      if (args.collection === "referral-codes") {
        return Promise.resolve({
          docs: [
            {
              id: "rc-1",
              code: "PARTNER10",
              totalEarnings: 100.45,
              pendingEarnings: 20.1,
              paidEarnings: 80.35,
              usageCount: 10,
              successfulReferralsCount: 4,
              isActive: true,
              program: { id: "prog-1" },
            },
            {
              id: "rc-2",
              code: "PARTNER20",
              totalEarnings: 50,
              pendingEarnings: 5,
              paidEarnings: 45,
              usageCount: 6,
              successfulReferralsCount: 2,
              isActive: false,
              program: { id: "prog-1" },
            },
          ],
        });
      }

      if (args.collection === "orders") {
        return Promise.resolve({
          docs: [
            {
              id: "order-1",
              appliedReferralCode: "rc-1",
              total: 300,
              partnerCommission: 30,
              createdAt: "2025-01-01T00:00:00.000Z",
              paymentStatus: "paid",
            },
            {
              id: "order-2",
              appliedReferralCode: "rc-2",
              total: 120,
              partnerCommission: 12,
              createdAt: "2025-01-02T00:00:00.000Z",
              paymentStatus: "pending",
            },
          ],
        });
      }

      return Promise.resolve({ docs: [] });
    });

    payload.findByID.mockResolvedValue({
      id: "prog-1",
      name: "Default Program",
      commissionRules: [
        {
          split: { partnerPercentage: 70, customerPercentage: 30 },
        },
      ],
    });

    const response = await handler({
      payload,
      user: { id: "u-partner", roles: ["partner"] },
    } as any);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.currency).toBe("USD");

    expect(result.data.stats.totalEarnings).toBeCloseTo(150.45, 2);
    expect(result.data.stats.pendingEarnings).toBeCloseTo(25.1, 2);
    expect(result.data.stats.paidEarnings).toBeCloseTo(125.35, 2);
    expect(result.data.stats.totalReferrals).toBe(16);
    expect(result.data.stats.successfulReferrals).toBe(6);
    expect(result.data.stats.conversionRate).toBe(37.5);

    expect(result.data.referralCodes).toHaveLength(2);
    expect(result.data.referralCodes[0]).toEqual({
      id: "rc-1",
      code: "PARTNER10",
      usageCount: 10,
      totalEarnings: 100.45,
      isActive: true,
    });

    expect(result.data.stats.recentReferrals).toHaveLength(2);
    expect(result.data.stats.recentReferrals[0].status).toBe("paid");
    expect(result.data.stats.recentReferrals[1].status).toBe("pending");

    expect(result.data.stats.monthlyEarnings).toHaveLength(6);
    for (const row of result.data.stats.monthlyEarnings) {
      expect(row.earnings).toBe(0);
      expect(row.referrals).toBe(0);
      expect(typeof row.month).toBe("string");
    }

    expect(result.data.program).toEqual({
      name: "Default Program",
      commissionRate: 70,
      customerDiscount: 30,
    });
  });

  it("allows admin users via access override and handles orders/program fetch failures gracefully", async () => {
    const pluginConfig = makePluginConfig({
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: () => true,
        isPartner: () => false,
      },
    });
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    payload.find.mockImplementation((args: any) => {
      if (args.collection === "referral-codes") {
        return Promise.resolve({
          docs: [
            {
              id: "rc-1",
              code: "ADMINCODE",
              usageCount: 0,
              totalEarnings: 0,
              pendingEarnings: 0,
              paidEarnings: 0,
              successfulReferralsCount: 0,
              isActive: true,
              program: "prog-err",
            },
          ],
        });
      }

      if (args.collection === "orders") {
        throw new Error("orders unavailable");
      }

      return Promise.resolve({ docs: [] });
    });

    payload.findByID.mockRejectedValue(new Error("program fetch failed"));

    const response = await handler({
      payload,
      user: { id: "u-admin", role: "someone-else" },
    } as any);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);

    expect(result.data.stats.recentReferrals).toEqual([]);
    expect(result.data.program).toBeNull();
    expect(result.data.stats.conversionRate).toBe(0);
    expect(result.data.stats.totalReferrals).toBe(0);
  });

  it("returns 500 when referral-code query fails at top level", async () => {
    const pluginConfig = makePluginConfig({
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: () => true,
        isPartner: () => false,
      },
    });
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    payload.find.mockRejectedValue(new Error("db failure"));

    const response = await handler({
      payload,
      user: { id: "u-admin", role: "admin" },
    } as any);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch partner stats");
  });

  it("maps legacy rule split fields (referrerSplit/refereeSplit) into program summary", async () => {
    const pluginConfig = makePluginConfig({
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: () => true,
        isPartner: () => false,
      },
    });
    const handler = partnerStatsHandler({ pluginConfig });
    const payload = createMockPayload();

    payload.find.mockImplementation((args: any) => {
      if (args.collection === "referral-codes") {
        return Promise.resolve({
          docs: [
            {
              id: "rc-legacy",
              code: "LEGACY",
              usageCount: 1,
              totalEarnings: 10,
              pendingEarnings: 0,
              paidEarnings: 10,
              successfulReferralsCount: 1,
              isActive: true,
              program: { id: "prog-legacy" },
            },
          ],
        });
      }

      if (args.collection === "orders") {
        return Promise.resolve({ docs: [] });
      }

      return Promise.resolve({ docs: [] });
    });

    payload.findByID.mockResolvedValue({
      id: "prog-legacy",
      name: "Legacy Program",
      commissionRules: [
        {
          referrerSplit: 65,
          refereeSplit: 35,
        },
      ],
    });

    const response = await handler({
      payload,
      user: { id: "u-admin", role: "admin" },
    } as any);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.program).toEqual({
      name: "Legacy Program",
      commissionRate: 65,
      customerDiscount: 35,
    });
  });
});
