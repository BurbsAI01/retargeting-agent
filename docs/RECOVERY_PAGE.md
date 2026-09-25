# Quote Recovery Landing Page

## Overview

The recovery landing page is a high-converting public-facing page where retargeting campaign recipients can view their original quote and complete the purchase with a special discount. It's designed for maximum conversion with minimal friction.

## Architecture

```
Recovery Link Generated
    ↓ (in dispatch engine)
quote_recovery_links table
    ↓ (user clicks email/SMS link)
/recover/:token
    ↓
Recovery React Component
    ↓
Fetch quote_recovery_links data
    ↓
Display quote + discount
    ↓
Track view event
    ↓
User completes purchase
    ↓
POST /recovery/:token/convert
    ↓
Update campaign_performance
    ↓
Success confirmation
```

## Backend Endpoints

### GET /recovery/:token
Fetch recovery link and associated quote details.

**Parameters:**
- `token` (path) - Recovery token from recovery link

**Response (200 OK):**
```json
{
  "campaign_id": 123,
  "quote_id": 456,
  "visitor_id": 789,
  "recovery_token": "abc-def-ghi",
  "visitor": {
    "name": "John Doe",
    "email": "john@example.com",
    "company": "ACME Corp"
  },
  "quote": {
    "description": "Website Redesign",
    "scope": "Full redesign with new branding",
    "timeline": "8 weeks",
    "generated_at": "2024-01-15T10:00:00Z",
    "days_ago": 5
  },
  "discount": {
    "enabled": true,
    "percent": 15,
    "amount": 750,
    "expires_at": "2024-02-15T23:59:59Z"
  },
  "pricing": {
    "original": 5000,
    "discount_amount": 750,
    "final": 4250,
    "savings_percent": 15
  },
  "incentives": [
    "Free 3-month support",
    "Priority implementation",
    "Custom training sessions"
  ],
  "already_converted": false,
  "copy_variant": {
    "subject": "Your Quote + Special Offer",
    "preview_text": "We miss you! Complete now.",
    "body": "Don't miss out on this opportunity",
    "cta_text": "Claim Your Offer"
  }
}
```

**Error Responses:**
- `404 Not Found` - Token not found
- `410 Gone` - Link has expired

### POST /recovery/:token/view
Track that the recovery link was viewed.

**Parameters:**
- `token` (path) - Recovery token
- `utm_source` (body, optional) - Tracking source (email, sms, etc.)

**Request:**
```json
{
  "utm_source": "email"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /recovery/:token/convert
Record a conversion on the recovery link.

**Parameters:**
- `token` (path) - Recovery token
- `amount` (body) - Conversion amount in dollars
- `order_id` (body, optional) - External order reference

**Request:**
```json
{
  "amount": 4250,
  "order_id": "ORD-123456"
}
```

**Response:**
```json
{
  "success": true,
  "campaign_id": 123,
  "quote_id": 456,
  "visitor_id": 789,
  "message": "Conversion recorded successfully"
}
```

## Frontend Component

### Recovery.jsx

High-converting landing page built with React.

**Features:**

1. **Loading State**
   - Spinner animation
   - "Loading your quote..." message

2. **Error States**
   - Link not found (404)
   - Link expired (410)
   - Generic error handling

3. **Hero Section**
   - Compelling headline
   - Subheading from copy variant
   - Blue gradient background

4. **Quote Card**
   - Original quote details
   - Days since quote generation
   - Service description, scope, timeline
   - Visual hierarchy for key information

5. **Pricing Display**
   - Original price (struck through)
   - Discount amount in green
   - Final price prominently displayed
   - Savings badge with percentage
   - Expiration countdown

6. **Incentives Section**
   - List of included benefits
   - Checkmark icons
   - Motivational copy

7. **Call-to-Action**
   - "Complete Purchase" button
   - Optional conversion form
   - Fields: Name, Email, Order ID
   - Loading state on submit

8. **Trust Section**
   - Security badge (🔒)
   - Money-back guarantee (✓)
   - 24/7 support (📞)

9. **FAQ Section**
   - Collapsible questions
   - Addresses common objections
   - Expandable details
   - Topics: validity, modifications, next steps, cancellation

10. **Footer**
    - Support contact link
    - Email link generation

### Styling (Recovery.css)

**Design System:**
- Primary: #007bff (Blue)
- Success: #28a745 (Green for savings)
- Warning: #ffc107 (Yellow for expiration)
- Light backgrounds with subtle shadows
- Responsive grid layout

**Key Features:**
- Mobile-first responsive design
- Dark mode support via prefers-color-scheme
- Smooth animations (loading spinner, success confirmation)
- Hover effects on buttons
- Focus states for accessibility
- Proper color contrast ratios

**Breakpoints:**
- Desktop: 800px+ (1 column, wide padding)
- Tablet: 600-800px (adjusted padding)
- Mobile: <600px (full width, single column)

## Data Flow

### 1. Link Generation (in Dispatch Engine)
```javascript
// When campaign is approved
const token = require('uuid').v4();
await pool.query(
  `INSERT INTO quote_recovery_links (
    campaign_id, quote_id, visitor_id,
    recovery_url, recovery_token,
    includes_discount, discount_percent,
    expires_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7,
    CURRENT_TIMESTAMP + INTERVAL '30 days'
  )`,
  [id, campaignId, quoteId, `/recover/${token}`, token, true, discountPercent]
);
```

### 2. Email Link
```html
<a href="https://app.example.com/recover/abc-def-ghi?utm_source=email">
  Claim Your Offer
