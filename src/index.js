require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
const Queue = require('bull');

const RetargetingAgent = require('./agent/RetargetingAgent');
const DispatchEngine = require('./services/DispatchEngine');
const MailgunWebhookHandler = require('./webhooks/MailgunWebhookHandler');
const TwilioWebhookHandler = require('./webhooks/TwilioWebhookHandler');
const FacebookWebhookHandler = require('./webhooks/FacebookWebhookHandler');
const ConversionWebhookHandler = require('./webhooks/ConversionWebhookHandler');
const APIKeyAuth = require('./middleware/apiKeyAuth');
const QuoteBotService = require('./services/QuoteBotService');
const QuoteBotWebhookHandler = require('./webhooks/QuoteBotWebhookHandler');
const campaignsRouter = require('./routes/campaigns');
const trackingRouter = require('./routes/tracking');
const recoveryRouter = require('./routes/recovery');
const betaRouter = require('./routes/beta');

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

// Initialize services
const agent = new RetargetingAgent();
const dispatchEngine = new DispatchEngine(pool);
const mailgunWebhookHandler = new MailgunWebhookHandler(pool);
const twilioWebhookHandler = new TwilioWebhookHandler(pool);
const facebookWebhookHandler = new FacebookWebhookHandler(pool);
const conversionWebhookHandler = new ConversionWebhookHandler(pool);
const apiKeyAuth = new APIKeyAuth(pool);
const quoteBotService = new QuoteBotService(process.env.QUOTE_BOT_API_KEY);
const quoteBotWebhookHandler = new QuoteBotWebhookHandler(pool, process.env.QUOTE_BOT_API_KEY);

// Mount routes
app.use('/campaigns', campaignsRouter);
app.use('/tracking', trackingRouter);
app.use('/recovery', recoveryRouter);
app.use('/beta', betaRouter(pool));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /health/quotebot
 * Verify Quote Bot API connection is working
 */
