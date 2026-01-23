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
    }),
  ],
})
```

### 2. Frontend Integration

```typescript
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'

const result = await useCouponCode({
  code: 'WELCOME10',
  cartID: 'your-cart-id',
})

if (result.success) {
  console.log('Discount:', result.discount)
}
```

## 🌐 REST API Endpoints

### POST /api/ecommerce/coupons/validate

Validate a coupon without applying it.

```bash
curl -X POST http://localhost:3000/api/ecommerce/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartValue": 5000}'
```

### POST /api/ecommerce/coupons/apply

Apply a coupon to a cart.

```bash
curl -X POST http://localhost:3000/api/ecommerce/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartID": "cart-123", "cartValue": 5000}'
```

## ⚙️ Configuration

```typescript
export type CouponPluginOptions = {
  enabled?: boolean                    // default: true
  allowStackWithOtherCoupons?: boolean // default: false
  defaultCurrency?: string             // default: 'USD'
  autoIntegrate?: boolean              // default: true
  collections?: {
    couponsSlug?: string
    referralProgramsSlug?: string
    referralCodesSlug?: string
    referralPartnersSlug?: string
  }
}
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

For detailed usage examples and advanced configurations:
- [Coupon Management Guide](./docs/coupons.md)
- [Referral Programs Setup](./docs/referral.md)
- [API Reference](./docs/api.md)
- [Compatibility Matrix](./COMPATIBILITY.md)

## 🔗 Links

- **GitHub**: https://github.com/technewwings/payload-ecommerce-coupon
- **NPM**: https://npmjs.com/package/@wtree/payload-ecommerce-coupon
- **Payload CMS**: https://payloadcms.com

## 📄 License

MIT License © 2026 wtree. See [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
