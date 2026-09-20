# Webhook Handlers Documentation

## Overview

The webhook system enables real-time tracking of campaign performance across all channels. Webhooks update metrics, log engagement events, and provide attribution for conversions.

## Architecture

```
Email Service (Mailgun)
    ↓
POST /webhooks/mailgun
    ↓
MailgunWebhookHandler
    ↓
Update campaign_performance + Log engagement_log

SMS Service (Twilio)
    ↓
POST /webhooks/twilio
    ↓
TwilioWebhookHandler
    ↓
Update campaign_performance + Log engagement_log

Ad Platforms (Facebook/Google/LinkedIn)
    ↓
POST /webhooks/{platform}
    ↓
FacebookWebhookHandler / ConversionWebhookHandler
    ↓
Update campaign_performance + Log engagement_log
```

## Webhook Endpoints

### Email Webhooks (Mailgun)

**Endpoint:** `POST /webhooks/mailgun`

**Configuration in Mailgun:**
1. Go to Mailgun Dashboard → Sending → Webhooks
2. Add webhook URL: `https://your-app.com/webhooks/mailgun`
3. Select events: Delivered, Opened, Clicked, Failed, Unsubscribed, Complained

**Environment Variables:**
```env
MAILGUN_SIGNING_KEY=your_mailgun_signing_key
```

**Events Tracked:**

| Event | Impact | Metrics Updated |
|-------|--------|-----------------|
| `delivered` | Email reached inbox | `total_delivered + 1` |
| `opened` | Email opened | `total_opened + 1`, `engagement_rate` |
| `clicked` | Email link clicked | `total_clicked + 1`, `engagement_rate` |
| `failed` | Delivery failed | Logged in engagement_log |
| `unsubscribed` | Recipient unsubscribed | `visitors.unsubscribed_from_email = true` |
| `complained` | Spam complaint | Logged as high severity |

**Mailgun Webhook Format:**
```json
{
  "signature": {
    "timestamp": "1234567890",
    "token": "abc123",
    "signature": "def456"
  },
  "body": {
    "event-type": "delivered",
    "message": "message-id@mg.example.com",
    "recipient": "recipient@example.com",
    "timestamp": 1234567890
  }
}
```

### SMS Webhooks (Twilio)

**Endpoint:** `POST /webhooks/twilio`

**Configuration in Twilio:**
1. Go to Twilio Console → Messaging → Services
2. Select your Messaging Service
3. Set Status Callback URL: `https://your-app.com/webhooks/twilio`
4. Webhook Type: POST

**Environment Variables:**
```env
TWILIO_AUTH_TOKEN=your_twilio_auth_token
APP_URL=https://your-app.com
```

**Events Tracked:**

| Status | Impact | Metrics Updated |
|--------|--------|-----------------|
| `delivered` | SMS successfully delivered | `total_delivered + 1` |
| `sent` | SMS sent (interim status) | Logged for tracking |
| `failed` | Delivery failed | Logged in engagement_log |
| `undelivered` | Could not be delivered | Logged with error details |

**Twilio Webhook Format:**
```json
{
  "MessageSid": "SMabcd1234...",
  "To": "+1234567890",
  "From": "+0987654321",
  "MessageStatus": "delivered",
  "ErrorCode": null,
  "ErrorMessage": null
}
```

### Facebook Webhooks (Conversions API)

**Endpoint:** `POST /webhooks/facebook`

**Webhook Verification:** `GET /webhooks/facebook`

**Configuration in Facebook:**
1. Go to Meta Business Suite → Apps → Settings
2. Add platform: Website
3. Set Webhook URL: `https://your-app.com/webhooks/facebook`
4. Subscribe to events: Pixel View Content, Pixel Track Conversion

**Environment Variables:**
```env
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_PIXEL_ID=your_pixel_id
```

**Events Tracked:**

| Event | Impact | Metrics Updated |
|-------|--------|-----------------|
| `Lead` | Lead generated | Logged as `facebook_lead` |
| `Purchase` | Purchase completed | `total_converted + 1`, `revenue_impact` |
| `ViewContent` | Product/quote viewed | Logged as engagement |
| `AddToCart` | Item added to cart | `total_clicked + 1` |

