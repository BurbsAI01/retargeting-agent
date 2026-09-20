# Campaign Dispatch Engine

## Overview

The dispatch engine is responsible for sending approved retargeting campaigns across multiple channels (email, SMS, Facebook Ads, Google Ads, LinkedIn). It processes campaigns asynchronously using Bull job queue with built-in retry logic and comprehensive tracking.

## Architecture

```
Campaign Approval
    ↓
Bull Job Queue
    ↓
DispatchEngine (Orchestrator)
    ├── EmailDispatcher (Mailgun)
    ├── SmsDispatcher (Twilio)
    └── AdDispatcher
        ├── Facebook Conversions API
        ├── Google Ads Conversion Tracking
        └── LinkedIn Audience Manager
```

## Components

### DispatchEngine (src/services/DispatchEngine.js)

Main orchestrator that:
- Fetches approved campaign details
- Coordinates dispatch across selected channels
- Logs results to campaign_performance table
- Handles transaction management for consistency

**Key Methods:**
- `dispatchCampaign(campaignId)` - Execute dispatch across all channels
- `getDispatchStatus(campaignId)` - Query dispatch status and logs

### EmailDispatcher (src/services/EmailDispatcher.js)

Sends personalized email campaigns via Mailgun.

**Features:**
- Uses copy variants from campaign recommendation
- Embeds quote recovery link with discount
- Includes open/click tracking
- Responsive HTML template with personalization
- Graceful fallback for missing data

**Configuration:**
```env
MAILGUN_API_KEY=your_mailgun_key
FROM_EMAIL=noreply@retargeting.app
FROM_NAME=Retargeting Team
REPLY_TO_EMAIL=support@retargeting.app
APP_URL=https://app.example.com
```

### SmsDispatcher (src/services/SmsDispatcher.js)

Sends SMS messages via Twilio for time-sensitive offers.

**Features:**
- Concise message with discount percentage
- Quote recovery link (shortened for SMS)
- Personalized greeting
- Character-optimized messaging

**Configuration:**
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### AdDispatcher (src/services/AdDispatcher.js)

Integrates with ad platforms for retargeting campaigns.

**Facebook:**
- Sends event via Conversions API
- Adds user to custom audience segment
- Hashed PII for privacy
- Custom conversion value = discount percentage

**Google Ads:**
- Tracks conversion via Google Analytics
- Creates audience segments
- Integrates with Google Ads API (requires setup)

**LinkedIn:**
- Leverages LinkedIn Insight Tag
- Creates account-based audience segments
- B2B targeting with company information

**Configuration:**
```env
# Facebook
FACEBOOK_PIXEL_ID=your_pixel_id
FACEBOOK_ACCESS_TOKEN=your_access_token
FACEBOOK_AUDIENCE_ID=your_audience_id

# Google Ads
GOOGLE_CONVERSION_ID=your_conversion_id
GOOGLE_CONVERSION_LABEL=your_label
GOOGLE_TRACKING_ID=your_tracking_id
GOOGLE_ADS_API_KEY=your_api_key
GOOGLE_ADS_CUSTOMER_ID=your_customer_id

# LinkedIn
LINKEDIN_INSIGHT_TAG=your_insight_tag
LINKEDIN_ACCESS_TOKEN=your_access_token
```

## Campaign Dispatch Workflow

### 1. Campaign Approval
Operator approves campaign with:
- Selected channels
- Discount percentage
- Copy overrides
- Additional incentives
- Notes

### 2. Queue Dispatch Job
Campaign status changes to `approved` and waits for dispatch.

Two options:
```bash
# Manual dispatch
POST /dispatch/campaign/{campaignId}/send

# Bulk dispatch all ready_to_send campaigns
POST /dispatch/bulk-send
```

### 3. Job Processing
Bull queue processes dispatch job:
1. Fetch campaign with all related data
2. For each selected channel:
   - Prepare personalized content
   - Invoke channel dispatcher
   - Log success/failure
3. Update campaign status to `dispatched` or `dispatch_failed`
4. Record metrics in campaign_performance table

### 4. Channel-Specific Logic

**Email:**
- Build personalized HTML from copy variant
- Embed recovery link
- Send via Mailgun with tracking enabled
- Log message ID

**SMS:**
- Condense message to 160 characters
- Include short recovery link
- Send via Twilio
- Log message SID

**Facebook:**
- Hash email + name (PII protection)
- Send Lead event to Pixel
- Add to custom audience
- Log conversion value

**Google Ads:**
- Track conversion event
- Populate audience list
- Send to Google Analytics
- Log conversion ID

**LinkedIn:**
- Tag insight event
- Add to account-based audience
- Include company info
- Log LinkedIn tag

### 5. Performance Tracking

Results logged to `campaign_performance` table:

```sql
INSERT INTO campaign_performance 
  (campaign_id, channel, total_sent, calculated_at)
VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
ON CONFLICT (campaign_id, channel) DO UPDATE ...
```

