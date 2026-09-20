# Quick Webhook Setup Guide

## Mailgun Email Tracking

### Step 1: Get Your Signing Key
1. Log in to Mailgun
2. Go to **Domain Settings** → **Security**
3. Copy **Signing Key**

### Step 2: Configure Environment
```env
MAILGUN_SIGNING_KEY=key-xxxxxxxxxxxxxxxx
FROM_EMAIL=retarget@yourdomain.com
```

### Step 3: Setup Webhook in Mailgun
1. Go to **Webhooks** → **Add Webhook**
2. Select your domain
3. Webhook URL: `https://your-app.com/webhooks/mailgun`
4. Events:
   - ✓ Delivered
   - ✓ Opened
   - ✓ Clicked
   - ✓ Failed
   - ✓ Unsubscribed
   - ✓ Complained
5. Save

### Step 4: Test
```bash
# Check logs for webhook receipt
tail -f /var/log/retargeting-agent.log | grep "Mailgun"
```

---

## Twilio SMS Tracking

### Step 1: Get Your Credentials
1. Log in to Twilio
2. Go to **Account Info** → Copy **Account SID** and **Auth Token**
3. Go to **Phone Numbers** → **Manage Numbers** → Your Number
4. Copy the phone number

### Step 2: Configure Environment
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
APP_URL=https://your-app.com
```

### Step 3: Setup Status Callback
1. Go to **Messaging** → **Services**
2. Select your service
3. **Sender Pools** → Your phone number
4. Set **Status Callback URL**: `https://your-app.com/webhooks/twilio`
5. Method: **POST**
6. Save

### Step 4: Test
```bash
# Send test SMS through your app
# Check Twilio console for delivery status
```

---

## Facebook Conversions API

### Step 1: Get Your Credentials
1. Go to **Meta Business Suite**
2. **Apps** → **Settings** → **Basic**
3. Copy **App ID** and **App Secret**
4. Go to **Pixels** → Select your pixel
5. Copy **Pixel ID**

### Step 2: Configure Environment
```env
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_VERIFY_TOKEN=your_random_verify_token
FACEBOOK_PIXEL_ID=your_pixel_id
FACEBOOK_ACCESS_TOKEN=your_access_token
FACEBOOK_AUDIENCE_ID=your_audience_id
```

### Step 3: Setup Webhook
1. Go to **Apps** → **Settings** → **Webhooks**
2. Add Webhook
3. Callback URL: `https://your-app.com/webhooks/facebook`
4. Verify Token: Use same token as `FACEBOOK_VERIFY_TOKEN`
5. Subscribe to objects:
   - ✓ pixel
6. Subscribe to fields:
   - ✓ offsite_conversion.fb_pixel_view_content
   - ✓ offsite_conversion.fb_pixel_track_custom
   - ✓ offsite_conversion.fb_pixel_purchase
7. Save

### Step 4: Verify Webhook
Facebook will send a GET request with challenge. Your app responds with challenge parameter.

Test verification:
```bash
curl "http://localhost:3000/webhooks/facebook?hub.mode=subscribe&hub.verify_token=your_verify_token&hub.challenge=test_challenge"
```

### Step 5: Test
```bash
# Check Facebook Events Manager
# Go to: Ads Manager → Events Manager
# You should see recent conversion events
```

---

## Google Ads Conversion Tracking

### Step 1: Get Your Conversion IDs
1. Log in to **Google Ads**
2. Go to **Tools** → **Conversions**
3. Create or select conversion action
4. Copy **Conversion ID** and **Conversion Label**

### Step 2: Configure Environment
```env
GOOGLE_CONVERSION_ID=AW-123456789
GOOGLE_CONVERSION_LABEL=conversion_label_abc
```

### Step 3: Send Conversions
Your dispatch engine automatically sends conversions via our webhook:
- Campaign sends with order_id: `campaign_123`
- Webhook receives conversion
- Endpoint: `POST /webhooks/google`

### Step 4: Test
```bash
# Send test conversion
curl -X POST http://localhost:3000/webhooks/google \
  -H "Content-Type: application/json" \
  -d '{
    "conversion_id": "AW-123456789",
    "conversion_label": "conversion_label_abc",
    "value": 100.00,
    "currency": "USD",
    "order_id": "campaign_123"
  }'
```

Check in Google Ads:
- Go to **Conversions** → **Conversion Actions**
- View conversion details and attribution

---

## LinkedIn Conversions

