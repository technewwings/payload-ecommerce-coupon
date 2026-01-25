# Partner Dashboard Setup Guide

This guide explains how to set up and customize the partner dashboard for your referral system.

## Overview

The partner dashboard provides partners with:
- **Earnings Summary** - Total, pending, and paid earnings
- **Referral Performance** - Conversion rates and monthly trends
- **Recent Referrals** - Latest referral activity
- **Referral Codes** - Manage and share referral codes

## Prerequisites

1. Enable referrals in your plugin configuration:
```typescript
payloadEcommerceCoupon({
  enableReferrals: true,
  partnerDashboard: {
    enabled: true,
  },
})
```

2. Set up partner role in your Users collection (see below)

## Setting Up Partner Role

### Option 1: Single Role Field

Add a `role` field to your Users collection:

```typescript
// collections/Users.ts
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'customer',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Partner', value: 'partner' },
        { label: 'Customer', value: 'customer' },
      ],
      admin: {
        description: 'User role determines access permissions',
      },
    },
    {
      name: 'partnerDetails',
      type: 'group',
      admin: {
        condition: (data) => data?.role === 'partner',
        description: 'Partner-specific information',
      },
      fields: [
        {
          name: 'companyName',
          type: 'text',
        },
        {
          name: 'payoutMethod',
          type: 'select',
          options: [
            { label: 'Bank Transfer', value: 'bank' },
            { label: 'PayPal', value: 'paypal' },
            { label: 'Stripe', value: 'stripe' },
          ],
        },
        {
          name: 'payoutDetails',
          type: 'json',
          admin: {
            description: 'Bank account or payment details',
          },
        },
      ],
    },
  ],
}
```

### Option 2: Multiple Roles Field

For users who can have multiple roles:

```typescript
// collections/Users.ts
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['customer'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Partner', value: 'partner' },
        { label: 'Customer', value: 'customer' },
        { label: 'Support', value: 'support' },
      ],
    },
  ],
}
```

### Configure Access Control

Update your plugin configuration to use the role field:

```typescript
payloadEcommerceCoupon({
  enableReferrals: true,
  access: {
    // Check single role field
    isPartner: ({ req }) => req.user?.role === 'partner',
    
    // Or check multiple roles
    isPartner: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (user.role === 'partner') return true
      if (Array.isArray(user.roles) && user.roles.includes('partner')) return true
      return false
    },
    
    isAdmin: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (user.role === 'admin') return true
      if (Array.isArray(user.roles) && user.roles.includes('admin')) return true
      return false
    },
  },
})
```

## Using the Dashboard Components

### Pre-built Dashboard

The easiest way to add a partner dashboard:

```tsx
// pages/partner/dashboard.tsx (Next.js example)
import { PartnerDashboard } from '@wtree/payload-ecommerce-coupon'

export default function PartnerDashboardPage() {
  return (
    <div className="container">
      <PartnerDashboard
        showEarningsSummary={true}
        showReferralPerformance={true}
        showRecentReferrals={true}
        showReferralCodes={true}
        apiEndpoint="/api/referrals/partner-stats"
      />
    </div>
  )
}
```

### Custom Dashboard with Individual Components

Build a custom layout using individual widgets:

```tsx
import {
  EarningsSummary,
  ReferralPerformance,
  RecentReferrals,
  ReferralCodes,
  usePartnerStats,
} from '@wtree/payload-ecommerce-coupon'
import { useEffect, useState } from 'react'

export default function CustomPartnerDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    const fetchData = async () => {
      const result = await usePartnerStats()
      if (result.success) {
        setData(result.data)
        setCurrency(result.currency || 'USD')
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div>Loading...</div>
  if (!data) return <div>No data available</div>

  return (
    <div className="dashboard-grid">
      <div className="dashboard-row">
        <EarningsSummary stats={data.stats} currency={currency} />
        <ReferralPerformance stats={data.stats} />
      </div>
      
      <div className="dashboard-row">
        <ReferralCodes codes={data.referralCodes} currency={currency} />
      </div>
      
      {data.stats.recentReferrals.length > 0 && (
        <div className="dashboard-row">
          <RecentReferrals 
            referrals={data.stats.recentReferrals} 
            currency={currency} 
          />
        </div>
      )}
    </div>
  )
}
```

### Fully Custom Dashboard

Use the `usePartnerStats` hook to build completely custom UI:

