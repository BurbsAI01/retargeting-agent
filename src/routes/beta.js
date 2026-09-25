const express = require('express');
const APIKeyAuth = require('../middleware/apiKeyAuth');
const BetaAgreementService = require('../services/BetaAgreementService');

module.exports = (pool) => {
  const router = express.Router();
  const apiKeyAuth = new APIKeyAuth(pool);
  const agreementService = new BetaAgreementService(pool);

  // POST /beta/invite - Admin invites a beta customer
  router.post('/invite', async (req, res) => {
    const { name, email, company_name, contact_person, phone, channels } = req.body;
    const adminKey = req.headers['x-admin-key'];

    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized - Invalid admin key' });
    }

    try {
      // Check if customer already exists
      const existing = await pool.query(
        'SELECT id FROM beta_customers WHERE email = $1',
        [email]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Beta customer with this email already exists',
          customerId: existing.rows[0].id
        });
      }

      // Create new beta customer
      const result = await pool.query(
        `INSERT INTO beta_customers (
          name, email, company_name, contact_person, phone,
          allowed_channels, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending_signature')
        RETURNING id, email`,
        [name, email, company_name, contact_person, phone, channels || ['email']]
      );

      const betaCustomerId = result.rows[0].id;
      const signatureLink = await agreementService.generateSignatureLink(
        betaCustomerId,
        email
      );

      console.log(`✓ Beta customer created: ${name} (${email})`);
      console.log(`  Signature link: ${signatureLink}`);

      res.status(201).json({
        success: true,
        betaCustomerId,
        email,
        signatureLink,
        message: `Beta customer ${name} created. Send signature link above to complete onboarding.`,
      });
    } catch (error) {
      console.error('Error inviting beta customer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /beta/sign/:token - Display agreement for signing
  router.get('/sign/:token', async (req, res) => {
    const { token } = req.params;

    try {
      const result = await pool.query(
        `SELECT id, name, company_name, signature_token_expires_at
         FROM beta_customers
         WHERE signature_token = $1 AND signature_token_expires_at > CURRENT_TIMESTAMP`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(404).send(`
          <html>
            <body style="font-family: Arial; text-align: center; margin-top: 50px;">
              <h1>Invalid or Expired Link</h1>
              <p>This signature link has expired or is invalid.</p>
              <p>Please contact support@retargeting.app to request a new link.</p>
            </body>
          </html>
        `);
      }

      const customer = result.rows[0];
      const agreementHTML = agreementService.getAgreementHTML(
        customer.name,
        customer.company_name,
        token
      );

      res.send(agreementHTML);
    } catch (error) {
      console.error('Error retrieving agreement:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /beta/sign/:token - Submit signed agreement
  router.post('/sign/:token', async (req, res) => {
    const { token } = req.params;
    const { signedByName, signedByEmail } = req.body;

    try {
      // Save signed agreement
      const customer = await agreementService.saveSignedAgreement(
        token,
        signedByName,
        signedByEmail
      );

      if (!customer) {
        return res.status(404).json({
          error: 'Invalid or expired signature link'
        });
      }

      // Generate API key for this customer
      const { apiKey, keyId } = await apiKeyAuth.generateAPIKey(
        customer.id,
        'Integration Key'
      );

      // Update beta customer with API key ID
      await pool.query(
        'UPDATE beta_customers SET api_key_id = $1 WHERE id = $2',
        [keyId, customer.id]
      );

      console.log(`✓ Beta agreement signed by ${signedByName} (${signedByEmail})`);
      console.log(`  Generated API key for ${customer.name}`);

      res.json({
        success: true,
        message: `Welcome to Retargeting Agent Beta, ${customer.name}!`,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
        },
        apiKey,
        nextSteps: {
          1: 'Save your API key securely (shown above)',
          2: 'Read the integration guide at /beta/docs/integration',
          3: 'Add the tracking pixel to your website',
          4: 'Test with a quote event',
          5: 'Contact us at support@retargeting.app'
        }
      });
    } catch (error) {
      console.error('Error signing agreement:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /beta/success - Success page after signing
  router.get('/success', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Agreement Signed Successfully</title>
          <style>
            body { font-family: Arial; background: #f5f5f5; }
            .container {
              max-width: 600px;
              margin: 100px auto;
              background: white;
              padding: 40px;
              border-radius: 8px;
              text-align: center;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .success-icon {
              font-size: 48px;
              color: #28a745;
              margin-bottom: 20px;
            }
            h1 { color: #2c3e50; }
            .next-steps { text-align: left; margin-top: 30px; background: #f8f9fa; padding: 20px; border-radius: 4px; }
            a { color: #007bff; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>Agreement Signed Successfully!</h1>
            <p>Thank you for joining the Retargeting Agent Beta Program.</p>

            <div class="next-steps">
              <h3>Next Steps:</h3>
              <ol>
                <li>Check your email for your API key and integration guide</li>
                <li>Add the tracking pixel to your website</li>
                <li>Generate test quotes to verify tracking</li>
                <li>Watch the dashboard as retargeting campaigns are created</li>
                <li>Join our weekly check-in calls to share feedback</li>
              </ol>
            </div>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              <strong>Questions?</strong> Email <a href="mailto:support@retargeting.app">support@retargeting.app</a>
            </p>
          </div>
        </body>
      </html>
    `);
  });

  // GET /beta/customers - View all beta customers (admin only)
  router.get('/customers', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      const result = await pool.query(
        `SELECT
          bc.id,
          bc.name,
          bc.email,
          bc.company_name,
          bc.contact_person,
          bc.status,
          bc.tier,
          bc.allowed_channels,
          bc.agreement_signed_at,
          bc.onboarded_at,
          bc.created_at,
          COUNT(DISTINCT ak.id) as api_keys_count
         FROM beta_customers bc
         LEFT JOIN api_keys ak ON bc.id = ak.beta_customer_id
         GROUP BY bc.id
         ORDER BY bc.created_at DESC`
      );

      res.json({
        customers: result.rows,
        total: result.rows.length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /beta/customer/:id - Get specific customer details (admin only)
  router.get('/customer/:id', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    try {
      const result = await pool.query(
        `SELECT * FROM beta_customers WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Get API keys for this customer
      const keysResult = await pool.query(
        `SELECT id, name, key_prefix, is_active, last_used_at, created_at, expires_at
         FROM api_keys
         WHERE beta_customer_id = $1
         ORDER BY created_at DESC`,
        [id]
      );

      // Get stats
      const statsResult = await pool.query(
        `SELECT
          COUNT(DISTINCT v.id) as total_visitors,
          COUNT(DISTINCT q.id) as total_quotes,
          COUNT(DISTINCT rc.id) as total_campaigns,
          COUNT(DISTINCT CASE WHEN el.action = 'page_view' THEN el.id END) as engagement_events
         FROM visitors v
         LEFT JOIN quotes q ON v.id = q.visitor_id
         LEFT JOIN retargeting_campaigns rc ON q.id = rc.quote_id
         LEFT JOIN engagement_log el ON rc.id = el.campaign_id
         WHERE v.email LIKE $1`,
        [`%@%`] // This would need better filtering by customer
      );

      res.json({
        customer: result.rows[0],
        apiKeys: keysResult.rows,
        stats: statsResult.rows[0]
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /beta/docs/integration - Integration guide for customers
  router.get('/docs/integration', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Integration Guide - Retargeting Agent</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              background: #f5f5f5;
            }
            .container {
              max-width: 900px;
              margin: 0 auto;
              padding: 40px 20px;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1, h2 { color: #007bff; }
            code {
              background: #f4f4f4;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: 'Courier New', monospace;
            }
            pre {
              background: #f4f4f4;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
            .success {
              background: #d4edda;
              border: 1px solid #28a745;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Retargeting Agent - Integration Guide</h1>
            <p><strong>For Signature Transportation Beta Testing</strong></p>

            <h2>Step 1: Track Quote Events</h2>
            <p>Add this snippet to your website, replacing YOUR_API_KEY with your actual API key:</p>
            <pre>&lt;script&gt;
window.retargetingConfig = {
  apiKey: 'YOUR_API_KEY',
  appUrl: 'https://api.retargeting.app'
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
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      console.log('✓ Quote tracked:', data.quoteId);
    }
  })
  .catch(err => console.error('Tracking error:', err));
}
&lt;/script&gt;</pre>

            <h2>Step 2: Call on Quote Complete</h2>
            <p>Add this to your quote form's submit handler:</p>
            <pre>document.getElementById('quoteForm').addEventListener('submit', function() {
  trackQuoteGenerated({
    id: 'QUOTE-123',
    customerId: 'CUST-456',
    customerEmail: 'customer@example.com',
    customerPhone: '615-555-0000',
    route: 'Nashville to Memphis',
    vehicleType: 'Sprinter Van',
    totalPrice: '2500.00'
  });
});</pre>

            <div class="success">
              <strong>✓ Testing Tip:</strong> Open browser DevTools and look for the "✓ Quote tracked" message in the console.
            </div>

            <h2>Step 3: Track Conversions (Optional)</h2>
            <p>When a customer completes their quote/purchase, call:</p>
            <pre>fetch(window.retargetingConfig.appUrl + '/webhooks/conversion', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': window.retargetingConfig.apiKey
  },
  body: JSON.stringify({
    platform: 'signature-transportation',
    recovery_token: getQueryParam('retarget_token'),
    visitor_email: 'customer@example.com',
    order_id: 'ORDER-123',
    amount: 2250.00,
    converted_at: new Date().toISOString()
  })
});</pre>

            <div class="warning">
              <strong>⚠ Important:</strong> Replace YOUR_API_KEY with the key provided in your welcome email.
            </div>

            <h2>Testing Your Integration</h2>
            <ol>
              <li>Add the script to your website</li>
              <li>Fill out a quote form on your website</li>
              <li>Check the browser console for "✓ Quote tracked" message</li>
              <li>Visit your Retargeting Agent dashboard</li>
              <li>You should see a visitor and quote created within seconds</li>
              <li>Within 2 hours, an automated retargeting campaign will be generated</li>
            </ol>

            <h2>Support</h2>
            <p>Questions? Email <a href="mailto:support@retargeting.app">support@retargeting.app</a> or check the <a href="/beta/docs/api">API Documentation</a></p>
          </div>
        </body>
      </html>
    `);
  });

  return router;
};
