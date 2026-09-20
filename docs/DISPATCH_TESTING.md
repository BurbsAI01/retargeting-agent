# Dispatch Engine Testing Guide

## Prerequisites

1. Running retargeting agent server: `npm start`
2. Database with test data (visitors, quotes, campaigns)
3. Environment variables configured (see `.env.example`)

## Test Scenarios

### 1. Manual Campaign Creation & Dispatch

```bash
# 1. Create a test visitor and quote via webhook
curl -X POST http://localhost:3000/webhooks/visitor-event \
  -H "Content-Type: application/json" \
  -d '{
    "visitorId": "test-visitor-123",
    "email": "test@example.com",
    "phone": "+1234567890",
    "company": "Test Company",
    "event_type": "quote_generated",
    "quote_data": {
      "total": 5000,
      "amount": 5000,
      "quote_url": "https://app.example.com/quotes/123",
      "converted": false
    }
  }'

# Response: { success: true, visitorId, quoteId }
```

### 2. Monitor Campaign Generation

```bash
# Wait ~2 hours for campaign to be generated (or reduce delay in code)
# Then check pending campaigns
curl http://localhost:3000/campaigns/pending-approval \
  -H "Accept: application/json"

# Response: [{ id, visitor_id, quote_id, campaign_status, agent_recommendation, ... }]
```

### 3. Approve Campaign

```bash
# Get campaign ID from previous step
CAMPAIGN_ID="123"

curl -X POST http://localhost:3000/campaigns/${CAMPAIGN_ID}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "operator_email": "operator@example.com",
    "discount_percent": 15,
    "channels": ["email", "sms", "facebook"],
    "copy_overrides": {
      "subject": "Custom Subject",
      "body": "Custom message"
    },
    "incentive": "discount_percent",
    "notes": "Test approval"
  }'

# Response: { success: true, campaign, message }
```

### 4. Trigger Dispatch

#### Option A: Manual Single Campaign Dispatch
```bash
curl -X POST http://localhost:3000/dispatch/campaign/${CAMPAIGN_ID}/send \
  -H "Content-Type: application/json"

# Response: { success: true, campaignId, message }
```

#### Option B: Bulk Dispatch All Ready Campaigns
```bash
curl -X POST http://localhost:3000/dispatch/bulk-send \
  -H "Content-Type: application/json"

# Response: { success: true, campaigns_queued, jobs: [...] }
```

### 5. Monitor Dispatch Status

```bash
# Check individual campaign dispatch status
curl http://localhost:3000/dispatch/campaign/${CAMPAIGN_ID}/status

# Response: {
#   campaign_id,
#   status: "dispatched" | "dispatch_failed",
#   dispatch_log: {
#     campaign_id,
#     channels_attempted: ["email", "sms", "facebook"],
#     dispatch_results: {
#       email: { success: true, message_id, recipient, subject },
#       sms: { success: true, message_id, recipient },
#       facebook: { success: true, event_id, user_email, discount }
#     },
#     total_attempts: 3,
#     total_succeeded: 3,
#     dispatched_at: "2024-01-15T10:30:00Z"
#   },
#   dispatched_at
# }
```

### 6. Queue Statistics

```bash
curl http://localhost:3000/dispatch/queue/stats

# Response: {
#   active: 2,
#   delayed: 5,
#   waiting: 10,
#   completed: 45,
#   failed: 2,
#   paused: 0
# }
```

### 7. Check Campaign Performance Metrics

```bash
curl http://localhost:3000/campaigns/${CAMPAIGN_ID}/performance

# Response: [{
#   campaign_id,
#   channel: "email",
#   total_sent: 1,
#   total_delivered: 1,
#   total_opened: 0,
#   total_clicked: 0,
#   total_converted: 0,
#   engagement_rate: 0,
#   conversion_rate: 0,
#   revenue_impact: 0,
#   calculated_at
# }, ...]
```

## Platform-Specific Testing

### Email (Mailgun)

**Without Mailgun configured:**
- Dispatch will skip email channel
- Check dispatch_log for: `{ email: { success: false, error: 'Platform not configured' } }`

**With Mailgun configured:**
```bash
# Verify environment variables
echo $MAILGUN_API_KEY

# Check Mailgun dashboard for delivered emails
# Mailgun admin: https://app.mailgun.com/app/sending/domain/logs
```

**Expected email:**
- From: `Retargeting Team <noreply@retargeting.app>`
- Subject: Copy variant subject
- Body: Personalized HTML with discount and recovery link
- Tracking: Open/click tracking enabled

### SMS (Twilio)

**Without Twilio configured:**
- Dispatch will skip SMS channel
- Check dispatch_log for: `{ sms: { success: false, error: 'Twilio not configured' } }`

**With Twilio configured:**
```bash
# Verify credentials
echo $TWILIO_ACCOUNT_SID
echo $TWILIO_PHONE_NUMBER

# Check Twilio console for sent messages
# Twilio: https://console.twilio.com/
```

**Expected SMS:**
- From: TWILIO_PHONE_NUMBER
- To: Visitor phone number
- Body: ~160 chars with discount % and recovery link

