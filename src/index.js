require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
const Queue = require('bull');

const RetargetingAgent = require('./agent/RetargetingAgent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Bull Job Queue for retargeting campaigns
const retargetingQueue = new Queue('retargeting-campaigns', {
  redis: process.env.REDIS_URL,
});

// Initialize agent
const agent = new RetargetingAgent();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Webhook: Receive visitor event (quote generated, no conversion)
 */
app.post('/webhooks/visitor-event', async (req, res) => {
  try {
    const { visitorId, email, phone, company, event_type, quote_data } =
      req.body;

    if (event_type === 'quote_generated' && !quote_data.converted) {
      // Store visitor and quote
      const visitorResult = await pool.query(
        `INSERT INTO visitors (id, email, phone, company_name, last_active)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE SET last_active = CURRENT_TIMESTAMP
         RETURNING id`,
        [visitorId, email, phone, company]
      );

      const finalVisitorId = visitorResult.rows[0].id;

      const quoteResult = await pool.query(
        `INSERT INTO quotes (visitor_id, quote_details, quote_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [finalVisitorId, JSON.stringify(quote_data), quote_data.quote_url]
      );

      const quoteId = quoteResult.rows[0].id;

      // Queue retargeting campaign job (will trigger after delay)
      await retargetingQueue.add(
        {
          visitorId: finalVisitorId,
          quoteId,
          email,
        },
        {
          delay: 2 * 60 * 60 * 1000, // 2 hours default
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      res.json({ success: true, visitorId: finalVisitorId, quoteId });
    } else {
      res.json({ success: false, reason: 'Not a retargeting candidate' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Get pending campaigns for operator approval
 */
app.get('/campaigns/pending-approval', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, v.email, v.first_name, v.company_name, q.quote_details
       FROM retargeting_campaigns c
       JOIN visitors v ON c.visitor_id = v.id
       JOIN quotes q ON c.quote_id = q.id
       WHERE c.campaign_status = 'pending_approval'
       ORDER BY c.created_at DESC
       LIMIT 50`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Approve campaign (operator action)
 */
app.post('/campaigns/:campaignId/approve', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { operator_email, discount_percent, channels, copy_overrides } =
      req.body;

    const modifications = {
      discount_percent,
      channels,
      ...copy_overrides,
    };

    await pool.query(
      `UPDATE retargeting_campaigns
       SET campaign_status = 'approved',
           approved_at = CURRENT_TIMESTAMP,
           approved_by = $1,
           operator_modifications = $2
       WHERE id = $3`,
      [operator_email, JSON.stringify(modifications), campaignId]
    );

    // Queue dispatch job
    await retargetingQueue.add(
      { campaignId, action: 'dispatch' },
      { attempts: 3 }
    );

    res.json({ success: true, campaignId });
  } catch (error) {
    console.error('Error approving campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Reject campaign
 */
app.post('/campaigns/:campaignId/reject', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { operator_email, reason } = req.body;

    await pool.query(
      `UPDATE retargeting_campaigns
       SET campaign_status = 'rejected',
           operator_modifications = jsonb_set(
             operator_modifications,
             '{rejection_reason}',
             $1::jsonb
           )
       WHERE id = $2`,
      [JSON.stringify(reason), campaignId]
    );

    res.json({ success: true, campaignId });
  } catch (error) {
    console.error('Error rejecting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bull job processor: Generate campaign recommendations
 */
retargetingQueue.process('retargeting-campaigns', async (job) => {
  const { visitorId, quoteId, email } = job.data;

  try {
    const visitorResult = await pool.query(
      'SELECT * FROM visitors WHERE id = $1',
      [visitorId]
    );
    const visitor = visitorResult.rows[0];

    const quoteResult = await pool.query(
      'SELECT * FROM quotes WHERE id = $1',
      [quoteId]
    );
    const quote = quoteResult.rows[0];

    // Calculate lead temperature
    const temperatureScore = agent.calculateLeadTemperature(visitor, quote, {
      pages_visited: [],
      interacted_with_chat: false,
    });

    // Get operator config (default)
    const operatorConfig = {
      max_discount_percent:
        parseInt(process.env.DEFAULT_MAX_DISCOUNT_PERCENT) || 15,
      enable_sms: true,
      enable_facebook: process.env.ENABLE_FACEBOOK_RETARGETING === 'true',
      enable_google_ads: process.env.ENABLE_GOOGLE_ADS_RETARGETING === 'true',
      enable_linkedin: process.env.ENABLE_LINKEDIN_RETARGETING === 'true',
      require_approval_for_discount_above_percent: parseInt(
        process.env.REQUIRE_APPROVAL_FOR_DISCOUNT_ABOVE_PERCENT
      ),
    };

    // Generate campaign recommendation
    const recommendation = await agent.generateCampaignRecommendation(
      visitor,
      quote,
      {
        temperatureScore,
        daysSinceQuote: Math.floor(
          (Date.now() - new Date(quote.generated_at)) / (1000 * 60 * 60 * 24)
        ),
        campaign_id: job.id,
      },
      operatorConfig
    );

    // Save campaign to database
    const campaignResult = await pool.query(
      `INSERT INTO retargeting_campaigns (visitor_id, quote_id, agent_recommendation, campaign_status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        visitorId,
        quoteId,
        JSON.stringify(recommendation),
        recommendation.approval_required ? 'pending_approval' : 'ready_to_send',
      ]
    );

    console.log(
      `Campaign generated for ${email}:`,
      campaignResult.rows[0].id
    );

    return { success: true, campaignId: campaignResult.rows[0].id };
  } catch (error) {
    console.error('Error processing retargeting job:', error);
    throw error;
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Retargeting Agent running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  await redisClient.quit();
  process.exit(0);
});
