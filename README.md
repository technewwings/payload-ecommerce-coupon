# @wtree/payload-ecommerce-coupon

[![NPM Version](https://img.shields.io/npm/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://npmjs.com/package/@wtree/payload-ecommerce-coupon)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node Version](https://img.shields.io/node/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://nodejs.org)

Production-ready coupon and referral system plugin for **Payload CMS** with seamless integration to the **@payloadcms/plugin-ecommerce** package.

## 🚀 Features

- ✅ **Coupon Management** – Create and manage discount codes with flexible conditions
- ✅ **Referral Programs** – Partner commission + customer discount split configuration
- ✅ **Referral Partners** – Onboard, approve, and track affiliate partners
- ✅ **REST API** – Validate, apply, and track coupons and referral codes
- ✅ **Frontend Hooks** – `useCouponCode()` and `validateCouponCode()` for React/Next.js
- ✅ **Auto-Integration** – Extends ecommerce collections automatically
- ✅ **Type-Safe** – Full TypeScript support with strict types
- ✅ **Tested** – 80%+ unit test coverage with Vitest
- ✅ **Production-Ready** – Follow Payload CMS best practices

## 📦 Installation

```bash
npm install @wtree/payload-ecommerce-coupon
```

### Requirements

- `payload@^3.0.0` (Payload CMS)
- `@payloadcms/plugin-ecommerce@>=3.0.0` (required peer dependency)
- `node@>=18.0.0`

## 🔧 Quick Start

### 1. Register the Plugin

In your `payload.config.ts`:

```typescript
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { payloadEcommerceCoupon } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      // your ecommerce configuration
    }),
    payloadEcommerceCoupon({
      enabled: true,
      defaultCurrency: 'USD',
      allowStackWithOtherCoupons: false,
      autoIntegrate: true,
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: ({ req }) => Boolean(req.user),
      },
    }),
  ],
})
```

### 2. Database Migration

After adding the plugin, run your Payload migration to create the new collections:

```bash
npm run payload migrate
```

This will create collections for:
- **Coupons** – Manage discount codes with flexible conditions
- **Referral Programs** – Set up partner commission structures
- **Referral Codes** – Track generated referral links

The plugin automatically integrates with your existing ecommerce collections, adding coupon fields to carts and orders.

### 3. Frontend Integration

```typescript
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'

function CheckoutComponent() {
  const [couponCode, setCouponCode] = useState('')
  const [cartId, setCartId] = useState('your-cart-id')

  const applyCoupon = async () => {
    const result = await useCouponCode({
      code: couponCode,
      cartID: cartId,
    })

    if (result.success) {
      console.log('Discount applied:', result.discount)
      // Update your cart total
    } else {
      console.error('Invalid coupon:', result.error)
    }
  }

  return (
    <div>
      <input
        value={couponCode}
        onChange={(e) => setCouponCode(e.target.value)}
        placeholder="Enter coupon code"
      />
      <button onClick={applyCoupon}>Apply Coupon</button>
    </div>
  )
}
```

## 🌐 REST API Endpoints

### POST /api/coupons/validate

Validate a coupon without applying it.

```bash
curl -X POST http://localhost:3000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartValue": 5000}'
```

**Response:**
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

### POST /api/coupons/apply

Apply a coupon to a cart.

```bash
curl -X POST http://localhost:3000/api/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartID": "cart-123", "cartValue": 5000}'
```

**Response:**
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

## ⚙️ Configuration

```typescript
export type CouponPluginOptions = {
  enabled?: boolean                    // default: true
  allowStackWithOtherCoupons?: boolean // default: false
  defaultCurrency?: string             // default: 'USD'
  autoIntegrate?: boolean              // default: true
  collections?: {
    couponsSlug?: string               // default: 'coupons'
    referralProgramsSlug?: string      // default: 'referral-programs'
    referralCodesSlug?: string         // default: 'referral-codes'
    referralPartnersSlug?: string      // default: 'referral-partners'
  }
  access?: {
    canUseCoupons?: Access             // default: () => true
    canUseReferrals?: Access           // default: () => true
    isAdmin?: Access                   // default: () => false
  }
}
```

### Access Control

The plugin supports fine-grained access control:

```typescript
payloadEcommerceCoupon({
  access: {
    canUseCoupons: ({ req }) => {
      // Allow all authenticated users to use coupons
      return Boolean(req.user)
    },
    canUseReferrals: ({ req }) => {
      // Only allow premium users to use referrals
      return req.user?.role === 'premium'
    },
    isAdmin: ({ req }) => {
      // Only admins can create/edit coupons
      return req.user?.role === 'admin'
    },
  },
})
```

### Collection Customization

You can customize collection slugs to avoid conflicts:

```typescript
payloadEcommerceCoupon({
  collections: {
    couponsSlug: 'discount-codes',
    referralProgramsSlug: 'affiliate-programs',
    referralCodesSlug: 'promo-codes',
  },
})
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📚 Documentation

For detailed usage examples and advanced configurations, see the sections above and check out:
- [Compatibility Matrix](./COMPATIBILITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 🔗 Links

- **GitHub**: https://github.com/technewwings/payload-ecommerce-coupon
- **NPM**: https://npmjs.com/package/@wtree/payload-ecommerce-coupon
- **Payload CMS**: https://payloadcms.com

## 📄 License

MIT License © 2026 wtree. See [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
