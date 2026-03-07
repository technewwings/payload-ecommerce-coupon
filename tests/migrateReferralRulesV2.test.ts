import { describe, expect, it } from "bun:test";
import { migrateReferralRuleToV2 } from "../src/utilities/migrateReferralRulesV2";

describe("migrateReferralRuleToV2", () => {
  it("should map legacy shared fields to partner/customer split", () => {
    const result = migrateReferralRuleToV2({
      appliesTo: "categories",
      totalCommission: { type: "percentage", value: 15 },
      referrerSplit: 30,
      refereeSplit: 70,
    });

    expect(result.needsManualReview).toBe(false);
    expect(result.rule?.appliesTo).toBe("segments");
    expect(result.rule?.partnerSplit).toBe(30);
    expect(result.rule?.customerSplit).toBe(70);
  });

  it("should convert direct percentage rules into shared representation", () => {
    const result = migrateReferralRuleToV2({
      appliesTo: "all",
      referrerReward: { type: "percentage", value: 6 },
      refereeReward: { type: "percentage", value: 4 },
    });

    expect(result.needsManualReview).toBe(false);
    expect(result.rule?.totalCommission).toEqual({ type: "percentage", value: 10 });
    expect(result.rule?.partnerSplit).toBe(60);
    expect(result.rule?.customerSplit).toBe(40);
  });

  it("should flag legacy fixed direct rules for manual conversion", () => {
    const result = migrateReferralRuleToV2({
      appliesTo: "all",
      referrerReward: { type: "fixed", value: 5 },
      refereeReward: { type: "percentage", value: 4 },
    });

    expect(result.needsManualReview).toBe(true);
    expect(result.rule).toBeNull();
  });
});
