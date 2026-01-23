# @wtree/payload-ecommerce-coupon

[![NPM Version](https://img.shields.io/npm/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://npmjs.com/package/@wtree/payload-ecommerce-coupon)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node Version](https://img.shields.io/node/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://nodejs.org)

Production-ready coupon and referral system plugin for **Payload CMS** with seamless integration to the **@payloadcms/plugin-ecommerce** package.

## 🚀 Features

### **System Modes**
- **Coupon Mode** (`enableReferrals: false`) – Traditional discount codes
- **Referral Mode** (`enableReferrals: true`) – Partner commissions + customer discounts

### **Coupon Mode Features**
- ✅ **Flexible Discounts** – Percentage or fixed amount discounts
- ✅ **Usage Controls** – Per-customer limits, expiration dates, usage counts
- ✅ **Conditions** – Minimum/maximum order values, product restrictions
- ✅ **Auto-Application** – Seamless cart integration

### **Referral Mode Features**
- ✅ **Commission Rules** – Per-product/category commission rates
- ✅ **Split Configuration** – Configurable partner/customer share ratios
- ✅ **Partner Tracking** – Commission earnings and referral performance
- ✅ **Auto-Generated Codes** – Unique referral codes for each user

### **Core Features**
- ✅ **REST API** – Validate, apply, and track codes
- ✅ **Frontend Hooks** – `useCouponCode()` for React/Next.js
- ✅ **Auto-Integration** – Extends carts/orders automatically
- ✅ **Type-Safe** – Full TypeScript support
- ✅ **Access Control** – Role-based permissions
- ✅ **Production-Ready** – Comprehensive testing and error handling

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
      enableReferrals: false, // Set to true for referral system, false for coupon system
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

## 👨‍💼 Admin Usage Guide

### **Choosing Your Mode**

#### **Coupon Mode** (`enableReferrals: false`)
Best for traditional discount campaigns, seasonal sales, and customer loyalty programs.

#### **Referral Mode** (`enableReferrals: true`)
Best for affiliate marketing, partner programs, and customer acquisition through referrals.

### **Setting Up Coupon Mode**

1. **Navigate to Admin Panel** → Go to "Coupons" collection
2. **Create New Coupon**:
   - **Code**: `WELCOME10` (unique identifier)
   - **Type**: `Percentage` or `Fixed Amount`
   - **Value**: `10` (10% or $10)
   - **Description**: "Welcome discount for new customers"
   - **Active From/Until**: Set validity period
   - **Usage Limit**: Maximum uses (optional)
   - **Per Customer Limit**: Uses per customer (optional)
   - **Conditions**: Min/max order values

3. **Advanced Conditions**:
   ```json
   {
     "minOrderValue": 5000,  // $50 minimum
     "maxOrderValue": 100000 // $1000 maximum
   }
   ```

### **Setting Up Referral Mode**

1. **Navigate to Admin Panel** → Go to "Referral Programs" collection
2. **Create Referral Program**:
   - **Name**: "Partner Affiliate Program"
   - **Description**: "Earn commissions by referring customers"
   - **Is Active**: Enable/disable program
   - **Active From/Until**: Program validity period

3. **Configure Commission Rules**:
   ```json
   {
     "name": "Electronics Category",
     "appliesTo": "categories",
     "categories": ["electronics"],
     "totalCommission": {
       "type": "percentage",
       "value": 15  // 15% of product price
     },
     "split": {
       "partnerPercentage": 70,  // Partner gets 70%
       "customerPercentage": 30  // Customer gets 30% discount
     }
   }
   ```

4. **Program Conditions**:
   - **Min Order Value**: Minimum purchase required
   - **Max Referrals Per User**: Limit referrals per user
   - **Referral Code Prefix**: Custom prefix for codes

### **Commission Rule Examples**

#### **Example 1: Electronics Category**
- **Total Commission**: 15% of product price
- **Partner Share**: 70% = 10.5% commission
- **Customer Discount**: 30% = 4.5% discount
- **Result**: $100 product = $10.50 partner commission + $4.50 customer discount

#### **Example 2: Fixed Commission**
- **Total Commission**: $25 per product
- **Partner Share**: 80% = $20 commission
- **Customer Discount**: 20% = $5 discount

#### **Example 3: All Products**
- **Total Commission**: 10% of order total
- **Partner Share**: 60% = 6% commission
- **Customer Discount**: 40% = 4% discount

### **Managing Referral Codes**

1. **Auto-Generation**: Codes are created automatically when users join
2. **Manual Creation**: Admin can create codes for specific partners
3. **Tracking**: Monitor usage, successful referrals, and commission payouts

### **Monitoring & Analytics**

#### **Coupon Analytics**
- Total redemptions
- Revenue impact
- Customer usage patterns
- Expiration tracking

#### **Referral Analytics**
- Total referrals generated
- Successful conversions
- Commission paid vs pending
- Partner performance rankings

### **Access Control Setup**

```typescript
payloadEcommerceCoupon({
  access: {
    // Who can use coupons/referrals
    canUseCoupons: ({ req }) => Boolean(req.user),
    canUseReferrals: ({ req }) => req.user?.subscription === 'premium',

    // Who can create/manage
    isAdmin: ({ req }) => req.user?.role === 'admin',
  },
})
```

### **Best Practices**

#### **For Coupons**
- Use descriptive codes: `SUMMER2024` vs `ABC123`
- Set reasonable expiration dates
- Monitor performance and adjust conditions
- Use per-customer limits to prevent abuse

#### **For Referrals**
- Start with generous splits to attract partners
- Set clear program rules and conditions
- Monitor partner performance regularly
- Provide transparent commission tracking

#### **General**
- Test all codes before going live
- Monitor API usage and error rates
- Keep commission rules simple initially
- Document your specific business rules

## 🌐 REST API Endpoints

The API endpoints automatically adapt based on your `enableReferrals` configuration.

### **Coupon Mode Endpoints**

#### POST /api/coupons/validate

Validate a coupon code without applying it.

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

#### POST /api/coupons/apply

Apply a coupon to a cart.

```bash
curl -X POST http://localhost:3000/api/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartID": "cart-123"}'
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

### **Referral Mode Endpoints**

#### POST /api/coupons/validate

Validate a referral code and preview commission/discount.

```bash
curl -X POST http://localhost:3000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "REF-ABC123", "cartID": "cart-123"}'
```

**Response:**
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

#### POST /api/coupons/apply

Apply a referral code to a cart.

```bash
curl -X POST http://localhost:3000/api/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code": "REF-ABC123", "cartID": "cart-123"}'
```

**Response:**
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

### **Error Responses**

All endpoints return consistent error formats:

```json
{
  "success": false,
  "error": "Invalid coupon code"
}
```

```json
{
  "success": false,
  "error": "Referral code has expired"
}
```

```json
{
  "success": false,
  "error": "Coupon already applied to this cart"
}
```

## ⚙️ Configuration

### **Core Options**

```typescript
export type CouponPluginOptions = {
  enabled?: boolean                    // Enable/disable the entire plugin (default: true)
  enableReferrals?: boolean           // Choose mode: false=coupons, true=referrals (default: false)
  allowStackWithOtherCoupons?: boolean // Allow multiple coupons (coupon mode only, default: false)
  defaultCurrency?: string             // Currency for amounts (default: 'USD')
  autoIntegrate?: boolean              // Auto-extend carts/orders collections (default: true)
  collections?: {
    couponsSlug?: string               // Collection slug for coupons (default: 'coupons')
    referralProgramsSlug?: string      // Collection slug for programs (default: 'referral-programs')
    referralCodesSlug?: string         // Collection slug for codes (default: 'referral-codes')
    referralPartnersSlug?: string      // Collection slug for partners (default: 'referral-partners')
  }
  access?: {
    canUseCoupons?: Access             // Who can use coupons (default: () => true)
    canUseReferrals?: Access           // Who can use referrals (default: () => true)
    isAdmin?: Access                   // Who can manage codes/programs (default: () => false)
  }
}
```

### **Mode Selection**

#### **Coupon Mode** (`enableReferrals: false`)
```typescript
payloadEcommerceCoupon({
  enableReferrals: false,  // Traditional coupon system
  // Creates: coupons collection
  // Features: percentage/fixed discounts, usage limits, conditions
})
```

#### **Referral Mode** (`enableReferrals: true`)
```typescript
payloadEcommerceCoupon({
  enableReferrals: true,   // Partner referral system
  // Creates: referral-programs, referral-codes collections
  // Features: commission rules, partner/customer splits, referral tracking
})
```

### **Access Control Examples**

#### **Basic Authentication**
```typescript
payloadEcommerceCoupon({
  access: {
    canUseCoupons: ({ req }) => Boolean(req.user),           // Authenticated users only
    canUseReferrals: ({ req }) => Boolean(req.user),         // Authenticated users only
    isAdmin: ({ req }) => req.user?.role === 'admin',        // Admin role required
  },
})
```

#### **Subscription-Based Access**
```typescript
payloadEcommerceCoupon({
  access: {
    canUseCoupons: ({ req }) => req.user?.subscription !== 'free',  // Paid users only
    canUseReferrals: ({ req }) => req.user?.subscription === 'premium', // Premium only
    isAdmin: ({ req }) => ['admin', 'manager'].includes(req.user?.role), // Multiple roles
  },
})
```

#### **Role-Based Permissions**
```typescript
payloadEcommerceCoupon({
  access: {
    canUseCoupons: ({ req }) => {
      // Custom logic based on user properties
      return req.user?.permissions?.includes('use_coupons') ?? false
    },
    canUseReferrals: ({ req }) => {
      // Check multiple conditions
      const user = req.user
      return user?.verified && user?.subscription === 'active'
    },
    isAdmin: ({ req }) => {
      // Admin or specific user IDs
      return req.user?.role === 'admin' || req.user?.id === 'special-user'
    },
  },
})
```

### **Collection Customization**

Avoid slug conflicts with existing collections:

```typescript
payloadEcommerceCoupon({
  collections: {
    couponsSlug: 'discount-codes',           // Instead of 'coupons'
    referralProgramsSlug: 'affiliate-programs', // Instead of 'referral-programs'
    referralCodesSlug: 'promo-codes',        // Instead of 'referral-codes'
  },
})
```

### **Advanced Configuration Examples**

#### **Multi-Tenant Setup**
```typescript
payloadEcommerceCoupon({
  collections: {
    couponsSlug: 'tenant-a-coupons',
    referralProgramsSlug: 'tenant-a-referrals',
  },
  access: {
    canUseCoupons: ({ req }) => req.user?.tenantId === 'tenant-a',
    canUseReferrals: ({ req }) => req.user?.tenantId === 'tenant-a',
    isAdmin: ({ req }) => req.user?.role === 'admin' && req.user?.tenantId === 'tenant-a',
  },
})
```

#### **Development vs Production**
```typescript
const isProduction = process.env.NODE_ENV === 'production'

payloadEcommerceCoupon({
  enabled: isProduction,  // Disable in development
  access: {
    isAdmin: ({ req }) => isProduction ? req.user?.role === 'admin' : true, // Allow all in dev
  },
})
```

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

## � Usage Examples

### **E-commerce Store Setup**

#### **Basic Coupon Store**
```typescript
// payload.config.ts
import { payloadEcommerceCoupon } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  collections: [/* your collections */],
  plugins: [
    ecommercePlugin({ /* config */ }),
    payloadEcommerceCoupon({
      enableReferrals: false,  // Coupon mode
      defaultCurrency: 'USD',
      access: {
        canUseCoupons: ({ req }) => Boolean(req.user),
        isAdmin: ({ req }) => req.user?.role === 'admin',
      },
    }),
  ],
})
```

#### **Affiliate Marketing Platform**
```typescript
// payload.config.ts
export default buildConfig({
  collections: [/* your collections */],
  plugins: [
    ecommercePlugin({ /* config */ }),
    payloadEcommerceCoupon({
      enableReferrals: true,   // Referral mode
      defaultCurrency: 'USD',
      access: {
        canUseReferrals: ({ req }) => req.user?.subscription === 'premium',
        isAdmin: ({ req }) => req.user?.role === 'admin',
      },
    }),
  ],
})
```

### **Commission Rule Examples**

#### **Tiered Commission Structure**
```json
// Referral Program Commission Rules
[
  {
    "name": "High-Value Electronics",
    "appliesTo": "categories",
    "categories": ["laptops", "smartphones"],
    "totalCommission": { "type": "percentage", "value": 20 },
    "split": { "partnerPercentage": 80, "customerPercentage": 20 }
  },
  {
    "name": "Accessories",
    "appliesTo": "categories",
    "categories": ["cases", "chargers"],
    "totalCommission": { "type": "percentage", "value": 10 },
    "split": { "partnerPercentage": 70, "customerPercentage": 30 }
  },
  {
    "name": "Default Rate",
    "appliesTo": "all",
    "totalCommission": { "type": "percentage", "value": 5 },
    "split": { "partnerPercentage": 60, "customerPercentage": 40 }
  }
]
```

#### **Fixed Commission per Product**
```json
[
  {
    "name": "Premium Products",
    "appliesTo": "products",
    "products": ["premium-laptop", "gaming-pc"],
    "totalCommission": { "type": "fixed", "value": 50 },
    "split": { "partnerPercentage": 75, "customerPercentage": 25 }
  }
]
```

### **Frontend Integration Examples**

#### **React Checkout Component**
```tsx
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'
import { useState } from 'react'

