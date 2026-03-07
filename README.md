# @wtree/payload-ecommerce-coupon

[![NPM Version](https://img.shields.io/npm/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://npmjs.com/package/@wtree/payload-ecommerce-coupon)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node Version](https://img.shields.io/node/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://nodejs.org)

Production-ready coupon and referral plugin for **Payload CMS** + **@payloadcms/plugin-ecommerce** with a **policy-first**, **integration-driven** architecture.

---

## Why this version

This release removes hard assumptions and gives you explicit control:

- **Policy-first access** (no required role shape)
- **Integration-driven mapping** for collection slugs, field names, and data resolvers
- **Deterministic code validation/apply flow** with normalized code lookup
- **Dependency-free runtime** (beyond Payload + Payload Ecommerce peer deps)
- **Usage accounting on order placement** (not on cart apply)

---

## Features

### System modes

- **Coupon Mode** (`enableReferrals: false`)
- **Referral Mode** (`enableReferrals: true`)
- **Hybrid Mode** (`enableReferrals: true` + `referralConfig.allowBothSystems: true`)

### Coupon capabilities

- Percentage and fixed discounts
- Global usage limits
- Optional per-customer limits
- Min/max order rules
- Code normalization (`trim + uppercase`) with fallback lookups
- Discount totals rounded to 2 decimals

### Referral capabilities

- Program/rule-driven commissions and customer discounts
- Rule min-order enforcement
- Fixed-only or mixed commission type support
- Partner stats endpoint
- Optional single code per cart across systems

### Core plugin behavior

- Auto-adds collections and endpoints (configurable)
- Auto-integrates cart/order fields (configurable)
- Recalculate hook support for cart totals/discounts/commissions
- Server utility for usage recording at order completion
- Frontend helpers for validate/apply/stats

---

## Requirements

### Runtime requirements

- `node >= 18.0.0`
- `payload ^3.79.0` (peer dependency)
- `@payloadcms/plugin-ecommerce ^3.79.0` (peer dependency)

### Project assumptions

Your app should include (or map via integration config):

- cart collection
- order collection
- product collection
- user collection
- category + tag collections (if used by referral rules)

### Recommended

- Node 20 LTS for production
- Payload and ecommerce plugin versions aligned within the same major/minor range

---

## Installation

```bash
npm install @wtree/payload-ecommerce-coupon
```

or

```bash
bun add @wtree/payload-ecommerce-coupon
```

---

## Quick start

### 1) Register plugin

```ts
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { payloadEcommerceCoupon } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      // ecommerce config
    }),
    payloadEcommerceCoupon({
      enabled: true,
      enableReferrals: true,
      defaultCurrency: 'USD',

      referralConfig: {
        allowBothSystems: false,
        singleCodePerCart: true,
        defaultPartnerSplit: 70,
        defaultCustomerSplit: 30,
        allowedTotalCommissionTypes: ['fixed', 'percentage'],
      },

      // Policy-first access gates
      policies: {
        canApplyCoupon: ({ req }) => Boolean(req),
        canApplyReferral: ({ req }) => Boolean(req),
        canViewPartnerStats: ({ user }) => Boolean(user),
        canRecordOrderUsage: ({ user }) => Boolean(user),
      },

      // Integration mapping (override defaults if your schema differs)
      integration: {
        collections: {
          cartsSlug: 'carts',
          ordersSlug: 'orders',
          productsSlug: 'products',
          usersSlug: 'users',
          categoriesSlug: 'categories',
          tagsSlug: 'tags',
        },
        fields: {
          cartItemsField: 'items',
          cartSubtotalField: 'subtotal',
          cartTotalField: 'total',
          cartAppliedCouponField: 'appliedCoupon',
          cartAppliedReferralCodeField: 'appliedReferralCode',
          cartDiscountAmountField: 'discountAmount',
          cartCustomerDiscountField: 'customerDiscount',
          cartPartnerCommissionField: 'partnerCommission',
          orderAppliedCouponField: 'appliedCoupon',
          orderAppliedReferralCodeField: 'appliedReferralCode',
          orderDiscountAmountField: 'discountAmount',
          orderCustomerDiscountField: 'customerDiscount',
          orderPartnerCommissionField: 'partnerCommission',
          orderCustomerEmailField: 'customerEmail',
          orderPaymentStatusField: 'paymentStatus',
          orderCreatedAtField: 'createdAt',
          productPriceField: 'price',
          productCurrencyCodeField: 'currencyCode',
        },
      },
    }),
  ],
})
```

---

## Usage lifecycle (important)

### Validate/apply does **not** increment usage

- `POST /api/coupons/validate` checks code validity and returns computed values
- `POST /api/coupons/apply` applies code to cart and updates discount/commission fields

### Usage is recorded when order is placed

Call usage recording when an order is paid/completed:

- Endpoint: `POST /api/coupons/record-order-usage` with `{ "orderId": "..." }`
- Or utility: `recordCouponUsageForOrder(payload, order, pluginConfig)`

This keeps usage and earnings accounting accurate and idempotent for order lifecycle events.

---

## Endpoints

Default paths (customizable via `endpoints` config):

- `POST /api/coupons/validate`
- `POST /api/coupons/apply`
- `GET /api/referrals/partner-stats`
- `POST /api/coupons/record-order-usage` (when enabled)

---

## Frontend helpers

```ts
import { useCouponCode, validateCouponCode, usePartnerStats } from '@wtree/payload-ecommerce-coupon/client'
```

- `useCouponCode({ code, cartID, customerEmail? })`
- `validateCouponCode({ code, cartValue?, cartID?, customerEmail? })`
- `usePartnerStats()`

### PartnerDashboard UI component

The package also exports ready-to-use partner dashboard UI components:

```ts
import {
  PartnerDashboard,
  EarningsSummary,
  ReferralPerformance,
  RecentReferrals,
  ReferralCodes,
  ProgramOverview,
  CommissionBreakdown,
} from '@wtree/payload-ecommerce-coupon/client'
import '@wtree/payload-ecommerce-coupon/styles.css'
```

> The dashboard components are client-side React components. Use them in your frontend app (for example, a Next.js client component).

#### Quick usage

```tsx
'use client'

import { PartnerDashboard } from '@wtree/payload-ecommerce-coupon/client'
import '@wtree/payload-ecommerce-coupon/styles.css'

export default function PartnerPage() {
  return <PartnerDashboard apiEndpoint="/api/referrals/partner-stats" />
}
```

#### PartnerDashboard props

```ts
type PartnerDashboardProps = {
  showEarningsSummary?: boolean
  showReferralPerformance?: boolean
  showRecentReferrals?: boolean
  showReferralCodes?: boolean
  showProgramOverview?: boolean
  showCommissionBreakdown?: boolean
  apiEndpoint?: string
}
```

Example with custom widget visibility:

```tsx
<PartnerDashboard
  apiEndpoint="/api/referrals/partner-stats"
  showEarningsSummary
  showReferralPerformance
  showRecentReferrals={false}
  showReferralCodes
  showProgramOverview
  showCommissionBreakdown
/>
```

#### Theming and style-guide compatibility

The `PartnerDashboard` styles are tokenized with CSS variables so your app can keep its own design system and branding.

By default, dashboard typography inherits from the host app (`font-family: inherit`) and colors use overridable tokens.

Basic override example:

```css
.partner-dashboard {
  --pd-color-text: var(--app-text-color);
  --pd-color-text-muted: var(--app-text-muted);
  --pd-color-surface: var(--app-surface);
  --pd-color-surface-muted: var(--app-surface-muted);
  --pd-color-border: var(--app-border);
  --pd-color-primary: var(--app-primary);
  --pd-color-primary-strong: var(--app-primary-strong);
  --pd-color-success: var(--app-success);
  --pd-color-warning: var(--app-warning);
  --pd-color-danger: var(--app-danger);
}
```

You can also set global aliases once:

```css
:root {
  --color-text: #111827;
  --color-text-muted: #6b7280;
  --color-surface: #ffffff;
  --color-surface-muted: #f9fafb;
  --color-border: #e5e7eb;
  --color-primary: #2563eb;
  --color-primary-strong: #1d4ed8;
  --color-primary-soft: #dbeafe;
  --color-success: #059669;
  --color-warning: #d97706;
  --color-danger: #dc2626;
}
```

Common dashboard tokens you may override:

- Layout/spacing: `--pd-space-*`, `--pd-grid-min-column`, `--pd-referrals-status-col-width`
- Typography: `--pd-font-family`, `--pd-font-size-*`, `--pd-font-weight-*`
- Surfaces/borders: `--pd-color-bg`, `--pd-color-surface`, `--pd-color-surface-muted`, `--pd-color-border`
- Semantic colors: `--pd-color-primary`, `--pd-color-success`, `--pd-color-warning`, `--pd-color-danger`
- Widget accents:
  - `--pd-color-earnings-total-*`
  - `--pd-color-earnings-pending-*`
  - `--pd-color-earnings-paid-*`
  - `--pd-color-status-pending-*`
  - `--pd-color-status-paid-*`
  - `--pd-color-status-cancelled-*`

This keeps plugin UI behavior consistent while respecting your product’s style guide.

---

## Configuration overview

```ts
type CouponPluginOptions = {
  enabled?: boolean
  enableReferrals?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  autoIntegrate?: boolean

  collections?: {
    couponsSlug?: string
    referralProgramsSlug?: string
    referralCodesSlug?: string
    referralPartnersSlug?: string
    couponsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    referralProgramsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    referralCodesCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
  }

  endpoints?: {
    applyCoupon?: string
    validateCoupon?: string
    partnerStats?: string
    recordOrderUsage?: string
  }

  // Legacy access support
  access?: {
    canUseCoupons?: any
    canUseReferrals?: any
    isAdmin?: any
    isPartner?: any
  }

  // Preferred policy-first API
  policies?: {
    canApplyCoupon?: (ctx: {
      req: unknown
      user?: unknown
      payload?: unknown
    }) => boolean | Promise<boolean>
    canApplyReferral?: (ctx: {
      req: unknown
      user?: unknown
      payload?: unknown
    }) => boolean | Promise<boolean>
    canViewPartnerStats?: (ctx: {
      req: unknown
      user?: unknown
      payload?: unknown
      requestedPartnerID?: string | number
    }) => boolean | Promise<boolean>
    canRecordOrderUsage?: (ctx: {
      req: unknown
      user?: unknown
      payload?: unknown
      order: unknown
    }) => boolean | Promise<boolean>
  }

  // Integration-driven mapping
  integration?: {
    collections?: {
      cartsSlug?: string
      ordersSlug?: string
      productsSlug?: string
      usersSlug?: string
      categoriesSlug?: string
      tagsSlug?: string
    }
    fields?: {
      cartItemsField?: string
      cartSubtotalField?: string
      cartTotalField?: string
      cartAppliedCouponField?: string
      cartAppliedReferralCodeField?: string
      cartDiscountAmountField?: string
      cartCustomerDiscountField?: string
      cartPartnerCommissionField?: string
      orderAppliedCouponField?: string
      orderAppliedReferralCodeField?: string
      orderDiscountAmountField?: string
      orderCustomerDiscountField?: string
      orderPartnerCommissionField?: string
      orderCustomerEmailField?: string
      orderPaymentStatusField?: string
      orderCreatedAtField?: string
      productPriceField?: string
      productCurrencyCodeField?: string
    }
    resolvers?: {
      getUserID?: (args: { req: unknown; user?: unknown }) => string | number | null | undefined
      getCartItems?: (cart: unknown) => any[]
      getCartSubtotal?: (cart: unknown) => number
      getCartTotal?: (cart: unknown) => number
      isOrderPaid?: (order: unknown) => boolean
      getProductUnitPrice?: (args: {
        item: unknown
        product: unknown
        variant?: unknown
        currencyCode?: string
      }) => number
    }
  }

  referralConfig?: {
    allowBothSystems?: boolean
    singleCodePerCart?: boolean
    defaultPartnerSplit?: number
    defaultCustomerSplit?: number
    allowedTotalCommissionTypes?: Array<'fixed' | 'percentage'>
  }

  orderIntegration?: {
    ordersSlug?: string
    orderCustomerEmailField?: string
    orderPaymentStatusField?: string
    orderPaidStatusValue?: string
  }

  roleConfig?: {
    roleFieldPaths?: string[]
    adminRoleValues?: string[]
    partnerRoleValues?: string[]
    customRoleResolver?: (user: unknown) => string[]
  }
}
```

---

## Migration notes (from role-assumption setups)

If you’re upgrading from older configs:

1. Prefer `policies` over role-specific assumptions.
2. Set `integration.collections` and `integration.fields` if your schema uses custom slugs/field names.
3. Ensure order completion flow calls usage recording.
4. Validate endpoint paths if you previously relied on custom routes.

---

## Troubleshooting

### Build/lint mismatch after changes

Run:

```bash
bun run lint
bun run build
bun test --runInBand
```

### Code applies but usage not incrementing

Expected behavior until order completion. Call record-order-usage on paid/completed order.

### Partner stats forbidden

Adjust `policies.canViewPartnerStats` to match your auth model.

### Per-customer limit not enforced

Pass `customerEmail` on validate/apply for coupons that define per-customer limits, and ensure order integration fields map to your schema.

---

## Exports

Main exports include:

- `payloadEcommerceCoupon` (plugin)
- `createCouponsCollection`
- `createReferralCodesCollection`
- `createReferralProgramsCollection`
- `useCouponCode`
- `validateCouponCode`
- `usePartnerStats`
- `PartnerDashboard`
- `EarningsSummary`
- `ReferralPerformance`
- `RecentReferrals`
- `ReferralCodes`
- `ProgramOverview`
- `CommissionBreakdown`
- `getCartTotalWithDiscounts`
- `recordCouponUsageForOrder`
- full TypeScript types for plugin options/policies/integration

---

## License

MIT