### Facebook (Conversions API)

**Without Facebook configured:**
- Dispatch will skip Facebook channel
- Check dispatch_log for: `{ facebook: { success: false, error: 'Facebook not configured' } }`

**With Facebook configured:**
```bash
# Verify pixel ID and access token
echo $FACEBOOK_PIXEL_ID
echo $FACEBOOK_ACCESS_TOKEN

# Check Facebook Ads Manager
# 1. Go to Events Manager
# 2. Select your pixel
# 3. View recent events
# 4. Should see "Lead" event with discount as value
```

**Expected event:**
- Event: "Lead"
- Value: discount_percent
- Email: hashed
- Name: hashed (if provided)
- Content: Original quote ID

### Google Ads

**Configuration needed:**
- GOOGLE_CONVERSION_ID
- GOOGLE_CONVERSION_LABEL
- GOOGLE_TRACKING_ID

**Verify:**
```bash
# Check Google Analytics for conversions
# 1. Go to Admin → Conversions
# 2. Look for "retargeting" conversion
# 3. Should see events from campaign
```

### LinkedIn

**Configuration needed:**
- LINKEDIN_INSIGHT_TAG
- LINKEDIN_ACCESS_TOKEN

**Verify:**
```bash
# Check LinkedIn Campaign Manager
# 1. Go to Audience Manager
# 2. Look for audience segment from dispatch
# 3. Should contain visitor email
```

## Troubleshooting

### Campaign Not Generated

**Problem:** Campaign stays in pending_approval queue longer than expected

**Solutions:**
1. Check Bull queue is processing: `GET /dispatch/queue/stats`
2. Verify default delay: `2 * 60 * 60 * 1000` milliseconds (2 hours)
3. Reduce delay in `src/index.js` for testing
4. Check Redis connection: `redis-cli PING`
5. Check database for errors: `SELECT * FROM retargeting_campaigns WHERE id = $1`

### Dispatch Fails on All Channels

**Problem:** All channels return `success: false`

**Solutions:**
1. Verify campaign exists: `GET /campaigns/{id}`
2. Verify campaign status is "approved"
3. Check database transaction: `SELECT dispatch_log FROM retargeting_campaigns WHERE id = $1`
4. Verify campaign has recovery link: `SELECT * FROM quote_recovery_links WHERE campaign_id = $1`
5. Check server logs for stack trace

### Email Not Sent

**Problem:** Email channel returns success but no email received

**Solutions:**
1. Verify email is valid: `SELECT email FROM visitors WHERE id = $1`
2. Check Mailgun dashboard for bounces/failures
3. Verify MAILGUN_API_KEY is correct
4. Verify FROM_EMAIL is authorized in Mailgun
5. Check spam folder / email filters

### SMS Not Sent

**Problem:** SMS channel returns success but no SMS received

**Solutions:**
1. Verify phone number format: Should be E.164 format (+1234567890)
2. Check Twilio console for delivery failures
3. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
4. Verify TWILIO_PHONE_NUMBER is active and has SMS capability
5. Check country restrictions in Twilio settings

### Campaign Status Stuck on "Dispatched" but No Results

**Problem:** Dispatch shows complete but no tracking data

**Solutions:**
1. Check campaign_performance table: `SELECT * FROM campaign_performance WHERE campaign_id = $1`
2. Verify webhooks are configured for tracking events
3. Check that tracking endpoints are receiving data: `GET /tracking/visitor/{id}/behavior`
4. Wait for async webhooks (Mailgun, Twilio) to arrive
5. Check database indexes on campaign_performance

## Performance Testing

### Bulk Dispatch Load Test

```bash
# Queue 100 campaigns for dispatch
for i in {1..10}; do
  curl -X POST http://localhost:3000/dispatch/bulk-send
done

# Monitor queue
watch -n 1 'curl -s http://localhost:3000/dispatch/queue/stats | jq .'

# Expected:
# - active: 3-5 (depends on concurrency)
# - waiting: 90-100
# - gradually decreases as jobs complete
```

### Database Performance

```bash
# Check slow queries
SELECT 
  mean_exec_time, 
  calls, 
  query 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

# Check indexes
SELECT * FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
ORDER BY idx_scan DESC;
```

## Manual Testing Checklist

- [ ] Campaign generation triggers on quote_generated webhook
- [ ] Campaign appears in pending-approval queue
- [ ] Can fetch single campaign details
- [ ] Can approve campaign with modifications
- [ ] Approval creates recovery link
- [ ] Approval creates incentive record
- [ ] Dispatch queue accepts campaign
- [ ] Email sent with correct recipient and content
- [ ] SMS sent with correct number and message
- [ ] Facebook event tracked with conversion value
- [ ] Campaign status changes to "dispatched"
- [ ] Campaign performance metrics recorded
- [ ] Dispatch status shows per-channel results
- [ ] Recovery link tracking works
- [ ] Conversion tracking works
- [ ] Queue stats show completed jobs
- [ ] Failed channels don't block other channels
- [ ] Retry logic works for failed jobs