```tsx
import { usePartnerStats } from '@wtree/payload-ecommerce-coupon'

export default function FullyCustomDashboard() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    usePartnerStats().then(result => {
      if (result.success) setStats(result.data)
    })
  }, [])

  if (!stats) return null

  return (
    <div>
      {/* Earnings Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Earnings</h3>
          <p className="amount">${stats.stats.totalEarnings.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <p className="amount">${stats.stats.pendingEarnings.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Conversion Rate</h3>
          <p className="amount">{stats.stats.conversionRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Referral Codes */}
      <div className="codes-section">
        <h2>Your Referral Codes</h2>
        {stats.referralCodes.map(code => (
          <div key={code.id} className="code-item">
            <code>{code.code}</code>
            <button onClick={() => navigator.clipboard.writeText(code.code)}>
              Copy
            </button>
            <span>{code.usageCount} uses</span>
          </div>
        ))}
      </div>

      {/* Program Info */}
      {stats.program && (
        <div className="program-info">
          <h2>{stats.program.name}</h2>
          <p>Commission Rate: {stats.program.commissionRate}%</p>
          <p>Customer Discount: {stats.program.customerDiscount}%</p>
        </div>
      )}
    </div>
  )
}
```

## Styling the Dashboard

### Using Default Styles

Import the default CSS:

```tsx
import '@wtree/payload-ecommerce-coupon/styles.css'
```

### Custom Styling

Override the default styles:

```css
/* Custom partner dashboard styles */
.partner-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.partner-widget {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.partner-widget__title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.earnings-card--total {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.earnings-card--total .earnings-card__value {
  color: white;
}
```

### Tailwind CSS Integration

If using Tailwind, you can style components with utility classes:

```tsx
import { usePartnerStats } from '@wtree/payload-ecommerce-coupon'

function TailwindDashboard() {
  // ... fetch data

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-gray-500 text-sm font-medium">Total Earnings</h3>
        <p className="text-3xl font-bold text-indigo-600">
          ${stats.totalEarnings.toFixed(2)}
        </p>
      </div>
      {/* More cards... */}
    </div>
  )
}
```

## Integrating with Payload Admin Panel

To add the partner dashboard as a custom view in Payload Admin:

```typescript
// payload.config.ts
import { buildConfig } from 'payload'

export default buildConfig({
  admin: {
    components: {
      views: {
        PartnerDashboard: {
          Component: '/components/admin/PartnerDashboardView',
          path: '/partner-dashboard',
        },
      },
    },
  },
})
```

```tsx
// components/admin/PartnerDashboardView.tsx
'use client'

import { PartnerDashboard } from '@wtree/payload-ecommerce-coupon'

export default function PartnerDashboardView() {
  return (
    <div className="payload-partner-dashboard">
      <PartnerDashboard />
    </div>
  )
}
```

## API Reference

### usePartnerStats Hook

```typescript
const result = await usePartnerStats(apiEndpoint?: string)

// Result type
type PartnerStatsResponse = {
  success: boolean
  data?: {
    stats: {
      totalEarnings: number
      pendingEarnings: number
      paidEarnings: number
      totalReferrals: number
      successfulReferrals: number
      conversionRate: number
      recentReferrals: Array<{
        id: string
        code: string
        orderValue: number
        commission: number
        date: string
        status: 'pending' | 'paid' | 'cancelled'
      }>
      monthlyEarnings: Array<{
        month: string
        earnings: number
        referrals: number
      }>
    }
    referralCodes: Array<{
      id: string
      code: string
      usageCount: number
      totalEarnings: number
      isActive: boolean
    }>
    program: {
      name: string
      description?: string
      commissionRate: number
      customerDiscount: number
    } | null
  }
  currency?: string
  error?: string
}
```

### Component Props

#### PartnerDashboard

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| showEarningsSummary | boolean | true | Show earnings widget |
| showReferralPerformance | boolean | true | Show performance widget |
| showRecentReferrals | boolean | true | Show recent referrals |
| showReferralCodes | boolean | true | Show referral codes |
| apiEndpoint | string | '/api/referrals/partner-stats' | API endpoint |

#### EarningsSummary

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| stats | PartnerStats | Yes | Partner statistics |
| currency | string | Yes | Currency code |

#### ReferralPerformance

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| stats | PartnerStats | Yes | Partner statistics |

#### RecentReferrals

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| referrals | Array | Yes | Recent referral data |
| currency | string | Yes | Currency code |

#### ReferralCodes

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| codes | Array | Yes | Referral codes data |
| currency | string | Yes | Currency code |

## Security Considerations

1. **Authentication**: The partner stats endpoint requires authentication
2. **Authorization**: Partners can only see their own data
3. **Rate Limiting**: Consider adding rate limiting to the API endpoint
4. **Data Validation**: All inputs are validated server-side

## Troubleshooting

### "Partner access required" error
- Ensure the user has the partner role
- Check your `isPartner` access control function

### Dashboard shows no data
- Verify the partner has created referral codes
- Check that the referral program is active
- Ensure orders have been placed with the partner's codes

### Earnings not updating
- Commission is calculated when codes are applied
- Earnings are tracked per referral code
- Check that orders are being properly linked to referral codes
