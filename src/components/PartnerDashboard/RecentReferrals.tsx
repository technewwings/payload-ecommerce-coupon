"use client";

import React from "react";

import type { PartnerStats } from "../../types";

export type RecentReferralsProps = {
  referrals: PartnerStats["recentReferrals"];
  currency: string;
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const RecentReferrals: React.FC<RecentReferralsProps> = ({ referrals, currency }) => {
  return (
    <div className="partner-widget partner-widget--recent">
      <h3 className="partner-widget__title">Recent Referrals</h3>
      <div className="partner-widget__content">
        <div className="referrals-table">
          <div className="referrals-table__header">
            <span>Code</span>
            <span>Order Value</span>
            <span>Commission</span>
            <span>Date</span>
            <span>Status</span>
          </div>
          <div className="referrals-table__body">
            {referrals.map((referral) => (
              <div key={referral.id} className="referrals-table__row">
                <span className="referrals-table__code">{referral.code}</span>
                <span className="referrals-table__value">
                  {formatCurrency(referral.orderValue, currency)}
                </span>
                <span className="referrals-table__commission">
                  {formatCurrency(referral.commission, currency)}
                </span>
                <span className="referrals-table__date">{formatDate(referral.date)}</span>
                <span
                  className={`referrals-table__status referrals-table__status--${referral.status}`}
                >
                  {referral.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecentReferrals;
