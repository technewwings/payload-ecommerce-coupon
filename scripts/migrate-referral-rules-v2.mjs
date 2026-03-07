#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Migration helper for Referral Program v2.
 *
 * Usage:
 *   node scripts/migrate-referral-rules-v2.mjs            # dry-run
 *   node scripts/migrate-referral-rules-v2.mjs --apply    # persist changes
 *
 * Requires PAYLOAD_CONFIG_PATH to load Payload local API.
 */

const hasApplyFlag = process.argv.includes('--apply')

const configPath = process.env.PAYLOAD_CONFIG_PATH
if (!configPath) {
  console.error('PAYLOAD_CONFIG_PATH is required')
  process.exit(1)
}

const { default: payload } = await import('payload')
const { default: config } = await import(configPath)

await payload.init({ config })

const programsResult = await payload.find({
  collection: 'referral-programs',
  limit: 1000,
})

let changedPrograms = 0
let convertedRules = 0
let flaggedLegacyRules = 0

function toSplitRule(rule) {
  // Already v2 style
  if (rule.totalCommission && typeof rule.partnerSplit === 'number') {
    return {
      ...rule,
      appliesTo: rule.appliesTo === 'categories' ? 'segments' : rule.appliesTo,
      customerSplit:
        typeof rule.customerSplit === 'number' ? rule.customerSplit : 100 - rule.partnerSplit,
    }
  }

  // Legacy shared style
  if (rule.totalCommission && typeof rule.referrerSplit === 'number') {
    return {
      ...rule,
      appliesTo: rule.appliesTo === 'categories' ? 'segments' : rule.appliesTo,
      partnerSplit: rule.referrerSplit,
      customerSplit:
        typeof rule.refereeSplit === 'number' ? rule.refereeSplit : 100 - rule.referrerSplit,
    }
  }

  // Legacy direct style can only be converted safely when both rewards are percentages.
  if (
    rule.referrerReward?.type === 'percentage' &&
    rule.refereeReward?.type === 'percentage' &&
    typeof rule.referrerReward?.value === 'number' &&
    typeof rule.refereeReward?.value === 'number'
  ) {
    const total = rule.referrerReward.value + rule.refereeReward.value
    if (total <= 0) return { converted: null, legacy: true }

    return {
      ...rule,
      appliesTo: rule.appliesTo === 'categories' ? 'segments' : rule.appliesTo,
      totalCommission: {
        type: 'percentage',
        value: total,
      },
      partnerSplit: (rule.referrerReward.value / total) * 100,
      customerSplit: (rule.refereeReward.value / total) * 100,
    }
  }

  return { converted: null, legacy: true }
}

for (const program of programsResult.docs) {
  const nextRules = []
  let hasChanges = false

  for (const rule of program.commissionRules || []) {
    const converted = toSplitRule(rule)

    if (converted?.legacy) {
      flaggedLegacyRules += 1
      console.warn(
        `[legacy] program=${program.id} rule=${rule.id || rule.name || 'unknown'} requires manual conversion`,
      )
      nextRules.push(rule)
      continue
    }

    const nextRule = converted
    const changed =
      nextRule.appliesTo !== rule.appliesTo ||
      nextRule.partnerSplit !== rule.partnerSplit ||
      nextRule.customerSplit !== rule.customerSplit

    if (changed) {
      hasChanges = true
      convertedRules += 1
    }

    nextRules.push(nextRule)
  }

  if (!hasChanges) continue

  changedPrograms += 1

  if (hasApplyFlag) {
    await payload.update({
      collection: 'referral-programs',
      id: program.id,
      data: {
        commissionRules: nextRules,
      },
    })
  }
}

console.log(
  JSON.stringify(
    {
      mode: hasApplyFlag ? 'apply' : 'dry-run',
      scannedPrograms: programsResult.totalDocs,
      changedPrograms,
      convertedRules,
      flaggedLegacyRules,
    },
    null,
    2,
  ),
)

await payload.destroy()
