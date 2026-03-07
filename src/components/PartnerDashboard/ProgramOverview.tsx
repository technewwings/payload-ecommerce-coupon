'use client'

import React from 'react'

import type { PartnerDashboardData } from '../../types'

export type ProgramOverviewProps = {
  program: PartnerDashboardData['program']
}

export const ProgramOverview: React.FC<ProgramOverviewProps> = ({ program }) => {
  if (!program) {
    return (
      <div className="partner-widget partner-widget--program-overview">
        <h3 className="partner-widget__title">Program Overview</h3>
        <div className="partner-widget__content">
          <div className="program-overview program-overview--empty">
            <p>No referral program details are available yet.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="partner-widget partner-widget--program-overview">
      <h3 className="partner-widget__title">Program Overview</h3>
      <div className="partner-widget__content">
        <div className="program-overview">
          <div className="program-overview__row">
            <span className="program-overview__label">Program Name</span>
            <span className="program-overview__value">{program.name}</span>
          </div>
          <div className="program-overview__row">
            <span className="program-overview__label">Commission Rate</span>
            <span className="program-overview__value">{program.commissionRate}%</span>
          </div>
          <div className="program-overview__row">
            <span className="program-overview__label">Customer Discount</span>
            <span className="program-overview__value">{program.customerDiscount}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProgramOverview
