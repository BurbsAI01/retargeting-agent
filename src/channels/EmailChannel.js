const sgMail = require('@sendgrid/mail');

class EmailChannel {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  /**
   * Send retargeting email
   */
  async send(campaign, visitor, copy) {
    try {
      const msg = {
        to: visitor.email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: process.env.SENDGRID_FROM_NAME,
        },
        subject: copy.email_subject,
        html: this._generateEmailHtml(copy, campaign),
        text: copy.email_body,
        trackingSettings: {
          clickTracking: {
            enable: true,
            enableText: false,
          },
          openTracking: {
            enable: true,
          },
        },
        customHeaders: {
          'X-Campaign-ID': campaign.id,
          'X-Visitor-ID': visitor.id,
        },
      };

      const response = await sgMail.send(msg);
      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  /**
   * Generate HTML email template
   */
  _generateEmailHtml(copy, campaign) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
    .body { line-height: 1.6; margin-bottom: 20px; }
    .quote-recap { background: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; }
    .cta-button {
      display: inline-block;
      background: #007bff;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
      font-weight: bold;
    }
    .footer { font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 40px; }
    .unsubscribe { font-size: 11px; color: #ccc; text-align: center; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${copy.email_subject}</div>

    <div class="body">
      ${copy.email_body.split('\n').map((line) => `<p>${line}</p>`).join('')}
    </div>

    <div class="quote-recap">
      <strong>Your Quote Summary:</strong><br>
      Service: ${campaign.quote_details?.service}<br>
      Duration: ${campaign.quote_details?.duration}<br>
      Price: $${campaign.quote_details?.base_price}
    </div>

    <a href="${campaign.quote_url_tracking}" class="cta-button">View Your Personalized Quote</a>

    <div class="footer">
      <p>This offer is valid for 48 hours. Don't miss out on this opportunity!</p>
    </div>

    <div class="unsubscribe">
      <a href="[unsubscribe-link]">Unsubscribe</a>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Handle webhook from SendGrid (delivery, open, click events)
   */
  static async handleWebhook(event) {
    const { email, event: eventType, campaign_id, visitor_id } = event;

    return {
      channel: 'email',
      visitor_id,
      campaign_id,
      action: eventType, // 'delivered', 'opened', 'clicked', 'bounced'
      timestamp: new Date(),
      metadata: { email },
    };
  }
}

module.exports = EmailChannel;
