# Quote Bot Integration Guide

**Status:** ✅ Ready for Implementation  
**Customer:** Signature Transportation  
**Integration Type:** Webhook-based (Real-time quote capture)

## Overview

Signature Transportation uses **The Quote Bot** (thequotebot.com) for their quoting system. Instead of adding a pixel to their website, we'll receive quote events directly via Quote Bot's webhook API.

### Benefits of this approach:
- ✅ Real-time quote capture (no delays)
- ✅ Automatic customer data extraction
- ✅ No pixel code needed on their website
- ✅ Access to Quote Bot's full quote data
- ✅ Automatic sync capability for backfilling

---

## Setup Steps

### Step 1: Get Quote Bot API Key

The API key for their Quote Bot account is available. Store it securely:

```
QUOTE_BOT_API_KEY=<their_api_key>
```

Add to `.env`:
```
QUOTE_BOT_API_KEY=their_actual_api_key_here
```

### Step 2: Configure Quote Bot Webhook

In Quote Bot settings, add a webhook that fires when quotes are generated:

**Webhook URL:**
```
https://your-domain.com/webhooks/quotebot
```

**Webhook Events to Enable:**
- ✅ Quote Created
- ✅ Quote Updated
- ✅ Quote Abandoned

**Request Method:** POST

### Step 3: Test the Connection

Verify the Quote Bot API connection is working:

```bash
curl -X GET http://localhost:3000/health/quotebot
```

Expected Response (Success):
```json
{
  "status": "ok",
  "quotebot": "connected",
  "timestamp": "2024-09-25T14:30:00.000Z"
}
```

Expected Response (Failure):
```json
{
  "status": "error",
  "quotebot": "disconnected",
  "error": "Invalid API key"
}
```

### Step 4: Backfill Historical Quotes (Optional)

If they have existing unconverted quotes in Quote Bot, sync them:

```bash
curl -X POST http://localhost:3000/admin/sync/quotebot \
  -H "X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production" \
  -H "Content-Type: application/json" \
  -d '{
    "hoursBack": 168
  }'
```

This will pull all quotes from the last 7 days (168 hours).

---

## How It Works

### Quote Bot Webhook Flow

```
┌──────────────────────┐
│  Signature           │
│  Transportation      │
│  Quote Bot Account   │
└──────────┬───────────┘
           │
           │ Customer generates quote
           │ Quote Bot webhook triggered
           ▼
┌──────────────────────────────────────────┐
│ POST /webhooks/quotebot                  │
│ {                                        │
│   "id": "QB-123456",                    │
│   "email": "customer@company.com",       │
│   "name": "John Customer",               │
│   "phone": "+1 615 555 0000",            │
│   "estimate_total": "2500.00",           │
│   "status": "pending",                   │
│   "created_at": "2024-09-25T...",        │
│   "converted": false                     │
│ }                                        │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ QuoteBotWebhookHandler           │
│ - Parse Quote Bot event          │
│ - Extract customer data          │
│ - Check if converted             │
└──────────┬──────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Create/Update Records            │
│ - Visitor (by email)             │
│ - Quote (with Quote Bot ID)      │
│ - Queue campaign generation      │
└──────────┬──────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Retargeting Campaign Flow        │
│ - 2 hour delay                   │
│ - AI recommendation              │
│ - Email/SMS dispatch             │
└──────────────────────────────────┘
```

### Data Mapping

Quote Bot webhook data maps to our system:

| Quote Bot Field | Our Field | Notes |
|---|---|---|
| `id` | `quotebot_quote_id` | Stored in quote_details |
| `email` | `visitor.email` | Used to identify customer |
| `name` | `visitor.first_name` | Customer name |
| `phone` | `visitor.phone` | Optional |
| `estimate_total` | `quote.amount` | In dollars |
| `status` | Quote status | pending, abandoned, etc. |
| `created_at` | Quote creation date | Timestamp |
| `converted` | Exclusion flag | Skip if true |

