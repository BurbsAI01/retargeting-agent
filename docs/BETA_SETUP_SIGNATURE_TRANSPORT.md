# Beta Setup: Signature Transportation

**Status:** ✅ Active  
**Customer ID:** `a554ef56-a0a7-44ac-a023-6fda1966a87b`  
**Agreement Signed:** 2024-09-25  
**Signed By:** John Smith (john.smith@signaturetransportation.com)

## Customer Information

| Field | Value |
|-------|-------|
| **Company** | Signature Transportation |
| **Contact** | Operations Manager |
| **Email** | operations@signaturetransportation.com |
| **Phone** | 615-XXX-XXXX |
| **Location** | Nashville, TN |
| **Channels** | Email, SMS |

## API Credentials

```
API Key: sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8
```

⚠️ **KEEP THIS SECURE** - This key should be stored in environment variables on their server.

## Implementation Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| **Week 1** | Integration | Tracking pixel added to website |
| **Week 1-2** | Testing | 5-10 test quotes created |
| **Week 2** | Campaign Setup | AI recommends retargeting strategy |
| **Week 2-3** | Tracking | Monitor email opens/clicks |
| **Week 3** | Conversion | Track completed bookings |
| **Week 3** | Report | Generate metrics & ROI analysis |

## Implementation Strategy

**KEY ADVANTAGE:** Signature Transportation uses Quote Bot for quoting, so we don't need to add any code to their website. Quote Bot webhooks will automatically send us quote events.

### Quote Bot Integration Flow

```
Quote Bot Account
    ↓
    └→ Quote generated
       └→ Webhook fires
          └→ https://your-domain/webhooks/quotebot
             └→ Quote stored in Retargeting Agent
                └→ Campaign generation starts (2-hour delay)
                   └→ Email/SMS retargeting
```

---

## Next Steps

### 1. Provide Quote Bot Setup Instructions

Share the Quote Bot integration guide:
```
https://your-domain/docs/quote-bot-integration
```

### 2. Configure Quote Bot Webhook

They need to set this up in their Quote Bot account settings:

**Webhook Configuration:**
- URL: `https://your-domain.com/webhooks/quotebot`
- Events: Quote Created, Quote Updated, Quote Abandoned
- Method: POST

### 3. Test Quote Bot Connection

Verify the integration is working:

Test the Quote Bot connection:

```bash
curl -X GET http://localhost:3000/health/quotebot
```

Expected Response:
```json
{
  "status": "ok",
  "quotebot": "connected",
  "timestamp": "2024-09-25T14:30:00.000Z"
}
```

### 4. Test with Sample Quote

They generate a test quote in Quote Bot's interface. When submitted, Quote Bot automatically sends a webhook to us.

You should see in the logs:
```
✓ Quote Bot webhook processed: QB-123456
  Visitor: customer@example.com
  Amount: $2500
  Stored as quote ID: ...
```

### 5. Backfill Historical Quotes (Optional)

If they have existing unconverted quotes, sync them:

```bash
curl -X POST http://localhost:3000/admin/sync/quotebot \
  -H "X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production" \
  -H "Content-Type: application/json" \
  -d '{ "hoursBack": 168 }'
```

Response shows how many quotes were synced:
```json
{
  "success": true,
  "total": 50,
  "processed": 45,
  "skipped": 5,
  "errors": []
}
```

### 4. Monitor Dashboard

After quotes are created:
- Check `/beta/customer/a554ef56-a0a7-44ac-a023-6fda1966a87b` (admin only)
- View visitors, quotes, campaigns created
- Monitor engagement (opens, clicks)

### 5. Campaign Generation

After 2 hours, the system will automatically:
1. Generate a retargeting campaign for each unconverted quote
2. Create email copy variants
3. Recommend discount percentage (default: 10%)
4. Queue for dispatch

### 6. Conversion Tracking

When a customer completes their booking, send:

```bash
curl -X POST http://localhost:3000/webhooks/conversion/signature-transportation \
  -H "X-API-Key: sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8" \
  -H "Content-Type: application/json" \
  -d '{
    "recovery_token": "recovered-from-recovery-link",
    "visitor_email": "customer@example.com",
    "order_id": "ORDER-123",
    "amount": 2250.00
  }'
```

## Success Metrics

We're tracking:
- **Quote Capture Rate:** Quotes tracked from website
- **Campaign Generation:** AI-generated retargeting campaigns
- **Email Metrics:** Open rate, click rate, unsubscribe rate
- **Conversion Rate:** Bookings recovered through retargeting
- **ROI:** Revenue from conversions vs. discount cost

**Target for Phase 1:** At least 1-2 recovered bookings within 3 weeks

## Support & Communication

- **Weekly Check-ins:** Every Friday 10am CST
- **Email Support:** support@retargeting.app
- **Slack Channel:** #beta-signature-transport (if available)
- **Emergency:** Direct call to BurbsAI team

## Dashboard Access

Admin dashboard to view all Signature Transportation data:
```
GET /beta/customers
Headers: X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production
```

View their specific data:
```
GET /beta/customer/a554ef56-a0a7-44ac-a023-6fda1966a87b
Headers: X-Admin-Key: admin_sig_trans_beta_2024_secure_key_change_in_production
```

## Phase Completion Checklist

- [ ] Signature Transportation receives integration guide
- [ ] Tracking pixel added to their website
- [ ] Test quote created and confirmed in dashboard
- [ ] 5-10 production quotes captured
- [ ] First automated campaign generated
- [ ] Email dispatched and tracked
- [ ] At least 1 conversion recorded
- [ ] Week 3 report generated and shared

---

**Last Updated:** 2024-09-25  
**Status:** Ready for integration testing
