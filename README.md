# @wtree/payload-ecommerce-coupon

Coupons and referral promotions plugin for **@payloadcms/plugin-ecommerce**.

> **Status:** Experimental – core data model and config API in place, business logic kept intentionally minimal so you can wire it to your project-specific ecommerce flows.

## Features

- Define reusable **coupon** documents (percentage / fixed amount)
- Define **referral programs** that split value between partner commission and customer discount
- Create **referral codes** linked to programs and (optionally) partners
- Extend ecommerce collections with coupon / referral fields (cart-level example included)
- Simple REST endpoint for validating / applying coupons
- Fully typed, Payload 3–compatible plugin

## Installation

```bash
npm install @wtree/payload-ecommerce-coupon
# or
pnpm add @wtree/payload-ecommerce-coupon
```

Peer dependencies:

- `payload@^3.0.0`
- `@payloadcms/plugin-ecommerce@^3.0.0`

## Usage

### 1. Register the plugin

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { payloadEcommerceCoupon } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  // ...other config
  plugins: [
    ecommercePlugin({
      // your ecommerce config
    }),
    payloadEcommerceCoupon({
      enabled: true,
      defaultCurrency: 'USD',
    }),
  ],
})
```

### 2. Collections created by the plugin

By default the plugin adds three collections:

- `coupons`
- `referral-programs`
- `referral-codes`

You can override the slugs via options.

```ts
payloadEcommerceCoupon({
  collections: {
    couponsSlug: 'shop-coupons',
    referralProgramsSlug: 'shop-referral-programs',
    referralCodesSlug: 'shop-referral-codes',
  },
})
```

### 3. Coupon model (simplified)

- `code`: unique text identifier
- `type`: `percentage | fixed`
- `value`: numeric value
- `conditions`: optional min order value and product/category scoping
- `usageLimit` & `perCustomerLimit`
- `activeFrom` / `activeUntil`

### 4. Referral program model

A referral program defines how much total value is available and how it is split:

- `totalValueType`: `percentage | fixed`
- `totalValue`: base value
- `split.partnerShare`: % for partner commission
- `split.customerShare`: % for customer coupon
- `appliesTo`: order / products / referral product category

### 5. Referral codes

- `code`: unique
- `program`: relation to a referral program
- `partner`: optional relation to `users` (referral partner)
- `usageCount` / `maxUsages`

### 6. Cart integration (example)

The plugin extends the `carts` collection (if present) with an `appliedCoupons` field:

```ts
appliedCoupons: [
  {
    coupon: Relation to coupons,
    referralCode: Relation to referral-codes,
    discountAmount: number,
  },
]
```

You can then use this field from your ecommerce flows (checkout, order creation, etc.) to calculate and store discounts / commissions.

### 7. Endpoint: validate / apply coupon

The plugin registers a minimal endpoint:

```http
POST /api/ecommerce/coupons/validate
Content-Type: application/json

{
  "code": "WELCOME10",
  "cartID": "<optional-cart-id>"
}
```

The default handler is intentionally simple; you are expected to adapt it to your business rules and ecommerce setup.

### 8. Options

```ts
export type CouponPluginOptions = {
  enabled?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  slugMap?: {
    orders?: string
    carts?: string
    transactions?: string
  }
  collections?: {
    couponsSlug?: string
    referralProgramsSlug?: string
    referralCodesSlug?: string
  }
}
```

## Roadmap Ideas

- Deeper integration with `transactions` and `orders` collections
- Auto‑calculation of commission vs customer discount per line item
- Partner dashboards & payout tracking
- Ready‑made React components for checkout and partner UI

PRs and issues are welcome!
