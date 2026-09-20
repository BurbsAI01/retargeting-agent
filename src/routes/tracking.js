const express = require('express');
const { Pool } = require('pg');
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * POST /tracking/event
 * Server-side event tracking (recommended approach - not blocked by ad blockers)
 * Events: page_view, time_spent, scroll, quote_generated, quote_viewed, conversion, etc.
 */
router.post('/event', async (req, res) => {
  try {
    const {
      visitor_id,
      email,
      event_type,
      page_url,
      page_title,
      section,
      duration_seconds,
      scroll_depth_percent,
      session_id,
      metadata,
    } = req.body;

    // Validate event
    if (!visitor_id && !email) {
      return res.status(400).json({ error: 'visitor_id or email required' });
    }

    // Get or create visitor
    let finalVisitorId = visitor_id;
    if (!finalVisitorId && email) {
      const visitorResult = await pool.query(
        `INSERT INTO visitors (email, last_active)
         VALUES ($1, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE SET last_active = CURRENT_TIMESTAMP
         RETURNING id`,
        [email]
      );
      finalVisitorId = visitorResult.rows[0].id;
    }

    // Record behavior event
    const result = await pool.query(
      `INSERT INTO behavior_events
       (visitor_id, event_type, page_url, page_title, section, duration_seconds, scroll_depth_percent, session_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, event_type, timestamp`,
      [
        finalVisitorId,
        event_type,
        page_url,
        page_title,
        section,
        duration_seconds || null,
        scroll_depth_percent || null,
        session_id,
        JSON.stringify(metadata || {}),
      ]
    );

    // Update visitor last_active
    await pool.query(
      `UPDATE visitors SET last_active = CURRENT_TIMESTAMP WHERE id = $1`,
      [finalVisitorId]
    );

    res.json({
      success: true,
      event_id: result.rows[0].id,
      visitor_id: finalVisitorId,
      timestamp: result.rows[0].timestamp,
    });
  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /tracking/quote-viewed
 * Track when a quote is viewed (from recovery link or original quote URL)
 */
router.post('/quote-viewed', async (req, res) => {
  try {
    const { visitor_id, quote_id, recovery_token, utm_source } = req.body;

    if (!visitor_id || !quote_id) {
      return res
        .status(400)
        .json({ error: 'visitor_id and quote_id required' });
    }

    // Record the view
    await pool.query(
      `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
       SELECT $1, c.id, 'quote_recovery', 'quote_viewed', $2
       FROM retargeting_campaigns c
       WHERE c.quote_id = $3
       LIMIT 1`,
      [
        visitor_id,
        JSON.stringify({
          recovery_token,
          utm_source: utm_source || 'direct',
          viewed_at: new Date().toISOString(),
        }),
        quote_id,
      ]
    );

    // Update recovery link if applicable
    if (recovery_token) {
      await pool.query(
        `UPDATE quote_recovery_links
         SET first_visited_at = CURRENT_TIMESTAMP
         WHERE recovery_token = $1`,
        [recovery_token]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking quote view:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /tracking/conversion
 * Track conversion (purchase/deal closed)
 */
router.post('/conversion', async (req, res) => {
  try {
    const {
      visitor_id,
      quote_id,
      campaign_id,
      amount,
      recovery_token,
    } = req.body;

    if (!visitor_id || !quote_id) {
      return res
        .status(400)
        .json({ error: 'visitor_id and quote_id required' });
    }

    // Update quote status
    await pool.query(`UPDATE quotes SET conversion_status = 'converted' WHERE id = $1`, [
      quote_id,
    ]);

    // Log conversion
    await pool.query(
      `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
       VALUES ($1, $2, 'conversion', 'converted', $3)`,
      [
        visitor_id,
        campaign_id,
        JSON.stringify({
          amount,
          converted_at: new Date().toISOString(),
          recovery_token,
        }),
      ]
    );

    // Update recovery link if applicable
    if (recovery_token) {
      await pool.query(
        `UPDATE quote_recovery_links
         SET converted_at = CURRENT_TIMESTAMP
         WHERE recovery_token = $1`,
        [recovery_token]
      );
    }

    // Update campaign performance
    if (campaign_id) {
      await pool.query(
        `INSERT INTO campaign_performance (campaign_id, channel, total_converted, revenue_impact)
         VALUES ($1, 'conversion', 1, $2)
         ON CONFLICT (campaign_id) DO UPDATE SET
           total_converted = campaign_performance.total_converted + 1,
           revenue_impact = campaign_performance.revenue_impact + $2,
           conversion_rate = ROUND((campaign_performance.total_converted + 1)::decimal / campaign_performance.total_sent * 100, 2)`,
        [campaign_id, amount || 0]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking conversion:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /tracking/batch
 * Batch track multiple events (for performance)
 */
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const event of events) {
        const {
          visitor_id,
          email,
          event_type,
          page_url,
          section,
          duration_seconds,
          scroll_depth_percent,
          session_id,
          metadata,
        } = event;

        let finalVisitorId = visitor_id;

        if (!finalVisitorId && email) {
          const visitorResult = await client.query(
            `INSERT INTO visitors (email, last_active)
             VALUES ($1, CURRENT_TIMESTAMP)
             ON CONFLICT (email) DO UPDATE SET last_active = CURRENT_TIMESTAMP
             RETURNING id`,
            [email]
          );
          finalVisitorId = visitorResult.rows[0].id;
        }

        await client.query(
          `INSERT INTO behavior_events
           (visitor_id, event_type, page_url, section, duration_seconds, scroll_depth_percent, session_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            finalVisitorId,
            event_type,
            page_url,
            section,
            duration_seconds || null,
            scroll_depth_percent || null,
            session_id,
            JSON.stringify(metadata || {}),
          ]
        );
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        events_tracked: events.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error batch tracking:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /tracking/visitor/:visitor_id/behavior
 * Get visitor behavior data
 */
router.get('/visitor/:visitor_id/behavior', async (req, res) => {
  try {
    const { visitor_id } = req.params;
    const { limit = 100 } = req.query;

    const result = await pool.query(
      `SELECT event_type, page_url, page_title, section, duration_seconds,
              scroll_depth_percent, timestamp, session_id
       FROM behavior_events
       WHERE visitor_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [visitor_id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching visitor behavior:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /tracking/pixel
 * Optional: Traditional pixel endpoint (can still support if needed)
 * Usage: <img src="/tracking/pixel?visitor_id=xxx&event=conversion" />
 */
router.get('/pixel', async (req, res) => {
  try {
    const { visitor_id, email, event } = req.query;

    if (!visitor_id && !email) {
      // Return 1x1 transparent GIF
      res.type('image/gif');
      return res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }

    // Track the pixel event
    await pool.query(
      `INSERT INTO behavior_events (visitor_id, event_type, metadata)
       SELECT $1, $2, $3
       WHERE $1 IS NOT NULL`,
      [
        visitor_id,
        event || 'pixel_view',
        JSON.stringify({
          type: 'pixel',
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    // Return 1x1 transparent GIF
    res.type('image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (error) {
    console.error('Error tracking pixel:', error);
    // Always return GIF even on error
    res.type('image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
});

module.exports = router;
