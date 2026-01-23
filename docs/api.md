# API Reference

This document describes the REST endpoints exposed by `@wtree/payload-ecommerce-coupon`.

All routes are relative to your Payload API base URL (default: `/api`).

## Types

All endpoints that validate or apply coupons return the same logical shape, referred to as `ApplyCouponResponse` in the TypeScript types:

```ts
export type ApplyCouponResponse = {
  success: boolean
  message: string
  discount?: number
  coupon?: {
    code: string
    type: 'percentage' | 'fixed'
    value: number
  }
  error?: string
}
```

## POST `/ecommerce/coupons/validate`

Validate a coupon without applying it to a cart.

### Request

```http
POST /api/ecommerce/coupons/validate
Content-Type: application/json
```

```json
{
  "code": "WELCOME10",
  "cartValue": 5000
}
```

- `code` (string) – coupon code to validate (required)
- `cartValue` (number) – optional cart total in smallest currency unit

### Response

```json
{
  "success": true,
  "message": "Valid coupon",
  "discount": 500,
  "coupon": {
    "code": "WELCOME10",
    "type": "percentage",
    "value": 10
  }
}
```

## POST `/ecommerce/coupons/apply`

Apply a coupon to a specific cart.

### Request

```http
POST /api/ecommerce/coupons/apply
Content-Type: application/json
```

```json
{
  "code": "WELCOME10",
  "cartID": "cart-123",
  "cartValue": 5000
}
```

- `code` (string) – coupon code to apply (required)
- `cartID` (string) – cart identifier for tracking (optional but recommended)
- `cartValue` (number) – optional cart total in smallest currency unit

### Response

Same shape as `validate`, but may also update internal usage counters.

## POST `/ecommerce/coupons/referral-code`

Validate a referral code and compute discount and partner commission.

### Request

```http
POST /api/ecommerce/coupons/referral-code
Content-Type: application/json
```

```json
{
  "code": "REF-12345",
  "cartValue": 7500
}
```

- `code` (string) – referral code (required)
- `cartValue` (number) – cart total in smallest currency unit

### Response

```json
{
  "success": true,
  "message": "Referral code applied",
  "discount": 750,
  "coupon": {
    "code": "REF-12345",
    "type": "percentage",
    "value": 10
  }
}
```

Partner commission details can be derived on the server side from the linked referral program and partner records.

## Error Handling

On error, endpoints return `success: false` and an `error` message:

```json
{
  "success": false,
  "message": "Invalid coupon",
  "error": "Coupon not found"
}
```

The frontend hooks surface this message via the `error` and `message` fields so you can display user‑friendly feedback.
