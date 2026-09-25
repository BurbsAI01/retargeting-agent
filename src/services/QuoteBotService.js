const axios = require('axios');

class QuoteBotService {
  constructor(apiKey, baseUrl = 'https://api.thequotebot.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Parse webhook event from Quote Bot
   * Quote Bot sends event when quote is generated/updated
   */
  parseWebhookEvent(payload) {
    const {
      id: quoteId,
      email: customerEmail,
      name: customerName,
      phone: customerPhone,
      estimate_total: quoteAmount,
      status: quoteStatus,
      items: quoteItems,
      created_at: createdAt,
      updated_at: updatedAt,
      converted: isConverted
    } = payload;

    return {
      quoteId,
      customerEmail,
      customerName,
      customerPhone,
      quoteAmount: parseFloat(quoteAmount),
      quoteStatus, // 'pending', 'completed', 'abandoned', 'converted'
      isConverted: isConverted === true,
      quoteItems: quoteItems || [],
      createdAt,
      updatedAt,
      // Build a descriptive route from items
      route: this.extractRouteFromItems(quoteItems),
      // Extract vehicle type if available
      vehicleType: this.extractVehicleType(quoteItems)
    };
  }

  extractRouteFromItems(items) {
    if (!items || items.length === 0) return 'Quote Request';

    // Try to find origin and destination
    const origin = items.find(i => i.type === 'origin')?.description || 'Origin';
    const destination = items.find(i => i.type === 'destination')?.description || 'Destination';

    return `${origin} to ${destination}`;
  }

  extractVehicleType(items) {
    if (!items || items.length === 0) return 'Standard';

    const vehicle = items.find(i => i.type === 'vehicle');
    return vehicle?.description || 'Standard';
  }

  /**
   * Get a single quote by ID
   */
  async getQuote(quoteId) {
    try {
      const response = await this.client.get(`/quotes/${quoteId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching quote ${quoteId}:`, error.message);
      throw error;
    }
  }

  /**
   * List quotes - useful for initial sync or backfill
   * Returns quotes created since a certain date
   */
  async listQuotes(filters = {}) {
    try {
      const params = {
        limit: filters.limit || 50,
        offset: filters.offset || 0,
        ...filters
      };

      const response = await this.client.get('/quotes', { params });
      return response.data;
    } catch (error) {
      console.error('Error listing quotes:', error.message);
      throw error;
    }
  }

  /**
   * Get unconverted quotes - perfect for identifying retargeting candidates
   */
  async getUnconvertedQuotes(options = {}) {
    try {
      const params = {
        status: 'abandoned,pending', // Not converted
        limit: options.limit || 100,
        offset: options.offset || 0,
        sort: 'created_at',
        order: 'desc'
      };

      const response = await this.client.get('/quotes', { params });

      // Filter to only those created recently (last 30 days by default)
      const daysSince = options.daysSince || 30;
      const cutoffDate = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);

      return response.data.filter(quote => {
        const createdDate = new Date(quote.created_at);
        return createdDate > cutoffDate && !quote.converted;
      });
    } catch (error) {
      console.error('Error fetching unconverted quotes:', error.message);
      throw error;
    }
  }

  /**
   * Get recent quotes for sync/backfill
   */
  async getRecentQuotes(hoursBack = 24) {
    try {
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const response = await this.client.get('/quotes', {
        params: {
          created_since: since.toISOString(),
          limit: 100
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching recent quotes:', error.message);
      throw error;
    }
  }

  /**
   * Verify webhook signature (if Quote Bot signs webhooks)
   * This depends on Quote Bot's signing method
   */
  verifyWebhookSignature(payload, signature, secret) {
    // Quote Bot typically uses HMAC-SHA256
    const crypto = require('crypto');
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hmac === signature;
  }

  /**
   * Get Quote Bot account info
   */
  async getAccountInfo() {
    try {
      const response = await this.client.get('/account');
      return response.data;
    } catch (error) {
      console.error('Error fetching account info:', error.message);
      throw error;
    }
  }

  /**
   * Health check - verify API credentials are valid
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return { healthy: true, data: response.data };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

module.exports = QuoteBotService;