### Step 1: Get Your Credentials
1. Go to **LinkedIn Campaign Manager**
2. **Conversions** → **Conversion Tracking**
3. Copy **Insight Tag** ID
4. Create **Access Token** in LinkedIn Developer Console

### Step 2: Configure Environment
```env
LINKEDIN_INSIGHT_TAG=your_insight_tag
LINKEDIN_ACCESS_TOKEN=your_access_token
```

### Step 3: Send Conversions
Conversions sent via:
- Endpoint: `POST /webhooks/linkedin`
- Requires: `campaign_id`, `email`, `company`

### Step 4: Test
```bash
# Send test conversion
curl -X POST http://localhost:3000/webhooks/linkedin \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": 123,
    "conversion_id": "conv_456",
    "email": "user@example.com",
    "company": "Company Name",
    "value": 100.00,
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

Check in LinkedIn:
- Go to **Campaign Manager** → **Analyze**
- View conversion metrics

---

## Environment Variables Checklist

```env
# Server
APP_URL=https://your-app.com

# Mailgun
MAILGUN_API_KEY=key-xxxx
MAILGUN_SIGNING_KEY=key-xxxx
FROM_EMAIL=noreply@yourdomain.com

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Facebook
FACEBOOK_APP_SECRET=xxxxx
FACEBOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_PIXEL_ID=123456789
FACEBOOK_ACCESS_TOKEN=xxxxx
FACEBOOK_AUDIENCE_ID=xxxxx

# Google Ads
GOOGLE_CONVERSION_ID=AW-123456789
GOOGLE_CONVERSION_LABEL=conversion_label_abc

# LinkedIn
LINKEDIN_INSIGHT_TAG=123456789
LINKEDIN_ACCESS_TOKEN=xxxxx
```

---

## Testing Webhooks

### Local Testing with Webhook Tools

Use [webhook.site](https://webhook.site) or similar:
1. Create temporary webhook URL
2. Configure platform to send to that URL
3. Verify payload format
4. Test your parser with that format

### Staging Testing

1. Deploy to staging server
2. Configure all platforms with staging URLs
3. Send test campaign
4. Monitor webhook receipts
5. Verify metrics updates

### Production Deployment

1. Configure all platforms with production URLs
2. Test each webhook endpoint with real data
3. Monitor webhook logs
4. Check metrics dashboard
5. Set up alerting for webhook failures

---

## Troubleshooting Checklist

- [ ] Environment variables all configured
- [ ] App URL is publicly accessible
- [ ] Each platform webhook URL is correct
- [ ] Signature verification keys are correct
- [ ] Firewall allows inbound connections
- [ ] Database can be accessed from webhook handler
- [ ] Logging shows webhook receipt
- [ ] campaign_performance table exists
- [ ] engagement_log table exists
- [ ] Application is running on correct port

---

## Webhook Testing Commands

### Test Mailgun
```bash
curl -X POST http://localhost:3000/webhooks/mailgun \
  -H "Content-Type: application/json" \
  -d '{
    "signature": {"timestamp": "'$(date +%s)'", "token": "test", "signature": "test"},
    "body": {"event-type": "delivered", "message": "test@example.com", "recipient": "user@example.com"}
  }'
```

### Test Twilio
```bash
curl -X POST http://localhost:3000/webhooks/twilio \
  -d "MessageSid=SMtest&To=%2B1234567890&From=%2B0987654321&MessageStatus=delivered"
```

### Test Facebook
```bash
curl -X POST http://localhost:3000/webhooks/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "pixel_123",
      "data": [{
        "event_name": "Purchase",
        "event_id": "evt_123",
        "event_time": '$(date +%s)',
        "user_data": {"em": "test", "fn": "test"},
        "custom_data": {"value": 100, "currency": "USD"}
      }]
    }]
  }'
```

### Test Google
```bash
curl -X POST http://localhost:3000/webhooks/google \
  -H "Content-Type: application/json" \
  -d '{
    "conversion_id": "AW-123",
    "conversion_label": "test",
    "value": 100,
    "currency": "USD",
    "order_id": "campaign_123"
  }'
```

### Test LinkedIn
```bash
curl -X POST http://localhost:3000/webhooks/linkedin \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": 123,
    "conversion_id": "conv_123",
    "email": "test@example.com",
    "company": "Test Co",
    "value": 100
  }'
```

---

## Next Steps

1. Complete all webhook configuration above
2. Deploy to staging and test
3. Monitor webhook logs in production
4. Set up alerting for webhook failures
5. Create dashboard to visualize metrics
6. Schedule regular review of webhook performance

See `WEBHOOKS.md` for detailed documentation.
