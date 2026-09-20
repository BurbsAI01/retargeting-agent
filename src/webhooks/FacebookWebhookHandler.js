const crypto = require('crypto');

class FacebookWebhookHandler {
  constructor(pool) {
    this.pool = pool;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
    this.verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
  }

  /**
   * Verify Facebook webhook signature
   * Facebook uses HMAC-SHA256 with the app secret
   */
  verifySignature(body, signature) {
    if (!this.appSecret) {
      console.warn('FACEBOOK_APP_SECRET not configured, skipping signature verification');
      return true;
    }

    const hash = crypto
      .createHmac('sha256', this.appSecret)
      .update(body)
      .digest('hex');

    return `sha256=${hash}` === signature;
  }

  /**
   * Handle Facebook webhook verification challenge
   */
  verifyToken(token) {
    return token === this.verifyToken;
  }

  async handleWebhook(entry) {
    try {
      const { id: pixelId, data } = entry;

      // data is an array of events
      if (!Array.isArray(data)) {
        console.warn('No data in Facebook webhook entry');
        return { success: false, reason: 'No data' };
      }

      const results = [];

      for (const event of data) {
        try {
          const result = await this.handleEvent(event, pixelId);
          results.push(result);
        } catch (error) {
          console.error('Error handling Facebook event:', error);
          results.push({ success: false, error: error.message });
        }
      }

      return { success: true, events_processed: results.length, results };
    } catch (error) {
      console.error('Facebook webhook error:', error);
      throw error;
    }
  }

  async handleEvent(event, pixelId) {
    const { event_name, event_id, user_data, custom_data, event_time } = event;

    switch (event_name) {
      case 'Lead':
        return this.handleLead(event_id, user_data, custom_data, event_time);
      case 'Purchase':
        return this.handlePurchase(event_id, user_data, custom_data, event_time);
      case 'ViewContent':
        return this.handleViewContent(event_id, user_data, custom_data, event_time);
      case 'AddToCart':
        return this.handleAddToCart(event_id, user_data, custom_data, event_time);
      default:
        console.log(`Unhandled Facebook event: ${event_name}`);
        return { success: false, reason: `Unhandled event: ${event_name}` };
    }
  }

  async handleLead(eventId, userData, customData, eventTime) {
    const { em: emailHash, fn: firstNameHash } = userData || {};
    const { value, currency, content_name } = customData || {};

    // Try to find visitor by email (we don't have the hash key, so this is best effort)
    await this.logConversionEvent('facebook_lead', eventId, emailHash, {
      value,
      currency,
      content_name,
      timestamp: new Date(eventTime * 1000).toISOString(),
    });

    console.log(`Facebook Lead event: ${eventId}, value: ${value}`);
    return { success: true, event: 'lead', event_id: eventId, value };
  }

  async handlePurchase(eventId, userData, customData, eventTime) {
    const { em: emailHash } = userData || {};
    const { value, currency, contents } = customData || {};

    // Update campaign performance with conversion
    await this.pool.query(
      `UPDATE campaign_performance
       SET total_converted = total_converted + 1,
           revenue_impact = revenue_impact + COALESCE($1::decimal, 0),
           conversion_rate = ROUND((total_converted + 1)::decimal / NULLIF(total_sent, 0) * 100, 2),
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'facebook'`,
      [value || 0]
    );

    await this.logConversionEvent('facebook_purchase', eventId, emailHash, {
      value,
      currency,
      contents,
      timestamp: new Date(eventTime * 1000).toISOString(),
    });

    console.log(`Facebook Purchase event: ${eventId}, value: ${value}`);
    return { success: true, event: 'purchase', event_id: eventId, value };
  }

  async handleViewContent(eventId, userData, customData, eventTime) {
    const { em: emailHash } = userData || {};
    const { content_id, content_name } = customData || {};

    await this.logConversionEvent('facebook_view_content', eventId, emailHash, {
      content_id,
      content_name,
      timestamp: new Date(eventTime * 1000).toISOString(),
    });

    console.log(`Facebook ViewContent event: ${eventId}`);
    return { success: true, event: 'view_content', event_id: eventId };
  }

  async handleAddToCart(eventId, userData, customData, eventTime) {
    const { em: emailHash } = userData || {};
    const { value, currency } = customData || {};

    await this.pool.query(
      `UPDATE campaign_performance
       SET total_clicked = total_clicked + 1,
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'facebook'`,
      []
    );

    await this.logConversionEvent('facebook_add_to_cart', eventId, emailHash, {
      value,
      currency,
      timestamp: new Date(eventTime * 1000).toISOString(),
    });

    console.log(`Facebook AddToCart event: ${eventId}`);
    return { success: true, event: 'add_to_cart', event_id: eventId };
  }

  async logConversionEvent(action, eventId, emailHash, metadata) {
    try {
      // Since we have only email hash from Facebook, we can only log the event
      // without direct campaign linkage. In production, you'd maintain a mapping
      // of email -> campaign for accurate attribution.

      // Try to find campaign by recent timestamp
      const result = await this.pool.query(
        `SELECT c.id as campaign_id, c.visitor_id
         FROM retargeting_campaigns c
         WHERE c.campaign_status = 'dispatched'
         ORDER BY c.dispatched_at DESC
         LIMIT 1`,
        []
      );

      if (result.rows.length > 0) {
        const { campaign_id, visitor_id } = result.rows[0];

        await this.pool.query(
          `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
           VALUES ($1, $2, 'facebook', $3, $4)`,
          [
            visitor_id,
            campaign_id,
            action,
            JSON.stringify({
              event_id: eventId,
              email_hash: emailHash,
              ...metadata,
            }),
          ]
        );
      }
    } catch (error) {
      console.error('Error logging Facebook conversion event:', error);
    }
  }
}

module.exports = FacebookWebhookHandler;