app.get('/health/quotebot', async (req, res) => {
  try {
    const health = await quoteBotService.healthCheck();
    if (health.healthy) {
      res.json({ status: 'ok', quotebot: 'connected', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'error', quotebot: 'disconnected', error: health.error });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /admin/sync/quotebot
 * Manually sync recent quotes from Quote Bot
 * Useful for backfilling or catching missed webhooks
 */
app.post('/admin/sync/quotebot', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const { hoursBack } = req.body;
    const results = await quoteBotWebhookHandler.syncRecentQuotes(hoursBack || 24);
    res.json({
      success: true,
      message: `Quote Bot sync completed`,
      ...results
    });
  } catch (error) {
    console.error('Quote Bot sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Webhook: Receive visitor event (quote generated, no conversion)
 */
app.post('/webhooks/visitor-event', apiKeyAuth.middleware(), async (req, res) => {
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
 * Bull job processor: Handle multiple job types (campaign generation and dispatch)
 */
retargetingQueue.process(async (job) => {
  const { action, visitorId, quoteId, email, campaignId } = job.data;

  try {
    // Job type 1: Generate campaign recommendations (default)
    if (!action || action === 'generate') {
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

      // Get operator config
      const operatorConfig = {
        max_discount_percent:
          parseInt(process.env.DEFAULT_MAX_DISCOUNT_PERCENT) || 15,
        enable_sms: process.env.ENABLE_SMS_RETARGETING !== 'false',
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
    }

    // Job type 2: Dispatch campaign
    if (action === 'dispatch') {
      console.log(`Processing dispatch job for campaign ${campaignId}`);
      const dispatchResult = await dispatchEngine.dispatchCampaign(campaignId);
      return dispatchResult;
    }

    throw new Error(`Unknown job action: ${action}`);
  } catch (error) {
    console.error('Error processing retargeting job:', error);
    throw error;
  }
});

/**
 * GET /dispatch/campaign/:campaignId/status
 * Get dispatch status for a campaign
 */
app.get('/dispatch/campaign/:campaignId/status', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const status = await dispatchEngine.getDispatchStatus(campaignId);
    res.json(status);
  } catch (error) {
    console.error('Error getting dispatch status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /dispatch/campaign/:campaignId/send
 * Manually trigger dispatch for an approved campaign
 */
app.post('/dispatch/campaign/:campaignId/send', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Check campaign status
    const campaignResult = await pool.query(
      'SELECT campaign_status FROM retargeting_campaigns WHERE id = $1',
      [campaignId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaignResult.rows[0];
    if (campaign.campaign_status !== 'approved') {
      return res.status(400).json({
        error: `Campaign must be approved to dispatch. Current status: ${campaign.campaign_status}`,
      });
    }

    // Queue dispatch job
    await retargetingQueue.add(
      { campaignId, action: 'dispatch' },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    res.json({
      success: true,
      campaignId,
      message: 'Campaign queued for dispatch',
    });
  } catch (error) {
    console.error('Error queuing dispatch:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /dispatch/bulk-send
 * Dispatch all ready_to_send campaigns
 */
app.post('/dispatch/bulk-send', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id FROM retargeting_campaigns
       WHERE campaign_status = 'ready_to_send'
       ORDER BY created_at ASC
       LIMIT 100`
    );

    const campaigns = result.rows;
    const queuedJobs = [];

    for (const campaign of campaigns) {
      const job = await retargetingQueue.add(
        { campaignId: campaign.id, action: 'dispatch' },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        }
      );
      queuedJobs.push({ campaignId: campaign.id, jobId: job.id });
    }

    res.json({
      success: true,
      campaigns_queued: campaigns.length,
      jobs: queuedJobs,
      message: `Queued ${campaigns.length} campaigns for dispatch`,
    });
  } catch (error) {
    console.error('Error bulk dispatching:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /dispatch/queue/stats
 * Get job queue statistics
 */
app.get('/dispatch/queue/stats', async (req, res) => {
  try {
    const counts = await retargetingQueue.getJobCounts();
    const active = await retargetingQueue.getActiveCount();
    const delayed = await retargetingQueue.getDelayedCount();

    res.json({
      active,
      delayed,
      ...counts,
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * WEBHOOK HANDLERS
 */

/**
 * POST /webhooks/mailgun
 * Mailgun webhook for email events (delivered, opened, clicked, failed, etc.)
 */
app.post('/webhooks/mailgun', async (req, res) => {
  try {
    const { signature, body } = req.body;

    if (!signature || !body) {
      return res.status(400).json({ error: 'Invalid webhook format' });
    }

    // Verify signature
    if (!mailgunWebhookHandler.verifySignature(body.timestamp, body.token, signature.signature)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // Handle the webhook
    const result = await mailgunWebhookHandler.handleWebhook(body['event-type'], body);
    res.json(result);
  } catch (error) {
    console.error('Mailgun webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/twilio
 * Twilio webhook for SMS delivery status
 */
app.post('/webhooks/twilio', async (req, res) => {
  try {
    const { MessageSid } = req.body;

    if (!MessageSid) {
      return res.status(400).json({ error: 'No MessageSid' });
    }

    // Verify signature using full URL and params
    const signature = req.get('X-Twilio-Signature');
    const fullUrl = `${process.env.APP_URL || 'https://app.example.com'}/webhooks/twilio`;

    if (!twilioWebhookHandler.verifySignature(fullUrl, req.body, signature)) {
      console.warn('Invalid Twilio signature - proceeding anyway (development mode)');
    }

    // Handle the webhook
    const result = await twilioWebhookHandler.handleWebhook(req.body);
    res.json(result);
  } catch (error) {
    console.error('Twilio webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/facebook
 * Facebook webhook for conversions and events
 */
app.post('/webhooks/facebook', async (req, res) => {
  try {
    const { object, entry } = req.body;

    if (object !== 'page' && object !== 'pixel') {
      return res.status(400).json({ error: 'Unknown object type' });
    }

    // Verify signature
    const signature = req.get('X-Hub-Signature-256');
    const body = JSON.stringify(req.body);

    if (!facebookWebhookHandler.verifySignature(body, signature)) {
      console.warn('Invalid Facebook signature');
      // Note: In production, return 403 here. For testing, continue.
    }

    // Process all entries
    const results = [];
    for (const e of entry) {
      const result = await facebookWebhookHandler.handleWebhook(e);
      results.push(result);
    }

    res.json({ success: true, entries_processed: results.length });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /webhooks/facebook
 * Facebook webhook verification
 */
app.get('/webhooks/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    console.log('Facebook webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('Facebook webhook verification failed');
    res.status(403).json({ error: 'Invalid verify token' });
  }
});

/**
 * POST /webhooks/google
 * Google Ads conversion tracking webhook
 */
app.post('/webhooks/google', async (req, res) => {
  try {
    const result = await conversionWebhookHandler.handleGoogleConversion(req.body);
    res.json(result);
  } catch (error) {
    console.error('Google webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/linkedin
 * LinkedIn conversion tracking webhook
 */
app.post('/webhooks/linkedin', async (req, res) => {
  try {
    const result = await conversionWebhookHandler.handleLinkedInConversion(req.body);
    res.json(result);
  } catch (error) {
    console.error('LinkedIn webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/conversion
 * Generic conversion webhook for custom platforms
 */
app.post('/webhooks/conversion/:platform', apiKeyAuth.middleware(), async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await conversionWebhookHandler.handleCustomConversion(platform, req.body);
    res.json(result);
  } catch (error) {
    console.error(`${platform} webhook error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/quotebot
 * Quote Bot webhook for quote generation events
 * Quote Bot sends this when a customer generates a quote
 */
app.post('/webhooks/quotebot', async (req, res) => {
  try {
    const result = await quoteBotWebhookHandler.handleWebhook(req.body);
    res.json(result);
  } catch (error) {
    console.error('Quote Bot webhook error:', error);
    res.status(500).json({ error: error.message });
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
