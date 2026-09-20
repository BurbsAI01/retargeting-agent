const twilio = require('twilio');

class SmsDispatcher {
  constructor(pool) {
    this.pool = pool;
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  async dispatch(campaign, modifications) {
    try {
      const { phone, first_name } = campaign;
      const recommendation = campaign.agent_recommendation;
      const discountPercent = modifications.discount_percent || recommendation.suggested_discount_percent || 10;

      if (!phone) {
        return { success: false, error: 'No phone number' };
      }

      if (!this.client || !this.fromPhoneNumber) {
        return { success: false, error: 'Twilio not configured' };
      }

      const recoveryLink = await this.getRecoveryLink(campaign.id);
      const message = this.buildSmsMessage(
        first_name,
        discountPercent,
        recoveryLink
      );

      const result = await this.client.messages.create({
        body: message,
        from: this.fromPhoneNumber,
        to: phone,
      });

      console.log(`SMS sent to ${phone}:`, result.sid);

      return {
        success: true,
        message_id: result.sid,
        recipient: phone,
        body: message,
      };
    } catch (error) {
      console.error('SMS dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async getRecoveryLink(campaignId) {
    const result = await this.pool.query(
      `SELECT recovery_token FROM quote_recovery_links
       WHERE campaign_id = $1
       LIMIT 1`,
      [campaignId]
    );

    if (result.rows.length > 0) {
      const token = result.rows[0].recovery_token;
      const baseUrl = process.env.APP_URL || 'https://app.example.com';
      // Use a short URL service if available, or create a tinyurl-style redirect
      return `${baseUrl}/r/${token}`;
    }

    return `${process.env.APP_URL || 'https://app.example.com'}/q/${campaignId}`;
  }

  buildSmsMessage(firstName, discountPercent, recoveryLink) {
    const greeting = firstName ? `Hi ${firstName}!` : 'Hi there!';

    return `${greeting} We noticed you didn't complete your quote. Get ${discountPercent}% off now! ${recoveryLink}`;
  }
}

module.exports = SmsDispatcher;
