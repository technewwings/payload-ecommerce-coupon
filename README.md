# @wtree/payload-ecommerce-coupon

[![NPM Version](https://img.shields.io/npm/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://npmjs.com/package/@wtree/payload-ecommerce-coupon)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node Version](https://img.shields.io/node/v/@wtree/payload-ecommerce-coupon?style=flat-square)](https://nodejs.org)

Production-ready coupon and referral system plugin for **Payload CMS** with seamless integration to the **@payloadcms/plugin-ecommerce** package.

## 🚀 Features

### **System Modes**
- **Coupon Mode** (`enableReferrals: false`) – Traditional discount codes
- **Referral Mode** (`enableReferrals: true`) – Partner commissions + customer discounts
- **Hybrid Mode** (`enableReferrals: true` + `referralConfig.allowBothSystems: true`) – Both systems active

### **Coupon Mode Features**
- ✅ **Flexible Discounts** – Percentage or fixed amount discounts
- ✅ **Usage Controls** – Per-customer limits, expiration dates, usage counts
- ✅ **Conditions** – Minimum/maximum order values, product restrictions
- ✅ **Auto-Application** – Seamless cart integration

### **Referral Mode Features**
- ✅ **Commission Rules** – Per-product/category commission rates
- ✅ **Split Configuration** – Configurable partner/customer share ratios
- ✅ **Partner Tracking** – Commission earnings and referral performance
- ✅ **Auto-Generated Codes** – Unique referral codes for each partner
- ✅ **Partner Dashboard** – Ready-to-use React components for partner stats
- ✅ **Single Code Per Cart** – Enforce one code (coupon or referral) per order

### **Core Features**
- ✅ **REST API** – Validate, apply, and track codes
- ✅ **Frontend Hooks** – `useCouponCode()`, `usePartnerStats()` for React/Next.js
- ✅ **Auto-Integration** – Extends carts/orders automatically
- ✅ **Type-Safe** – Full TypeScript support
- ✅ **Access Control** – Role-based permissions with partner role support
- ✅ **Custom Admin Groups** – Separate "Coupons" and "Referrals" categories
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
      enableReferrals: true, // Enable referral system
      defaultCurrency: 'USD',
      
      // Referral-specific configuration
      referralConfig: {
        allowBothSystems: false, // Set true to allow both coupons and referrals
        singleCodePerCart: true, // Only one code per order
        defaultPartnerSplit: 70, // 70% to partner
        defaultCustomerSplit: 30, // 30% discount to customer
      },
      
      // Custom admin panel groups
      adminGroups: {
        couponsGroup: 'Coupons',
        referralsGroup: 'Referrals',
      },
      
      // Partner dashboard configuration
      partnerDashboard: {
        enabled: true,
        showEarningsSummary: true,
        showReferralPerformance: true,
        showRecentReferrals: true,
        showCommissionBreakdown: true,
      },
      
      // Access control
      access: {
        canUseCoupons: () => true,
        canUseReferrals: () => true,
        isAdmin: ({ req }) => req.user?.role === 'admin',
        isPartner: ({ req }) => req.user?.role === 'partner',
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
- **Coupons** – Manage discount codes (in "Coupons" group)
- **Referral Programs** – Set up partner commission structures (in "Referrals" group)
- **Referral Codes** – Track generated referral links (in "Referrals" group)

### 3. Setting Up Partner Role

To enable the partner dashboard and role-based access, add a `role` field to your Users collection:

```typescript
// collections/Users.ts
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Partner', value: 'partner' },
        { label: 'Customer', value: 'customer' },
      ],
      defaultValue: 'customer',
      required: true,
    },
    // Or use multiple roles
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Partner', value: 'partner' },
        { label: 'Customer', value: 'customer' },
      ],
      defaultValue: ['customer'],
    },
  ],
}
```

### 4. Frontend Integration

#### Apply Coupon/Referral Code

```typescript
import { useCouponCode } from '@wtree/payload-ecommerce-coupon'

function CheckoutComponent() {
  const [code, setCode] = useState('')
  const [cartId, setCartId] = useState('your-cart-id')

  const applyCode = async () => {
    const result = await useCouponCode({
      code,
      cartID: cartId,
    })

    if (result.success) {
      if (result.coupon) {
        console.log('Coupon applied! Discount:', result.discount)
      } else if (result.referralCode) {
        console.log('Referral applied!')
        console.log('Your discount:', result.customerDiscount)
        console.log('Partner commission:', result.partnerCommission)
      }
    } else {
      console.error('Error:', result.error)
    }
  }

  return (
    <div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter coupon or referral code"
      />
      <button onClick={applyCode}>Apply Code</button>
    </div>
  )
}
```

#### Partner Dashboard

```typescript
import { PartnerDashboard, usePartnerStats } from '@wtree/payload-ecommerce-coupon'

// Option 1: Use the pre-built dashboard component
function PartnerPage() {
  return (
    <PartnerDashboard
      showEarningsSummary={true}
      showReferralPerformance={true}
      showRecentReferrals={true}
      showReferralCodes={true}
      apiEndpoint="/api/referrals/partner-stats"
    />
  )
}

// Option 2: Build custom dashboard with the hook
function CustomPartnerDashboard() {
  const [data, setData] = useState(null)
  
  useEffect(() => {
    const fetchStats = async () => {
      const result = await usePartnerStats()
      if (result.success) {
        setData(result.data)
      }
    }
    fetchStats()
  }, [])

  if (!data) return <div>Loading...</div>

  return (
    <div>
      <h2>Your Earnings</h2>
      <p>Total: ${data.stats.totalEarnings}</p>
      <p>Pending: ${data.stats.pendingEarnings}</p>
      <p>Paid: ${data.stats.paidEarnings}</p>
      
      <h2>Your Referral Codes</h2>
      {data.referralCodes.map(code => (
        <div key={code.id}>
          <span>{code.code}</span>
          <span>Uses: {code.usageCount}</span>
        </div>
      ))}
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

#### **Hybrid Mode** (`enableReferrals: true` + `allowBothSystems: true`)
Best when you need both traditional coupons AND partner referrals, but want to enforce only one code per order.

### **Setting Up Coupon Mode**

1. **Navigate to Admin Panel** → Go to "Coupons" collection (under "Coupons" group)
2. **Create New Coupon**:
   - **Code**: `WELCOME10` (unique identifier)
   - **Type**: `Percentage` or `Fixed Amount`
   - **Value**: `10` (10% or $10)
   - **Description**: "Welcome discount for new customers"
   - **Active From/Until**: Set validity period
   - **Usage Limit**: Maximum uses (optional)
   - **Per Customer Limit**: Uses per customer (optional)
   - **Min/Max Order Value**: Order value constraints

### **Setting Up Referral Mode**

1. **Navigate to Admin Panel** → Go to "Referral Programs" (under "Referrals" group)
2. **Create Referral Program**:
   - **Name**: "Partner Affiliate Program"
   - **Description**: "Earn commissions by referring customers"
   - **Is Active**: Enable/disable program
   - **Referrer Reward**: Commission for the partner (e.g., 10% of order)
   - **Referee Reward**: Discount for the customer (e.g., 5% off)

3. **Configure Commission Rules** (Optional - for product-specific rates):
   ```json
   {
     "name": "Electronics Category",
     "appliesTo": "categories",
     "categories": ["electronics"],
     "totalCommission": {
       "type": "percentage",
       "value": 15
     },
     "split": {
       "partnerPercentage": 70,
       "customerPercentage": 30
     }
   }
   ```

### **Commission Calculation Examples**

#### **Example 1: Simple Percentage Split**
- **Order Total**: $100
- **Referrer Reward**: 10% (percentage)
- **Referee Reward**: 5% (percentage)
- **Result**: Partner earns $10, Customer saves $5

#### **Example 2: Commission Rules with Split**
- **Order Total**: $100 (Electronics category)
- **Total Commission**: 15% = $15
- **Partner Share**: 70% of $15 = $10.50
- **Customer Discount**: 30% of $15 = $4.50

#### **Example 3: Fixed Commission**
- **Referrer Reward**: $20 (fixed)
- **Referee Reward**: $10 (fixed)
- **Result**: Partner earns $20, Customer saves $10 (regardless of order value)

### **Managing Partners**

1. **Create Partner Account**: Set user role to "partner"
2. **Generate Referral Code**: Partners can create codes in "Referral Codes" collection
3. **Track Performance**: View usage count, earnings, and successful referrals
4. **Payout Management**: Track pending vs paid earnings

## 🌐 REST API Endpoints

### **Coupon/Referral Endpoints**

#### POST /api/coupons/validate
Validate a code without applying it.

```bash
curl -X POST http://localhost:3000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartValue": 5000}'
```

#### POST /api/coupons/apply
Apply a code to a cart.

```bash
curl -X POST http://localhost:3000/api/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code": "WELCOME10", "cartID": "cart-123"}'
```

### **Partner Stats Endpoint**

#### GET /api/referrals/partner-stats
Get partner dashboard data (requires authentication).

```bash
curl -X GET http://localhost:3000/api/referrals/partner-stats \
  -H "Cookie: payload-token=your-auth-token"
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
      "recentReferrals": [...],
      "monthlyEarnings": [...]
    },
    "referralCodes": [...],
    "program": {
      "name": "Partner Program",
      "commissionRate": 10,
      "customerDiscount": 5
    }
  },
  "currency": "USD"
}
```

## ⚙️ Configuration

### **Core Options**

```typescript
export type CouponPluginOptions = {
  enabled?: boolean                    // Enable/disable the plugin (default: true)
  enableReferrals?: boolean           // Enable referral system (default: false)
  allowStackWithOtherCoupons?: boolean // Allow multiple coupons (default: false)
  defaultCurrency?: string             // Currency code (default: 'USD')
  autoIntegrate?: boolean              // Auto-extend carts/orders (default: true)
  
  collections?: {
    couponsSlug?: string               // Default: 'coupons'
    referralProgramsSlug?: string      // Default: 'referral-programs'
    referralCodesSlug?: string         // Default: 'referral-codes'
    
    /** Override the default coupons collection configuration */
    couponsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    
    /** Override the default referral programs collection configuration */
    referralProgramsCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
    
    /** Override the default referral codes collection configuration */
    referralCodesCollectionOverride?: (params: { defaultCollection: any }) => any | Promise<any>
  }
  
  endpoints?: {
    applyCoupon?: string               // Default: '/coupons/apply'
    validateCoupon?: string            // Default: '/coupons/validate'
    partnerStats?: string              // Default: '/referrals/partner-stats'
  }
  
  access?: {
    canUseCoupons?: Access             // Who can use coupons
    canUseReferrals?: Access           // Who can use referrals
    isAdmin?: Access                   // Who can manage codes/programs
    isPartner?: Access                 // Who has partner access
  }
  
  referralConfig?: {
    allowBothSystems?: boolean         // Allow coupons + referrals (default: false)
    singleCodePerCart?: boolean        // One code per order (default: true)
    defaultPartnerSplit?: number       // Default partner % (default: 70)
    defaultCustomerSplit?: number      // Default customer % (default: 30)
  }
  
  adminGroups?: {
    couponsGroup?: string              // Admin group for coupons (default: 'Coupons')
    referralsGroup?: string            // Admin group for referrals (default: 'Referrals')
  }
  
  partnerDashboard?: {
    enabled?: boolean                  // Enable dashboard (default: true)
    showEarningsSummary?: boolean      // Show earnings widget (default: true)
    showReferralPerformance?: boolean  // Show performance widget (default: true)
    showRecentReferrals?: boolean      // Show recent referrals (default: true)
    showCommissionBreakdown?: boolean  // Show breakdown (default: true)
  }
}
```

### **Collection Overrides**

You can override the default collection configurations to customize fields, hooks, or other collection settings. This allows you to extend or modify the plugin's behavior without forking the code.

```typescript
payloadEcommerceCoupon({
  collections: {
    // Override coupons collection
    couponsCollectionOverride: async ({ defaultCollection }) => {
      return {
        ...defaultCollection,
        fields: [
          ...defaultCollection.fields,
          // Add custom field to coupons
          {
            name: 'customField',
            type: 'text',
            label: 'Custom Field',
          },
        ],
        hooks: {
          ...defaultCollection.hooks,
          // Add custom hook
          beforeChange: [
            ...(defaultCollection.hooks?.beforeChange || []),
            async ({ data, req, operation }) => {
              // Custom beforeChange logic
              return data
            },
          ],
        },
      }
    },
    
    // Override referral programs collection
    referralProgramsCollectionOverride: ({ defaultCollection }) => {
      return {
        ...defaultCollection,
        admin: {
          ...defaultCollection.admin,
          defaultColumns: ['name', 'isActive', 'totalReferrals'],
        },
      }
    },
    
    // Override referral codes collection
    referralCodesCollectionOverride: async ({ defaultCollection }) => {
      return {
        ...defaultCollection,
        fields: [
          ...defaultCollection.fields,
          {
            name: 'customCodeField',
            type: 'select',
            label: 'Custom Code Type',
            options: ['standard', 'premium'],
            defaultValue: 'standard',
          },
        ],
      }
    },
  },
})
```

### **Access Control Examples**

```typescript
payloadEcommerceCoupon({
  access: {
    // Anyone can use coupons
    canUseCoupons: () => true,
    
    // Only authenticated users can use referrals
    canUseReferrals: ({ req }) => Boolean(req.user),
    
    // Only admins can manage
    isAdmin: ({ req }) => req.user?.role === 'admin',
    
    // Partner role check (supports both single role and array)
    isPartner: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (user.role === 'partner') return true
      if (Array.isArray(user.roles) && user.roles.includes('partner')) return true
      return false
    },
  },
})
```

## 📦 API Reference

### **Exported Functions**

```typescript
import {
  payloadEcommerceCoupon,
  
  // Collection creation functions
  createCouponsCollection,
  createReferralCodesCollection,
  createReferralProgramsCollection,
  
  // Frontend hooks
  useCouponCode,
  validateCouponCode,
  usePartnerStats,
  
  // Dashboard components
  PartnerDashboard,
  EarningsSummary,
  ReferralPerformance,
  RecentReferrals,
  ReferralCodes,
} from '@wtree/payload-ecommerce-coupon'
```

### **Collection Creation Functions**

You can use the collection creation functions directly in your Payload config to customize collections before they're added to the config.

```typescript
import { buildConfig } from 'payload'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { payloadEcommerceCoupon, createCouponsCollection } from '@wtree/payload-ecommerce-coupon'