### Quote Status Handling

Different quote statuses are handled differently:

| Status | Action |
|--------|--------|
| `pending` | ✅ Queue for retargeting (not yet accepted/rejected) |
| `abandoned` | ✅ Queue for retargeting (customer left without booking) |
| `completed` | ⏭️ Skip (may already have booking) |
| `converted` | ⏭️ Skip (already converted) |

---

## API Endpoints

### Webhook Endpoint (For Quote Bot to call)

```
POST /webhooks/quotebot
Content-Type: application/json

Body: Quote Bot webhook payload
Response: { success: true, visitorId: "...", quoteId: "..." }
```

No authentication required (Quote Bot doesn't have our API key).

### Health Check

```
GET /health/quotebot
Response: { status: "ok", quotebot: "connected" }
```

### Manual Sync

```
POST /admin/sync/quotebot
Headers:
  X-Admin-Key: [ADMIN_API_KEY]
  Content-Type: application/json

Body:
{
  "hoursBack": 24
}

Response:
{
  "success": true,
  "total": 50,
  "processed": 45,
  "skipped": 5,
  "errors": []
}
```

---

## Monitoring & Troubleshooting

### Check Quote Bot Connection

```bash
# Verify API key is valid and Quote Bot is reachable
curl -X GET http://localhost:3000/health/quotebot -H "Accept: application/json"
```

### View Quote Bot Quotes in Dashboard

```bash
# Get Signature Transportation customer info (including Quote Bot quotes)
curl -X GET http://localhost:3000/beta/customer/a554ef56-a0a7-44ac-a023-6fda1966a87b \
  -H "X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production"
```

### Sync Recent Quotes

If webhooks are delayed or missed:

```bash
# Sync last 24 hours of quotes
curl -X POST http://localhost:3000/admin/sync/quotebot \
  -H "X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production" \
  -H "Content-Type: application/json" \
  -d '{ "hoursBack": 24 }'
```

### Check Server Logs

```bash
# View real-time logs
tail -f /tmp/retargeting-server.log | grep -i quotebot

# Look for:
# "✓ Quote Bot webhook processed: QB-123456"
# "Quote Bot sync complete: X processed, Y skipped"
```

### Common Issues

**Issue: "Quote Bot API key invalid"**
- Verify QUOTE_BOT_API_KEY in .env is correct
- Make sure it's their Quote Bot account's API key, not a different account
- Check key hasn't expired in Quote Bot settings

**Issue: "Webhook not receiving events"**
- Verify webhook URL is publicly accessible from Quote Bot servers
- Check Quote Bot webhook settings has correct URL: `https://your-domain.com/webhooks/quotebot`
- Verify webhook events are enabled in Quote Bot
- Test with manual sync to confirm API works

**Issue: "Quotes appearing twice"**
- If both webhook AND sync run, quotes might be duplicated
- We prevent this by checking for existing `quotebot_quote_id` before syncing

---

## Production Checklist

- [ ] QUOTE_BOT_API_KEY added to production .env
- [ ] Webhook URL configured in Quote Bot account settings
- [ ] Quote Bot webhook events enabled (Create, Update, Abandon)
- [ ] Health check passes (`/health/quotebot` returns 200 OK)
- [ ] Test quote created in Quote Bot - verify appears in dashboard within 30 seconds
- [ ] Logging verified - check `/tmp/retargeting-server.log` for "✓ Quote Bot webhook processed"
- [ ] Monitoring dashboard set up to track Quote Bot quotes
- [ ] Support team trained on Quote Bot integration
- [ ] Backfill sync completed for any existing unconverted quotes

---

## Support

- **Quote Bot API Docs:** https://docs.thequotebot.com/api
- **Quote Bot Support:** support@thequotebot.com
- **Retargeting Agent Support:** support@retargeting.app

---

**Last Updated:** 2024-09-25  
**Status:** Ready for implementation