function Checkout({ cartId, total }: { cartId: string, total: number }) {
  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState(0)
  const [loading, setLoading] = useState(false)

  const applyCode = async () => {
    setLoading(true)
    try {
      const result = await useCouponCode({
        code,
        cartID: cartId,
      })

      if (result.success) {
        setDiscount(result.discount || 0)
        alert(`Applied successfully! Discount: $${result.discount}`)
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert('Failed to apply code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="checkout">
      <div className="code-input">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter coupon or referral code"
          disabled={loading}
        />
        <button onClick={applyCode} disabled={loading}>
          {loading ? 'Applying...' : 'Apply'}
        </button>
      </div>

      <div className="totals">
        <div>Subtotal: ${total}</div>
        <div>Discount: -${discount}</div>
        <div>Total: ${total - discount}</div>
      </div>
    </div>
  )
}
```

#### **Next.js API Route**
```typescript
// pages/api/apply-code.ts
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, cartId } = req.body

  try {
    const result = await useCouponCode({
      code,
      cartID: cartId,
    })

    if (result.success) {
      return res.status(200).json(result)
    } else {
      return res.status(400).json({ error: result.error })
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
```

### **Admin Panel Examples**

#### **Bulk Coupon Creation**
```typescript
// Admin script to create multiple coupons
const coupons = [
  { code: 'WELCOME10', type: 'percentage', value: 10 },
  { code: 'SAVE20', type: 'percentage', value: 20 },
  { code: 'FLAT50', type: 'fixed', value: 50 },
]

for (const coupon of coupons) {
  await payload.create({
    collection: 'coupons',
    data: {
      ...coupon,
      activeFrom: new Date(),
      activeUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  })
}
```

#### **Referral Program Setup**
```typescript
// Create a complete referral program
const program = await payload.create({
  collection: 'referral-programs',
  data: {
    name: 'Partner Program 2024',
    description: 'Earn commissions by referring customers',
    isActive: true,
    commissionRules: [
      {
        name: 'Electronics',
        appliesTo: 'categories',
        categories: ['electronics'],
        totalCommission: { type: 'percentage', value: 15 },
        split: { partnerPercentage: 70, customerPercentage: 30 },
      },
    ],
  },
})
```

## �🔧 Troubleshooting

### **Common Issues**

#### **"Collection already exists" Error**
**Problem**: Migration fails due to existing collections
**Solution**: Customize collection slugs to avoid conflicts
```typescript
payloadEcommerceCoupon({
  collections: {
    couponsSlug: 'my-coupons',
    referralProgramsSlug: 'my-referral-programs',
  },
})
```

#### **API Returns 404**
**Problem**: Endpoints not found
**Solution**: Ensure plugin is registered in `payload.config.ts`
```typescript
// Correct order in payload.config.ts
plugins: [
  ecommercePlugin({...}),
  payloadEcommerceCoupon({...}), // Must come after ecommerce plugin
]
```

#### **Permission Denied**
**Problem**: Users can't use coupons/referrals
**Solution**: Check access control configuration
```typescript
payloadEcommerceCoupon({
  access: {
    canUseCoupons: ({ req }) => Boolean(req.user), // Ensure this returns true
    canUseReferrals: ({ req }) => Boolean(req.user),
  },
})
```

#### **Commission Calculation Issues**
**Problem**: Referral discounts not calculating correctly
**Solution**: Verify commission rules and product relationships
- Ensure products have correct category assignments
- Check that commission rules match product criteria
- Verify cart contains valid product references

#### **Cart Integration Not Working**
**Problem**: Applied coupons/referrals not showing in cart
**Solution**: Check auto-integration settings
```typescript
payloadEcommerceCoupon({
  autoIntegrate: true, // Ensure this is enabled (default)
})
```

### **Debugging Tips**

#### **Enable Debug Logging**
```typescript
// Add to your payload.config.ts for debugging
logger: {
  level: 'debug',
},
```

#### **Test API Endpoints**
```bash
# Test coupon validation
curl -X POST http://localhost:3000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "TEST123"}'

# Test referral validation
curl -X POST http://localhost:3000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "REF-ABC123", "cartID": "cart-123"}'
```

#### **Check Database Collections**
Verify collections are created correctly:
- **Coupon Mode**: `coupons` collection
- **Referral Mode**: `referral-programs`, `referral-codes` collections

#### **Validate Configuration**
```typescript
// Add console.log to verify config
const couponConfig = payloadEcommerceCoupon({
  enableReferrals: true,
  // ... other options
})
console.log('Coupon plugin config:', couponConfig)
```

### **Performance Considerations**

#### **Database Indexes**
For high-traffic sites, add indexes on frequently queried fields:
- Coupon codes: `code` field
- Referral codes: `code` field
- Usage counts: `usageCount` field

#### **Caching Strategy**
Consider caching for:
- Frequently used coupon validation
- Commission rule lookups
- Product category mappings

#### **Rate Limiting**
Implement rate limiting for API endpoints to prevent abuse:
```typescript
// Example: Limit to 10 requests per minute per IP
const rateLimit = require('express-rate-limit')
app.use('/api/coupons', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10
}))
```

## 🧪 Testing

### **Running Tests**

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/plugin.test.ts
```

### **Test Coverage**

The plugin maintains 80%+ test coverage including:
- ✅ Plugin initialization and configuration
- ✅ Collection creation (conditional based on mode)
- ✅ API endpoint functionality
- ✅ Access control validation
- ✅ Commission calculation logic
- ✅ Error handling scenarios

### **Manual Testing Checklist**

#### **Coupon Mode Testing**
- [ ] Create coupon in admin panel
- [ ] Validate coupon via API
- [ ] Apply coupon to cart
- [ ] Verify discount calculation
- [ ] Test usage limits
- [ ] Test expiration dates

#### **Referral Mode Testing**
- [ ] Create referral program with commission rules
- [ ] Generate referral codes
- [ ] Validate referral codes via API
- [ ] Apply referral codes to cart
- [ ] Verify commission and discount split
- [ ] Test referral tracking

#### **Integration Testing**
- [ ] Cart total updates correctly
- [ ] Order creation includes applied discounts
- [ ] Frontend hooks work properly
- [ ] Access control restrictions work

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
