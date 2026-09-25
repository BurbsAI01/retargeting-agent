# Dual-Audience Retargeting Strategy

**Signature Transportation Beta Implementation**

---

## Overview

Instead of only retargeting people who generated quotes, we're implementing a **two-tier funnel**:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  TIER 1: Website Visitors (Broader Awareness)              │
│  ├─ Anyone who lands on signaturetransportation.com        │
│  ├─ May not have generated a quote yet                     │
│  ├─ Retarget: Immediately (same day)                       │
│  ├─ Message: "Get a free transportation quote"             │
│  ├─ Goal: Bring them back to generate a quote              │
│  └─ Expected volume: 100-500 per month                     │
│                                                             │
│  TIER 2: Quote Generators (Higher Intent)                  │
│  ├─ People who generated a quote in Quote Bot             │
│  ├─ Didn't convert/complete booking                        │
│  ├─ Retarget: After 30 minutes                            │
│  ├─ Message: "Complete your quote - 10% discount"         │
│  ├─ Goal: Complete the transaction                         │
│  └─ Expected volume: 20-50 per month                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Two Tracking Sources

#### 1. Website Pixel (Tier 1: Awareness)

Added to main website at:
```html
<script>
window.retargetingConfig = {
  apiKey: 'sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8',
  appUrl: 'https://your-api-domain.com'
};

// Sends webhook when anyone lands on site
POST /webhooks/visitor-event
{
  "event_type": "website_visitor",
  "email": "optional@extracted.from.form",
  "visitor_data": {
    "url": "https://signaturetransportation.com/services",
    "referrer": "google.com",
    "page_title": "Transportation Services"
  }
}
</script>
```

**Processing:**
- ✅ Create visitor record (visitor_type = "website_visitor")
- ✅ Queue campaign generation: **Immediate (0 minute delay)**
- ✅ Generate "Get a quote" messaging
- ✅ Send email within 30 minutes

---

#### 2. Quote Bot Webhook (Tier 2: Conversion)

Quote Bot sends webhook when quote is generated:

```
POST /webhooks/quotebot
{
  "id": "QB-123456",
  "email": "customer@company.com",
  "estimate_total": "2500.00",
  "status": "pending",
  "converted": false
}
```

**Processing:**
- ✅ Create/update visitor record (visitor_type = "quote_generator")
- ✅ Create quote record
- ✅ Queue campaign generation: **After 30 minutes**
- ✅ Generate "Complete your quote + discount" messaging
- ✅ Send email after 30 minute delay

---

## Campaign Generation Logic

### Visitor Type Context

Each campaign now knows **why** the visitor is being retargeted:

```javascript
{
  visitor_type: "website_visitor" | "quote_generator",
  is_quote: false | true,
  daysSinceQuote: 0 (for website), X (for quotes)
}
```

### Different Messaging by Type

#### Website Visitors (Tier 1)

**Email Subject:**
- "Get Your Free Transportation Quote"
- "See Live Rates: Nashville to Your Destination"
- "Instant Transportation Quotes - Compare Prices"

