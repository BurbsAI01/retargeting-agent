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

## Next Steps

### 1. Provide Integration Code to Signature Transportation

Send them the integration guide:
```
GET http://localhost:3000/beta/docs/integration
```

### 2. Add Tracking Pixel to Their Website

They need to add this to their quote page:
```html
<script>
window.retargetingConfig = {
  apiKey: 'sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8',
  appUrl: 'http://localhost:3000'
};

function trackQuoteGenerated(quoteData) {
  fetch(window.retargetingConfig.appUrl + '/webhooks/visitor-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': window.retargetingConfig.apiKey
    },
    body: JSON.stringify({
      visitorId: quoteData.customerId || Date.now(),
      email: quoteData.customerEmail,
      phone: quoteData.customerPhone,
      company: 'Signature Transportation',
      event_type: 'quote_generated',
      quote_data: {
        quote_id: quoteData.id,
        route: quoteData.route,
        vehicle_type: quoteData.vehicleType,
        amount: parseFloat(quoteData.totalPrice),
        quote_url: window.location.href,
        converted: false,
        created_at: new Date().toISOString()
      }
    })
  })
  .catch(err => console.error('Tracking error:', err));
}
</script>
```

### 3. Test Quote Tracking

Once integrated, test with a sample quote:

```bash
curl -X POST http://localhost:3000/webhooks/visitor-event \
  -H "X-API-Key: sig_trans_7dff285ad79be438d0af08c938e2671cc0c9c3246d1479d8" \
  -H "Content-Type: application/json" \
  -d '{
    "visitorId": "test-001",
    "email": "customer@example.com",
    "phone": "615-555-0001",
    "company": "Signature Transportation",
    "event_type": "quote_generated",
    "quote_data": {
      "quote_id": "SIG-TEST-001",
      "route": "Nashville to Memphis",
      "vehicle_type": "Sprinter Van",
      "amount": 2500,
      "quote_url": "https://signaturetransportation.com/quote/SIG-TEST-001",
      "converted": false
    }
  }'
```

Expected Response:
```json
{
  "success": true,
  "visitorId": "test-001",
  "quoteId": "..."
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
