"use client";

import React, { useState } from "react";

import type { PartnerDashboardData } from "../../types";

export type ReferralCodesProps = {
  codes: PartnerDashboardData["referralCodes"];
  currency: string;
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export const ReferralCodes: React.FC<ReferralCodesProps> = ({ codes, currency }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  return (
    <div className="partner-widget partner-widget--codes">
      <h3 className="partner-widget__title">Your Referral Codes</h3>
      <div className="partner-widget__content">
        <div className="codes-list">
          {codes.map((codeData) => (
            <div
              key={codeData.id}
              className={`code-card ${!codeData.isActive ? "code-card--inactive" : ""}`}
            >
              <div className="code-card__header">
                <span className="code-card__code">{codeData.code}</span>
                <button
                  type="button"
                  className="code-card__copy"
                  onClick={() => copyToClipboard(codeData.code)}
                  title="Copy code"
                >
                  {copiedCode === codeData.code ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <div className="code-card__stats">
                <div className="code-card__stat">
                  <span className="code-card__stat-value">{codeData.usageCount}</span>
                  <span className="code-card__stat-label">Uses</span>
                </div>
                <div className="code-card__stat">
                  <span className="code-card__stat-value">
                    {formatCurrency(codeData.totalEarnings, currency)}
                  </span>
                  <span className="code-card__stat-label">Earnings</span>
                </div>
              </div>
              {!codeData.isActive && (
                <span className="code-card__badge code-card__badge--inactive">Inactive</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReferralCodes;
