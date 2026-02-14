# Compatibility Matrix

## Payload CMS Compatibility

| Package                      | Version | Status       |
| ---------------------------- | ------- | ------------ |
| payload                      | ^3.0.0  | ✅ Supported |
| @payloadcms/plugin-ecommerce | >=3.0.0 | ✅ Required  |

## Node.js Compatibility

| Node Version | Status                     |
| ------------ | -------------------------- |
| 18.x         | ✅ Supported               |
| 20.x         | ✅ Supported (Recommended) |
| 22.x         | ✅ Supported               |

## Framework Compatibility

### Frontend Hooks

The frontend hooks are framework-agnostic and work with:

- **React** (18+) – Hooks can be used in React components
- **Next.js** (13+) – Compatible with both App Router and Pages Router
- **Vue.js** (3+) – Can be adapted for Vue composables
- **Svelte** (4+) – Compatible with Svelte stores
- **Vanilla JS** – Direct fetch calls work in any environment

## Collection Dependencies

The plugin requires the following base collections to exist:

- `products` - For product-specific coupon scoping
- `categories` - For category-specific coupon scoping
- `users` - For partner and customer tracking

These are typically provided by the `@payloadcms/plugin-ecommerce` plugin.

## Integration Points

### Collections Extended

When `autoIntegrate` is true (default):

- **carts** – Adds coupon, referral, and discount tracking fields
- **orders** – Adds applied coupons, referral codes, and totals

### API Routes Added

- `POST /api/ecommerce/coupons/validate`
- `POST /api/ecommerce/coupons/apply`
- `POST /api/ecommerce/coupons/referral-code`
