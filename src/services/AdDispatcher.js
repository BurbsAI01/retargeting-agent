const axios = require('axios');

class AdDispatcher {
  constructor(pool) {
    this.pool = pool;
  }

  async dispatchFacebook(campaign, modifications) {
    try {
      if (!process.env.FACEBOOK_PIXEL_ID || !process.env.FACEBOOK_ACCESS_TOKEN) {
        return { success: false, error: 'Facebook not configured' };
      }

      const { email, first_name } = campaign;
      const recommendation = campaign.agent_recommendation;
      const discountPercent = modifications.discount_percent || recommendation.suggested_discount_percent || 10;
      const recoveryLink = await this.getRecoveryLink(campaign.id);

      // Track custom event via Facebook Conversions API
      const pixelData = {
        data: [
          {
            event_name: 'Lead',
            event_time: Math.floor(Date.now() / 1000),
            user_data: {
              em: email ? this.hashEmail(email) : undefined,
              fn: first_name ? this.hashString(first_name) : undefined,
            },
            custom_data: {
              value: discountPercent,
              currency: 'USD',
              content_name: `${discountPercent}% Discount Offer`,
              content_type: 'product',
              contents: [
                {
                  id: campaign.quote_id,
                  quantity: 1,
                  delivery_category: 'home_delivery',
                },
              ],
            },
            event_id: `campaign_${campaign.id}_${Date.now()}`,
          },
        ],
        access_token: process.env.FACEBOOK_ACCESS_TOKEN,
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PIXEL_ID}/events`,
        pixelData
      );

      // Also create custom audience segment for retargeting
      await this.createFacebookAudience(email, campaign, discountPercent, recoveryLink);

      console.log(`Facebook event tracked for ${email}:`, response.data);

      return {
        success: true,
        platform: 'facebook',
        event_id: pixelData.data[0].event_id,
        user_email: email,
        discount: discountPercent,
      };
    } catch (error) {
      console.error('Facebook dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async dispatchGoogleAds(campaign, modifications) {
    try {
      if (!process.env.GOOGLE_ADS_API_KEY || !process.env.GOOGLE_CONVERSION_ID) {
        return { success: false, error: 'Google Ads not configured' };
      }

      const { email, first_name } = campaign;
      const recommendation = campaign.agent_recommendation;
      const discountPercent = modifications.discount_percent || recommendation.suggested_discount_percent || 10;
      const recoveryLink = await this.getRecoveryLink(campaign.id);

      // Track conversion via Google Ads conversion tracking
      const conversionData = {
        conversion_id: process.env.GOOGLE_CONVERSION_ID,
        conversion_label: process.env.GOOGLE_CONVERSION_LABEL || 'retargeting',
        value: discountPercent,
        currency: 'USD',
        order_id: `campaign_${campaign.id}`,
      };

      // Send to Google's conversion tracking endpoint
      const gtagUrl = 'https://www.google-analytics.com/collect?v=1&t=event' +
        `&tid=${process.env.GOOGLE_TRACKING_ID}` +
        `&cid=${this.hashEmail(email)}` +
        '&ec=engagement&ea=retargeting_offer' +
        `&el=${discountPercent}%_discount`;

      await axios.get(gtagUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RetargetingAgent/1.0)',
        },
      });

      // Also add to Google Ads audience for retargeting
      await this.createGoogleAdsAudience(email, campaign, discountPercent);

      console.log(`Google Ads conversion tracked for ${email}`);

      return {
        success: true,
        platform: 'google_ads',
        conversion_id: process.env.GOOGLE_CONVERSION_ID,
        user_email: email,
        discount: discountPercent,
      };
    } catch (error) {
      console.error('Google Ads dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async dispatchLinkedIn(campaign, modifications) {
    try {
      if (!process.env.LINKEDIN_INSIGHT_TAG || !process.env.LINKEDIN_ACCESS_TOKEN) {
        return { success: false, error: 'LinkedIn not configured' };
      }

      const { email, first_name, company_name } = campaign;
      const recommendation = campaign.agent_recommendation;
      const discountPercent = modifications.discount_percent || recommendation.suggested_discount_percent || 10;
      const recoveryLink = await this.getRecoveryLink(campaign.id);

      // Track event via LinkedIn Insight Tag
      const linkedinEvent = {
        sr: 1, // Search results page
        redir: recoveryLink,
        pa: 'pageView', // Page action type
        pid: process.env.LINKEDIN_INSIGHT_TAG,
        reclaim: true,
      };

      // Create LinkedIn audience segment
      await this.createLinkedInAudience(email, first_name, company_name, campaign, discountPercent);

      console.log(`LinkedIn audience segment created for ${email} at ${company_name}`);

      return {
        success: true,
        platform: 'linkedin',
        insight_tag: process.env.LINKEDIN_INSIGHT_TAG,
        user_email: email,
        company: company_name,
        discount: discountPercent,
      };
    } catch (error) {
      console.error('LinkedIn dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async createFacebookAudience(email, campaign, discountPercent, recoveryLink) {
    try {
      if (!process.env.FACEBOOK_AUDIENCE_ID || !process.env.FACEBOOK_ACCESS_TOKEN) {
        return;
      }

      const payload = {
        schema: ['EMAIL'],
        data: [[this.hashEmail(email)]],
      };

      // Add user to custom audience for retargeting
      await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_AUDIENCE_ID}/users`,
        payload,
        {
          params: { access_token: process.env.FACEBOOK_ACCESS_TOKEN },
        }
      );

      console.log(`User added to Facebook audience: ${email}`);
    } catch (error) {
      console.error('Facebook audience error:', error.message);
    }
  }

  async createGoogleAdsAudience(email, campaign, discountPercent) {
    try {
      if (!process.env.GOOGLE_ADS_CUSTOMER_ID || !process.env.GOOGLE_ADS_API_KEY) {
        return;
      }

      // This would use Google Ads API (google-ads-node) to add to audience
      // For now, we'll log it as a placeholder for integration
      console.log(`Google Ads: Queue user ${email} for audience segment`);
    } catch (error) {
      console.error('Google Ads audience error:', error.message);
    }
  }

  async createLinkedInAudience(email, firstName, company, campaign, discountPercent) {
    try {
      if (!process.env.LINKEDIN_ACCESS_TOKEN) {
        return;
      }

      // This would use LinkedIn Campaign Manager API to create/update audience
      // For now, we'll log it as a placeholder for integration
      console.log(`LinkedIn: Queue user ${email} at ${company} for audience segment`);
    } catch (error) {
      console.error('LinkedIn audience error:', error.message);
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
      return `${process.env.APP_URL || 'https://app.example.com'}/recover/${token}`;
    }

    return `${process.env.APP_URL || 'https://app.example.com'}/q/${campaignId}`;
  }

  hashEmail(email) {
    if (!email) return null;
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }

  hashString(str) {
    if (!str) return null;
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(str.toLowerCase().trim())
      .digest('hex');
  }
}

module.exports = AdDispatcher;
