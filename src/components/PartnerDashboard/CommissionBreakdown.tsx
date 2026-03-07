"use client";

import React from "react";

import type { PartnerStats } from "../../types";

export type CommissionBreakdownProps = {
  stats: PartnerStats;
  currency: string;
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
};

export const CommissionBreakdown: React.FC<CommissionBreakdownProps> = ({ stats, currency }) => {
  const totalEarnings = Math.max(stats.totalEarnings || 0, 0);
  const paidEarnings = Math.max(stats.paidEarnings || 0, 0);
  const pendingEarnings = Math.max(stats.pendingEarnings || 0, 0);

  const paidPercent = totalEarnings > 0 ? (paidEarnings / totalEarnings) * 100 : 0;
  const pendingPercent = totalEarnings > 0 ? (pendingEarnings / totalEarnings) * 100 : 0;
  const unpaidOrOther = Math.max(totalEarnings - (paidEarnings + pendingEarnings), 0);
  const otherPercent = totalEarnings > 0 ? (unpaidOrOther / totalEarnings) * 100 : 0;

  return (
    <div className="partner-widget partner-widget--commission-breakdown">
      <h3 className="partner-widget__title">Commission Breakdown</h3>

      <div className="partner-widget__content">
        <div className="commission-breakdown">
          <div className="commission-breakdown__summary">
            <span className="commission-breakdown__total-label">Total Commission</span>
            <span className="commission-breakdown__total-value">
              {formatCurrency(totalEarnings, currency)}
            </span>
          </div>

          <div
            className="commission-breakdown__bars"
            role="img"
            aria-label="Commission distribution"
          >
            <div className="commission-breakdown__track">
              <div
                className="commission-breakdown__segment commission-breakdown__segment--paid"
                style={{ width: `${Math.max(Math.min(paidPercent, 100), 0)}%` }}
                title={`Paid: ${formatCurrency(paidEarnings, currency)} (${formatPercent(paidPercent)})`}
              />
              <div
                className="commission-breakdown__segment commission-breakdown__segment--pending"
                style={{ width: `${Math.max(Math.min(pendingPercent, 100), 0)}%` }}
                title={`Pending: ${formatCurrency(pendingEarnings, currency)} (${formatPercent(pendingPercent)})`}
              />
              {otherPercent > 0 && (
                <div
                  className="commission-breakdown__segment commission-breakdown__segment--other"
                  style={{ width: `${Math.max(Math.min(otherPercent, 100), 0)}%` }}
                  title={`Other: ${formatCurrency(unpaidOrOther, currency)} (${formatPercent(otherPercent)})`}
                />
              )}
            </div>
          </div>

          <div className="commission-breakdown__legend">
            <div className="commission-breakdown__item">
              <span className="commission-breakdown__dot commission-breakdown__dot--paid" />
              <div className="commission-breakdown__meta">
                <span className="commission-breakdown__label">Paid</span>
                <span className="commission-breakdown__value">
                  {formatCurrency(paidEarnings, currency)} · {formatPercent(paidPercent)}
                </span>
              </div>
            </div>

            <div className="commission-breakdown__item">
              <span className="commission-breakdown__dot commission-breakdown__dot--pending" />
              <div className="commission-breakdown__meta">
                <span className="commission-breakdown__label">Pending</span>
                <span className="commission-breakdown__value">
                  {formatCurrency(pendingEarnings, currency)} · {formatPercent(pendingPercent)}
                </span>
              </div>
            </div>

            {otherPercent > 0 && (
              <div className="commission-breakdown__item">
                <span className="commission-breakdown__dot commission-breakdown__dot--other" />
                <div className="commission-breakdown__meta">
                  <span className="commission-breakdown__label">Other</span>
                  <span className="commission-breakdown__value">
                    {formatCurrency(unpaidOrOther, currency)} · {formatPercent(otherPercent)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="commission-breakdown__footnote">
            Based on current referral payouts and pending settlements.
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionBreakdown;
