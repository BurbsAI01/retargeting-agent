const crypto = require('crypto');

class TwilioWebhookHandler {
  constructor(pool) {
    this.pool = pool;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
  }

  /**
   * Verify Twilio webhook signature
   * Twilio uses HMAC-SHA1 with the Twilio auth token
   */
  verifySignature(url, params, signature) {
    if (!this.authToken) {
      console.warn('TWILIO_AUTH_TOKEN not configured, skipping signature verification');
      return true;
    }

    // Build the data to hash: URL + all parameters in alphabetical order
    const data = url + Object.keys(params)
      .sort()
      .map(key => key + params[key])
      .join('');

    const hash = crypto
      .createHmac('sha1', this.authToken)
      .update(data)
      .digest('base64');

    return hash === signature;
  }

  async handleWebhook(messageData) {
    try {
      const { MessageSid, To, From, MessageStatus } = messageData;

      if (!MessageSid) {
        console.warn('No MessageSid in webhook');
        return { success: false, reason: 'No MessageSid' };
      }

      switch (MessageStatus) {
        case 'delivered':
          return this.handleDelivered(MessageSid, To, From, messageData);
        case 'failed':
          return this.handleFailed(MessageSid, To, From, messageData);
        case 'undelivered':
          return this.handleUndelivered(MessageSid, To, From, messageData);
        case 'sent':
          // Interim status, log but don't update metrics
          return this.handleSent(MessageSid, To, From, messageData);
        case 'queued':
        case 'sending':
          // Interim statuses, skip
          return { success: true, event: 'interim', status: MessageStatus };
        default:
          console.log(`Unhandled Twilio SMS status: ${MessageStatus}`);
          return { success: false, reason: `Unknown status: ${MessageStatus}` };
      }
    } catch (error) {
      console.error('Twilio webhook error:', error);
      throw error;
    }
  }

  async handleDelivered(messageSid, to, from, messageData) {
    // Update campaign performance
    await this.pool.query(
      `UPDATE campaign_performance
       SET total_delivered = total_delivered + 1,
           calculated_at = CURRENT_TIMESTAMP
       WHERE channel = 'sms'`,
      []
    );

    // Log engagement event
    await this.logEngagementEvent('sms_delivered', messageSid, to, messageData);

    console.log(`SMS delivered to ${to}`);
    return { success: true, event: 'delivered', recipient: to };
  }

  async handleFailed(messageSid, to, from, messageData) {
    const { ErrorCode, ErrorMessage } = messageData;

    await this.logEngagementEvent('sms_failed', messageSid, to, {
      error_code: ErrorCode,
      error_message: ErrorMessage,
      reason: 'delivery_failed',
    });

    console.error(`SMS failed to ${to}: ${ErrorMessage} (${ErrorCode})`);
    return {
      success: true,
      event: 'failed',
      recipient: to,
      error: ErrorMessage,
    };
  }

  async handleUndelivered(messageSid, to, from, messageData) {
    const { ErrorCode, ErrorMessage } = messageData;

    await this.logEngagementEvent('sms_undelivered', messageSid, to, {
      error_code: ErrorCode,
      error_message: ErrorMessage,
      reason: 'undelivered',
    });

    console.error(`SMS undelivered to ${to}: ${ErrorMessage}`);
    return {
      success: true,
      event: 'undelivered',
      recipient: to,
      error: ErrorMessage,
    };
  }

  async handleSent(messageSid, to, from, messageData) {
    // Just log for tracking, don't update delivery metrics yet
    console.log(`SMS sent to ${to}`);
    return { success: true, event: 'sent', recipient: to };
  }

  async logEngagementEvent(action, messageSid, recipient, messageData) {
    try {
      // Try to find associated campaign
      const result = await this.pool.query(
        `SELECT c.id as campaign_id, c.visitor_id
         FROM retargeting_campaigns c
         JOIN visitors v ON c.visitor_id = v.id
         WHERE v.phone = $1
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [recipient]
      );

      if (result.rows.length > 0) {
        const { campaign_id, visitor_id } = result.rows[0];

        await this.pool.query(
          `INSERT INTO engagement_log (visitor_id, campaign_id, channel, action, metadata)
           VALUES ($1, $2, 'sms', $3, $4)`,
          [
            visitor_id,
            campaign_id,
            action,
            JSON.stringify({
              message_sid: messageSid,
              recipient,
              timestamp: new Date().toISOString(),
              ...messageData,
            }),
          ]
        );
      } else {
        console.warn(`No campaign found for SMS recipient: ${recipient}`);
      }
    } catch (error) {
      console.error('Error logging SMS engagement event:', error);
    }
  }
}

module.exports = TwilioWebhookHandler;
