'use client'

import React from 'react'

import type { PartnerStats } from '../../types'

export type ReferralPerformanceProps = {
  stats: PartnerStats
}

export const ReferralPerformance: React.FC<ReferralPerformanceProps> = ({ stats }) => {
  return (
    <div className="partner-widget partner-widget--performance">
      <h3 className="partner-widget__title">Referral Performance</h3>
      <div className="partner-widget__content">
        <div className="performance-grid">
          <div className="performance-stat">
            <span className="performance-stat__value">{stats.totalReferrals}</span>
            <span className="performance-stat__label">Total Referrals</span>
          </div>
          <div className="performance-stat">
            <span className="performance-stat__value">{stats.successfulReferrals}</span>
            <span className="performance-stat__label">Successful</span>
          </div>
          <div className="performance-stat">
            <span className="performance-stat__value">{stats.conversionRate.toFixed(1)}%</span>
            <span className="performance-stat__label">Conversion Rate</span>
          </div>
        </div>

        {stats.monthlyEarnings.length > 0 && (
          <div className="performance-chart">
            <h4 className="performance-chart__title">Monthly Trend</h4>
            <div className="performance-chart__bars">
              {stats.monthlyEarnings.map((month, index) => {
                const maxEarnings = Math.max(...stats.monthlyEarnings.map((m) => m.earnings), 1)
                const heightPercent = (month.earnings / maxEarnings) * 100

                return (
                  <div key={index} className="performance-chart__bar-container">
                    <div
                      className="performance-chart__bar"
                      style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      title={`${month.month}: ${month.referrals} referrals`}
                    />
                    <span className="performance-chart__label">{month.month.split(' ')[0]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReferralPerformance
