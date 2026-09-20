const crypto = require('crypto');

class MailgunWebhookHandler {
  constructor(pool) {
    this.pool = pool;
    this.signingKey = process.env.MAILGUN_SIGNING_KEY;
  }

  /**
   * Verify Mailgun webhook signature
   * Mailgun sends: timestamp, token, signature
   */
  verifySignature(timestamp, token, signature) {
    if (!this.signingKey) {
      console.warn('MAILGUN_SIGNING_KEY not configured, skipping signature verification');
      return true;
    }

    const data = `${timestamp}${token}`;
    const hash = crypto
      .createHmac('sha256', this.signingKey)
      .update(data)
      .digest('hex');

    return hash === signature;
  }

  async handleWebhook(event, eventData) {
    try {
      const { message } = eventData;
      if (!message) {
        console.warn('No message ID in webhook, skipping');
        return { success: false, reason: 'No message ID' };
      }

      switch (event) {
        case 'delivered':
          return this.handleDelivered(message, eventData);
        case 'opened':
          return this.handleOpened(message, eventData);
        case 'clicked':
          return this.handleClicked(message, eventData);
        case 'failed':
          return this.handleFailed(message, eventData);
        case 'unsubscribed':
          return this.handleUnsubscribed(message, eventData);
        case 'complained':
          return this.handleComplained(message, eventData);
        default:
          console.log(`Unhandled Mailgun event: ${event}`);
          return { success: false, reason: `Unhandled event: ${event}` };
      }
    } catch (error) {
      console.error('Mailgun webhook error:', error);
      throw error;
    }
  }

  async handleDelivered(messageId, eventData) {
    const { recipient } = eventData;

    await this.pool.query(
      `UPDATE campaign_performance
       SET total_delivered = total_delivered + 1,
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'email'
       AND campaign_id IN (
         SELECT campaign_id FROM quote_recovery_links
         WHERE campaign_id IS NOT NULL
       )`,
      []
    );

    await this.logEngagementEvent('email_delivered', messageId, recipient, eventData);

    console.log(`Email delivered to ${recipient}`);
    return { success: true, event: 'delivered', recipient };
  }

  async handleOpened(messageId, eventData) {
    const { recipient } = eventData;

    await this.pool.query(
      `UPDATE campaign_performance
       SET total_opened = total_opened + 1,
           engagement_rate = ROUND((total_opened::decimal / NULLIF(total_sent, 0)) * 100, 2),
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'email'`,
      []
    );

    await this.logEngagementEvent('email_opened', messageId, recipient, eventData);

    console.log(`Email opened by ${recipient}`);
    return { success: true, event: 'opened', recipient };
  }

  async handleClicked(messageId, eventData) {
    const { recipient, url } = eventData;

    // Check if click is on recovery link
    const isRecoveryLink = url && url.includes('/recover/');

    await this.pool.query(
      `UPDATE campaign_performance
       SET total_clicked = total_clicked + 1,
           engagement_rate = ROUND((total_clicked::decimal / NULLIF(total_sent, 0)) * 100, 2),
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'email'`,
      []
    );

    await this.logEngagementEvent('email_clicked', messageId, recipient, {
      ...eventData,
      url,
      is_recovery_link: isRecoveryLink,
    });

    console.log(`Email clicked by ${recipient} - URL: ${url}`);
    return { success: true, event: 'clicked', recipient, url, isRecoveryLink };
  }

  async handleFailed(messageId, eventData) {
    const { recipient, reason, description } = eventData;

    await this.logEngagementEvent('email_failed', messageId, recipient, {
      reason,
      description,
      failure_code: eventData.code,
    });

    console.error(`Email failed to ${recipient}: ${reason}`);
    return { success: true, event: 'failed', recipient, reason };
  }

  async handleUnsubscribed(messageId, eventData) {
    const { recipient } = eventData;

    // Mark visitor as unsubscribed
    await this.pool.query(
      `UPDATE visitors
       SET unsubscribed_from_email = true,
           unsubscribed_at = CURRENT_TIMESTAMP
       WHERE email = $1`,
      [recipient]
    );

    await this.logEngagementEvent('email_unsubscribed', messageId, recipient, eventData);

    console.log(`Email unsubscribed: ${recipient}`);
    return { success: true, event: 'unsubscribed', recipient };
  }

  async handleComplained(messageId, eventData) {
    const { recipient } = eventData;

    // Mark recipient as having complained
    await this.logEngagementEvent('email_complained', messageId, recipient, {
      ...eventData,
      severity: 'high',
    });

    console.warn(`Email complaint from ${recipient}`);
    return { success: true, event: 'complained', recipient };
  }

  async logEngagementEvent(action, messageId, recipient, eventData) {
    try {
      // Try to find associated campaign via recovery link
      const result = await this.pool.query(
        `SELECT c.id as campaign_id, c.visitor_id
         FROM retargeting_campaigns c
         WHERE c.id IN (
           SELECT campaign_id FROM quote_recovery_links
           WHERE campaign_id IS NOT NULL
         )
         LIMIT 1`,
        []
      );

      if (result.rows.length > 0) {
        const { campaign_id, visitor_id } = result.rows[0];

        await this.pool.query(
          `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
           VALUES ($1, $2, 'email', $3, $4)`,
          [
            visitor_id,
            campaign_id,
            action,
            JSON.stringify({
              message_id: messageId,
              recipient,
              timestamp: new Date().toISOString(),
              ...eventData,
            }),
          ]
        );
      }
    } catch (error) {
      console.error('Error logging engagement event:', error);
    }
  }
}

module.exports = MailgunWebhookHandler;