## Retry Logic

Each dispatch job has:
- **Attempts:** 3 retries
- **Backoff:** Exponential (2s, 4s, 8s)
- **Logging:** Non-destructive (keep job logs)

Failed dispatch jobs remain in queue for inspection:

```bash
GET /dispatch/queue/stats
```

## API Endpoints

### Manual Dispatch
```bash
POST /dispatch/campaign/{campaignId}/send
Response: { success: true, campaignId, message }
```

### Dispatch Status
```bash
GET /dispatch/campaign/{campaignId}/status
Response: { 
  campaign_id, 
  status, 
  dispatch_log, 
  dispatched_at 
}
```

### Bulk Dispatch
```bash
POST /dispatch/bulk-send
Response: { 
  success: true, 
  campaigns_queued, 
  jobs: [{ campaignId, jobId }] 
}
```

### Queue Stats
```bash
GET /dispatch/queue/stats
Response: { 
  active, 
  delayed, 
  waiting, 
  completed, 
  failed, 
  paused 
}
```

## Personalization

Each dispatch uses:

1. **Copy Variants** from agent recommendation
   - Subject line
   - Preview text
   - Body copy
   - CTA text
   - Per-channel optimizations

2. **Visitor Data**
   - First name
   - Company name
   - Email/Phone

3. **Quote Context**
   - Original quote amount
   - Quote details (JSON)
   - Days since quote

4. **Incentives**
   - Discount percentage
   - Discount display text
   - Expiration date

5. **Recovery Link**
   - Unique token per campaign
   - 30-day expiration (configurable)
   - Tracks first visit and conversion

## Database Schema

### quote_recovery_links
```sql
- campaign_id (FK)
- quote_id (FK)
- visitor_id (FK)
- recovery_token (UNIQUE)
- recovery_url
- includes_discount (BOOLEAN)
- discount_percent (DECIMAL)
- first_visited_at (TIMESTAMP)
- converted_at (TIMESTAMP)
- expires_at (TIMESTAMP)
- created_at (TIMESTAMP)
```

### campaign_performance
```sql
- campaign_id (FK)
- channel (VARCHAR)
- total_sent (INTEGER)
- total_delivered (INTEGER)
- total_opened (INTEGER)
- total_clicked (INTEGER)
- total_converted (INTEGER)
- engagement_rate (DECIMAL)
- conversion_rate (DECIMAL)
- revenue_impact (DECIMAL)
- calculated_at (TIMESTAMP)
```

### retargeting_campaigns
```sql
- id (PRIMARY)
- visitor_id (FK)
- quote_id (FK)
- campaign_status (pending_approval|approved|dispatched|dispatch_failed)
- dispatch_log (JSONB) # Detailed dispatch results per channel
- dispatched_at (TIMESTAMP)
- operator_modifications (JSONB) # Approved modifications
```

## Error Handling

Each dispatcher handles errors gracefully:

1. **Missing Configuration:**
   - Return `{ success: false, error: 'Platform not configured' }`
   - Continue with other channels

2. **Network/API Errors:**
   - Log error details
   - Queue for retry (Bull handles exponential backoff)
   - Mark individual channel as failed

3. **Data Validation:**
   - Email without email address → skip channel
   - Phone without SMS configured → skip channel
   - Facebook pixel not configured → skip Facebook

4. **Transaction Safety:**
   - Use database transactions
   - Rollback on critical errors
   - Keep detailed dispatch logs

## Performance Considerations

### Batch Processing
- Dispatch up to 100 campaigns per `/bulk-send` request
- Bull processes jobs in parallel (configurable concurrency)
- Per-channel jobs handle retries independently

### Tracking
- Mailgun: Real-time webhooks for delivery/open/click events
- Twilio: Delivery status callbacks
- Ad platforms: Native conversion tracking (async)

### Database
- `campaign_performance` indexed on (campaign_id, channel)
- `quote_recovery_links` indexed on recovery_token
- Batch inserts for multiple campaigns

## Monitoring

### Queue Health
```bash
curl http://localhost:3000/dispatch/queue/stats
```

### Campaign Status
```bash
curl http://localhost:3000/dispatch/campaign/{campaignId}/status
```

### Logs
```bash
# Watch dispatch logs
tail -f logs/dispatch.log

# Check database dispatch_log
SELECT dispatch_log FROM retargeting_campaigns WHERE id = $1;
```

## Future Enhancements

1. **Webhook Handlers** for delivery/open/click events
2. **A/B Testing** with automatic winner tracking
3. **Dynamic Scheduling** based on recipient timezone
4. **Fraud Detection** for suspicious conversions
5. **CRM Integration** (Salesforce, HubSpot)
6. **Template Management** UI for copy variants
7. **Real-time Dashboards** for dispatch metrics
8. **Message Queuing** for high-volume campaigns
