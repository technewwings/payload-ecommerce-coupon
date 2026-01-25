# API Reference

Complete API documentation for @wtree/payload-ecommerce-coupon plugin.

## Table of Contents

- [Plugin Configuration](#plugin-configuration)
- [REST API Endpoints](#rest-api-endpoints)
- [Client Hooks](#client-hooks)
- [Types](#types)
- [Collections](#collections)

---

## Plugin Configuration

### payloadEcommerceCoupon(options)

Main plugin function to configure the coupon/referral system.

```typescript
import { payloadEcommerceCoupon } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  plugins: [
    payloadEcommerceCoupon({
      // Configuration options
    }),
  ],
})
```

### Configuration Options

#### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the entire plugin |
| `enableReferrals` | `boolean` | `false` | Enable referral system (creates referral collections) |
| `allowStackWithOtherCoupons` | `boolean` | `false` | Allow multiple coupons on same cart |
| `defaultCurrency` | `string` | `'USD'` | Default currency code |
| `autoIntegrate` | `boolean` | `true` | Auto-add fields to carts/orders collections |

#### Collections Configuration

```typescript
collections?: {
  couponsSlug?: string           // Default: 'coupons'
  referralProgramsSlug?: string  // Default: 'referral-programs'
  referralCodesSlug?: string     // Default: 'referral-codes'
  referralPartnersSlug?: string  // Default: 'referral-partners'
}
```

#### Endpoints Configuration

```typescript
endpoints?: {
  applyCoupon?: string     // Default: '/coupons/apply'
  validateCoupon?: string  // Default: '/coupons/validate'
  partnerStats?: string    // Default: '/referrals/partner-stats'
}
```

#### Access Control

```typescript
access?: {
  canUseCoupons?: Access    // Who can use coupons
  canUseReferrals?: Access  // Who can use referrals
  isAdmin?: Access          // Who can manage codes/programs
  isPartner?: Access        // Who has partner dashboard access
}
```

#### Referral Configuration

```typescript
referralConfig?: {
  allowBothSystems?: boolean      // Default: false - Allow coupons + referrals
  singleCodePerCart?: boolean     // Default: true - One code per order
  defaultPartnerSplit?: number    // Default: 70 - Partner commission %
  defaultCustomerSplit?: number   // Default: 30 - Customer discount %
}
```

#### Admin Groups

```typescript
adminGroups?: {
  couponsGroup?: string    // Default: 'Coupons'
  referralsGroup?: string  // Default: 'Referrals'
}
```

#### Partner Dashboard

```typescript
partnerDashboard?: {
  enabled?: boolean                  // Default: true
  showEarningsSummary?: boolean      // Default: true
  showReferralPerformance?: boolean  // Default: true
  showRecentReferrals?: boolean      // Default: true
  showCommissionBreakdown?: boolean  // Default: true
}
```

---

## REST API Endpoints

### POST /api/coupons/validate

Validate a coupon or referral code without applying it.

**Request Body:**

```json
{
  "code": "WELCOME10",
  "cartValue": 5000,
  "cartID": "cart-123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Coupon or referral code |
| `cartValue` | `number` | No | Cart value for discount preview |
| `cartID` | `string` | No | Cart ID for referral calculation |

**Response (Coupon):**

```json
{
  "success": true,
  "coupon": {
    "code": "WELCOME10",
    "type": "percentage",
    "value": 10,
    "description": "Welcome discount"
  },
  "discount": 500,
  "currency": "USD"
}
```

**Response (Referral):**

```json
{
  "success": true,
  "referralCode": {
    "code": "REF-ABC123",
    "description": "Get $15.50 discount with this referral code"
  },
  "partnerCommission": 36.75,
  "customerDiscount": 15.50,
  "currency": "USD"
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Invalid coupon code"
}
```

### POST /api/coupons/apply

Apply a coupon or referral code to a cart.

**Request Body:**

```json
{
  "code": "WELCOME10",
  "cartID": "cart-123",
  "customerEmail": "customer@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Coupon or referral code |
| `cartID` | `string` | Yes | Cart ID to apply code to |
| `customerEmail` | `string` | No | Customer email for tracking |

**Response (Coupon):**

```json
{
  "success": true,
  "message": "Coupon applied successfully",
  "coupon": {
    "code": "WELCOME10",
    "type": "percentage",
    "value": 10
  },
  "discount": 500,
  "currency": "USD"
}
```

**Response (Referral):**

```json
{
  "success": true,
  "message": "Referral code applied successfully",
  "referralCode": {
    "code": "REF-ABC123"
  },
  "partnerCommission": 36.75,
  "customerDiscount": 15.50,
  "currency": "USD"
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | "Code and cart ID are required" | Missing required fields |
| 400 | "A code has already been applied" | Single code per cart enforced |
| 400 | "Coupon is not yet active" | Before activeFrom date |
| 400 | "Coupon has expired" | After activeUntil date |
| 400 | "Coupon usage limit exceeded" | Max uses reached |
| 400 | "Minimum order value required" | Cart below minimum |
| 404 | "Invalid coupon code" | Code not found |
| 404 | "Cart not found" | Cart ID invalid |
| 500 | "Internal server error" | Server error |

### GET /api/referrals/partner-stats

Get partner dashboard statistics. Requires authentication.

**Headers:**

```
Cookie: payload-token=<auth-token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "stats": {
      "totalEarnings": 1250.50,
      "pendingEarnings": 350.00,
      "paidEarnings": 900.50,
      "totalReferrals": 45,
      "successfulReferrals": 38,
      "conversionRate": 84.44,
      "recentReferrals": [
        {
          "id": "order-123",
          "code": "REF-ABC123",
          "orderValue": 150.00,
          "commission": 15.00,
          "date": "2024-01-15T10:30:00Z",
          "status": "paid"
        }
      ],
      "monthlyEarnings": [
        {
          "month": "Jan 2024",
          "earnings": 250.00,
          "referrals": 8
        }
      ]
    },
    "referralCodes": [
      {
        "id": "code-123",
        "code": "REF-ABC123",
        "usageCount": 25,
        "totalEarnings": 750.00,
        "isActive": true
      }
    ],
    "program": {
      "name": "Partner Program",
      "description": "Earn commissions by referring customers",
      "commissionRate": 10,
      "customerDiscount": 5
    }
  },
  "currency": "USD"
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | "Authentication required" | Not logged in |
| 403 | "Partner access required" | User not a partner |
| 500 | "Failed to fetch partner stats" | Server error |

---

## Client Hooks

### useCouponCode(options)

Apply a coupon or referral code to a cart.

```typescript
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'

const result = await useCouponCode({
  code: 'WELCOME10',
  cartID: 'cart-123',
  customerEmail: 'customer@example.com',
})

if (result.success) {
  console.log('Discount:', result.discount)
  console.log('Partner Commission:', result.partnerCommission)
  console.log('Customer Discount:', result.customerDiscount)
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Coupon or referral code |
| `cartID` | `string` | No | Cart ID |
| `customerEmail` | `string` | No | Customer email |

**Returns:** `Promise<ApplyCouponResponse>`

### validateCouponCode(code, cartValue?, cartID?)

Validate a code without applying it.

```typescript
import { validateCouponCode } from '@wtree/payload-ecommerce-coupon'

const result = await validateCouponCode('WELCOME10', 5000, 'cart-123')

if (result.success) {
  console.log('Valid! Discount would be:', result.discount)
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | Code to validate |
| `cartValue` | `number` | No | Cart value for preview |
| `cartID` | `string` | No | Cart ID for referral calc |

**Returns:** `Promise<ApplyCouponResponse>`

### usePartnerStats(apiEndpoint?)

Fetch partner dashboard statistics.

```typescript
import { usePartnerStats } from '@wtree/payload-ecommerce-coupon'

const result = await usePartnerStats()

if (result.success) {
  console.log('Total Earnings:', result.data.stats.totalEarnings)
  console.log('Referral Codes:', result.data.referralCodes)
}
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `apiEndpoint` | `string` | No | `/api/referrals/partner-stats` | API endpoint |

**Returns:** `Promise<PartnerStatsResponse>`

---

## Types

### ApplyCouponResponse

```typescript
type ApplyCouponResponse = {
  success: boolean
  message: string
  discount?: number
  partnerCommission?: number
  customerDiscount?: number
  currency?: string
  coupon?: {
    code: string
    type: 'percentage' | 'fixed'
    value: number
  }
  referralCode?: {
    code: string
  }
  error?: string
}
```

### PartnerStats

```typescript
type PartnerStats = {
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
```

### PartnerDashboardData

```typescript
type PartnerDashboardData = {
  stats: PartnerStats
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
```

### CouponPluginOptions

```typescript
type CouponPluginOptions = {
  enabled?: boolean
  enableReferrals?: boolean
  allowStackWithOtherCoupons?: boolean
  defaultCurrency?: string
  collections?: CouponPluginCollections
  endpoints?: CouponPluginEndpoints
  autoIntegrate?: boolean
  access?: CouponPluginAccess
  referralConfig?: ReferralProgramConfig
  adminGroups?: AdminGroupConfig
  partnerDashboard?: PartnerDashboardConfig
}
```

---

## Collections

### Coupons Collection

Created when `enableReferrals: false` or `referralConfig.allowBothSystems: true`.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `text` | Yes | Unique coupon code |
| `description` | `text` | No | Admin description |
| `type` | `select` | Yes | 'percentage' or 'fixed' |
| `value` | `number` | Yes | Discount value |
| `maxDiscountAmount` | `number` | No | Max discount cap |
| `usageLimit` | `number` | No | Total usage limit |
| `perCustomerLimit` | `number` | No | Per-customer limit |
| `activeFrom` | `date` | No | Start date |
| `activeUntil` | `date` | No | End date |
| `minOrderValue` | `number` | No | Minimum order value |
| `maxOrderValue` | `number` | No | Maximum order value |
| `usageCount` | `number` | Auto | Current usage count |
| `createdBy` | `relationship` | Auto | Creator user |

### Referral Programs Collection

Created when `enableReferrals: true`.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `text` | Yes | Program name |
| `description` | `textarea` | No | Program description |
| `isActive` | `checkbox` | No | Active status |
| `referrerReward` | `group` | Yes | Partner reward config |
| `refereeReward` | `group` | Yes | Customer reward config |
| `commissionRules` | `array` | No | Product-specific rules |
| `minOrderValue` | `number` | No | Minimum order value |
| `maxReferralsPerUser` | `number` | No | Max referrals per partner |
| `referralCodePrefix` | `text` | No | Code prefix |
| `activeFrom` | `date` | No | Start date |
| `activeUntil` | `date` | No | End date |
| `totalReferrals` | `number` | Auto | Total referral count |
| `totalRewardsPaid` | `number` | Auto | Total rewards paid |

### Referral Codes Collection

Created when `enableReferrals: true`.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `text` | Yes | Unique referral code |
| `program` | `relationship` | Yes | Associated program |
| `referrer` | `relationship` | Yes | Partner user |
| `isActive` | `checkbox` | No | Active status |
| `usageCount` | `number` | Auto | Usage count |
| `usageLimit` | `number` | No | Max uses |
| `expiresAt` | `date` | No | Expiration date |
| `successfulReferralsCount` | `number` | Auto | Successful referrals |
| `totalEarnings` | `number` | Auto | Total earnings |
| `pendingEarnings` | `number` | Auto | Pending earnings |
| `paidEarnings` | `number` | Auto | Paid earnings |
| `metadata` | `json` | No | Additional data |

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CODE` | Code not found |
| `CODE_EXPIRED` | Code has expired |
| `CODE_NOT_ACTIVE` | Code not yet active |
| `USAGE_LIMIT_EXCEEDED` | Max uses reached |
| `MIN_ORDER_NOT_MET` | Below minimum order value |
| `MAX_ORDER_EXCEEDED` | Above maximum order value |
| `CODE_ALREADY_APPLIED` | Code already on cart |
| `SINGLE_CODE_ENFORCED` | Only one code allowed |
| `CART_NOT_FOUND` | Cart ID invalid |
| `AUTH_REQUIRED` | Authentication needed |
| `PARTNER_ACCESS_REQUIRED` | Partner role needed |
