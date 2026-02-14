'use client'

import React from 'react'

import type { PartnerStats } from '../../types'

export type EarningsSummaryProps = {
  stats: PartnerStats
  currency: string
}

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export const EarningsSummary: React.FC<EarningsSummaryProps> = ({ stats, currency }) => {
  return (
    <div className="partner-widget partner-widget--earnings">
      <h3 className="partner-widget__title">Earnings Summary</h3>
      <div className="partner-widget__content">
        <div className="earnings-grid">
          <div className="earnings-card earnings-card--total">
            <span className="earnings-card__label">Total Earnings</span>
            <span className="earnings-card__value">
              {formatCurrency(stats.totalEarnings, currency)}
            </span>
          </div>
          <div className="earnings-card earnings-card--pending">
            <span className="earnings-card__label">Pending</span>
            <span className="earnings-card__value">
              {formatCurrency(stats.pendingEarnings, currency)}
            </span>
          </div>
          <div className="earnings-card earnings-card--paid">
            <span className="earnings-card__label">Paid Out</span>
            <span className="earnings-card__value">
              {formatCurrency(stats.paidEarnings, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EarningsSummary
