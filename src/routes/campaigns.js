const express = require('express');
const { Pool } = require('pg');
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /campaigns/pending-approval
 * Get all campaigns pending operator approval
 */
router.get('/pending-approval', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.visitor_id,
        c.quote_id,
        c.campaign_status,
        c.agent_recommendation,
        c.operator_modifications,
        c.created_at,
        c.approved_at,
        c.approved_by,
        v.email,
        v.first_name,
        v.last_name,
        v.phone,
        v.company_name,
        q.quote_details,
        q.generated_at as quote_generated_at
      FROM retargeting_campaigns c
      JOIN visitors v ON c.visitor_id = v.id
      JOIN quotes q ON c.quote_id = q.id
      WHERE c.campaign_status IN ('pending_approval', 'ready_to_send')
      ORDER BY c.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/:id
 * Get single campaign details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await pool.query(
      `SELECT c.*,
              v.id as visitor_id, v.email, v.first_name, v.last_name, v.phone, v.company_name,
              q.id as quote_id, q.quote_details, q.generated_at as quote_generated_at
       FROM retargeting_campaigns c
       JOIN visitors v ON c.visitor_id = v.id
       JOIN quotes q ON c.quote_id = q.id
       WHERE c.id = $1`,
      [id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaignResult.rows[0];

    // Get behavior data
    const behaviorResult = await pool.query(
      `SELECT event_type, page_url, section, duration_seconds, scroll_depth_percent
       FROM behavior_events
       WHERE visitor_id = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [campaign.visitor_id]
    );

    // Get incentives
    const incentivesResult = await pool.query(
      `SELECT * FROM incentives
       WHERE campaign_id = $1
       ORDER BY priority DESC`,
      [id]
    );

    // Get copy variants
    const variantsResult = await pool.query(
      `SELECT * FROM campaign_copy_variants
       WHERE campaign_id = $1
       ORDER BY created_at`,
      [id]
    );

    // Get quote recovery link
    const recoveryResult = await pool.query(
      `SELECT * FROM quote_recovery_links
       WHERE campaign_id = $1
       LIMIT 1`,
      [id]
    );

    res.json({
      ...campaign,
      behavior_events: behaviorResult.rows,
      incentives: incentivesResult.rows,
      copy_variants: variantsResult.rows,
      recovery_link: recoveryResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /campaigns/:id/approve
 * Operator approves a campaign
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      operator_email,
      discount_percent,
      channels,
      copy_overrides,
      incentive,
      notes,
    } = req.body;

    // Update campaign status
    const updateResult = await pool.query(
      `UPDATE retargeting_campaigns
       SET campaign_status = 'approved',
           approved_at = CURRENT_TIMESTAMP,
           approved_by = $1,
           operator_modifications = $2
       WHERE id = $3
       RETURNING *`,
      [
        operator_email,
        JSON.stringify({
          discount_percent,
          channels,
          copy_overrides,
          incentive,
          notes,
          approved_at: new Date().toISOString(),
        }),
        id,
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = updateResult.rows[0];

    // Log approval in audit log
    await pool.query(
      `INSERT INTO operator_audit_log (campaign_id, operator_email, action, changes, notes)
       VALUES ($1, $2, 'approved', $3, $4)`,
      [
        id,
        operator_email,
        JSON.stringify({
          discount_percent,
          channels,
          incentive,
        }),
        notes,
      ]
    );

    // Create incentive record if selected
    if (incentive) {
      const rec = campaign.agent_recommendation;
      const incentiveAmount = discount_percent || rec.suggested_discount_percent;

      await pool.query(
        `INSERT INTO incentives (campaign_id, visitor_id, incentive_type, incentive_value, display_name, expires_at)
         VALUES ($1, $2, 'discount_percent', $3, $4, CURRENT_TIMESTAMP + INTERVAL '48 hours')`,
        [
          id,
          campaign.visitor_id,
          String(incentiveAmount),
          `${incentiveAmount}% Off`,
        ]
      );
    }

    // Create quote recovery link
    const token = require('uuid').v4();
    await pool.query(
      `INSERT INTO quote_recovery_links (campaign_id, quote_id, visitor_id, recovery_url, recovery_token, includes_discount, discount_percent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [
        id,
        campaign.quote_id,
        campaign.visitor_id,
        `/recover/${token}`,
        token,
        true,
        discount_percent || campaign.agent_recommendation.suggested_discount_percent,
      ]
    );

    res.json({
      success: true,
      campaign: updateResult.rows[0],
      message: 'Campaign approved and queued for dispatch',
    });
  } catch (error) {
    console.error('Error approving campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /campaigns/:id/reject
 * Operator rejects a campaign
 */
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { operator_email, reason } = req.body;

    const updateResult = await pool.query(
      `UPDATE retargeting_campaigns
       SET campaign_status = 'rejected',
           operator_modifications = jsonb_set(
             operator_modifications,
             '{rejection_reason}',
             $1::jsonb
           )
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(reason), id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Log rejection
    await pool.query(
      `INSERT INTO operator_audit_log (campaign_id, operator_email, action, notes)
       VALUES ($1, $2, 'rejected', $3)`,
      [id, operator_email, reason]
    );

    res.json({
      success: true,
      message: 'Campaign rejected',
    });
  } catch (error) {
    console.error('Error rejecting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/:id/performance
 * Get campaign performance metrics
 */
router.get('/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        campaign_id,
        channel,
        total_sent,
        total_delivered,
        total_opened,
        total_clicked,
        total_converted,
        engagement_rate,
        conversion_rate,
        revenue_impact,
        calculated_at
       FROM campaign_performance
       WHERE campaign_id = $1`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaign performance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/history
 * Get historical campaigns with filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      status = 'approved',
      limit = 50,
      offset = 0,
      temperature,
      start_date,
      end_date,
    } = req.query;

    let query = `
      SELECT c.id, c.campaign_status, c.created_at, c.approved_at,
             v.email, v.company_name, v.first_name,
             c.agent_recommendation
      FROM retargeting_campaigns c
      JOIN visitors v ON c.visitor_id = v.id
      WHERE c.campaign_status = $1
    `;

    const params = [status];

    if (temperature) {
      query += ` AND c.agent_recommendation->>'lead_temperature' = $${params.length + 1}`;
      params.push(temperature);
    }

    if (start_date) {
      query += ` AND c.created_at >= $${params.length + 1}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND c.created_at <= $${params.length + 1}`;
      params.push(end_date);
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaign history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/:id/audit-log
 * Get approval audit trail for campaign
 */
router.get('/:id/audit-log', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM operator_audit_log
       WHERE campaign_id = $1
       ORDER BY timestamp DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