**Email Body:**
- Emphasize ease of getting a quote
- Show quick form (2-3 minutes)
- Highlight variety of vehicle options
- No discount (they haven't invested time yet)
- CTA: "Get My Quote"

**Discount Strategy:**
- None offered initially (awareness phase)
- Build relationship first

**Example:**
```
Subject: Get Your Free Transportation Quote

Hi there,

Looking for reliable transportation in Nashville? 

Get an instant quote in under 2 minutes using our Quote Bot system.
See exactly what your transportation will cost.

We offer:
✓ Sprinter Vans
✓ Full-Size Buses
✓ Luxury Shuttles
✓ Professional Drivers

Ready? Click below to get started.

[Get My Quote]

Best,
The Signature Transportation Team
```

---

#### Quote Generators (Tier 2)

**Email Subject:**
- "Your Quote is Ready - Claim 10% Off"
- "Complete Your Booking - Special Offer Inside"
- "John, Here's Your Quote + Exclusive Discount"

**Email Body:**
- Reference their specific quote (amount, date)
- Highlight the discount offer
- Show confidence/social proof (years in business, reviews)
- Add urgency (limited time offer)
- CTA: "Complete My Booking"

**Discount Strategy:**
- 10% default (configurable per campaign)
- Only offered because they've already invested time
- Shows urgency with expiration date

**Example:**
```
Subject: Complete Your Quote - 10% Off Today

Hi John,

Your transportation quote is ready!

Quote Details:
Route: Nashville to Memphis
Vehicle: Sprinter Van
Original Price: $2,500.00
Your Price Today: $2,250.00 (10% Off)

This special offer expires in 48 hours.

Don't miss out on your discounted rate.

[Complete Your Booking]

Questions? Reply to this email or call us.

Best,
The Signature Transportation Team
```

---

## Timing Strategy

### Website Visitors

```
Day 0:
├─ User lands on website
├─ Pixel fires
├─ Visitor record created
├─ Campaign queued (Immediate)
├─ Wait time: 0 minutes
│
Day 0 (Same Day, ~30 min later):
├─ Campaign generation runs
├─ "Get a quote" email generated
├─ Email sent to visitor
│
Day 0-3:
├─ Visitor receives email
├─ May click and visit recovery page
├─ Maybe generates a quote
│
Day 1, 3, 7:
├─ If no quote generated yet
├─ Send follow-up emails (if enabled)
└─ Continue retargeting
```

### Quote Generators

```
Day 0:
├─ User fills quote form in Quote Bot
├─ Quote Bot webhook fires
├─ Visitor + Quote records created
├─ Campaign queued (30 min delay)
│
Day 0 (Same Day, ~30 min later):
├─ Campaign generation runs
├─ "Complete your quote" email generated
├─ Email sent with recovery link + discount
│
Day 0-1:
├─ Visitor receives email
├─ Clicks link with discount code
├─ Completes booking (conversion!)
│
Day 1-7:
├─ If still unconverted
├─ Send follow-up: "Limited time offer expires soon"
├─ Last chance email
└─ Final retargeting effort
```

---

## Database Schema

### Visitors Table Changes

Added `visitor_type` column:

```sql
-- Values: 'website_visitor' or 'quote_generator'
ALTER TABLE visitors ADD COLUMN visitor_type VARCHAR DEFAULT 'website_visitor';

-- Index for filtering by type
CREATE INDEX idx_visitors_type ON visitors(visitor_type);
```

### Campaign Tracking

Campaigns now store visitor type context:

```json
{
  "lead_temperature": "warm",
  "visitor_type": "website_visitor",
  "is_quote": false,
  "channels": ["email"],
  "suggested_discount_percent": 0,
  "copy_variants": [
    {
      "channel": "email",
      "subject": "Get Your Free Transportation Quote",
      "body": "...",
      "cta_text": "Get My Quote"
    }
  ]
}
```

---

## API Endpoints

### Website Visitor Tracking

```bash
curl -X POST https://api.retargeting.app/webhooks/visitor-event \
  -H "X-API-Key: sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "website_visitor",
    "email": "optional@visitor.com",
    "visitor_data": {
      "url": "https://signaturetransportation.com/services",
      "referrer": "google.com",
      "page_title": "Services"
    }
  }'

Response:
{
  "success": true,
  "visitor_type": "website_visitor",
  "campaign_delay_minutes": 0
}
```

### Quote Generator Tracking (via Quote Bot Webhook)

```bash
POST /webhooks/quotebot
(Quote Bot sends automatically)

Response:
{
  "success": true,
  "visitor_type": "quote_generator",
  "campaign_delay_minutes": 0.5
}
```

---

## Monitoring & Analytics

### Dashboard Metrics

Track separately for each audience:

| Metric | Website Visitors | Quote Generators |
|--------|---|---|
| **Audience Size** | 100-500/mo | 20-50/mo |
| **Campaign Delay** | Immediate | 30 min |
| **Email Open Rate Target** | 20-25% | 30-35% |
| **Click Rate Target** | 3-5% | 8-12% |
| **Conversion Target** | 2-5% (quote gen) | 10-20% (booking) |
| **Discount Offered** | None | 10% |

### Key Distinctions

**Website Visitors:**
- Larger volume, lower intent
- Goal: Get them to generate a quote
- Success metric: Quote generated (conversion to Tier 2)
- Repeat targeting allowed (1-2 follow-ups)

**Quote Generators:**
- Smaller volume, higher intent
- Goal: Complete the booking
- Success metric: Booking completed
- Urgency/scarcity in messaging (time-limited discount)

---

## Customer Communication

### What to Tell Signature Transportation

"We'll implement **two-level retargeting**:

**Level 1 - Website Awareness:**
- Capture everyone who visits your site
- Send them a friendly "Get a free quote" email immediately
- Goal: Turn browsers into quote-makers

**Level 2 - Quote Recovery:**
- Capture people who generate quotes but don't book
- Send them a completion email with 10% discount after 30 min
- Goal: Turn quote-makers into paying customers

This two-tier approach gives us the largest possible retargeting audience and multiple opportunities to convert."

---

## Implementation Checklist

- [x] Website pixel created and documented
- [x] Dual-event handling in webhook endpoint
- [x] Visitor type column added to schema
- [x] Different timing (0 min vs 30 min)
- [x] Job queue configured for both types
- [x] Documentation written
- [ ] Campaign generation templates separated (TODO)
- [ ] Email templates created for both types (TODO)
- [ ] Testing with both visitor types (TODO)
- [ ] Dashboard monitoring set up (TODO)
- [ ] Analytics reporting configured (TODO)

---

## Week 1-2 Testing Plan

**Week 1:**
- Add website pixel to their staging site
- Generate 5 test website visitors
- Verify immediate campaign generation
- Review "Get a quote" email copy
- Verify it's different from quote generator copy

**Week 2:**
- Deploy to production
- Monitor real website visitors
- Create test quotes in Quote Bot
- Verify 30-minute delay campaigns
- Compare open/click rates between tiers
- Adjust messaging based on performance

---

**Status:** ✅ Architecture ready, implementation complete, testing next

**Next:** Separate email templates for each visitor type and implement different copy variants in RetargetingAgent
