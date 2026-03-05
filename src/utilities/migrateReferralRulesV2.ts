export type MigrationResult = {
  rule: Record<string, unknown> | null;
  needsManualReview: boolean;
};

export function migrateReferralRuleToV2(rule: Record<string, any>): MigrationResult {
  if (rule.totalCommission && typeof rule.partnerSplit === "number") {
    return {
      needsManualReview: false,
      rule: {
        ...rule,
        appliesTo: rule.appliesTo === "categories" ? "segments" : rule.appliesTo,
        customerSplit:
          typeof rule.customerSplit === "number" ? rule.customerSplit : 100 - rule.partnerSplit,
      },
    };
  }

  if (rule.totalCommission && typeof rule.referrerSplit === "number") {
    return {
      needsManualReview: false,
      rule: {
        ...rule,
        appliesTo: rule.appliesTo === "categories" ? "segments" : rule.appliesTo,
        partnerSplit: rule.referrerSplit,
        customerSplit:
          typeof rule.refereeSplit === "number" ? rule.refereeSplit : 100 - rule.referrerSplit,
      },
    };
  }

  if (
    rule.referrerReward?.type === "percentage" &&
    rule.refereeReward?.type === "percentage" &&
    typeof rule.referrerReward?.value === "number" &&
    typeof rule.refereeReward?.value === "number"
  ) {
    const total = rule.referrerReward.value + rule.refereeReward.value;
    if (total <= 0) {
      return { rule: null, needsManualReview: true };
    }

    return {
      needsManualReview: false,
      rule: {
        ...rule,
        appliesTo: rule.appliesTo === "categories" ? "segments" : rule.appliesTo,
        totalCommission: { type: "percentage", value: total },
        partnerSplit: (rule.referrerReward.value / total) * 100,
        customerSplit: (rule.refereeReward.value / total) * 100,
      },
    };
  }

  return { rule: null, needsManualReview: true };
}