</a>
```

### 3. Page Load
```javascript
// 1. Extract token from URL
const token = window.location.pathname.split('/').pop();

// 2. Fetch recovery data
GET /recovery/{token}

// 3. Display quote + discount
// 4. Track view
POST /recovery/{token}/view
```

### 4. Conversion
```javascript
// When user submits form
POST /recovery/{token}/convert
{
  "amount": 4250,
  "order_id": "ORD-123456"
}

// Updates:
// - quote_recovery_links.converted_at = NOW
// - quotes.conversion_status = 'converted'
// - engagement_log: conversion event
// - campaign_performance: totals, revenue, rates
```

## Database Schema

### quote_recovery_links
```sql
- id (PRIMARY KEY)
- campaign_id (FK → retargeting_campaigns)
- quote_id (FK → quotes)
- visitor_id (FK → visitors)
- recovery_token (UNIQUE, VARCHAR)
- recovery_url (VARCHAR)
- includes_discount (BOOLEAN)
- discount_percent (DECIMAL)
- expires_at (TIMESTAMP)
- first_visited_at (TIMESTAMP) ← Updated on first view
- converted_at (TIMESTAMP) ← Updated on conversion
- created_at (TIMESTAMP)
```

### Related Tables
```
quotes:
- id, visitor_id, quote_details, conversion_status, generated_at

retargeting_campaigns:
- id, visitor_id, quote_id, agent_recommendation, operator_modifications

campaign_performance:
- campaign_id, channel, total_sent, total_converted, revenue_impact

engagement_log:
- visitor_id, campaign_id, channel, action, metadata, created_at
```

## Conversion Metrics

### Real-time Updates

When conversion is recorded:
```sql
UPDATE campaign_performance
SET 
  total_converted = total_converted + 1,
  revenue_impact = revenue_impact + 4250,
  conversion_rate = (total_converted + 1) / total_sent * 100
