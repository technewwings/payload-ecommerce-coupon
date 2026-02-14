"use client";

import React, { useEffect, useState } from "react";

import type { PartnerDashboardData } from "../../types";

import { EarningsSummary } from "./EarningsSummary";
import { ReferralPerformance } from "./ReferralPerformance";
import { RecentReferrals } from "./RecentReferrals";
import { ReferralCodes } from "./ReferralCodes";

import "./styles.css";

export type PartnerDashboardProps = {
  showEarningsSummary?: boolean;
  showReferralPerformance?: boolean;
  showRecentReferrals?: boolean;
  showReferralCodes?: boolean;
  apiEndpoint?: string;
};

export const PartnerDashboard: React.FC<PartnerDashboardProps> = ({
  showEarningsSummary = true,
  showReferralPerformance = true,
  showRecentReferrals = true,
  showReferralCodes = true,
  apiEndpoint = "/api/referrals/partner-stats",
}) => {
  const [data, setData] = useState<PartnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(apiEndpoint, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError("Please log in to view your partner dashboard");
            return;
          }
          if (response.status === 403) {
            setError("Partner access required");
            return;
          }
          throw new Error("Failed to fetch partner data");
        }

        const result = (await response.json()) as {
          success: boolean;
          data?: PartnerDashboardData;
          currency?: string;
          error?: string;
        };

        if (result.success) {
          setData(result.data ?? null);
          setCurrency(result.currency ?? "USD");
        } else {
          setError(result.error ?? "Failed to load dashboard data");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiEndpoint]);

  if (loading) {
    return (
      <div className="partner-dashboard partner-dashboard--loading">
        <div className="partner-dashboard__loader">
          <div className="partner-dashboard__spinner" />
          <p>Loading partner dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="partner-dashboard partner-dashboard--error">
        <div className="partner-dashboard__error">
          <h3>Unable to load dashboard</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="partner-dashboard partner-dashboard--empty">
        <div className="partner-dashboard__empty">
          <h3>No data available</h3>
          <p>Your partner dashboard will appear here once you have referral activity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="partner-dashboard">
      <div className="partner-dashboard__header">
        <h2>Partner Dashboard</h2>
        {data.program && (
          <div className="partner-dashboard__program">
            <span className="partner-dashboard__program-name">{data.program.name}</span>
            <span className="partner-dashboard__program-rate">
              {data.program.commissionRate}% commission
            </span>
          </div>
        )}
      </div>

      <div className="partner-dashboard__grid">
        {showEarningsSummary && <EarningsSummary stats={data.stats} currency={currency} />}

        {showReferralPerformance && <ReferralPerformance stats={data.stats} />}

        {showRecentReferrals && data.stats.recentReferrals.length > 0 && (
          <RecentReferrals referrals={data.stats.recentReferrals} currency={currency} />
        )}

        {showReferralCodes && data.referralCodes.length > 0 && (
          <ReferralCodes codes={data.referralCodes} currency={currency} />
        )}
      </div>
    </div>
  );
};

export default PartnerDashboard;
