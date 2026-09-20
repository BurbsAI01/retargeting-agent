const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');

class RetargetingAgent {
  constructor(db = null) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.db = db; // Optional database connection for behavior analysis
  }

  /**
   * Analyze visitor behavior to understand their interests and objections
   */
  async analyzeBehavior(visitorId, behaviorEvents = []) {
    const analysis = {
      most_viewed_sections: {},
      total_time_on_site: 0,
      pages_visited: [],
      scroll_depth: {},
      price_sensitivity: false,
      feature_interest: [],
      objection_signals: [],
      engagement_level: 'low',
    };

    for (const event of behaviorEvents) {
      if (event.event_type === 'page_view') {
        analysis.pages_visited.push(event.page_url);
        analysis.most_viewed_sections[event.section] =
          (analysis.most_viewed_sections[event.section] || 0) + 1;
      }
      if (event.event_type === 'scroll') {
        analysis.scroll_depth[event.page_url] = event.scroll_depth_percent;
      }
      if (event.event_type === 'time_spent') {
        analysis.total_time_on_site += event.duration_seconds || 0;
      }
    }

    // Detect price sensitivity (revisiting pricing page multiple times)
    const pricingPageVisits = behaviorEvents.filter(
      (e) => e.section === 'pricing'
    ).length;
    if (pricingPageVisits > 2) {
      analysis.price_sensitivity = true;
      analysis.objection_signals.push('price_concern');
    }

    // Detect feature interest
    if (analysis.most_viewed_sections['features'] > 0) {
      analysis.feature_interest.push('features');
    }
    if (analysis.most_viewed_sections['integrations'] > 0) {
      analysis.feature_interest.push('integrations');
    }

    // Classify engagement level
    if (analysis.total_time_on_site > 600) {
      analysis.engagement_level = 'high';
    } else if (analysis.total_time_on_site > 180) {
      analysis.engagement_level = 'medium';
    }

    return analysis;
  }

  /**
   * Calculate lead temperature score (0-100) - now with behavior analysis
   */
  calculateLeadTemperature(visitor, quote, context, behaviorAnalysis = {}) {
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

    // Engagement signals (from behavior analysis)
    if (behaviorAnalysis.engagement_level === 'high') {
      score += 20;
    } else if (behaviorAnalysis.engagement_level === 'medium') {
      score += 10;
    }

    if (behaviorAnalysis.feature_interest?.length > 0) {
      score += 10;
    }

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
   * Generate multiple copy variants (A/B testing) using Claude API
   * Makes the agent more interpretive - creates variants based on temperature and behavior
   */
  async generateCopyVariants(visitor, quote, context, behaviorAnalysis = {}) {
    const prompt = `You are a retargeting specialist creating A/B test variants for someone who viewed a quote but didn't convert.

Lead Information:
- Name: ${visitor.first_name}
- Company: ${visitor.company_name}
- Lead Temperature: ${context.temperature}
- Days Since Quote: ${context.daysSinceQuote}
- Service: ${quote.quote_details?.service}
- Original Price: $${quote.quote_details?.base_price}
- Discount Offered: ${context.discount_percent}%
${behaviorAnalysis.price_sensitivity ? '- Signal: Visitor checked pricing multiple times (price sensitivity)' : ''}
${behaviorAnalysis.feature_interest?.length > 0 ? `- Signal: Visitor interested in: ${behaviorAnalysis.feature_interest.join(', ')}` : ''}
${behaviorAnalysis.engagement_level ? `- Engagement Level: ${behaviorAnalysis.engagement_level}` : ''}

Create TWO different copy approaches:
- Variant A: Focus on ${context.temperature === 'cold' ? 'urgency + limited-time offer' : context.temperature === 'warm' ? 'ROI + value' : 'relationship + benefit'}
- Variant B: Focus on ${context.temperature === 'cold' ? 'value + social proof' : context.temperature === 'warm' ? 'ease + quick wins' : 'urgency + scarcity'}

For each variant, generate:
1. Email subject (max 50 chars)
2. Email body (150-200 words)
3. Email CTA
4. SMS message (max 160 chars)
5. Ad headline (max 30 chars)
6. Ad description (max 90 chars)

Return as valid JSON with structure:
{
  "variant_a": { "email_subject": "...", "email_body": "...", "email_cta": "...", "sms_message": "...", "ad_headline": "...", "ad_description": "..." },
  "variant_b": { "email_subject": "...", "email_body": "...", "email_cta": "...", "sms_message": "...", "ad_headline": "...", "ad_description": "..." },
  "recommended_variant": "variant_a" | "variant_b"
}

Be specific, authentic, and responsive to the lead's signals.`;

    try {
      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText = message.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to parse Claude response as JSON');
    } catch (error) {
      console.error('Error generating copy variants:', error);
      throw error;
    }
  }

  /**
   * Recommend incentives based on behavior and lead temperature
   * Responsive to visitor's actual actions
   */
  async recommendIncentives(visitor, quote, context, behaviorAnalysis = {}) {
    const recommendations = [];

    // Price-sensitive visitors
    if (behaviorAnalysis.price_sensitivity) {
      recommendations.push({
        incentive_type: 'discount_percent',
        value: `${Math.min(context.suggested_discount_percent + 3, 20)}`,
        display_name: `${Math.min(context.suggested_discount_percent + 3, 20)}% Off`,
        reasoning: 'Visitor showed price sensitivity - increased discount may convert',
        priority: 'high',
      });
    }

    // Feature-interested visitors (give them what they want)
    if (
      behaviorAnalysis.feature_interest?.includes('integrations') ||
      behaviorAnalysis.feature_interest?.includes('features')
    ) {
      recommendations.push({
        incentive_type: 'free_upgrade',
        value: 'premium_features',
        display_name: 'Free Premium Features for 3 Months',
        reasoning: 'Visitor researched features extensively - they want capability',
        priority: 'high',
      });
    }

    // Cold leads (break the ice)
    if (context.temperature === 'cold') {
      recommendations.push({
        incentive_type: 'free_trial',
        value: '14_days',
        display_name: 'Free 14-Day Trial + Setup Support',
        reasoning: 'Cold lead needs risk-free way to engage',
        priority: 'medium',
      });
    }

    // Warm leads (accelerate)
    if (context.temperature === 'warm') {
      recommendations.push({
        incentive_type: 'extended_trial',
        value: '60_days',
        display_name: '60-Day Money-Back Guarantee',
        reasoning: 'Warm lead needs confidence boost',
        priority: 'medium',
      });
    }

    // Hot leads (keep it simple)
    if (context.temperature === 'hot') {
      recommendations.push({
        incentive_type: 'discount_percent',
        value: String(context.suggested_discount_percent),
        display_name: `${context.suggested_discount_percent}% Off Today`,
        reasoning: 'Hot lead just needs nudge',
        priority: 'high',
      });
    }

    return recommendations;
  }

  /**
   * Generate complete retargeting campaign recommendation (now with behavior analysis)
   */
  async generateCampaignRecommendation(
    visitor,
    quote,
    context,
    operatorConfig,
    behaviorAnalysis = {}
  ) {
    const temperature = this.classifyTemperature(context.temperatureScore);
    const channels = this.selectChannels(visitor, operatorConfig);
    const daysSinceQuote = context.daysSinceQuote;
    const discount = this.calculateDiscount(
      temperature,
      daysSinceQuote,
      operatorConfig.max_discount_percent
    );

    // Generate multiple copy variants (A/B testing)
    const copyVariants = await this.generateCopyVariants(
      visitor,
      quote,
      {
        temperature,
        daysSinceQuote,
        suggested_discount_percent: discount,
      },
      behaviorAnalysis
    );

    // Recommend incentives based on behavior
    const recommendedIncentives = await this.recommendIncentives(
      visitor,
      quote,
      {
        temperature,
        daysSinceQuote,
        suggested_discount_percent: discount,
      },
      behaviorAnalysis
    );

    // Determine if approval is required
    const approvalRequired =
      discount > operatorConfig.require_approval_for_discount_above_percent;

    // Create quote recovery link
    const recoveryToken = uuidv4();
    const recoveryLink = `/recover/${recoveryToken}`;

    return {
      lead_temperature: temperature,
      temperature_score: context.temperatureScore,
      reasoning: `Lead has been inactive for ${daysSinceQuote} days with engagement score of ${context.temperatureScore}/100.${behaviorAnalysis.price_sensitivity ? ' Price sensitivity detected.' : ''}${behaviorAnalysis.engagement_level === 'high' ? ' High engagement observed.' : ''}`,
      channels,
      suggested_discount_percent: discount,
      copy_variants: copyVariants,
      recommended_copy: copyVariants.recommended_variant || 'variant_a',
      recommended_incentives: recommendedIncentives,
      recovery_link: recoveryLink,
      recovery_token: recoveryToken,
      quote_url_tracking: this.buildTrackingUrl(
        quote.quote_url,
        context.campaign_id
      ),
      approval_required: approvalRequired,
      notes: this._generateNotes(temperature, daysSinceQuote, discount),
      behavior_insights: {
        price_sensitivity: behaviorAnalysis.price_sensitivity || false,
        engagement_level: behaviorAnalysis.engagement_level || 'low',
        feature_interest: behaviorAnalysis.feature_interest || [],
        objection_signals: behaviorAnalysis.objection_signals || [],
      },
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
   * Generate ad creative recommendations with visual themes
   */
  async generateAdCreatives(visitor, quote, context, behaviorAnalysis = {}) {
    const prompt = `You are a social media ad creative strategist. Recommend ad designs and visual themes for a retargeting campaign.

Company: ${visitor.company_name}
Service: ${quote.quote_details?.service}
Price Point: $${quote.quote_details?.base_price}
Temperature: ${context.temperature}
${behaviorAnalysis.price_sensitivity ? '- Visitor is price-sensitive' : ''}
${behaviorAnalysis.feature_interest?.length > 0 ? `- Interested in: ${behaviorAnalysis.feature_interest.join(', ')}` : ''}

Recommend:
1. Visual theme (color palette, style)
2. Image type (product demo, customer testimonial, ROI chart, etc.)
3. Key emotion to evoke
4. Social proof element if applicable
5. Call-to-action button style and text

Return as JSON with keys: visual_theme, image_type, emotion, social_proof, cta_button

Be specific and actionable for design teams.`;

    try {
      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText = message.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to parse Claude response as JSON');
    } catch (error) {
      console.error('Error generating ad creatives:', error);
      return {
        visual_theme: 'modern_minimal',
        image_type: 'product_demo',
        emotion: 'confidence',
        social_proof: 'customer_testimonial',
        cta_button: 'See My Quote',
      };
    }
  }

  /**
   * Generate human-readable notes for operator
   */
  _generateNotes(temperature, daysSinceQuote, discount) {
    const notes = [];

    if (temperature === 'hot') {
      notes.push(
        'Hot lead - quick response window. Minimal discount needed.'
      );
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
