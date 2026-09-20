const mailgun = require('node-mailgun').client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
});

class EmailDispatcher {
  constructor(pool) {
    this.pool = pool;
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@retargeting.app';
    this.fromName = process.env.FROM_NAME || 'Retargeting Team';
  }

  async dispatch(campaign, modifications) {
    try {
      const { email, first_name, company_name } = campaign;
      const recommendation = campaign.agent_recommendation;
      const copyVariant = modifications.copy_overrides || recommendation.copy_variants[0];

      if (!email) {
        return { success: false, error: 'No email address' };
      }

      const recoveryLink = await this.getRecoveryLink(campaign.id);
      const subject = copyVariant.subject || 'Your Quote is Waiting - Special Offer Inside';
      const discountPercent = modifications.discount_percent || recommendation.suggested_discount_percent || 10;

      const htmlBody = this.buildEmailBody(
        copyVariant,
        campaign,
        recoveryLink,
        discountPercent,
        first_name
      );

      const mailgunData = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: email,
        subject: subject,
        html: htmlBody,
        'h:Reply-To': process.env.REPLY_TO_EMAIL || this.fromEmail,
        tracking: 'yes',
        'tracking-clicks': 'yes',
        'tracking-opens': 'yes',
      };

      // Use callback-based API since node-mailgun uses callbacks
      return new Promise((resolve, reject) => {
        mailgun.messages().send(mailgunData, (err, body) => {
          if (err) {
            console.error('Mailgun error:', err);
            resolve({ success: false, error: err.message });
          } else {
            console.log(`Email sent to ${email}:`, body.id);
            resolve({
              success: true,
              message_id: body.id,
              recipient: email,
              subject: subject,
            });
          }
        });
      });
    } catch (error) {
      console.error('Email dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async getRecoveryLink(campaignId) {
    const result = await this.pool.query(
      `SELECT recovery_url, recovery_token FROM quote_recovery_links
       WHERE campaign_id = $1
       LIMIT 1`,
      [campaignId]
    );

    if (result.rows.length > 0) {
      const token = result.rows[0].recovery_token;
      return `${process.env.APP_URL || 'https://app.example.com'}/recover/${token}`;
    }

    return `${process.env.APP_URL || 'https://app.example.com'}/quotes/${campaignId}`;
  }

  buildEmailBody(copyVariant, campaign, recoveryLink, discountPercent, firstName) {
    const { quote_details } = campaign;
    let quoteAmount = 'your quote';

    try {
      if (quote_details && typeof quote_details === 'object') {
        quoteAmount = `$${quote_details.total || quote_details.amount || 'your'}`;
      } else if (typeof quote_details === 'string') {
        const parsed = JSON.parse(quote_details);
        quoteAmount = `$${parsed.total || parsed.amount || 'your'}`;
      }
    } catch (e) {
      // Leave default
    }

    const preview = copyVariant.preview_text || 'We miss you!';
    const subject = copyVariant.subject || 'Your Quote + Special Offer';
    const body = copyVariant.body || `We noticed you generated a quote but didn't complete your purchase.`;
    const cta = copyVariant.cta_text || 'Claim Your Offer';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f8f9fa; padding: 20px; border-radius: 4px 4px 0 0; }
    .content { background-color: #fff; padding: 30px; border: 1px solid #e0e0e0; }
    .footer { background-color: #f8f9fa; padding: 15px; border-radius: 0 0 4px 4px; font-size: 12px; color: #666; }
    .discount-badge { background-color: #dc3545; color: white; padding: 10px 15px; border-radius: 4px; display: inline-block; font-weight: bold; margin: 15px 0; }
    .button { display: inline-block; padding: 12px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
    .quote-amount { font-size: 24px; font-weight: bold; color: #007bff; }
    h1 { color: #333; margin-bottom: 10px; }
    .divider { border-top: 1px solid #e0e0e0; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Hi ${firstName || 'there'}!</h1>
      <p style="margin: 0; color: #666;">${preview}</p>
    </div>

    <div class="content">
      <p>${body}</p>

      <p>We've prepared a special offer just for you:</p>

      <div class="discount-badge">${discountPercent}% Off</div>

      <p>Your original quote: <span class="quote-amount">${quoteAmount}</span></p>

      <p><strong>Don't miss out on this limited-time offer.</strong> Complete your purchase now and get ${discountPercent}% off.</p>

      <center>
        <a href="${recoveryLink}" class="button">${cta}</a>
      </center>

      <div class="divider"></div>

      <p style="font-size: 14px; color: #666;">
        If you have any questions, please reach out to us. We're here to help!
      </p>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Retargeting Team. All rights reserved.</p>
      <p>You received this email because you generated a quote on our platform.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

module.exports = EmailDispatcher;
