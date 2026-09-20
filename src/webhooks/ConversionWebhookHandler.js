/**
 * Generic conversion tracking webhook handler
 * Used for Google Ads, LinkedIn, and other platforms that send conversion callbacks
 */
class ConversionWebhookHandler {
  constructor(pool) {
    this.pool = pool;
  }

  async handleGoogleConversion(conversionData) {
    try {
      const {
        conversion_id,
        conversion_label,
        value,
        currency,
        order_id,
        user_id,
      } = conversionData;

      if (!conversion_id || !order_id) {
        return { success: false, error: 'Missing conversion_id or order_id' };
      }

      // Extract campaign ID from order_id (format: campaign_123)
      const match = order_id.match(/campaign_(\d+)/);
      if (!match) {
        console.warn(`Could not extract campaign ID from order_id: ${order_id}`);
        return { success: false, error: 'Invalid order_id format' };
      }

      const campaignId = match[1];

      // Update campaign performance
      await this.pool.query(
        `UPDATE campaign_performance
         SET total_converted = total_converted + 1,
             revenue_impact = revenue_impact + COALESCE($1::decimal, 0),
             conversion_rate = ROUND((total_converted + 1)::decimal / NULLIF(total_sent, 0) * 100, 2),
             calculated_at = CURRENT_TIMESTAMP
         WHERE campaign_id = $2 AND channel = 'google_ads'`,
        [value || 0, campaignId]
      );

      // Get campaign info for engagement log
      const campaignResult = await this.pool.query(
        `SELECT visitor_id FROM retargeting_campaigns WHERE id = $1`,
        [campaignId]
      );

      if (campaignResult.rows.length > 0) {
        const { visitor_id } = campaignResult.rows[0];

        await this.pool.query(
          `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
           VALUES ($1, $2, 'google_ads', $3, $4)`,
          [
            visitor_id,
            campaignId,
            'google_conversion',
            JSON.stringify({
              conversion_id,
              conversion_label,
              value,
              currency,
              order_id,
              timestamp: new Date().toISOString(),
            }),
          ]
        );
      }

      console.log(`Google conversion tracked: ${order_id}, value: ${value}`);
      return {
        success: true,
        platform: 'google_ads',
        campaign_id: campaignId,
        value,
      };
    } catch (error) {
      console.error('Google conversion tracking error:', error);
      throw error;
    }
  }

  async handleLinkedInConversion(conversionData) {
    try {
      const {
        campaign_id,
        conversion_id,
        email,
        company,
        value,
        timestamp,
      } = conversionData;

      if (!campaign_id) {
        return { success: false, error: 'Missing campaign_id' };
      }

      // Update campaign performance
      await this.pool.query(
        `UPDATE campaign_performance
         SET total_converted = total_converted + 1,
             revenue_impact = revenue_impact + COALESCE($1::decimal, 0),
             conversion_rate = ROUND((total_converted + 1)::decimal / NULLIF(total_sent, 0) * 100, 2),
             calculated_at = CURRENT_TIMESTAMP
         WHERE campaign_id = $2 AND channel = 'linkedin'`,
        [value || 0, campaign_id]
      );

      // Get campaign info for engagement log
      const campaignResult = await this.pool.query(
        `SELECT visitor_id FROM retargeting_campaigns WHERE id = $1`,
        [campaign_id]
      );

      if (campaignResult.rows.length > 0) {
        const { visitor_id } = campaignResult.rows[0];

        await this.pool.query(
          `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
           VALUES ($1, $2, 'linkedin', $3, $4)`,
          [
            visitor_id,
            campaign_id,
            'linkedin_conversion',
            JSON.stringify({
              conversion_id,
              email,
              company,
              value,
              timestamp: timestamp || new Date().toISOString(),
            }),
          ]
        );
      }

      console.log(`LinkedIn conversion tracked: campaign ${campaign_id}, value: ${value}`);
      return {
        success: true,
        platform: 'linkedin',
        campaign_id,
        value,
      };
    } catch (error) {
      console.error('LinkedIn conversion tracking error:', error);
      throw error;
    }
  }

  async handleCustomConversion(platform, conversionData) {
    try {
      const {
        campaign_id,
        visitor_id,
        event_type,
        value,
        metadata,
      } = conversionData;

      if (!campaign_id || !visitor_id) {
        return {
          success: false,
          error: 'Missing campaign_id or visitor_id',
        };
      }

      // Determine channel from platform
      let channel = platform.toLowerCase();

      // Update campaign performance based on event type
      if (event_type === 'conversion' || event_type === 'purchase') {
        await this.pool.query(
          `UPDATE campaign_performance
           SET total_converted = total_converted + 1,
               revenue_impact = revenue_impact + COALESCE($1::decimal, 0),
               conversion_rate = ROUND((total_converted + 1)::decimal / NULLIF(total_sent, 0) * 100, 2),
               calculated_at = CURRENT_TIMESTAMP
           WHERE campaign_id = $2 AND channel = $3`,
          [value || 0, campaign_id, channel]
        );
      } else if (event_type === 'click' || event_type === 'engagement') {
        await this.pool.query(
          `UPDATE campaign_performance
           SET total_clicked = total_clicked + 1,
               engagement_rate = ROUND((total_clicked::decimal / NULLIF(total_sent, 0)) * 100, 2),
               calculated_at = CURRENT_TIMESTAMP
           WHERE campaign_id = $1 AND channel = $2`,
          [campaign_id, channel]
        );
      }

      // Log engagement event
      await this.pool.query(
        `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          visitor_id,
          campaign_id,
          channel,
          `${platform.toLowerCase()}_${event_type}`,
          JSON.stringify({
            event_type,
            value,
            ...metadata,
            timestamp: new Date().toISOString(),
          }),
        ]
      );

      console.log(`${platform} conversion tracked: campaign ${campaign_id}, value: ${value}`);
      return {
        success: true,
        platform,
        campaign_id,
        value,
      };
    } catch (error) {
      console.error(`${platform} conversion tracking error:`, error);
      throw error;
    }
  }
}

module.exports = ConversionWebhookHandler;
