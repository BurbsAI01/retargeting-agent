const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /recovery/:token
 * Fetch recovery link details for landing page
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Fetch recovery link and associated data
    const result = await pool.query(
      `SELECT
        r.id,
        r.campaign_id,
        r.quote_id,
        r.visitor_id,
        r.recovery_token,
        r.includes_discount,
        r.discount_percent,
        r.expires_at,
        r.first_visited_at,
        r.converted_at,
        q.quote_details,
        q.generated_at,
        v.email,
        v.first_name,
        v.company_name,
        c.agent_recommendation,
        c.operator_modifications
       FROM quote_recovery_links r
       JOIN quotes q ON r.quote_id = q.id
       JOIN visitors v ON r.visitor_id = v.id
       JOIN retargeting_campaigns c ON r.campaign_id = c.id
       WHERE r.recovery_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recovery link not found' });
    }

    const recoveryLink = result.rows[0];

    // Check if link has expired
    if (recoveryLink.expires_at && new Date(recoveryLink.expires_at) < new Date()) {
      return res.status(410).json({
        error: 'This recovery link has expired',
        expired: true,
      });
    }

    // Check if already converted
    if (recoveryLink.converted_at) {
      return res.status(200).json({
        ...recoveryLink,
        already_converted: true,
      });
    }

    // Parse quote details
    let quoteDetails = {};
    try {
      quoteDetails = typeof recoveryLink.quote_details === 'string'
        ? JSON.parse(recoveryLink.quote_details)
        : recoveryLink.quote_details;
    } catch (e) {
      console.error('Error parsing quote details:', e);
    }

    // Parse agent recommendation
    let recommendation = {};
    try {
      recommendation = typeof recoveryLink.agent_recommendation === 'string'
        ? JSON.parse(recoveryLink.agent_recommendation)
        : recoveryLink.agent_recommendation;
    } catch (e) {
      console.error('Error parsing recommendation:', e);
    }

    // Parse operator modifications
    let modifications = {};
    try {
      modifications = recoveryLink.operator_modifications
        ? (typeof recoveryLink.operator_modifications === 'string'
          ? JSON.parse(recoveryLink.operator_modifications)
          : recoveryLink.operator_modifications)
        : {};
    } catch (e) {
      console.error('Error parsing modifications:', e);
    }

    // Calculate discount savings
    const quoteAmount = quoteDetails.total || quoteDetails.amount || 0;
    const discountPercent = recoveryLink.discount_percent || 0;
    const discountAmount = (quoteAmount * discountPercent) / 100;
    const finalAmount = quoteAmount - discountAmount;

    res.json({
      campaign_id: recoveryLink.campaign_id,
      quote_id: recoveryLink.quote_id,
      visitor_id: recoveryLink.visitor_id,
      recovery_token: token,
      visitor: {
        name: recoveryLink.first_name || 'Valued Customer',
        email: recoveryLink.email,
        company: recoveryLink.company_name,
      },
      quote: {
        ...quoteDetails,
        generated_at: recoveryLink.generated_at,
        days_ago: Math.floor(
          (new Date() - new Date(recoveryLink.generated_at)) / (1000 * 60 * 60 * 24)
        ),
      },
      discount: {
        enabled: recoveryLink.includes_discount,
        percent: discountPercent,
        amount: discountAmount,
        expires_at: recoveryLink.expires_at,
      },
      pricing: {
        original: quoteAmount,
        discount_amount: discountAmount,
        final: finalAmount,
        savings_percent: discountPercent,
      },
      incentives: recommendation.suggested_incentives || [],
      already_converted: false,
      copy_variant: modifications.copy_overrides || recommendation.copy_variants?.[0] || {},
    });
  } catch (error) {
    console.error('Error fetching recovery link:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /recovery/:token/convert
 * Track conversion on recovery link
 */
router.post('/:token/convert', async (req, res) => {
  try {
    const { token } = req.params;
    const { amount, order_id } = req.body;

    // Find the recovery link
    const result = await pool.query(
      `SELECT campaign_id, quote_id, visitor_id FROM quote_recovery_links
       WHERE recovery_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recovery link not found' });
    }

    const { campaign_id, quote_id, visitor_id } = result.rows[0];

    // Update recovery link with conversion
    await pool.query(
      `UPDATE quote_recovery_links
       SET converted_at = CURRENT_TIMESTAMP
       WHERE recovery_token = $1`,
      [token]
    );

    // Update quote status
    await pool.query(
      `UPDATE quotes SET conversion_status = 'converted' WHERE id = $1`,
      [quote_id]
    );

    // Log conversion event
    await pool.query(
      `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
       VALUES ($1, $2, 'recovery_link', 'converted', $3)`,
      [
        visitor_id,
        campaign_id,
        JSON.stringify({
          amount,
          order_id,
          converted_at: new Date().toISOString(),
        }),
      ]
    );

    // Update campaign performance
    await pool.query(
      `UPDATE campaign_performance
       SET total_converted = total_converted + 1,
           revenue_impact = revenue_impact + COALESCE($1::decimal, 0),
           conversion_rate = ROUND((total_converted + 1)::decimal / NULLIF(total_sent, 0) * 100, 2),
           calculated_at = CURRENT_TIMESTAMP
       WHERE campaign_id = $2`,
      [amount || 0, campaign_id]
    );

    console.log(`Recovery link converted: ${token}, amount: ${amount}`);

    res.json({
      success: true,
      campaign_id,
      quote_id,
      visitor_id,
      message: 'Conversion recorded successfully',
    });
  } catch (error) {
    console.error('Error recording conversion:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /recovery/:token/view
 * Track page view on recovery link (for engagement)
 */
router.post('/:token/view', async (req, res) => {
  try {
    const { token } = req.params;
    const { utm_source } = req.body;

    // Update first_visited_at if this is first visit
    const result = await pool.query(
      `UPDATE quote_recovery_links
       SET first_visited_at = COALESCE(first_visited_at, CURRENT_TIMESTAMP)
       WHERE recovery_token = $1
       RETURNING visitor_id, campaign_id`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recovery link not found' });
    }

    const { visitor_id, campaign_id } = result.rows[0];

    // Log view event
    await pool.query(
      `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
       VALUES ($1, $2, 'recovery_link', 'viewed', $3)`,
      [
        visitor_id,
        campaign_id,
        JSON.stringify({
          utm_source: utm_source || 'email',
          viewed_at: new Date().toISOString(),
        }),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking page view:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
