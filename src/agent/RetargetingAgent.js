const Anthropic = require('@anthropic-ai/sdk');

class RetargetingAgent {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Calculate lead temperature score (0-100)
   */
  calculateLeadTemperature(visitor, quote, context) {
    let score = 50;

    // Time decay
    const daysSinceQuote = Math.floor(
      (Date.now() - new Date(quote.generated_at)) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceQuote < 1) {
      score += 25;
    } else if (daysSinceQuote < 3) {
      score += 15;
    } else if (daysSinceQuote < 7) {
      score += 5;
    } else {
      score -= 10;
    }

    // Engagement signals
    const pagesVisited = context.pages_visited?.length || 0;
    if (pagesVisited > 5) score += 15;
    if (context.pages_visited?.includes('case_studies')) score += 10;
    if (context.pages_visited?.includes('pricing')) score += 10;
    if (context.interacted_with_chat) score += 5;

    // Intent signals
    const quoteAmount = quote.quote_details?.base_price || 0;
    if (quoteAmount > 5000) score += 10;
    if (visitor.company_name) score += 5;
    if (visitor.phone) score += 5;

    // Clamp score
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify lead temperature
   */
  classifyTemperature(score) {
    if (score > 75) return 'hot';
    if (score > 40) return 'warm';
    return 'cold';
  }

  /**
   * Select eligible channels based on visitor data
   */
  selectChannels(visitor, config) {
    const channels = ['email']; // Always include email

    if (visitor.phone && config.enable_sms) {
      channels.push('sms');
    }

    // Add more channels based on config
    if (config.enable_facebook && visitor.facebook_id) {
      channels.push('facebook');
    }

    if (config.enable_google_ads) {
      channels.push('google_ads');
    }

    if (config.enable_linkedin && visitor.company_name) {
      channels.push('linkedin');
    }

    return channels;
  }

  /**
   * Calculate discount based on lead temperature and rules
   */
  calculateDiscount(temperature, daysSinceQuote, maxDiscount) {
    const temperatureAdjustment = {
      hot: -5,
      warm: 0,
      cold: 3,
    };

    const timeDecay = {
      '<1': 0,
      '1-3': 2,
      '3-7': 4,
      '>7': 6,
    };

    let discount = 5; // Base discount
    discount += temperatureAdjustment[temperature] || 0;

    if (daysSinceQuote < 1) {
      discount += timeDecay['<1'];
    } else if (daysSinceQuote < 3) {
      discount += timeDecay['1-3'];
    } else if (daysSinceQuote < 7) {
      discount += timeDecay['3-7'];
    } else {
      discount += timeDecay['>7'];
    }

    return Math.min(discount, maxDiscount);
  }

  /**
   * Generate personalized copy using Claude API
   */
  async generatePersonalizedCopy(visitor, quote, context) {
    const prompt = `You are a retargeting specialist. Generate personalized, channel-specific copy for someone who viewed a quote but didn't convert.

Lead Information:
- Name: ${visitor.first_name}
- Company: ${visitor.company_name}
- Lead Temperature: ${context.temperature}
- Days Since Quote: ${context.daysSinceQuote}
- Service Viewed: ${quote.quote_details?.service}
- Original Price: $${quote.quote_details?.base_price}
- Discount Offered: ${context.discount_percent}%

Requirements:
1. Email subject (max 50 chars): Personalize with name/company
2. Email body (150-200 words): Recap quote, highlight benefits, mention discount with urgency
3. SMS message (max 160 chars): Concise offer + urgency + link placeholder
4. Facebook headline (max 30 chars): Benefit-focused
5. Facebook description (max 90 chars): Problem + solution + CTA
6. LinkedIn headline: Professional tone, ROI-focused

Return as valid JSON with keys: email_subject, email_body, sms_message, facebook_headline, facebook_description, linkedin_headline

Make messaging authentic and specific to their situation.`;

    try {
      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText = message.content[0].text;

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to parse Claude response as JSON');
    } catch (error) {
      console.error('Error generating personalized copy:', error);
      throw error;
    }
  }

  /**
   * Generate complete retargeting campaign recommendation
   */
  async generateCampaignRecommendation(visitor, quote, context, operatorConfig) {
    const temperature = this.classifyTemperature(context.temperatureScore);
    const channels = this.selectChannels(visitor, operatorConfig);
    const daysSinceQuote = context.daysSinceQuote;
    const discount = this.calculateDiscount(
      temperature,
      daysSinceQuote,
      operatorConfig.max_discount_percent
    );

    // Generate personalized copy
    const copy = await this.generatePersonalizedCopy(visitor, quote, {
      temperature,
      daysSinceQuote,
      discount_percent: discount,
    });

    // Determine if approval is required
    const approvalRequired =
      discount > operatorConfig.require_approval_for_discount_above_percent;

    return {
      lead_temperature: temperature,
      temperature_score: context.temperatureScore,
      reasoning: `Lead has been inactive for ${daysSinceQuote} days with engagement score of ${context.temperatureScore}/100.`,
      channels,
      suggested_discount_percent: discount,
      copy,
      quote_url_tracking: this.buildTrackingUrl(
        quote.quote_url,
        context.campaign_id
      ),
      approval_required: approvalRequired,
      notes: this._generateNotes(temperature, daysSinceQuote, discount),
    };
  }

  /**
   * Build tracking URL with UTM parameters
   */
  buildTrackingUrl(baseUrl, campaignId) {
    const url = new URL(baseUrl);
    url.searchParams.set('utm_source', 'retarget');
    url.searchParams.set('utm_campaign', campaignId);
    url.searchParams.set('utm_medium', 'email');
    return url.toString();
  }

  /**
   * Generate human-readable notes for operator
   */
  _generateNotes(temperature, daysSinceQuote, discount) {
    const notes = [];

    if (temperature === 'hot') {
      notes.push('Hot lead - quick response window. Minimal discount needed.');
    } else if (temperature === 'warm') {
      notes.push('Warm lead - personalized follow-up recommended.');
    } else {
      notes.push('Cold lead - may need stronger incentive to convert.');
    }

    if (daysSinceQuote > 7) {
      notes.push(`${daysSinceQuote} days since quote - consider fresh offer.`);
    }

    if (discount > 10) {
      notes.push(`${discount}% discount offered - verify margin impact.`);
    }

    return notes.join(' ');
  }
}

module.exports = RetargetingAgent;