WHERE campaign_id = 123;
```

### Tracked Events
- `recovery_link.viewed` - First page view
- `recovery_link.converted` - Conversion recorded
- `recovery_link.form_viewed` - Conversion form displayed
- `recovery_link.form_submitted` - Conversion form submitted

## Conversion Optimization

### Design Principles
1. **Minimize Friction** - No unnecessary steps
2. **Build Trust** - Security, guarantee, support signals
3. **Emphasize Savings** - Green highlight, percentage, dollar amount
4. **Create Urgency** - Expiration countdown
5. **Clear CTA** - Primary button, color hierarchy
6. **Social Proof** - Incentives, testimonials (future)

### Mobile Optimization
- Single-column layout
- Large touch targets (44px minimum)
- Minimal typing (only 3 form fields)
- Sticky CTA button (optional)
- Fast loading (minimal dependencies)

### Conversion Form
- Name field (prefilled if available)
- Email field (prefilled if available)
- Order ID (optional, for reference)
- Clear success message
- Validation feedback

## Testing

### Manual Testing

#### 1. Create Test Campaign
```bash
# Create visitor and quote
POST /webhooks/visitor-event
{
  "visitorId": "test-123",
  "email": "test@example.com",
  "phone": "+1234567890",
  "company": "Test Corp",
  "event_type": "quote_generated",
  "quote_data": {
    "total": 5000,
    "description": "Website Redesign",
    "scope": "Full redesign",
    "timeline": "8 weeks"
  }
}
```

#### 2. Approve Campaign
```bash
POST /campaigns/{campaignId}/approve
{
  "operator_email": "op@example.com",
  "discount_percent": 15,
  "channels": ["email"],
  "incentive": "discount_percent"
}
```

#### 3. Test Recovery Page
```bash
# Get token from quote_recovery_links table
SELECT recovery_token FROM quote_recovery_links
WHERE campaign_id = {campaignId};

# Visit page
https://localhost:3000/recover/{token}

# Verify:
# - Quote details display
# - Discount calculated correctly
# - Original price struck through
# - Final price highlighted
# - Save button visible
```

#### 4. Test Conversion
```bash
# Submit form
POST /recovery/{token}/convert
{
  "amount": 4250,
  "order_id": "TEST-001"
}

# Verify in database:
SELECT * FROM quote_recovery_links
WHERE recovery_token = '{token}';
# converted_at should be populated

SELECT * FROM campaign_performance
WHERE campaign_id = {campaignId};
# total_converted = 1, revenue_impact = 4250
```

### Automated Testing
```javascript
// Jest test example
test('displays discount correctly', async () => {
  const { getByText } = render(<Recovery />);
  expect(getByText('Save $750 (15% off)')).toBeInTheDocument();
});

test('submit form records conversion', async () => {
  const { getByLabelText, getByText } = render(<Recovery />);
  fireEvent.change(getByLabelText('Full Name'), { target: { value: 'John Doe' } });
  fireEvent.click(getByText('Confirm & Complete'));
  
  expect(mockAxios.post).toHaveBeenCalledWith(
    expect.stringContaining('/recovery/'),
    expect.objectContaining({ amount: 4250 })
  );
});
```

## Environment Variables

```env
# Frontend
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SUPPORT_EMAIL=support@example.com

# Backend (if needed)
APP_URL=https://app.example.com
```

## URL Structure

### Public URLs
```
/recover/{token}                    - Landing page
/recover/{token}?utm_source=email   - With tracking
/recover/{token}?utm_source=sms     - SMS link
```

### API Endpoints
```
GET  /recovery/{token}              - Fetch details
POST /recovery/{token}/view         - Track view
POST /recovery/{token}/convert      - Record conversion
```

## Future Enhancements

1. **Dynamic Pricing** - Calculate final price on backend
2. **Testimonials** - Social proof section
3. **Video Demo** - Show service/product in action
4. **Live Chat** - Support during decision
5. **Countdown Timer** - Urgency with visible timer
6. **A/B Testing** - Test different copy variants
7. **Analytics Dashboard** - View recovery metrics
8. **Email Reminder** - Retarget if not converted
9. **Upsell Offers** - Suggest add-ons
10. **Payment Integration** - Direct checkout

## Troubleshooting

### Issue: Token Not Found
- Verify recovery link was created in database
- Check token hasn't expired
- Ensure URL parameter is correct

### Issue: Discount Not Showing
- Check `includes_discount` field in database
- Verify `discount_percent` is > 0
- Check discount wasn't overridden in operator_modifications

### Issue: Conversion Not Recorded
- Verify POST endpoint is called
- Check network tab for successful response
- Query engagement_log for the event

### Issue: Mobile Layout Broken
- Check viewport meta tag in HTML
- Verify CSS media queries are working
- Test on actual mobile device
- Check font sizes for readability

## Support

For issues with:
- **Backend endpoints** - Check server logs
- **Frontend rendering** - Check browser console
- **Database** - Run recovery link queries
- **Styling** - Check CSS breakpoints
- **Tracking** - Check engagement_log and campaign_performance

See main documentation for detailed setup and integration guides.