**Facebook Webhook Format:**
```json
{
  "object": "page",
  "entry": [
    {
      "id": "pixel_id",
      "data": [
        {
          "event_name": "Purchase",
          "event_id": "event_123",
          "event_time": 1234567890,
          "user_data": {
            "em": "hashed_email",
            "fn": "hashed_first_name"
          },
          "custom_data": {
            "value": 100.00,
            "currency": "USD",
            "content_name": "Quote Recovery",
            "contents": [
              {
                "id": "quote_123",
                "quantity": 1
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### Google Ads Webhooks

**Endpoint:** `POST /webhooks/google`

**Environment Variables:**
```env
GOOGLE_CONVERSION_ID=your_conversion_id
GOOGLE_CONVERSION_LABEL=your_conversion_label
```

**Expected Payload:**
```json
{
  "conversion_id": "AW-xxx",
  "conversion_label": "retargeting",
  "value": 100.00,
  "currency": "USD",
  "order_id": "campaign_123",
  "user_id": "user@example.com"
}
```

**Campaign Attribution:**
- Extracts campaign ID from `order_id` format: `campaign_123`
- Updates `campaign_performance` for channel `google_ads`
- Logs conversion with value and timestamp

### LinkedIn Webhooks

**Endpoint:** `POST /webhooks/linkedin`

**Environment Variables:**
```env
LINKEDIN_ACCESS_TOKEN=your_access_token
```

**Expected Payload:**
```json
{
  "campaign_id": 123,
  "conversion_id": "conv_456",
  "email": "user@example.com",
  "company": "Company Name",
  "value": 100.00,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Campaign Attribution:**
- Uses `campaign_id` directly
- Includes company name for account-based attribution
- Updates `campaign_performance` for channel `linkedin`

### Generic Conversion Webhook

**Endpoint:** `POST /webhooks/conversion/{platform}`

For custom platforms not covered above.

**Expected Payload:**
```json
{
  "campaign_id": 123,
  "visitor_id": 456,
  "event_type": "conversion",
  "value": 100.00,
  "metadata": {
    "source": "custom_platform",
    "tracking_id": "track_123"
  }
}
```

## Signature Verification

All webhooks include signature verification for security.

### Mailgun Verification
```javascript
// Mailgun sends: timestamp, token, signature
const data = `${timestamp}${token}`;
const hash = crypto
  .createHmac('sha256', MAILGUN_SIGNING_KEY)
  .update(data)
  .digest('hex');

verify: hash === signature;
```

### Twilio Verification
```javascript
// Twilio uses HMAC-SHA1
const data = url + Object.keys(params)
  .sort()
  .map(key => key + params[key])
  .join('');

const hash = crypto
  .createHmac('sha1', TWILIO_AUTH_TOKEN)
  .update(data)
  .digest('base64');

verify: `sha1=${hash}` === signature;
```

### Facebook Verification
```javascript
// Facebook uses HMAC-SHA256
const body = JSON.stringify(requestBody);
const hash = crypto
  .createHmac('sha256', FACEBOOK_APP_SECRET)
  .update(body)
  .digest('hex');

verify: `sha256=${hash}` === signature;
```

## Database Updates

### campaign_performance Table
```sql
UPDATE campaign_performance
SET 
  total_delivered = total_delivered + 1,
  total_opened = total_opened + 1,
  total_clicked = total_clicked + 1,
  total_converted = total_converted + 1,
  revenue_impact = revenue_impact + CAST(value AS DECIMAL),
  engagement_rate = ROUND((total_clicked::decimal / NULLIF(total_sent, 0)) * 100, 2),
  conversion_rate = ROUND((total_converted::decimal / NULLIF(total_sent, 0)) * 100, 2),
  calculated_at = CURRENT_TIMESTAMP
WHERE campaign_id = $1 AND channel = $2;
```

### engagement_log Table
```sql
INSERT INTO engagement_log (
  visitor_id,
  campaign_id,
  channel,
  action,
  metadata
) VALUES (
  $1,
  $2,
  $3,
  $4,
  $5::jsonb
);
```

### visitors Table Updates
```sql
-- Unsubscribe
UPDATE visitors
SET 
  unsubscribed_from_email = true,
  unsubscribed_at = CURRENT_TIMESTAMP
WHERE email = $1;
```

## Campaign Attribution Logic

### Email (Mailgun)
- Uses recovery link or campaign email recipient
- Matches via engagement_log entry from dispatch
- Falls back to recent campaign if exact match unavailable

### SMS (Twilio)
- Matches phone number to visitor
- Finds latest campaign for that visitor
- Logs event with visitor-campaign linkage

### Facebook
- Uses recent dispatched campaigns for attribution
- Email hash provides some reverse-lookup capability
- Falls back to most recent campaign

### Google Ads
- Extracts campaign ID from `order_id` format
- Direct attribution: `campaign_<id>`
- Most reliable method due to explicit ID in payload

### LinkedIn
- Direct campaign_id in payload
- Account-based targeting via company name
- Highest attribution accuracy

## Real-time Performance Tracking

Metrics update in real-time as webhooks arrive:

```
Campaign Dispatched
    ↓
total_sent = 1 (from dispatch_log)
    ↓
Email Delivered Webhook
    ↓
total_delivered = 1, engagement_rate = 100%
    ↓
Email Opened Webhook
    ↓
total_opened = 1, engagement_rate = 100%
    ↓
Email Clicked Webhook (Recovery Link)
    ↓
total_clicked = 1, engagement_rate = 100%
    ↓
Conversion Webhook
    ↓
total_converted = 1, conversion_rate = 100%, revenue_impact = $X
```

## Error Handling

### Webhook Processing
- Invalid format → 400 Bad Request
- Signature verification failure → 403 Forbidden (or warning in dev)
- Campaign not found → Logged but continues (non-blocking)
- Database error → 500 Internal Server Error

### Graceful Degradation
- Failed signature verification logs warning but continues
- Missing campaign attribution logs but doesn't fail
- Partial updates don't rollback other changes
- Each platform independent (Facebook failure doesn't affect SMS)

## Testing Webhooks

### Test Mailgun Webhook
```bash
curl -X POST http://localhost:3000/webhooks/mailgun \
  -H "Content-Type: application/json" \
  -d '{
    "signature": {
      "timestamp": "'$(date +%s)'",
      "token": "test-token-123",
      "signature": "test-signature"
    },
    "body": {
      "event-type": "delivered",
      "message": "test-message@example.com",
      "recipient": "user@example.com",
      "timestamp": '$(date +%s)'
    }
  }'
```

### Test Twilio Webhook
```bash
curl -X POST http://localhost:3000/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'MessageSid=SMabcd1234&To=%2B1234567890&From=%2B0987654321&MessageStatus=delivered'
```

### Test Facebook Webhook
```bash
curl -X POST http://localhost:3000/webhooks/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "pixel_123",
      "data": [{
        "event_name": "Purchase",
        "event_id": "evt_456",
        "event_time": '$(date +%s)',
        "user_data": {
          "em": "hashed_email_here",
          "fn": "hashed_name_here"
        },
        "custom_data": {
          "value": 100.00,
          "currency": "USD"
        }
      }]
    }]
  }'
```

### Test Google Ads Webhook
```bash
curl -X POST http://localhost:3000/webhooks/google \
  -H "Content-Type: application/json" \
  -d '{
    "conversion_id": "AW-123",
    "conversion_label": "test",
    "value": 100.00,
    "currency": "USD",
    "order_id": "campaign_123"
  }'
```

## Monitoring Webhooks

### Check Webhook Logs
```bash
# In application logs, look for:
tail -f logs/app.log | grep "webhook"
```

### Verify Campaign Performance Updated
```bash
# Query campaign_performance table
SELECT 
  campaign_id,
  channel,
  total_sent,
  total_delivered,
  total_opened,
  total_clicked,
  total_converted,
  engagement_rate,
  conversion_rate,
  revenue_impact
FROM campaign_performance
WHERE campaign_id = $1
ORDER BY channel;
```

### Check Engagement Log
```bash
# View all engagement events for a campaign
SELECT 
  channel,
  action,
  metadata,
  created_at
FROM engagement_log
WHERE campaign_id = $1
ORDER BY created_at DESC;
```

## Troubleshooting

### Webhooks Not Being Received

**Issue:** Webhooks configured but not arriving

**Solutions:**
1. Verify endpoint is publicly accessible
2. Check firewall rules allow inbound POST
3. Verify platform webhook configuration points to correct URL
4. Check application logs for errors
5. Test endpoint with curl or webhook testing tool

### Metrics Not Updating

**Issue:** Webhooks arrive but metrics unchanged

**Solutions:**
1. Verify signature verification passes (check logs)
2. Verify campaign exists in database
3. Check campaign_performance table has campaign entry
4. Verify channel name matches in webhook handler
5. Check database transaction didn't rollback

### Campaign Attribution Missing

**Issue:** Webhook processed but no campaign attribution

**Solutions:**
1. Verify campaign has correct visitor/phone/email
2. Check if campaign in DISPATCHED status
3. Verify attribution logic for your channel:
   - Email: via recovery link or engagement_log
   - SMS: via phone number match
   - Google: via campaign_id in order_id
   - LinkedIn: via campaign_id in payload
4. Add more specific logging in webhook handler

### False Duplicate Events

**Issue:** Same event counted multiple times

**Solutions:**
1. Check for duplicate webhook sends from platform
2. Implement event deduplication using event_id
3. Use database constraints to prevent duplicates
4. Add idempotency keys for webhook processing

## Future Enhancements

1. **Webhook Retry Logic** - Auto-retry failed webhooks
2. **Event Deduplication** - Prevent duplicate counting
3. **Real-time Dashboards** - WebSocket updates on metrics
4. **Webhook History** - Store all webhook payloads for debugging
5. **Attribution Models** - Support multi-touch attribution
6. **Anomaly Detection** - Alert on unusual metrics
7. **Webhook Management UI** - Configure webhooks via dashboard
8. **Event Filtering** - Subscribe only to relevant events