export default buildConfig({
  plugins: [
    ecommercePlugin({
      // your ecommerce configuration
    }),
    payloadEcommerceCoupon({
      // plugin configuration
    }),
  ],
  collections: [
    // You can also create and customize collections directly
    createCouponsCollection({
      enabled: true,
      defaultCurrency: 'USD',
    }),
  ],
})
```

## 🎨 Partner Dashboard Components

The plugin provides ready-to-use React components for building partner dashboards:

```typescript
import {
  PartnerDashboard,      // Complete dashboard
  EarningsSummary,       // Earnings widget
  ReferralPerformance,   // Performance metrics
  RecentReferrals,       // Recent referrals table
  ReferralCodes,         // Referral codes list
} from '@wtree/payload-ecommerce-coupon'

// Use individual components
function CustomDashboard({ stats, currency }) {
  return (
    <div>
      <EarningsSummary stats={stats} currency={currency} />
      <ReferralPerformance stats={stats} />
    </div>
  )
}
```

### **Styling**

Import the default styles or customize:

```css
/* Import default styles */
@import '@wtree/payload-ecommerce-coupon/styles.css';

/* Or customize with CSS variables */
.partner-dashboard {
  --primary-color: #3b82f6;
  --success-color: #059669;
  --warning-color: #d97706;
}
```

## 🔧 Troubleshooting

### **Common Issues**

#### **"A code has already been applied to this cart"**
This occurs when `singleCodePerCart: true` and a code is already applied.
- Solution: Remove the existing code before applying a new one, or set `singleCodePerCart: false`

#### **Partner can't see their referral codes**
- Ensure the user has `role: 'partner'` or `roles: ['partner']`
- Check the `isPartner` access control function

#### **Commission not calculating correctly**
- Verify commission rules are properly configured
- Check that products have correct category assignments
- Ensure cart has valid `subtotal` or `total` field

## 📋 Future Features (Roadmap)

The following features are planned for future releases:

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-tier commissions | 🔜 Planned | Support for tiered commission rates based on performance |
| Automatic payouts | 🔜 Planned | Integration with payment providers for automatic partner payouts |
| Referral analytics | 🔜 Planned | Advanced analytics and reporting dashboard |
| Email notifications | 🔜 Planned | Automated emails for referral events |
| Custom code generation | 🔜 Planned | Allow partners to create custom branded codes |
| Fraud detection | 🔜 Planned | Automatic detection of suspicious referral patterns |
| Bulk code import | 🔜 Planned | Import coupons/codes from CSV |
| A/B testing | 🔜 Planned | Test different commission structures |

### **Comparison with Other Solutions**

| Feature | This Plugin | ReferralCandy | Refersion | Custom Build |
|---------|-------------|---------------|-----------|--------------|
| Payload CMS Integration | ✅ Native | ❌ | ❌ | ⚠️ Manual |
| Coupon System | ✅ | ❌ | ❌ | ⚠️ Manual |
| Referral System | ✅ | ✅ | ✅ | ⚠️ Manual |
| Partner Dashboard | ✅ | ✅ | ✅ | ⚠️ Manual |
| Commission Rules | ✅ | ⚠️ Limited | ✅ | ⚠️ Manual |
| Single Code Enforcement | ✅ | ❌ | ❌ | ⚠️ Manual |
| TypeScript Support | ✅ | ❌ | ❌ | ⚠️ Varies |
| Self-Hosted | ✅ | ❌ | ❌ | ✅ |
| Monthly Cost | Free | $49+ | $89+ | Dev Time |

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📚 Documentation

- [API Reference](./docs/api.md)
- [Compatibility Matrix](./COMPATIBILITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 🔗 Links

- **GitHub**: https://github.com/technewwings/payload-ecommerce-coupon
- **NPM**: https://npmjs.com/package/@wtree/payload-ecommerce-coupon
- **Payload CMS**: https://payloadcms.com
- **Payload Dashboard Docs**: https://payloadcms.com/docs/custom-components/dashboard

## 📄 License

MIT License © 2026 wtree. See [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
