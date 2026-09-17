const twilio = require('twilio');

class SMSChannel {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  /**
   * Send retargeting SMS
   */
  async send(campaign, visitor, copy) {
    try {
      if (!visitor.phone) {
        throw new Error('No phone number provided');
      }

      const message = await this.client.messages.create({
        body: copy.sms_message,
        from: this.phoneNumber,
        to: visitor.phone,
      });

      return {
        success: true,
        messageId: message.sid,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('SMS send error:', error);
      throw error;
    }
  }

  /**
   * Handle webhook from Twilio (delivery, read events)
   */
  static async handleWebhook(event) {
    const { MessageSid, MessageStatus, To } = event;

    const statusMap = {
      queued: 'queued',
      sending: 'sending',
      sent: 'sent',
      delivered: 'delivered',
      failed: 'failed',
      undelivered: 'undelivered',
      received: 'received',
    };

    return {
      channel: 'sms',
      message_id: MessageSid,
      action: statusMap[MessageStatus] || MessageStatus,
      timestamp: new Date(),
      metadata: { phone: To },
    };
  }
}

module.exports = SMSChannel;
